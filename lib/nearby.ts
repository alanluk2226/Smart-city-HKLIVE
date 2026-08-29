import { haversineMeters } from "@/lib/geo";

/** 總覽「附近交通」步行可達半徑 */
export const NEARBY_MAX_METERS = 400;

export function rankNearby<T extends { lat?: number; lng?: number }>(
  items: T[],
  lat: number,
  lng: number,
  limit: number,
  maxMeters?: number,
): (T & { distanceMeters: number })[] {
  return items
    .filter((item) => typeof item.lat === "number" && typeof item.lng === "number")
    .map((item) => ({
      ...item,
      distanceMeters: haversineMeters(lat, lng, item.lat!, item.lng!),
    }))
    .filter((item) => maxMeters == null || item.distanceMeters <= maxMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

export function withinNearbyRadius<T extends { distanceMeters?: number }>(
  items: T[],
  maxMeters = NEARBY_MAX_METERS,
): T[] {
  return items.filter((item) => (item.distanceMeters ?? Infinity) <= maxMeters);
}
