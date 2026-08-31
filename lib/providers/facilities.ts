import { cached, TTL } from "@/lib/cache";
import { dmsToDecimal, haversineMeters } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { buildRegionFacets, districtMatches, type RegionFacet } from "@/lib/static/hk-districts";
import type { Place } from "@/lib/types";

type VenueRow = {
  Name_cn?: string;
  District_cn?: string;
  Address_cn?: string;
  Phone?: string;
  Opening_hours_cn?: string;
  Latitude?: string | number;
  Longitude?: string | number;
  Court_no_cn?: string;
};

type GeoFeature = {
  type: string;
  geometry?: { type: string; coordinates?: number[] };
  properties?: {
    NAME_TC?: string;
    ADDRESS_TC?: string;
    SEARCH01_TC?: string;
    DATASET_TC?: string;
    LATITUDE?: string | number;
    LONGITUDE?: string | number;
    NSEARCH01_TC?: string;
    NSEARCH02_TC?: string;
  };
};

type GeoCollection = {
  type: string;
  features?: GeoFeature[];
};

export type FacilityPlace = Place & {
  type: string;
  district: string;
  address: string;
  phone: string;
  hours: string;
  courts?: string;
};

export type FacilitySnapshot = {
  places: FacilityPlace[];
  facets: RegionFacet[];
  types: Array<{ type: string; count: number }>;
  mode: "nearby" | "district";
  region: string | null;
  district: string | null;
  type: string | null;
  total: number;
};

const SOURCES: Array<{ type: string; url: string }> = [
  { type: "羽毛球場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-bmtc.json" },
  { type: "籃球場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-bkbc.json" },
  { type: "排球場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-vbc.json" },
  { type: "網球場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-tc.json" },
  { type: "體育館", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-sc.json" },
  { type: "運動場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-sg.json" },
  { type: "滑板場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-sp.json" },
  { type: "射箭場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-ar.json" },
  { type: "草地滾球場", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-bg.json" },
  { type: "游泳池", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-swimming-pools.json" },
  { type: "泳灘", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-beaches.json" },
  { type: "水上活動中心", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-wsc.json" },
  { type: "度假營", url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-hc.json" },
];

export const FACILITY_TYPE_ORDER = SOURCES.map((s) => s.type);

function parseCoord(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const dms = dmsToDecimal(raw);
  if (dms != null) return dms;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function rowsFromPayload(payload: unknown): VenueRow[] {
  if (Array.isArray(payload)) return payload as VenueRow[];
  const geo = payload as GeoCollection;
  if (!geo?.features?.length) return [];
  return geo.features.map((f) => {
    const p = f.properties ?? {};
    const coords = f.geometry?.coordinates;
    return {
      Name_cn: p.NAME_TC,
      District_cn: p.SEARCH01_TC,
      Address_cn: p.ADDRESS_TC,
      Phone: p.NSEARCH01_TC,
      Opening_hours_cn: p.NSEARCH02_TC,
      Latitude: p.LATITUDE ?? coords?.[1],
      Longitude: p.LONGITUDE ?? coords?.[0],
    };
  });
}

async function loadAllFacilities(lat?: number, lng?: number): Promise<FacilityPlace[]> {
  const lists = await Promise.all(
    SOURCES.map((src) =>
      cached(`lcsd:v3:${src.type}`, TTL.facility, () => fetchJson<unknown>(src.url, 20_000)).then(
        (payload) => rowsFromPayload(payload).map((row) => ({ row, type: src.type })),
      ),
    ),
  );

  const places: FacilityPlace[] = [];
  for (const { row, type } of lists.flat()) {
    const vlat = parseCoord(row.Latitude);
    const vlng = parseCoord(row.Longitude);
    if (vlat == null || vlng == null || !row.Name_cn) continue;
    places.push({
      id: `${type}-${row.Name_cn}-${row.Address_cn ?? ""}`,
      name: row.Name_cn,
      type,
      lat: vlat,
      lng: vlng,
      distanceMeters:
        lat != null && lng != null ? haversineMeters(lat, lng, vlat, vlng) : undefined,
      district: row.District_cn ?? "",
      address: row.Address_cn ?? "",
      phone: row.Phone ?? "",
      hours: row.Opening_hours_cn ?? "",
      courts: row.Court_no_cn,
    });
  }
  return places;
}

function sortPlaces(rows: FacilityPlace[]) {
  return [...rows].sort((a, b) => {
    if (a.distanceMeters != null && b.distanceMeters != null) {
      return a.distanceMeters - b.distanceMeters;
    }
    return a.name.localeCompare(b.name, "zh-Hant") || a.type.localeCompare(b.type, "zh-Hant");
  });
}

function typeFacets(rows: FacilityPlace[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  return FACILITY_TYPE_ORDER.filter((t) => counts.has(t)).map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }));
}

export type GetFacilitiesQuery = {
  lat?: number;
  lng?: number;
  region?: string;
  district?: string;
  type?: string;
  limit?: number;
};

export async function getFacilitiesSnapshot(
  query: GetFacilitiesQuery = {},
): Promise<FacilitySnapshot> {
  const all = await loadAllFacilities(query.lat, query.lng);
  const type = query.type?.trim() || null;
  const typed = type ? all.filter((p) => p.type === type) : all;
  const facets = buildRegionFacets(typed);
  const types = typeFacets(all);
  const region = query.region?.trim() || null;
  const district = query.district?.trim() || null;

  if (region && district) {
    const places = sortPlaces(typed.filter((p) => districtMatches(p.district, district)));
    return {
      places,
      facets,
      types,
      mode: "district",
      region,
      district,
      type,
      total: all.length,
    };
  }

  const limit = Math.min(Math.max(query.limit ?? 40, 1), 80);
  return {
    places: sortPlaces(typed).slice(0, limit),
    facets,
    types,
    mode: "nearby",
    region: null,
    district: null,
    type,
    total: all.length,
  };
}

/** @deprecated Prefer getFacilitiesSnapshot */
export async function getFacilities(
  lat: number,
  lng: number,
  type?: string,
  limit = 30,
): Promise<FacilityPlace[]> {
  const snap = await getFacilitiesSnapshot({ lat, lng, type, limit });
  return snap.places;
}
