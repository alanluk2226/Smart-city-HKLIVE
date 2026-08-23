import { cached, TTL } from "@/lib/cache";
import { haversineMeters } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
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

export async function getParking(lat: number, lng: number, limit = 20): Promise<ParkingPlace[]> {
  const [info, vacancy] = await Promise.all([
    cached("parking:info", TTL.parkingInfo, () =>
      fetchJson<List<InfoRow>>(
        "https://api.data.gov.hk/v1/carpark-info-vacancy?data=info&lang=zh_TW",
        20_000,
      ),
    ),
    cached("parking:vacancy", TTL.parkingVacancy, () =>
      fetchJson<List<VacancyRow>>(
        "https://api.data.gov.hk/v1/carpark-info-vacancy?data=vacancy",
        20_000,
      ),
    ),
  ]);
  const vacMap = new Map(vacancy.results.map((v) => [v.park_Id, v]));
  return info.results
    .map((row) => {
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
        distanceMeters: haversineMeters(lat, lng, row.latitude, row.longitude),
        vacancy: vacancyNum,
        vacancyLabel,
        address: row.displayAddress ?? "",
        district: row.district ?? "",
        status: row.opening_status ?? "",
      };
    })
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, limit);
}
