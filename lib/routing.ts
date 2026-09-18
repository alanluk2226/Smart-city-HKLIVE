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
  /** True when some/all segments used straight stop-to-stop chords. */
  mixed?: boolean;
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

/**
 * Reject OSRM legs that wander far beyond the straight stop-to-stop distance.
 * HK one-ways / flyovers often produce huge loops between nearby stops.
 */
const MAX_DETOUR_RATIO = 1.85;
const MAX_DETOUR_EXTRA_M = 450;

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

function straightSegment(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): { points: [number, number][]; distanceMeters: number; durationMinutes: number } {
  const distanceMeters = Math.round(haversineMeters(a.lat, a.lng, b.lat, b.lng));
  return {
    points: [
      [a.lat, a.lng],
      [b.lat, b.lng],
    ],
    distanceMeters,
    durationMinutes: Math.max(1, Math.round(distanceMeters / 350)),
  };
}

function isReasonableDetour(driveMeters: number, straightMeters: number) {
  // Nearby stops: never accept a multi-hundred-metre flyover loop.
  if (straightMeters < 250) {
    return driveMeters <= Math.max(straightMeters * 1.55, straightMeters + 180);
  }
  const limit = Math.max(straightMeters * MAX_DETOUR_RATIO, straightMeters + MAX_DETOUR_EXTRA_M);
  return driveMeters <= limit;
}

async function osrmDrivePair(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): Promise<{ points: [number, number][]; distanceMeters: number; durationMinutes: number } | null> {
  const url = `${OSRM_DRIVE}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  try {
    const json = await fetchJson<OsrmResponse>(url, 10_000);
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates ?? [];
    if (!route || coords.length < 2) return null;
    const distanceMeters = Math.round(route.distance);
    const straight = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    if (!isReasonableDetour(distanceMeters, straight)) return null;
    return {
      points: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceMeters,
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
}

/**
 * Corridor through ordered bus/minibus stops.
 *
 * Transport Department open data publishes stop sequences + coordinates, but
 * not official road polylines (TD GTFS has no shapes.txt). We therefore:
 * - try a short OSRM driving leg between consecutive stops
 * - reject legs that loop wildly (common with HK one-ways / flyovers)
 * - fall back to a straight chord for that segment
 */
export async function driveRouteThrough(
  stops: Array<{ lat: number; lng: number }>,
): Promise<DriveRoute> {
  const cleaned = dedupeNearPoints(stops);
  if (cleaned.length < 2) {
    return {
      points: cleaned.map((s) => [s.lat, s.lng] as [number, number]),
      distanceMeters: 0,
      durationMinutes: 0,
      fallback: true,
    };
  }

  const points: [number, number][] = [];
  let distanceMeters = 0;
  let durationMinutes = 0;
  let usedStraight = false;
  let usedRoad = false;

  // Limit parallel OSRM calls so we don't hammer the public server.
  const CONCURRENCY = 6;
  const segments: Array<{
    points: [number, number][];
    distanceMeters: number;
    durationMinutes: number;
    straight: boolean;
  }> = new Array(cleaned.length - 1);

  for (let i = 0; i < cleaned.length - 1; i += CONCURRENCY) {
    const batch = cleaned.slice(i, i + CONCURRENCY).map((_, j) => i + j);
    await Promise.all(
      batch.map(async (idx) => {
        if (idx >= cleaned.length - 1) return;
        const a = cleaned[idx];
        const b = cleaned[idx + 1];
        const road = await osrmDrivePair(a, b);
        if (road) {
          segments[idx] = { ...road, straight: false };
        } else {
          segments[idx] = { ...straightSegment(a, b), straight: true };
        }
      }),
    );
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    if (seg.straight) usedStraight = true;
    else usedRoad = true;
    distanceMeters += seg.distanceMeters;
    durationMinutes += seg.durationMinutes;
    const slice = i === 0 ? seg.points : seg.points.slice(1);
    points.push(...slice);
  }

  if (points.length < 2) {
    return {
      points: cleaned.map((s) => [s.lat, s.lng] as [number, number]),
      distanceMeters,
      durationMinutes: Math.max(1, durationMinutes),
      fallback: true,
    };
  }

  return {
    points,
    distanceMeters,
    durationMinutes: Math.max(1, durationMinutes),
    fallback: !usedRoad,
    mixed: usedRoad && usedStraight,
  };
}
