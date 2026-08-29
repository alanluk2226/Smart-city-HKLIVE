import { jsonError, jsonOk, num } from "@/lib/api";
import { NEARBY_MAX_METERS, withinNearbyRadius } from "@/lib/nearby";
import { nearbyCtbStops } from "@/lib/providers/ctb";
import { nearbyGmbStops } from "@/lib/providers/gmb";
import { nearbyKmbStops } from "@/lib/providers/kmb";
import { nearbyLrtStations } from "@/lib/providers/lrt";
import { nearbyMtrStations } from "@/lib/providers/mtr";
import { nearbyMtrBusStops } from "@/lib/providers/mtr-bus";
import { nearbyNlbStops } from "@/lib/providers/nlb";
import { MTR_STATIONS } from "@/lib/static/mtr-stations";
import type { StopHit } from "@/lib/types";

export const dynamic = "force-dynamic";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function mergeNearby(groups: StopHit[][], limit = 24): StopHit[] {
  return withinNearbyRadius(groups.flat(), NEARBY_MAX_METERS)
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, limit);
}

/** 總覽「全部」只保留最近數個巴士站，避免九巴／城巴／嶼巴／港鐵巴士佔滿列表 */
const BUS_IN_ALL = 5;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const lat = num(p.get("lat"));
  const lng = num(p.get("lng"));
  if (lat == null || lng == null) return jsonError("需要 lat / lng");
  try {
    const [kmbRaw, ctbRaw, nlbRaw, mtrbRaw, gmbRaw] = await Promise.all([
      nearbyKmbStops(lat, lng, 12).catch(() => [] as StopHit[]),
      nearbyCtbStops(lat, lng, 12).catch(() => [] as StopHit[]),
      nearbyNlbStops(lat, lng, 12).catch(() => [] as StopHit[]),
      nearbyMtrBusStops(lat, lng, 12).catch(() => [] as StopHit[]),
      withTimeout(nearbyGmbStops(lat, lng, 16), 12_000, []).catch(() => [] as StopHit[]),
    ]);
    const kmb = withinNearbyRadius(kmbRaw);
    const ctb = withinNearbyRadius(ctbRaw);
    const nlb = withinNearbyRadius(nlbRaw);
    const mtrb = withinNearbyRadius(mtrbRaw);
    const gmb = withinNearbyRadius(gmbRaw);
    const mtr = withinNearbyRadius(
      nearbyMtrStations(lat, lng, 12).map((s) => {
        const station = MTR_STATIONS.find((row) => row.code === s.stopId);
        return { ...s, lines: station?.lines ?? [] };
      }),
    );
    const lrt = withinNearbyRadius(nearbyLrtStations(lat, lng, 12));
    const busTop = mergeNearby([kmb, ctb, nlb, mtrb], BUS_IN_ALL);
    const all = mergeNearby([busTop, gmb, mtr, lrt]);
    return jsonOk({ kmb, ctb, nlb, mtrb, gmb, mtr, lrt, all, maxMeters: NEARBY_MAX_METERS });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入附近車站", 502);
  }
}
