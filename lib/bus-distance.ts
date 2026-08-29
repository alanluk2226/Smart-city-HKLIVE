import { haversineMeters } from "@/lib/geo";

export type RouteStopPoint = {
  seq: number;
  lat: number;
  lng: number;
};

export type VehicleEtaPoint = {
  seq: number;
  etaMinutes: number | null;
};

/** 沿站序累加直線段距離（公開 API 無路網形狀時的近似） */
export function pathDistanceMeters(stops: RouteStopPoint[], fromSeq: number, toSeq: number): number {
  if (toSeq <= fromSeq) return 0;
  const bySeq = new Map(stops.map((s) => [s.seq, s]));
  let total = 0;
  for (let seq = fromSeq; seq < toSeq; seq++) {
    const a = bySeq.get(seq);
    const b = bySeq.get(seq + 1);
    if (!a || !b) continue;
    total += haversineMeters(a.lat, a.lng, b.lat, b.lng);
  }
  return total;
}

/**
 * 用同一班車在各站的 ETA，推算它大概行到邊一站，再量到目標站剩餘距離。
 * 只睇 seq <= targetSeq，避免循環線後段舊 ETA 干擾。
 */
export function inferDistanceToStop(
  stops: RouteStopPoint[],
  vehicleEtas: VehicleEtaPoint[],
  targetSeq: number,
  etaMinutesAtTarget: number | null,
): { meters: number; estimate: boolean } | null {
  const relevant = vehicleEtas
    .filter((row) => row.seq > 0 && row.seq <= targetSeq && row.etaMinutes != null)
    .sort((a, b) => a.seq - b.seq);

  if (relevant.length) {
    const passed = [...relevant].reverse().find((row) => (row.etaMinutes ?? 99) <= 0.35);
    const fromSeq = passed?.seq ?? Math.max(1, (relevant.find((r) => (r.etaMinutes ?? 99) > 0.35)?.seq ?? 1) - 1);
    const meters = pathDistanceMeters(stops, fromSeq, targetSeq);
    if (meters > 0 || fromSeq >= targetSeq) {
      return { meters: Math.max(0, meters), estimate: false };
    }
  }

  // 無站序推算時，用車速估算（市區／機場巴士約 22 km/h）
  if (etaMinutesAtTarget != null && etaMinutesAtTarget >= 0) {
    const meters = etaMinutesAtTarget * ((22 * 1000) / 60);
    return { meters, estimate: true };
  }
  return null;
}

export function formatBusDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "";
  if (meters < 100) return "即將到站";
  if (meters < 1000) return `距離約 ${Math.round(meters / 10) * 10} m`;
  return `距離約 ${(meters / 1000).toFixed(1)} km`;
}
