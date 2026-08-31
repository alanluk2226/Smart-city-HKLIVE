import { cached, TTL } from "@/lib/cache";
import { haversineMeters } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { buildRegionFacets, districtMatches, type RegionFacet } from "@/lib/static/hk-districts";
import type { Place } from "@/lib/types";

type InfoRow = {
  park_Id: string;
  name: string;
  displayAddress?: string;
  district?: string;
  latitude: number;
  longitude: number;
  opening_status?: string;
};

type VacancyRow = {
  park_Id: string;
  privateCar?: Array<{ vacancy_type: string; vacancy: number; lastupdate?: string }>;
};

type List<T> = { results: T[] };

export type ParkingPlace = Place & {
  vacancy: number | null;
  vacancyLabel: string;
  address: string;
  district: string;
  status: string;
};

export type ParkingSnapshot = {
  places: ParkingPlace[];
  facets: RegionFacet[];
  mode: "nearby" | "district";
  region: string | null;
  district: string | null;
  total: number;
};

async function loadAllParking(lat?: number, lng?: number): Promise<ParkingPlace[]> {
  const [info, vacancy] = await Promise.all([
    cached("parking:info:v2", TTL.parkingInfo, () =>
      fetchJson<List<InfoRow>>(
        "https://api.data.gov.hk/v1/carpark-info-vacancy?data=info&lang=zh_TW",
        20_000,
      ),
    ),
    cached("parking:vacancy:v2", TTL.parkingVacancy, () =>
      fetchJson<List<VacancyRow>>(
        "https://api.data.gov.hk/v1/carpark-info-vacancy?data=vacancy",
        20_000,
      ),
    ),
  ]);
  const vacMap = new Map(vacancy.results.map((v) => [v.park_Id, v]));
  return info.results.map((row) => {
    const v = vacMap.get(row.park_Id)?.privateCar?.[0];
    let vacancyNum: number | null = null;
    let vacancyLabel = "暫無數據";
    if (v?.vacancy_type === "A") {
      vacancyNum = v.vacancy;
      vacancyLabel = v.vacancy < 0 ? "暫無數據" : String(v.vacancy);
    } else if (v?.vacancy_type === "B") {
      vacancyLabel = v.vacancy > 0 ? "尚有空位" : "已滿";
    } else if (v?.vacancy_type === "C") {
      vacancyLabel = "已關閉";
    }
    return {
      id: row.park_Id,
      name: row.name,
      lat: row.latitude,
      lng: row.longitude,
      distanceMeters:
        lat != null && lng != null
          ? haversineMeters(lat, lng, row.latitude, row.longitude)
          : undefined,
      vacancy: vacancyNum,
      vacancyLabel,
      address: row.displayAddress ?? "",
      district: row.district ?? "",
      status: row.opening_status ?? "",
    };
  });
}

function sortPlaces(rows: ParkingPlace[]) {
  return [...rows].sort((a, b) => {
    if (a.distanceMeters != null && b.distanceMeters != null) {
      return a.distanceMeters - b.distanceMeters;
    }
    return a.name.localeCompare(b.name, "zh-Hant");
  });
}

export type GetParkingQuery = {
  lat?: number;
  lng?: number;
  region?: string;
  district?: string;
  limit?: number;
};

export async function getParkingSnapshot(query: GetParkingQuery = {}): Promise<ParkingSnapshot> {
  const all = await loadAllParking(query.lat, query.lng);
  const facets = buildRegionFacets(all);
  const region = query.region?.trim() || null;
  const district = query.district?.trim() || null;

  if (region && district) {
    const places = sortPlaces(all.filter((p) => districtMatches(p.district, district)));
    return { places, facets, mode: "district", region, district, total: all.length };
  }

  const limit = Math.min(Math.max(query.limit ?? 40, 1), 80);
  return {
    places: sortPlaces(all).slice(0, limit),
    facets,
    mode: "nearby",
    region: null,
    district: null,
    total: all.length,
  };
}

/** @deprecated Prefer getParkingSnapshot */
export async function getParking(lat: number, lng: number, limit = 20): Promise<ParkingPlace[]> {
  const snap = await getParkingSnapshot({ lat, lng, limit });
  return snap.places;
}
