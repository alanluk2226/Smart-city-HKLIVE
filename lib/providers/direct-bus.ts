import { haversineMeters } from "@/lib/geo";
import { hkBusCatalog } from "@/lib/providers/route-fare";
import type { AiTripOption } from "@/lib/types";

const BOARD_METERS = 1200;
const ALIGHT_METERS = 700;

export type DirectBusHit = {
  operator: "kmb" | "ctb" | "nlb";
  operatorName: string;
  route: string;
  bound: string;
  destName?: string;
  serviceType?: string;
  fromStopId: string;
  fromStopName: string;
  toStopId: string;
  toStopName: string;
  fromSeq: number;
  toSeq: number;
  walkMeters: number;
};

export type DirectBusQuery = {
  limit?: number;
  fromHints?: string[];
  toHints?: string[];
};

const OPERATOR_NAME: Record<"kmb" | "ctb" | "nlb", string> = {
  kmb: "九巴／龍運",
  ctb: "城巴",
  nlb: "嶼巴",
};

function coToOperator(co: string): "kmb" | "ctb" | "nlb" | null {
  if (co === "ctb") return "ctb";
  if (co === "kmb" || co === "lwb") return "kmb";
  if (co === "nlb") return "nlb";
  return null;
}

function routeLegs(stops: Record<string, string[]> | undefined) {
  if (!stops) return [] as Array<{ operator: "kmb" | "ctb" | "nlb"; co: string; ids: string[] }>;
  const out: Array<{ operator: "kmb" | "ctb" | "nlb"; co: string; ids: string[] }> = [];
  for (const [co, ids] of Object.entries(stops)) {
    const operator = coToOperator(co);
    if (!operator || !ids?.length) continue;
    out.push({ operator, co, ids });
  }
  return out;
}

/**
 * 用 hkbus 公開站序＋座標，自動搵「一程巴士」同時經過起點同終點附近嘅路線。
 * 唔使人手寫死 E21A 等走廊。
 */
export async function findDirectBuses(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  query: DirectBusQuery = {},
): Promise<DirectBusHit[]> {
  const limit = query.limit ?? 5;
  if (haversineMeters(fromLat, fromLng, toLat, toLng) < 900) return [];

  const { routeList, stopList } = await hkBusCatalog();
  const fromHints = query.fromHints ?? [];
  const toHints = query.toHints ?? [];

  type Acc = { hit: DirectBusHit; score: number };
  const best = new Map<string, Acc>();

  for (const row of Object.values(routeList)) {
    const route = row.route?.trim();
    if (!route) continue;
    for (const leg of routeLegs(row.stops)) {
      let bestFrom: { seq: number; stopId: string; name: string; d: number } | null = null;
      let bestTo: { seq: number; stopId: string; name: string; d: number } | null = null;
      for (let i = 0; i < leg.ids.length; i++) {
        const stopId = leg.ids[i];
        const stop = stopList[stopId];
        const lat = stop?.location?.lat;
        const lng = stop?.location?.lng;
        if (lat == null || lng == null) continue;
        const dFrom = haversineMeters(fromLat, fromLng, lat, lng);
        const dTo = haversineMeters(toLat, toLng, lat, lng);
        const name = stop.name?.zh || stop.name?.en || stopId;
        if (dFrom <= BOARD_METERS && (!bestFrom || dFrom < bestFrom.d)) {
          bestFrom = { seq: i + 1, stopId, name, d: dFrom };
        }
        if (dTo <= ALIGHT_METERS && (!bestTo || dTo < bestTo.d)) {
          bestTo = { seq: i + 1, stopId, name, d: dTo };
        }
      }
      if (!bestFrom || !bestTo || bestFrom.seq >= bestTo.seq) continue;
      if (bestFrom.stopId === bestTo.stopId) continue;

      const walkMeters = Math.round(bestFrom.d + bestTo.d);
      const destName = row.dest?.zh;
      const bound = row.bound?.[leg.co] || "O";
      const serviceType = row.serviceType != null ? String(row.serviceType) : undefined;
      const key = `${leg.operator}|${route}`;
      const destBlob = `${row.orig?.zh ?? ""}${destName ?? ""}`;
      const hintBonus =
        (toHints.some((h) => h && destBlob.includes(h.slice(0, 2))) ? 0 : 40) +
        (fromHints.some((h) => h && destBlob.includes(h.slice(0, 2))) ? 0 : 20);
      const eBonus = leg.operator === "ctb" && /^E\d/i.test(route) ? 0 : 30;
      const nNight = /^N\d/i.test(route) ? 160 : 0;
      const score = walkMeters + (bestTo.seq - bestFrom.seq) * 4 + hintBonus + eBonus + nNight;
      const prev = best.get(key);
      if (prev && prev.score <= score) continue;

      best.set(key, {
        score,
        hit: {
          operator: leg.operator,
          operatorName: OPERATOR_NAME[leg.operator],
          route,
          bound,
          destName,
          serviceType,
          fromStopId: bestFrom.stopId,
          fromStopName: bestFrom.name,
          toStopId: bestTo.stopId,
          toStopName: bestTo.name,
          fromSeq: bestFrom.seq,
          toSeq: bestTo.seq,
          walkMeters,
        },
      });
    }
  }

  return [...best.values()]
    .sort((a, b) => a.score - b.score || a.hit.route.localeCompare(b.hit.route, "en", { numeric: true }))
    .slice(0, limit)
    .map((x) => x.hit);
}

export function directBusToOption(
  hit: DirectBusHit,
  fromName: string,
  toName: string,
  tone: "severe" | "wet" | "hot" | "fair",
  index: number,
): AiTripOption {
  const dest = hit.destName ? `（往${hit.destName}）` : "";
  return {
    id: `bus-direct-${hit.operator}-${hit.route}-${index}`,
    mode: "bus",
    title: `${hit.operatorName} ${hit.route}${dest} 直達`,
    minutes: null,
    fareHkd: null,
    steps: [
      `由${fromName}步行／接駁至「${hit.fromStopName}」巴士站`,
      `乘${hit.operatorName} ${hit.route}${dest}`,
      `於「${hit.toStopName}」下車，再前往${toName}`,
    ],
    why: `公開站距自動對到：呢條線同時停近起點同終點（站序 ${hit.fromSeq} → ${hit.toSeq}），一程直達。車程視路面。`,
    weatherFit: tone === "severe" || tone === "wet" ? "ok" : "good",
    badges: ["直達巴士"],
    source: "computed",
  };
}

export function optionRouteNumbers(option: AiTripOption): string[] {
  const found = option.title.match(/[A-Z]?\d+[A-Z]?/gi) ?? [];
  return [...new Set(found.map((x) => x.toUpperCase()))];
}
