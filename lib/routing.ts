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
  /** Legs drawn along roads vs. straight chords — drives the map caption. */
  roadLegs?: number;
  straightLegs?: number;
  computedAt?: number;
};

type OsrmResponse = {
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: Array<{
      distance: number;
      duration: number;
      steps?: Array<{ geometry?: { coordinates?: [number, number][] } }>;
    }>;
  }>;
  code?: string;
  message?: string;
};

type OsrmNearestResponse = {
  waypoints?: Array<{ location?: [number, number]; distance?: number }>;
  code?: string;
};

const OSRM_BASE = (process.env.OSRM_BASE_URL || "https://router.project-osrm.org").replace(/\/+$/, "");
const OSRM_FOOT = `${OSRM_BASE}/route/v1/foot`;
const OSRM_DRIVE = `${OSRM_BASE}/route/v1/driving`;
const OSRM_NEAREST = `${OSRM_BASE}/nearest/v1/driving`;

/**
 * Reject OSRM legs that wander far beyond the straight stop-to-stop distance.
 * HK one-ways / flyovers often produce huge loops between nearby stops.
 */
const MAX_DETOUR_RATIO = 1.85;
const MAX_DETOUR_EXTRA_M = 450;

/** Repairing a leg costs several OSRM calls, so cap the work per route. */
const MAX_REPAIRED_LEGS = 10;
const SNAP_CANDIDATES = 4;
const REPAIR_BUDGET_MS = 16_000;
/**
 * Whole-corridor ceiling, kept under the route handler's `maxDuration` so a
 * slow OSRM degrades to straight chords instead of a gateway timeout.
 */
const TOTAL_BUDGET_MS = 24_000;
/** Polyline simplification tolerance — keeps cached geometry small. */
const SIMPLIFY_EPSILON_M = 5;

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

/**
 * Buses legitimately loop around a block or a one-way pair, so short legs need
 * a generous allowance; the aim is only to catch mis-snapped legs that dive
 * onto a flyover or tunnel and come back kilometres later.
 */
function isReasonableDetour(driveMeters: number, straightMeters: number) {
  if (straightMeters < 400) {
    return driveMeters <= Math.max(straightMeters * 3, straightMeters + 450);
  }
  if (straightMeters < 1500) {
    return driveMeters <= Math.max(straightMeters * 2.2, straightMeters + 700);
  }
  const limit = Math.max(straightMeters * MAX_DETOUR_RATIO, straightMeters + MAX_DETOUR_EXTRA_M);
  return driveMeters <= limit;
}

type Segment = {
  points: [number, number][];
  distanceMeters: number;
  durationMinutes: number;
  straight: boolean;
};

type Pt = { lat: number; lng: number };

function toLatLng(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
}

/** Perpendicular distance in metres, treating the local area as flat. */
function pointToSegmentMeters(p: [number, number], a: [number, number], b: [number, number]) {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((p[0] * Math.PI) / 180);
  const px = p[1] * lngScale;
  const py = p[0] * latScale;
  const ax = a[1] * lngScale;
  const ay = a[0] * latScale;
  const bx = b[1] * lngScale;
  const by = b[0] * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function simplifyPath(points: [number, number][], epsilonMeters: number): [number, number][] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToSegmentMeters(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= epsilonMeters) return [points[0], points[points.length - 1]];
  const left = simplifyPath(points.slice(0, index + 1), epsilonMeters);
  const right = simplifyPath(points.slice(index), epsilonMeters);
  return [...left, ...right.slice(1)];
}

async function osrmThroughLegs(points: Pt[]): Promise<Segment[] | null> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `${OSRM_DRIVE}/${coords}?overview=false&geometries=geojson&steps=true`;
  try {
    const json = await fetchJson<OsrmResponse>(url, 20_000);
    const legs = json.routes?.[0]?.legs;
    if (!legs || legs.length !== points.length - 1) return null;
    return legs.map((leg, i) => {
      const coordinates: [number, number][] = [];
      for (const step of leg.steps ?? []) {
        for (const c of step.geometry?.coordinates ?? []) {
          const last = coordinates[coordinates.length - 1];
          if (!last || last[0] !== c[0] || last[1] !== c[1]) coordinates.push(c);
        }
      }
      const straightMeters = haversineMeters(
        points[i].lat,
        points[i].lng,
        points[i + 1].lat,
        points[i + 1].lng,
      );
      const distanceMeters = Math.round(leg.distance);
      const usable = coordinates.length >= 2 && isReasonableDetour(distanceMeters, straightMeters);
      if (!usable) return { ...straightSegment(points[i], points[i + 1]), straight: true };
      return {
        points: toLatLng(coordinates),
        distanceMeters,
        durationMinutes: Math.max(1, Math.round(leg.duration / 60)),
        straight: false,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Stops sitting under a flyover or tunnel portal snap onto that carriageway,
 * which forces OSRM into kilometre-long loops. Nearby alternatives usually
 * include the surface street the bus actually uses.
 */
async function snapCandidates(point: Pt): Promise<Pt[]> {
  try {
    const json = await fetchJson<OsrmNearestResponse>(
      `${OSRM_NEAREST}/${point.lng},${point.lat}?number=${SNAP_CANDIDATES}`,
      8_000,
    );
    const out: Pt[] = [];
    for (const wp of json.waypoints ?? []) {
      const loc = wp.location;
      if (!loc) continue;
      out.push({ lat: loc[1], lng: loc[0] });
    }
    return out.length ? out : [point];
  } catch {
    return [point];
  }
}

async function osrmPair(a: Pt, b: Pt): Promise<{ points: [number, number][]; distanceMeters: number; durationMinutes: number } | null> {
  try {
    const json = await fetchJson<OsrmResponse>(
      `${OSRM_DRIVE}/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&radiuses=12;12`,
      10_000,
    );
    const route = json.routes?.[0];
    const coords = route?.geometry?.coordinates ?? [];
    if (!route || coords.length < 2) return null;
    return {
      points: toLatLng(coords),
      distanceMeters: Math.round(route.distance),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
}

/** Retry a looping leg against alternative snap points on both ends. */
async function repairLeg(a: Pt, b: Pt, deadline: number): Promise<Segment | null> {
  const straightMeters = haversineMeters(a.lat, a.lng, b.lat, b.lng);
  const [fromCandidates, toCandidates] = await Promise.all([snapCandidates(a), snapCandidates(b)]);
  let best: { points: [number, number][]; distanceMeters: number; durationMinutes: number } | null = null;
  for (const from of fromCandidates) {
    for (const to of toCandidates) {
      if (Date.now() > deadline) return best && isReasonableDetour(best.distanceMeters, straightMeters)
        ? { ...best, straight: false }
        : null;
      const attempt = await osrmPair(from, to);
      if (!attempt) continue;
      if (!best || attempt.distanceMeters < best.distanceMeters) best = attempt;
      if (isReasonableDetour(attempt.distanceMeters, straightMeters)) {
        return { ...attempt, straight: false };
      }
    }
  }
  return null;
}

/**
 * Corridor through ordered bus/minibus stops.
 *
 * Transport Department open data publishes stop sequences + coordinates, but
 * no official road polylines (TD GTFS has no shapes.txt), so the shape is
 * derived from OSRM:
 * - one multi-waypoint driving request covers the whole route
 * - legs that loop far beyond the straight stop-to-stop distance are retried
 *   against alternative snap points (fixes flyover / tunnel mis-snapping)
 * - legs that still loop fall back to a straight chord
 *
 * Results are expensive to compute but stable, so callers cache them.
 */
export async function driveRouteThrough(stops: Pt[]): Promise<DriveRoute> {
  const startedAt = Date.now();
  const cleaned = dedupeNearPoints(stops);
  if (cleaned.length < 2) {
    return {
      points: cleaned.map((s) => [s.lat, s.lng] as [number, number]),
      distanceMeters: 0,
      durationMinutes: 0,
      fallback: true,
      computedAt: Date.now(),
    };
  }

  const segments =
    (await osrmThroughLegs(cleaned)) ??
    cleaned.slice(1).map((_, i) => ({ ...straightSegment(cleaned[i], cleaned[i + 1]), straight: true }));

  const deadline = Math.min(Date.now() + REPAIR_BUDGET_MS, startedAt + TOTAL_BUDGET_MS);
  const broken = segments
    .map((seg, i) => (seg.straight ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, MAX_REPAIRED_LEGS);

  for (const i of broken) {
    if (Date.now() > deadline) break;
    const repaired = await repairLeg(cleaned[i], cleaned[i + 1], deadline);
    if (repaired) segments[i] = repaired;
  }

  const points: [number, number][] = [];
  let distanceMeters = 0;
  let durationMinutes = 0;
  let roadLegs = 0;
  let straightLegs = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.straight) straightLegs++;
    else roadLegs++;
    distanceMeters += seg.distanceMeters;
    durationMinutes += seg.durationMinutes;
    // Anchor every leg at the stop itself: repaired legs snap to a different
    // carriageway than their neighbours, so the pin is the shared joint.
    const anchored: [number, number][] = [
      [cleaned[i].lat, cleaned[i].lng],
      ...seg.points,
      [cleaned[i + 1].lat, cleaned[i + 1].lng],
    ];
    for (const p of anchored) {
      const last = points[points.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) points.push(p);
    }
  }

  if (points.length < 2) {
    return {
      points: cleaned.map((s) => [s.lat, s.lng] as [number, number]),
      distanceMeters,
      durationMinutes: Math.max(1, durationMinutes),
      fallback: true,
      computedAt: Date.now(),
    };
  }

  return {
    points: simplifyPath(points, SIMPLIFY_EPSILON_M),
    distanceMeters,
    durationMinutes: Math.max(1, durationMinutes),
    fallback: roadLegs === 0,
    mixed: roadLegs > 0 && straightLegs > 0,
    roadLegs,
    straightLegs,
    computedAt: Date.now(),
  };
}
