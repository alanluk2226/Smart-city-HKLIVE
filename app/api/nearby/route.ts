import { jsonError, jsonOk, jsonUpstreamError, num } from "@/lib/api";
import { NEARBY_MAX_METERS, withinNearbyRadius } from "@/lib/nearby";
import { nearbyCtbStops } from "@/lib/providers/ctb";
import { nearbyGmbStops } from "@/lib/providers/gmb";
import { nearbyKmbStops } from "@/lib/providers/kmb";
import { nearbyLrtStations } from "@/lib/providers/lrt";
import { nearbyMtrStations } from "@/lib/providers/mtr";
import { nearbyMtrBusStops } from "@/lib/providers/mtr-bus";
import { nearbyNlbStops } from "@/lib/providers/nlb";
import { clientIp, pruneRateLimits, rateLimitShared } from "@/lib/rate-limit";
import { MTR_STATIONS } from "@/lib/static/mtr-stations";
import type { StopHit } from "@/lib/types";

export const dynamic = "force-dynamic";

const NEARBY_LIMIT_PER_MIN = 30;
const NEARBY_GMB_LIMIT_PER_MIN = 12;

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

function mtrNearby(lat: number, lng: number) {
  return withinNearbyRadius(
    nearbyMtrStations(lat, lng, 12).map((s) => {
      const station = MTR_STATIONS.find((row) => row.code === s.stopId);
      return { ...s, lines: station?.lines ?? [] };
    }),
  );
}

/**
 * phase=fast — 巴士＋港鐵／輕鐵（無小巴，回應快）
 * phase=gmb  — 只小巴（可第二輪合併）
 * phase=all  — 一次全取（相容舊客戶端）
 */
export async function GET(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const p = new URL(request.url).searchParams;
  const lat = num(p.get("lat"));
  const lng = num(p.get("lng"));
  if (lat == null || lng == null) return jsonError("需要 lat / lng");
  if (lat < 22.12 || lat > 22.58 || lng < 113.8 || lng > 114.5) {
    return jsonError("附近搜尋只支援香港範圍", 400);
  }

  const phase = (p.get("phase") || "all").toLowerCase();
  const limited = await rateLimitShared({
    key: `nearby:${phase === "gmb" ? "gmb" : "min"}:${ip}`,
    limit: phase === "gmb" ? NEARBY_GMB_LIMIT_PER_MIN : NEARBY_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return jsonError("附近車站請求過於頻繁，請稍後再試。", 429, {
      retryAfter: limited.retryAfterSec,
    });
  }

  try {
    if (phase === "gmb") {
      const gmbRaw = await withTimeout(nearbyGmbStops(lat, lng, 16), 12_000, []).catch(
        () => [] as StopHit[],
      );
      const gmb = withinNearbyRadius(gmbRaw);
      return jsonOk({ gmb, maxMeters: NEARBY_MAX_METERS, phase: "gmb" as const });
    }

    const [kmbRaw, ctbRaw, nlbRaw, mtrbRaw] = await Promise.all([
      nearbyKmbStops(lat, lng, 12).catch(() => [] as StopHit[]),
      nearbyCtbStops(lat, lng, 12).catch(() => [] as StopHit[]),
      nearbyNlbStops(lat, lng, 12).catch(() => [] as StopHit[]),
      nearbyMtrBusStops(lat, lng, 12).catch(() => [] as StopHit[]),
    ]);
    const kmb = withinNearbyRadius(kmbRaw);
    const ctb = withinNearbyRadius(ctbRaw);
    const nlb = withinNearbyRadius(nlbRaw);
    const mtrb = withinNearbyRadius(mtrbRaw);
    const mtr = mtrNearby(lat, lng);
    const lrt = withinNearbyRadius(nearbyLrtStations(lat, lng, 12));

    if (phase === "fast") {
      const busTop = mergeNearby([kmb, ctb, nlb, mtrb], BUS_IN_ALL);
      const all = mergeNearby([busTop, mtr, lrt]);
      return jsonOk({
        kmb,
        ctb,
        nlb,
        mtrb,
        gmb: [] as StopHit[],
        mtr,
        lrt,
        all,
        maxMeters: NEARBY_MAX_METERS,
        phase: "fast" as const,
      });
    }

    const gmbRaw = await withTimeout(nearbyGmbStops(lat, lng, 16), 12_000, []).catch(
      () => [] as StopHit[],
    );
    const gmb = withinNearbyRadius(gmbRaw);
    const busTop = mergeNearby([kmb, ctb, nlb, mtrb], BUS_IN_ALL);
    const all = mergeNearby([busTop, gmb, mtr, lrt]);
    return jsonOk({
      kmb,
      ctb,
      nlb,
      mtrb,
      gmb,
      mtr,
      lrt,
      all,
      maxMeters: NEARBY_MAX_METERS,
      phase: "all" as const,
    });
  } catch (error) {
    return jsonUpstreamError("nearby", error, "無法載入附近車站");
  }
}
