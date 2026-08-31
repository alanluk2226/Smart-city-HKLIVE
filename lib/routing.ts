import { fetchJson } from "@/lib/http";
import { haversineMeters } from "@/lib/geo";

export type WalkRoute = {
  points: [number, number][];
  distanceMeters: number;
  durationMinutes: number;
  fallback?: boolean;
};

type OsrmResponse = {
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
  }>;
};

const OSRM = "https://router.project-osrm.org/route/v1/foot";

export async function walkRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<WalkRoute> {
  const url = `${OSRM}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
  try {
    const json = await fetchJson<OsrmResponse>(url, 12_000);
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates ?? [];
    if (!route || coords.length < 2) throw new Error("no route");
    const distanceMeters = Math.round(route.distance);
    const osrmMin = Math.max(1, Math.round(route.duration / 60));
    // Public OSRM sometimes returns driving-like durations; walk ≥ ~5 km/h.
    const walkFloor = Math.max(1, Math.round(distanceMeters / 85));
    return {
      points: coords.map(([lng, lat]) => [lat, lng]),
      distanceMeters,
      durationMinutes: Math.max(osrmMin, walkFloor),
    };
  } catch {
    const distanceMeters = Math.round(haversineMeters(fromLat, fromLng, toLat, toLng));
    return {
      points: [
        [fromLat, fromLng],
        [toLat, toLng],
      ],
      distanceMeters,
      durationMinutes: Math.max(1, Math.round(distanceMeters / 80)),
      fallback: true,
    };
  }
}
