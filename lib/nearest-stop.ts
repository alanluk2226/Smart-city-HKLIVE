import { getLocationEnabled } from "@/lib/location-pref";
import { haversineMeters } from "@/lib/geo";
import type { StopHit } from "@/lib/types";

export function nearestStopOnRoute(
  stops: StopHit[],
  lat: number,
  lng: number,
): StopHit | null {
  let best: StopHit | null = null;
  let bestD = Infinity;
  for (const stop of stops) {
    if (typeof stop.lat !== "number" || typeof stop.lng !== "number") continue;
    const d = haversineMeters(lat, lng, stop.lat, stop.lng);
    if (d < bestD) {
      bestD = d;
      best = stop;
    }
  }
  return best;
}

function readPosition(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6_000, maximumAge: 60_000 },
    );
  });
}

/**
 * Prefer the stop nearest the user when location is enabled; otherwise first stop.
 */
export async function pickInitialRouteStop(stops: StopHit[]): Promise<StopHit | null> {
  if (!stops.length) return null;
  if (!getLocationEnabled()) return stops[0];

  const pos = await readPosition();
  if (!pos) return stops[0];

  return nearestStopOnRoute(stops, pos.lat, pos.lng) ?? stops[0];
}
