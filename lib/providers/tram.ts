import tramLine from "@/lib/static/tram-line.json";
import type { EtaResult, StopHit } from "@/lib/types";
import { rankNearby } from "@/lib/nearby";

export type TramDirection = "east" | "west";

export type TramStop = {
  seq: number;
  key: string;
  name: string;
  eastId: string;
  westId: string;
  lat: number;
  lng: number;
  branch: string;
  destinationsEast: string[];
  destinationsWest: string[];
  routes: Array<{ id: string; name: string }>;
};

export const TRAM_LINE = tramLine as {
  generatedAt: string;
  note: string;
  headwayMinutesDay: number;
  headwayMinutesNight: number;
  routes: Array<{ id: string; name: string; eastTip: string; westTip: string }>;
  stops: TramStop[];
};

export function tramStopsMainline(): TramStop[] {
  return TRAM_LINE.stops.filter((s) => s.branch === "主線");
}

export function tramStopByKey(key: string): TramStop | undefined {
  return TRAM_LINE.stops.find((s) => s.key === key);
}

function headwayMinutes(now = new Date()): number {
  const h = now.getHours();
  if (h >= 23 || h < 6) return TRAM_LINE.headwayMinutesNight;
  if ((h >= 6 && h < 9) || (h >= 17 && h < 20)) return Math.max(1, TRAM_LINE.headwayMinutesDay);
  return TRAM_LINE.headwayMinutesDay;
}

/** Deterministic pseudo-countdown so UI feels live without claiming GPS ETA. */
function estimateMinutes(seed: string, headway: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const span = Math.max(1, Math.round(headway));
  const phase = (hash + minuteBucket) % (span * 2);
  const first = Math.max(1, (phase % span) + 1);
  return [first, first + span, first + span * 2];
}

export function tramEtaForStop(stopKey: string, direction: TramDirection): EtaResult[] {
  const stop = tramStopByKey(stopKey);
  if (!stop) return [];
  const dests = direction === "east" ? stop.destinationsEast : stop.destinationsWest;
  const unique = dests.length ? dests : direction === "east" ? ["筲箕灣 / 跑馬地"] : ["堅尼地城 / 石塘咀"];
  const headway = headwayMinutes();
  const mins = estimateMinutes(`${stop.key}:${direction}`, headway);
  return unique.slice(0, 4).map((dest, i) => ({
    operator: "tram" as const,
    operatorName: "香港電車",
    route: "叮叮",
    dest,
    stopId: direction === "east" ? stop.eastId : stop.westId,
    stopName: stop.name,
    etaMinutes: mins[i] ?? mins[0]! + headway * i,
    etaTime: null,
    remark: `班次估算（約每 ${headway} 分鐘）；電車暫無公開實時到站`,
  }));
}

export function nearbyTramStops(lat: number, lng: number, limit = 4): StopHit[] {
  return rankNearby(
    TRAM_LINE.stops.map((s) => ({
      operator: "tram" as const,
      operatorName: "香港電車",
      stopId: s.key,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
    })),
    lat,
    lng,
    limit,
  );
}
