import { cached, TTL } from "@/lib/cache";
import { fetchJson, fetchText } from "@/lib/http";
import type { Operator, RouteInfo } from "@/lib/types";

const HKBUS_URL = "https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json";
const TD_BUS_ROUTE = "https://static.data.gov.hk/td/routes-fares-xml/ROUTE_BUS.xml";
const TD_GMB_ROUTE = "https://static.data.gov.hk/td/routes-fares-xml/ROUTE_GMB.xml";

export type { RouteInfo };

type HkBusRoute = {
  route: string;
  co?: string[];
  serviceType?: string;
  gtfsId?: string | number;
  bound?: Record<string, string>;
  orig?: { zh?: string; en?: string };
  dest?: { zh?: string; en?: string };
  fares?: string[] | null;
  jt?: string | number | null;
};

type HkBusPayload = {
  routeList: Record<string, HkBusRoute>;
};

const CO_MAP: Record<string, string> = {
  kmb: "kmb",
  ctb: "ctb",
  nlb: "nlb",
  mtrb: "lrtfeeder",
  gmb: "gmb",
};

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeBound(operator: Operator, bound?: string): string | undefined {
  if (!bound) return undefined;
  if (operator === "gmb") {
    if (bound === "1" || bound.toUpperCase() === "O") return "O";
    if (bound === "2" || bound.toUpperCase() === "I") return "I";
  }
  const u = bound.toUpperCase();
  if (u === "O" || u === "I") return u;
  if (u === "1" || u === "OUTBOUND") return "O";
  if (u === "2" || u === "INBOUND") return "I";
  return u;
}

function destScore(want: string | undefined, got: string | undefined): number {
  if (!want || !got) return 0;
  const a = want.replace(/\s+/g, "");
  const b = got.replace(/\s+/g, "");
  if (a === b) return 3;
  if (a.includes(b) || b.includes(a)) return 2;
  if (a.slice(0, 2) === b.slice(0, 2)) return 1;
  return 0;
}

async function hkBusRoutes(): Promise<Record<string, HkBusRoute>> {
  return cached("hkbus:route-fare", TTL.route, async () => {
    const json = await fetchJson<HkBusPayload>(HKBUS_URL, 60_000);
    return json.routeList ?? {};
  });
}

function parseTdJourney(xml: string, companyFilter?: (co: string) => boolean): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of xml.matchAll(/<ROUTE>([\s\S]*?)<\/ROUTE>/g)) {
    const block = m[1];
    const get = (tag: string) => block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1]?.trim();
    const co = get("COMPANY_CODE") ?? "";
    if (companyFilter && !companyFilter(co)) continue;
    const name = get("ROUTE_NAMEC");
    const jt = Number(get("JOURNEY_TIME"));
    if (!name || !Number.isFinite(jt)) continue;
    const key = `${co.toUpperCase()}|${name.toUpperCase()}`;
    if (!map.has(key)) map.set(key, jt);
  }
  return map;
}

async function tdJourneyIndex(): Promise<Map<string, number>> {
  return cached("td:journey-index", TTL.route, async () => {
    const [busXml, gmbXml] = await Promise.all([
      fetchText(TD_BUS_ROUTE, 60_000),
      fetchText(TD_GMB_ROUTE, 60_000),
    ]);
    const map = parseTdJourney(busXml);
    for (const [k, v] of parseTdJourney(gmbXml)) map.set(k, v);
    return map;
  });
}

function tdLookup(
  index: Map<string, number>,
  operator: Operator,
  route: string,
): number | null {
  const name = route.toUpperCase();
  const candidates: string[] = [];
  if (operator === "kmb") candidates.push("KMB", "LWB");
  else if (operator === "ctb") candidates.push("CTB");
  else if (operator === "nlb") candidates.push("NLB");
  else if (operator === "mtrb") candidates.push("LRTFEEDER");
  else if (operator === "gmb") candidates.push("GMB");
  for (const co of candidates) {
    const hit = index.get(`${co}|${name}`);
    if (hit != null) return hit;
  }
  return null;
}

function pickHkBusRoute(
  list: Record<string, HkBusRoute>,
  operator: Operator,
  route: string,
  bound?: string,
  dest?: string,
  serviceType?: string,
  routeId?: string,
): HkBusRoute | null {
  const co = CO_MAP[operator];
  if (!co) return null;
  const wantBound = normalizeBound(operator, bound);
  let best: HkBusRoute | null = null;
  let bestScore = -1;

  for (const row of Object.values(list)) {
    if (!row.co?.includes(co)) continue;
    if (row.route.toUpperCase() !== route.toUpperCase()) continue;
    if (routeId && row.gtfsId != null && String(row.gtfsId) !== String(routeId)) continue;
    if (serviceType && row.serviceType && row.serviceType !== serviceType) continue;

    let score = 0;
    const rowBound = row.bound?.[co];
    if (wantBound && rowBound) {
      if (rowBound !== wantBound) continue;
      score += 2;
    }
    score += destScore(dest, row.dest?.zh);
    if (serviceType && row.serviceType === serviceType) score += 1;
    if (routeId && String(row.gtfsId) === String(routeId)) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  return best;
}

export async function lookupRouteInfo(input: {
  operator: Operator;
  route: string;
  bound?: string;
  dest?: string;
  serviceType?: string;
  routeId?: string;
  seq?: number;
  stopCount?: number;
}): Promise<RouteInfo> {
  const [list, td] = await Promise.all([hkBusRoutes(), tdJourneyIndex()]);
  const row = pickHkBusRoute(
    list,
    input.operator,
    input.route,
    input.bound,
    input.dest,
    input.serviceType,
    input.routeId,
  );

  const seq = input.seq && input.seq > 0 ? input.seq : 1;
  const fareAdult = row?.fares?.length
    ? parseMoney(row.fares[Math.min(seq - 1, row.fares.length - 1)])
    : null;

  const journeyMinutes =
    (row?.jt != null && row.jt !== "" ? Number(row.jt) : null) ||
    tdLookup(td, input.operator, input.route);

  const stopCount = input.stopCount ?? row?.fares?.length ?? null;
  let remainingMinutes: number | null = null;
  if (journeyMinutes != null && Number.isFinite(journeyMinutes)) {
    if (stopCount && stopCount > 1) {
      const remainStops = Math.max(0, stopCount - seq);
      remainingMinutes = Math.max(
        0,
        Math.round((journeyMinutes * remainStops) / Math.max(1, stopCount - 1)),
      );
    } else {
      remainingMinutes = journeyMinutes;
    }
  }

  return {
    fareAdult,
    journeyMinutes: journeyMinutes != null && Number.isFinite(journeyMinutes) ? journeyMinutes : null,
    remainingMinutes,
    destName: row?.dest?.zh ?? input.dest ?? null,
    note: fareAdult == null ? "車費暫缺，請以車費顯示器為準" : "八達通／流動支付成人分段車費參考",
  };
}
