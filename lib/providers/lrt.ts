import { cached, TTL } from "@/lib/cache";
import { fetchJson } from "@/lib/http";
import { rankNearby } from "@/lib/nearby";
import { LRT_STATIONS } from "@/lib/static/lrt-stations";
import type { EtaResult, StopHit } from "@/lib/types";

type LrtSchedule = {
  platform_list?: Array<{
    platform_id: number;
    route_list?: Array<{
      route_no: string;
      dest_ch: string;
      time_ch: string;
      train_length?: number;
      stop?: number;
      special?: number;
    }>;
  }>;
};

function parseLrtMinutes(timeCh: string): number | null {
  if (!timeCh || timeCh === "-") return 0;
  if (timeCh.includes("即將") || timeCh.includes("離開")) return 0;
  const m = timeCh.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export async function lrtEta(stationId: string, stopName = ""): Promise<EtaResult[]> {
  const station = LRT_STATIONS.find((s) => String(s.id) === stationId);
  const json = await cached(`lrt:${stationId}`, TTL.eta, () =>
    fetchJson<LrtSchedule>(
      `https://rt.data.gov.hk/v1/transport/mtr/lrt/getSchedule?station_id=${encodeURIComponent(stationId)}&with_special=1`,
    ),
  );
  const rows: EtaResult[] = [];
  for (const platform of json.platform_list ?? []) {
    for (const train of platform.route_list ?? []) {
      if (train.stop) continue;
      rows.push({
        operator: "lrt",
        operatorName: "輕鐵",
        route: train.route_no,
        dest: train.dest_ch,
        stopId: stationId,
        stopName: stopName || station?.name || stationId,
        etaMinutes: parseLrtMinutes(train.time_ch),
        etaTime: null,
        remark: train.special ? "特別班" : undefined,
        platform: String(platform.platform_id),
      });
    }
  }
  return rows.sort((a, b) => (a.etaMinutes ?? 99) - (b.etaMinutes ?? 99));
}

export function nearbyLrtStations(lat: number, lng: number, limit = 6): StopHit[] {
  return rankNearby(
    LRT_STATIONS.map((s) => ({
      operator: "lrt" as const,
      operatorName: "輕鐵",
      stopId: String(s.id),
      name: s.name,
      lat: s.lat,
      lng: s.lng,
    })),
    lat,
    lng,
    limit,
  );
}
