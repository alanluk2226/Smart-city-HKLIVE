import { cached, TTL } from "@/lib/cache";
import { haversineMeters } from "@/lib/geo";
import { fetchBuffer, fetchText } from "@/lib/http";

export type CctvCamera = {
  key: string;
  region: string;
  district: string;
  description: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
  imageUrl: string;
};

export type CctvDistrictFacet = {
  district: string;
  count: number;
};

export type CctvRegionFacet = {
  region: string;
  count: number;
  districts: CctvDistrictFacet[];
};

export type TrafficSnapshot = {
  cameras: CctvCamera[];
  facets: CctvRegionFacet[];
  mode: "nearby" | "district";
  region: string | null;
  district: string | null;
};

/** Display order for TD region / district chips */
export const CCTV_REGION_ORDER = ["香港島", "九龍", "新界"] as const;

export const CCTV_DISTRICT_ORDER: Record<string, string[]> = {
  香港島: ["中西區", "灣仔區", "東區", "南區"],
  九龍: ["油尖旺區", "深水埗區", "九龍城區", "黃大仙區", "觀塘區"],
  新界: ["荃灣區", "屯門區", "元朗區", "北區", "大埔區", "沙田區", "西貢區", "葵青區", "離島區"],
};

function decodeXml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"');
}

async function loadAllCameras(): Promise<CctvCamera[]> {
  return cached("cctv:all:v2", TTL.traffic, async () => {
    const xml = await fetchText(
      "https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_Tc.xml",
    );
    const cameras: CctvCamera[] = [];
    const block = /<image>([\s\S]*?)<\/image>/g;
    let match: RegExpExecArray | null;
    while ((match = block.exec(xml))) {
      const chunk = match[1];
      const grab = (tag: string) => {
        const m = chunk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
        return m ? decodeXml(m[1].trim()) : "";
      };
      const key = grab("key");
      const lat = Number(grab("latitude"));
      const lng = Number(grab("longitude"));
      if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      cameras.push({
        key,
        region: grab("region"),
        district: grab("district"),
        description: grab("description"),
        lat,
        lng,
        imageUrl: `/api/traffic/image?key=${encodeURIComponent(key)}`,
      });
    }
    return cameras;
  });
}

function buildFacets(cameras: CctvCamera[]): CctvRegionFacet[] {
  const byRegion = new Map<string, Map<string, number>>();
  for (const c of cameras) {
    if (!byRegion.has(c.region)) byRegion.set(c.region, new Map());
    const dist = byRegion.get(c.region)!;
    dist.set(c.district, (dist.get(c.district) ?? 0) + 1);
  }

  const regions = [...byRegion.keys()].sort((a, b) => {
    const ia = CCTV_REGION_ORDER.indexOf(a as (typeof CCTV_REGION_ORDER)[number]);
    const ib = CCTV_REGION_ORDER.indexOf(b as (typeof CCTV_REGION_ORDER)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b, "zh-Hant");
  });

  return regions.map((region) => {
    const distMap = byRegion.get(region)!;
    const preferred = CCTV_DISTRICT_ORDER[region] ?? [];
    const districts = [...distMap.entries()]
      .map(([district, count]) => ({ district, count }))
      .sort((a, b) => {
        const ia = preferred.indexOf(a.district);
        const ib = preferred.indexOf(b.district);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.district.localeCompare(b.district, "zh-Hant");
      });
    return {
      region,
      count: districts.reduce((n, d) => n + d.count, 0),
      districts,
    };
  });
}

export type GetCamerasQuery = {
  lat?: number;
  lng?: number;
  region?: string;
  district?: string;
  /** nearby mode only */
  limit?: number;
};

export async function getTrafficSnapshot(query: GetCamerasQuery = {}): Promise<TrafficSnapshot> {
  const all = await loadAllCameras();
  const facets = buildFacets(all);
  const region = query.region?.trim() || null;
  const district = query.district?.trim() || null;

  const withDist = (rows: CctvCamera[]) =>
    rows.map((c) => ({
      ...c,
      distanceMeters:
        query.lat != null && query.lng != null
          ? haversineMeters(query.lat, query.lng, c.lat, c.lng)
          : undefined,
    }));

  // District browse: return every camera in that district
  if (region && district) {
    const cameras = withDist(
      all.filter((c) => c.region === region && c.district === district),
    ).sort((a, b) => {
      if (a.distanceMeters != null && b.distanceMeters != null) {
        return a.distanceMeters - b.distanceMeters;
      }
      return a.description.localeCompare(b.description, "zh-Hant");
    });
    return { cameras, facets, mode: "district", region, district };
  }

  // Nearby fallback
  const limit = Math.min(Math.max(query.limit ?? 40, 1), 80);
  const cameras = withDist(all)
    .sort((a, b) => {
      if (a.distanceMeters != null && b.distanceMeters != null) {
        return a.distanceMeters - b.distanceMeters;
      }
      return a.description.localeCompare(b.description, "zh-Hant");
    })
    .slice(0, limit);

  return { cameras, facets, mode: "nearby", region: null, district: null };
}

/** @deprecated use getTrafficSnapshot */
export async function getCameras(lat?: number, lng?: number, limit = 24): Promise<CctvCamera[]> {
  const snap = await getTrafficSnapshot({ lat, lng, limit });
  return snap.cameras;
}

export async function getCameraImage(key: string) {
  const safe = key.replace(/[^A-Za-z0-9]/g, "");
  if (!safe) throw new Error("invalid camera key");
  return fetchBuffer(`https://tdcctv.data.one.gov.hk/${safe}.JPG`);
}
