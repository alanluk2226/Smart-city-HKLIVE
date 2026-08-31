import { cached, TTL } from "@/lib/cache";
import { haversineMeters } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import {
  type FacilityPlace,
  type FacilitySnapshot,
  type GetFacilitiesQuery,
} from "@/lib/providers/facilities";
import mallSnapshot from "@/lib/static/igeocom-malls.json";
import { buildRegionFacets, canonicalDistrict, districtMatches } from "@/lib/static/hk-districts";

type EsriAttr = {
  OBJECTID?: number;
  NAME_TC?: string;
  ADDRESS_TC?: string;
  SEARCH01_TC?: string;
  SEARCH02_TC?: string;
  NSEARCH01_TC?: string;
  NSEARCH04_TC?: string;
  LATITUDE?: string | number;
  LONGITUDE?: string | number;
};

type EsriFeature = {
  attributes?: EsriAttr;
  geometry?: { x?: number; y?: number };
};

type EsriQuery = {
  features?: EsriFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string; code?: number };
};

type MallRow = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  district: string;
  address: string;
};

const LAYER =
  "https://portal.csdi.gov.hk/server/rest/services/common/fehd_rcd_1629969687926_30590/FeatureServer/0/query";

const TOILET_WHERE =
  "SEARCH02_EN IN ('PUBLIC TOILETS','ACCESSIBLE UNISEX TOILETS','UNIVERSAL TOILETS','PUBLIC BATHHOUSES')";

const PAGE_SIZE = 1000;

/** 商場：地政總署 iGeoCom TYPE=MAL，作「通常有洗手間」標記，不標樓層。 */
export const MALL_TYPE = "商場";

export const TOILET_TYPE_ORDER = [
  "公廁",
  "暢通易達洗手間",
  "通用洗手間",
  "公共浴室",
  MALL_TYPE,
];

export type ToiletPlace = FacilityPlace;
export type ToiletSnapshot = FacilitySnapshot;

function parseCoord(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchToiletPage(offset: number): Promise<EsriQuery> {
  const params = new URLSearchParams({
    where: TOILET_WHERE,
    outFields:
      "OBJECTID,NAME_TC,ADDRESS_TC,SEARCH01_TC,SEARCH02_TC,NSEARCH01_TC,NSEARCH04_TC,LATITUDE,LONGITUDE",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    orderByFields: "OBJECTID",
  });
  return fetchJson<EsriQuery>(`${LAYER}?${params}`, 25_000);
}

async function loadFehdToilets(): Promise<ToiletPlace[]> {
  const features: EsriFeature[] = [];
  for (let offset = 0, guard = 0; guard < 8; guard += 1) {
    const page = await fetchToiletPage(offset);
    if (page.error?.message) throw new Error(page.error.message);
    const rows = page.features ?? [];
    features.push(...rows);
    if (rows.length < PAGE_SIZE && !page.exceededTransferLimit) break;
    if (!rows.length) break;
    offset += rows.length;
  }

  const places: ToiletPlace[] = [];
  for (const f of features) {
    const a = f.attributes ?? {};
    const latVal = parseCoord(a.LATITUDE) ?? parseCoord(f.geometry?.y);
    const lngVal = parseCoord(a.LONGITUDE) ?? parseCoord(f.geometry?.x);
    const name = a.NAME_TC?.trim();
    if (!name || latVal == null || lngVal == null) continue;
    if (latVal < 22 || latVal > 23 || lngVal < 113 || lngVal > 115) continue;
    const type = a.SEARCH02_TC?.trim() || "公廁";
    places.push({
      id: `toilet-${a.OBJECTID ?? `${name}-${a.ADDRESS_TC ?? ""}`}`,
      name,
      type,
      lat: latVal,
      lng: lngVal,
      district: canonicalDistrict(a.SEARCH01_TC) ?? a.SEARCH01_TC ?? "",
      address: a.ADDRESS_TC ?? "",
      phone: a.NSEARCH01_TC ?? "",
      hours: a.NSEARCH04_TC ?? "",
    });
  }
  return places;
}

function loadMallMarkers(): ToiletPlace[] {
  return (mallSnapshot as MallRow[]).flatMap((m) => {
    if (!m.name || !Number.isFinite(m.lat) || !Number.isFinite(m.lng)) return [];
    return [
      {
        id: m.id,
        name: m.name,
        type: MALL_TYPE,
        lat: m.lat,
        lng: m.lng,
        district: canonicalDistrict(m.district) ?? m.district,
        address: m.address,
        phone: "",
        hours: "通常有洗手間；樓層請入商場後自行查找",
      },
    ];
  });
}

async function loadAllToiletPlaces(): Promise<ToiletPlace[]> {
  const [fehd, malls] = await Promise.all([
    cached("fehd:toilets:v2", TTL.toilet, () => loadFehdToilets()),
    Promise.resolve(loadMallMarkers()),
  ]);
  return [...fehd, ...malls];
}

function sortPlaces(rows: ToiletPlace[]) {
  return [...rows].sort((a, b) => {
    if (a.distanceMeters != null && b.distanceMeters != null) {
      return a.distanceMeters - b.distanceMeters;
    }
    return a.name.localeCompare(b.name, "zh-Hant") || a.type.localeCompare(b.type, "zh-Hant");
  });
}

function typeFacets(rows: ToiletPlace[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  const ordered = TOILET_TYPE_ORDER.filter((t) => counts.has(t)).map((type) => ({
    type,
    count: counts.get(type) ?? 0,
  }));
  const extras = [...counts.entries()]
    .filter(([type]) => !TOILET_TYPE_ORDER.includes(type))
    .sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"))
    .map(([type, count]) => ({ type, count }));
  return [...ordered, ...extras];
}

export async function getToiletsSnapshot(query: GetFacilitiesQuery = {}): Promise<ToiletSnapshot> {
  const all = await loadAllToiletPlaces().then((rows) =>
    rows.map((p) => ({
      ...p,
      distanceMeters:
        query.lat != null && query.lng != null
          ? haversineMeters(query.lat, query.lng, p.lat, p.lng)
          : undefined,
    })),
  );

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
