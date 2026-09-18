import { fetchJson } from "@/lib/http";
import { haversineMeters } from "@/lib/geo";

export type WalkRoute = {
  points: [number, number][];
  distanceMeters: number;
  durationMinutes: number;
  fallback?: boolean;
};

export type DriveRoute = {
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
  code?: string;
  message?: string;
};

const OSRM_FOOT = "https://router.project-osrm.org/route/v1/foot";
const OSRM_DRIVE = "https://router.project-osrm.org/route/v1/driving";
/** Public OSRM typically allows ~100 waypoints; keep headroom. */
const MAX_WAYPOINTS = 80;

export async function walkRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<WalkRoute> {
  const url = `${OSRM_FOOT}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
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

function dedupeNearPoints(stops: Array<{ lat: number; lng: number }>, minMeters = 12) {
  const out: Array<{ lat: number; lng: number }> = [];
  for (const stop of stops) {
    const prev = out[out.length - 1];
    if (!prev || haversineMeters(prev.lat, prev.lng, stop.lat, stop.lng) >= minMeters) {
      out.push(stop);
    }
  }
  return out;
}

function straightFallback(stops: Array<{ lat: number; lng: number }>): DriveRoute {
  let distanceMeters = 0;
  for (let i = 1; i < stops.length; i++) {
    distanceMeters += haversineMeters(
      stops[i - 1].lat,
      stops[i - 1].lng,
      stops[i].lat,
      stops[i].lng,
    );
  }
  distanceMeters = Math.round(distanceMeters);
  return {
    points: stops.map((s) => [s.lat, s.lng] as [number, number]),
    distanceMeters,
    durationMinutes: Math.max(1, Math.round(distanceMeters / 350)),
    fallback: true,
  };
}

async function osrmDriveChunk(stops: Array<{ lat: number; lng: number }>): Promise<DriveRoute> {
  const path = stops.map((s) => `${s.lng},${s.lat}`).join(";");
  const url = `${OSRM_DRIVE}/${path}?overview=full&geometries=geojson&continue_straight=true`;
  const json = await fetchJson<OsrmResponse>(url, 25_000);
  const route = json.routes?.[0];
  const coords = route?.geometry?.coordinates ?? [];
  if (!route || coords.length < 2) throw new Error(json.message || "no drive route");
  return {
    points: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceMeters: Math.round(route.distance),
    durationMinutes: Math.max(1, Math.round(route.duration / 60)),
  };
}

/**
 * Road-following corridor through ordered bus/minibus stops (OSRM driving).
 * Falls back to straight chords between stops if OSRM fails.
 */
export async function driveRouteThrough(
  stops: Array<{ lat: number; lng: number }>,
): Promise<DriveRoute> {
  const cleaned = dedupeNearPoints(stops);
  if (cleaned.length < 2) return straightFallback(cleaned.length ? cleaned : stops);

  try {
    if (cleaned.length <= MAX_WAYPOINTS) {
      return await osrmDriveChunk(cleaned);
    }

    // Overlapping chunks share the last waypoint so segments stitch cleanly.
    const points: [number, number][] = [];
    let distanceMeters = 0;
    let durationMinutes = 0;
    for (let start = 0; start < cleaned.length - 1; start += MAX_WAYPOINTS - 1) {
      const chunk = cleaned.slice(start, start + MAX_WAYPOINTS);
      if (chunk.length < 2) break;
      const part = await osrmDriveChunk(chunk);
      distanceMeters += part.distanceMeters;
      durationMinutes += part.durationMinutes;
      const slice = start === 0 ? part.points : part.points.slice(1);
      points.push(...slice);
    }
    if (points.length < 2) return straightFallback(cleaned);
    return { points, distanceMeters, durationMinutes: Math.max(1, durationMinutes) };
  } catch {
    return straightFallback(cleaned);
  }
}
