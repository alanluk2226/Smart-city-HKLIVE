import { cached, TTL } from "@/lib/cache";
import { dmsToDecimal, haversineMeters } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import type { Place } from "@/lib/types";

type VenueRow = {
  Name_cn: string;
  District_cn: string;
  Address_cn: string;
  Phone: string;
  Opening_hours_cn: string;
  Latitude: string;
  Longitude: string;
  Court_no_cn?: string;
};

export type FacilityPlace = Place & {
  type: string;
  district: string;
  address: string;
  phone: string;
  hours: string;
  courts?: string;
};

const SOURCES = [
  {
    type: "羽毛球場",
    url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-bmtc.json",
  },
  {
    type: "籃球場",
    url: "https://www.lcsd.gov.hk/datagovhk/facility/facility-bkbc.json",
  },
];

export async function getFacilities(
  lat: number,
  lng: number,
  type?: string,
  limit = 30,
): Promise<FacilityPlace[]> {
  const lists = await Promise.all(
    SOURCES.map((src) =>
      cached(`lcsd:${src.type}`, TTL.facility, () => fetchJson<VenueRow[]>(src.url, 20_000)).then(
        (rows) => rows.map((row) => ({ row, type: src.type })),
      ),
    ),
  );
  const places: FacilityPlace[] = [];
  for (const { row, type: venueType } of lists.flat()) {
    if (type && venueType !== type) continue;
    const vlat = dmsToDecimal(row.Latitude);
    const vlng = dmsToDecimal(row.Longitude);
    if (vlat == null || vlng == null) continue;
    places.push({
      id: `${venueType}-${row.Name_cn}-${row.Address_cn}`,
      name: row.Name_cn,
      type: venueType,
      lat: vlat,
      lng: vlng,
      distanceMeters: haversineMeters(lat, lng, vlat, vlng),
      district: row.District_cn,
      address: row.Address_cn,
      phone: row.Phone,
      hours: row.Opening_hours_cn,
      courts: row.Court_no_cn,
    });
  }
  return places
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, limit);
}
