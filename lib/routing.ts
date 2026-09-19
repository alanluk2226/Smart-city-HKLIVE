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
const TOTAL_BUDGET_MS = 28_000;
/** Polyline simplification tolerance — keeps cached geometry small. */
const SIMPLIFY_EPSILON_M = 5;
/**
 * Long corridors (tram mainline ~74 stops) are split so each OSRM call stays
 * under URL / timeout limits. Overlap one stop so chunks stitch cleanly.
 */
const CORRIDOR_CHUNK = 28;

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
function isReasonableDetour(driveMeters: number, straightMeters: number, strict = false) {
  // Tracks run straight along the street, so any block-sized car detour is
  // wrong for a tram even though it would be plausible for a bus.
  if (strict) {
    return driveMeters <= Math.max(straightMeters * 1.45, straightMeters + 150);
  }
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

async function osrmThroughLegs(points: Pt[], strict: boolean): Promise<Segment[] | null> {
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
      const usable = coordinates.length >= 2 && isReasonableDetour(distanceMeters, straightMeters, strict);
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

async function osrmPair(
  a: Pt,
  b: Pt,
): Promise<{ points: [number, number][]; distanceMeters: number; durationMinutes: number } | null> {
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

/**
 * Retry a looping leg: first against the opposite direction (trams share one
 * pair of tracks, so the return path is the same street), then against
 * alternative snap points on both ends.
 */
async function repairLeg(
  a: Pt,
  b: Pt,
  deadline: number,
  bidirectional: boolean,
): Promise<Segment | null> {
  const straightMeters = haversineMeters(a.lat, a.lng, b.lat, b.lng);

  if (bidirectional) {
    const reverse = await osrmPair(b, a);
    if (reverse && isReasonableDetour(reverse.distanceMeters, straightMeters, bidirectional)) {
      return { ...reverse, points: [...reverse.points].reverse(), straight: false };
    }
  }

  const [fromCandidates, toCandidates] = await Promise.all([snapCandidates(a), snapCandidates(b)]);
  for (const from of fromCandidates) {
    for (const to of toCandidates) {
      if (Date.now() > deadline) return null;
      const attempt = await osrmPair(from, to);
      if (attempt && isReasonableDetour(attempt.distanceMeters, straightMeters, bidirectional)) {
        return { ...attempt, straight: false };
      }
      if (!bidirectional) continue;
      const reverse = await osrmPair(to, from);
      if (reverse && isReasonableDetour(reverse.distanceMeters, straightMeters, bidirectional)) {
        return { ...reverse, points: [...reverse.points].reverse(), straight: false };
      }
    }
  }
  return null;
}

/**
 * Corridor through ordered bus/minibus/tram stops.
 *
 * Transport Department open data publishes stop sequences + coordinates, but
 * no official road polylines (TD GTFS has no shapes.txt), so the shape is
 * derived from OSRM:
 * - one multi-waypoint driving request covers a chunk of the route
 * - long lines (tram) are split into overlapping chunks and stitched
 * - legs that loop far beyond the straight stop-to-stop distance are retried
 *   against alternative snap points (fixes flyover / tunnel mis-snapping)
 * - legs that still loop fall back to a straight chord
 *
 * Results are expensive to compute but stable, so callers cache them.
 *
 * `bidirectional` suits modes that use the same street both ways (tram), where
 * a one-way restriction only blocks the car profile, not the vehicle.
 */
export async function driveRouteThrough(
  stops: Pt[],
  { bidirectional = false }: { bidirectional?: boolean } = {},
): Promise<DriveRoute> {
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

  // Trams: prefer OSM rail geometry so we follow tracks instead of car one-ways
  // (which often collapse to building-cutting chords).
  if (bidirectional) {
    const { tramTrackCorridor } = await import("@/lib/tram-tracks");
    const tracked = tramTrackCorridor(cleaned);
    if (tracked?.points && tracked.points.length > 2 && !tracked.fallback) {
      return tracked;
    }
  }

  if (cleaned.length <= CORRIDOR_CHUNK) {
    return driveRouteChunk(cleaned, bidirectional, startedAt + TOTAL_BUDGET_MS);
  }

  // Overlapping windows: [0..27], [27..54], [54..end] — shared stop is the joint.
  const chunks: Pt[][] = [];
  for (let start = 0; start < cleaned.length - 1; start += CORRIDOR_CHUNK - 1) {
    const end = Math.min(cleaned.length, start + CORRIDOR_CHUNK);
    chunks.push(cleaned.slice(start, end));
    if (end >= cleaned.length) break;
  }

  const points: [number, number][] = [];
  let distanceMeters = 0;
  let durationMinutes = 0;
  let roadLegs = 0;
  let straightLegs = 0;

  for (let c = 0; c < chunks.length; c++) {
    const budgetLeft = startedAt + TOTAL_BUDGET_MS - Date.now();
    if (budgetLeft < 2_000) {
      // Out of time — finish with stop-to-stop chords so the line still reaches the tip.
      const last = points[points.length - 1];
      let startIdx = 0;
      if (last) {
        const hit = cleaned.findIndex(
          (s) => Math.abs(s.lat - last[0]) < 1e-5 && Math.abs(s.lng - last[1]) < 1e-5,
        );
        if (hit >= 0) startIdx = hit;
      }
      for (let i = startIdx + 1; i < cleaned.length; i++) {
        const seg = straightSegment(cleaned[i - 1], cleaned[i]);
        straightLegs++;
        distanceMeters += seg.distanceMeters;
        durationMinutes += seg.durationMinutes;
        for (const p of seg.points) {
          const prev = points[points.length - 1];
          if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) points.push(p);
        }
      }
      break;
    }

    const part = await driveRouteChunk(chunks[c], bidirectional, Date.now() + budgetLeft);
    roadLegs += part.roadLegs ?? 0;
    straightLegs += part.straightLegs ?? 0;
    distanceMeters += part.distanceMeters;
    durationMinutes += part.durationMinutes;

    const partPoints = part.points;
    for (let i = 0; i < partPoints.length; i++) {
      // Skip duplicate joint when appending later chunks.
      if (c > 0 && i === 0) continue;
      const p = partPoints[i];
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

async function driveRouteChunk(
  cleaned: Pt[],
  bidirectional: boolean,
  absoluteDeadline: number,
): Promise<DriveRoute> {
  const segments =
    (await osrmThroughLegs(cleaned, bidirectional)) ??
    cleaned.slice(1).map((_, i) => ({ ...straightSegment(cleaned[i], cleaned[i + 1]), straight: true }));

  const deadline = Math.min(Date.now() + REPAIR_BUDGET_MS, absoluteDeadline);
  const broken = segments
    .map((seg, i) => (seg.straight ? i : -1))
    .filter((i) => i >= 0)
    .slice(0, MAX_REPAIRED_LEGS);

  for (const i of broken) {
    if (Date.now() > deadline) break;
    const repaired = await repairLeg(cleaned[i], cleaned[i + 1], deadline, bidirectional);
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
      roadLegs,
      straightLegs,
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
