import { cached, TTL } from "@/lib/cache";
import { etaMinutesFromIso, formatEtaClock, haversineMeters } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { MTR_LINE_NAMES, MTR_STATIONS, mtrName } from "@/lib/static/mtr-stations";
import type { EtaResult, StopHit } from "@/lib/types";

type MtrSchedule = {
  status: number;
  isdelay?: string;
  data?: Record<
    string,
    {
      UP?: Array<{ dest: string; plat: string; time: string; ttnt: string }>;
      DOWN?: Array<{ dest: string; plat: string; time: string; ttnt: string }>;
    }
  >;
};

export async function mtrEta(line: string, sta: string): Promise<EtaResult[]> {
  const json = await cached(`mtr:${line}:${sta}`, TTL.eta, () =>
    fetchJson<MtrSchedule>(
      `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}&lang=tc`,
    ),
  );
  const station = MTR_STATIONS.find((s) => s.code === sta);
  const block = json.data?.[`${line}-${sta}`];
  if (!block) return [];
  const rows: EtaResult[] = [];
  for (const dir of ["UP", "DOWN"] as const) {
    for (const train of block[dir] ?? []) {
      rows.push({
        operator: "mtr",
        operatorName: "港鐵",
        route: MTR_LINE_NAMES[line] ?? line,
        dest: mtrName(train.dest),
        stopId: `${line}-${sta}`,
        stopName: station?.name ?? sta,
        etaMinutes: Number.isFinite(Number(train.ttnt))
          ? Number(train.ttnt)
          : etaMinutesFromIso(train.time.replace(" ", "T")),
        etaTime: formatEtaClock(train.time.replace(" ", "T") + "+08:00"),
        platform: train.plat,
        remark: json.isdelay === "Y" ? "服務延誤" : undefined,
      });
    }
  }
  return rows;
}

export function nearbyMtrStations(lat: number, lng: number, limit = 6): StopHit[] {
  return MTR_STATIONS.map((s) => ({
    operator: "mtr" as const,
    operatorName: "港鐵",
    stopId: s.code,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    distanceMeters: haversineMeters(lat, lng, s.lat, s.lng),
    route: s.lines.join(","),
  }))
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, limit);
}
