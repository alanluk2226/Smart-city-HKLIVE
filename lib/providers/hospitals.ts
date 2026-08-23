import { cached, TTL } from "@/lib/cache";
import { haversineMeters, parseWaitMinutes } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { HOSPITALS } from "@/lib/static/hospitals";

export type HospitalWait = {
  name: string;
  cluster: string;
  lat: number;
  lng: number;
  t1: string;
  t2: string;
  t3: string;
  t45: string;
  waitMinutes: number | null;
  distanceMeters?: number;
  updateTime: string;
};

type HaJson = {
  waitTime: Array<{
    hospName: string;
    t1wt: string;
    t2wt: string;
    t3p50: string;
    t45p50: string;
  }>;
  updateTime: string;
};

export async function getHospitals(lat?: number, lng?: number): Promise<HospitalWait[]> {
  const json = await cached("ha:ae", TTL.hospital, () =>
    fetchJson<HaJson>("https://www.ha.org.hk/opendata/aed/aedwtdata2-tc.json"),
  );
  return HOSPITALS.map((h) => {
    const wait = json.waitTime.find((w) => w.hospName === h.name);
    return {
      name: h.name,
      cluster: h.cluster,
      lat: h.lat,
      lng: h.lng,
      t1: wait?.t1wt ?? "—",
      t2: wait?.t2wt ?? "—",
      t3: wait?.t3p50 ?? "—",
      t45: wait?.t45p50 ?? "—",
      waitMinutes: parseWaitMinutes(wait?.t45p50 ?? ""),
      distanceMeters:
        lat != null && lng != null ? haversineMeters(lat, lng, h.lat, h.lng) : undefined,
      updateTime: json.updateTime,
    };
  }).sort((a, b) => {
    if (a.distanceMeters != null && b.distanceMeters != null) {
      return a.distanceMeters - b.distanceMeters;
    }
    return (b.waitMinutes ?? 0) - (a.waitMinutes ?? 0);
  });
}
