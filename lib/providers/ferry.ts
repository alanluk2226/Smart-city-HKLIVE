import { cached, TTL } from "@/lib/cache";
import { fetchJson } from "@/lib/http";
import { FERRY_HUBS, ferryHub, type FerryLeg, type FerryOperator } from "@/lib/static/ferry-hubs";
import { nextScheduledDeparture } from "@/lib/static/ferry-schedules";
import { getWeather, type WeatherSnapshot } from "@/lib/providers/weather";

export type FerryVesselType = "fast" | "ordinary" | "unknown";

export type FerryDeparture = {
  legId: string;
  operator: FerryOperator;
  operatorName: string;
  title: string;
  from: string;
  to: string;
  pier?: string;
  vesselType: FerryVesselType;
  vesselLabel: string;
  vesselCode?: string;
  departTime: string | null;
  etaTime: string | null;
  departMinutes: number | null;
  remark?: string;
  live: boolean;
  scheduleEstimate?: boolean;
};

function vesselTypeFrom(routeCode: string, vesselCode?: string | null): FerryVesselType {
  if (/H$/i.test(routeCode)) return "fast";
  if (vesselCode && /^XMZ/i.test(vesselCode)) return "fast";
  if (vesselCode && /GUO|XIN|ORD/i.test(vesselCode)) return "ordinary";
  if (vesselCode) return "ordinary";
  return "unknown";
}

function vesselLabel(t: FerryVesselType): string {
  if (t === "fast") return "高速船";
  if (t === "ordinary") return "普通渡輪";
  return "渡輪";
}

function parseClockToMinutes(clock: string | null | undefined, now = new Date()): number | null {
  if (!clock) return null;
  const m = clock.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (diff < -5) return null;
  return diff;
}

function parseIsoMinutes(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = Math.round((t - now.getTime()) / 60_000);
  if (diff < -5) return null;
  return diff;
}

function scheduledFallback(leg: FerryLeg, vesselType: FerryVesselType = "unknown"): FerryDeparture {
  const next = nextScheduledDeparture(leg.id);
  if (!next) {
    return {
      legId: leg.id,
      operator: leg.operator,
      operatorName: leg.operatorName,
      title: leg.title,
      from: leg.from,
      to: leg.to,
      pier: leg.pier,
      vesselType,
      vesselLabel: vesselLabel(vesselType),
      departTime: null,
      etaTime: null,
      departMinutes: null,
      remark: "暫無即將開出班次，請稍後再查或留意碼頭現場公佈",
      live: false,
      scheduleEstimate: true,
    };
  }
  const vType = next.vesselType ?? vesselType;
  return {
    legId: leg.id,
    operator: leg.operator,
    operatorName: leg.operatorName,
    title: leg.title,
    from: leg.from,
    to: leg.to,
    pier: leg.pier,
    vesselType: vType,
    vesselLabel: vesselLabel(vType),
    departTime: next.departTime,
    etaTime: null,
    departMinutes: next.departMinutes,
    remark: next.note,
    live: false,
    scheduleEstimate: true,
  };
}

type SunEtaRow = {
  routecode?: string;
  route_tc?: string;
  vesselcode?: string | null;
  depart_time?: string | null;
  eta?: string | null;
  rmk_tc?: string | null;
};

type SunEtaPayload = { data?: SunEtaRow[] };

type HkkfEtaRow = {
  route_id?: number;
  direction?: string;
  session_time?: string;
  ETA?: string;
};

type HkkfEtaPayload = { data?: HkkfEtaRow[] };

async function sunFerryDepartures(leg: FerryLeg): Promise<FerryDeparture[]> {
  const json = await cached(`sunferry:${leg.routeCode}`, TTL.eta, () =>
    fetchJson<SunEtaPayload>(`https://www.sunferry.com.hk/eta/?route=${encodeURIComponent(leg.routeCode)}`),
  );
  const now = new Date();
  const rows = (json.data ?? [])
    .map((row) => {
      const code = row.routecode ?? leg.routeCode;
      const vType = vesselTypeFrom(code, row.vesselcode);
      return {
        legId: leg.id,
        operator: "sunferry" as const,
        operatorName: leg.operatorName,
        title: leg.title,
        from: leg.from,
        to: leg.to,
        pier: leg.pier,
        vesselType: vType,
        vesselLabel: vesselLabel(vType),
        vesselCode: row.vesselcode ?? undefined,
        departTime: row.depart_time ?? null,
        etaTime: row.eta ?? null,
        departMinutes: parseClockToMinutes(row.depart_time, now),
        remark: row.rmk_tc ?? undefined,
        live: true,
      };
    })
    .filter((d) => d.departMinutes != null && d.departMinutes >= -1);
  return rows.length ? rows : [scheduledFallback(leg)];
}

async function hkkfDepartures(leg: FerryLeg): Promise<FerryDeparture[]> {
  const dir = leg.direction ?? "outbound";
  const json = await cached(`hkkf:${leg.routeCode}:${dir}`, TTL.eta, () =>
    fetchJson<HkkfEtaPayload>(
      `https://www.hkkfeta.com/opendata/eta/${encodeURIComponent(leg.routeCode)}/${dir}`,
    ),
  );
  const now = new Date();
  const rows = (json.data ?? [])
    .map((row) => {
      const departMinutes =
        parseClockToMinutes(row.session_time?.slice(0, 5), now) ?? parseIsoMinutes(row.ETA, now);
      const clock =
        row.session_time?.slice(0, 5) ??
        (row.ETA
          ? new Date(row.ETA).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "Asia/Hong_Kong",
            })
          : null);
      return {
        legId: leg.id,
        operator: "hkkf" as const,
        operatorName: leg.operatorName,
        title: leg.title,
        from: leg.from,
        to: leg.to,
        pier: leg.pier,
        vesselType: "ordinary" as const,
        vesselLabel: "普通渡輪",
        departTime: clock,
        etaTime: row.ETA
          ? new Date(row.ETA).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
              timeZone: "Asia/Hong_Kong",
            })
          : null,
        departMinutes,
        live: true,
      };
    })
    .filter((d) => d.departMinutes != null && d.departMinutes >= -1);
  return rows.length ? rows : [scheduledFallback(leg, "ordinary")];
}

function starFerryDepartures(leg: FerryLeg): FerryDeparture[] {
  return [scheduledFallback(leg, "ordinary")];
}

export async function ferryDeparturesForHub(hubId: string): Promise<FerryDeparture[]> {
  const hub = ferryHub(hubId);
  if (!hub) return [];
  const batches = await Promise.all(
    hub.legs.map(async (leg) => {
      try {
        if (leg.operator === "sunferry") return await sunFerryDepartures(leg);
        if (leg.operator === "hkkf") return await hkkfDepartures(leg);
        return starFerryDepartures(leg);
      } catch {
        return [scheduledFallback(leg)];
      }
    }),
  );
  return batches.flat().sort((a, b) => (a.departMinutes ?? 9999) - (b.departMinutes ?? 9999));
}

export function ferryWeatherAlert(weather: WeatherSnapshot): string | null {
  const warningText = weather.warnings.map((w) => `${w.name} ${w.type} ${w.action}`).join(" ");
  const blob = [weather.warningMessage, weather.tropicalMessage, warningText].join(" ");

  const rain = /黃雨|紅雨|黑雨|暴雨警告/.test(blob) || /WRAINA|WRAINR|WRAINB/i.test(warningText);
  const thunder = /雷暴警告/.test(blob) || /\bWTS\b/i.test(warningText);
  const typhoon =
    /[3-9]號熱帶氣旋|十號熱帶氣旋|強烈季候風信號/.test(blob) ||
    /\bTC[3-9]\b|\bTC10\b/i.test(warningText);

  if (rain || thunder || typhoon) {
    return "受惡劣天氣影響，渡輪服務可能隨時調整或暫停，請留意現場公佈。";
  }
  return null;
}

export type FerryRouteLink = { fromHubId: string; toHubId: string };

const HUB_BY_NAME: Record<string, string> = {
  中環: "central",
  尖沙咀: "tst",
  灣仔: "wanchai",
  北角: "northpoint",
  紅磡: "hunghom",
  長洲: "cheungchau",
  梅窩: "muiwo",
  榕樹灣: "yungshuewan",
  索罟灣: "sokkwuwan",
  坪洲: "pengchau",
};

export function ferryRouteLinksForHub(hubId: string): FerryRouteLink[] {
  const hub = ferryHub(hubId);
  if (!hub) return [];
  const links: FerryRouteLink[] = [];
  const seen = new Set<string>();
  for (const leg of hub.legs) {
    const toId = HUB_BY_NAME[leg.to];
    if (!toId || toId === hubId) continue;
    const key = [hubId, toId].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ fromHubId: hubId, toHubId: toId });
  }
  return links;
}

export async function ferryHubSnapshot(hubId: string) {
  const [departures, weather] = await Promise.all([ferryDeparturesForHub(hubId), getWeather()]);
  return {
    hub: ferryHub(hubId) ?? null,
    hubs: FERRY_HUBS.map(({ id, name, nameEn, lat, lng }) => ({ id, name, nameEn, lat, lng })),
    departures,
    routeLinks: ferryRouteLinksForHub(hubId),
    weatherAlert: ferryWeatherAlert(weather),
    updatedAt: new Date().toISOString(),
  };
}
