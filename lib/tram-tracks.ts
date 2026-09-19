import { haversineMeters } from "@/lib/geo";
import tramTracks from "@/lib/static/tram-tracks.json";
import type { DriveRoute } from "@/lib/routing";

type Pt = { lat: number; lng: number };
type LatLng = [number, number];

const GRID = 1e4; // ~11 m cells for node keys
const SNAP_MAX_M = 90;
const SIMPLIFY_M = 4;

function keyOf(lat: number, lng: number) {
  return `${Math.round(lat * GRID)},${Math.round(lng * GRID)}`;
}

type Graph = {
  coords: Map<string, Pt>;
  adj: Map<string, Array<{ to: string; w: number }>>;
  edges: Array<{ a: string; b: string; aPt: Pt; bPt: Pt }>;
};

let cachedGraph: Graph | null = null;

function buildGraph(): Graph {
  const coords = new Map<string, Pt>();
  const adj = new Map<string, Array<{ to: string; w: number }>>();
  const edges: Graph["edges"] = [];

  function ensure(p: Pt): string {
    const k = keyOf(p.lat, p.lng);
    if (!coords.has(k)) coords.set(k, p);
    if (!adj.has(k)) adj.set(k, []);
    return k;
  }

  function link(a: Pt, b: Pt) {
    const ka = ensure(a);
    const kb = ensure(b);
    if (ka === kb) return;
    const w = haversineMeters(a.lat, a.lng, b.lat, b.lng);
    if (w < 0.3) return;
    adj.get(ka)!.push({ to: kb, w });
    adj.get(kb)!.push({ to: ka, w });
    edges.push({ a: ka, b: kb, aPt: a, bPt: b });
  }

  for (const line of tramTracks.lines as LatLng[][]) {
    for (let i = 1; i < line.length; i++) {
      link({ lat: line[i - 1][0], lng: line[i - 1][1] }, { lat: line[i][0], lng: line[i][1] });
    }
  }

  return { coords, adj, edges };
}

function graph(): Graph {
  if (!cachedGraph) cachedGraph = buildGraph();
  return cachedGraph;
}

function projectOnSegment(p: Pt, a: Pt, b: Pt): { pt: Pt; t: number; dist: number } {
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const px = p.lng * lngScale;
  const py = p.lat * latScale;
  const ax = a.lng * lngScale;
  const ay = a.lat * latScale;
  const bx = b.lng * lngScale;
  const by = b.lat * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  return { pt: { lat, lng }, t, dist: haversineMeters(p.lat, p.lng, lat, lng) };
}

type Snap = { node: string; via: Pt[]; dist: number };

function snapToNetwork(p: Pt, g: Graph): Snap | null {
  let best: Snap | null = null;
  for (const e of g.edges) {
    const proj = projectOnSegment(p, e.aPt, e.bPt);
    if (proj.dist > SNAP_MAX_M) continue;
    // Prefer the nearer endpoint as graph node; keep projection for geometry.
    const endA = haversineMeters(proj.pt.lat, proj.pt.lng, e.aPt.lat, e.aPt.lng);
    const endB = haversineMeters(proj.pt.lat, proj.pt.lng, e.bPt.lat, e.bPt.lng);
    const node = endA <= endB ? e.a : e.b;
    const via = [proj.pt];
    if (!best || proj.dist < best.dist) best = { node, via, dist: proj.dist };
  }
  return best;
}

function dijkstra(g: Graph, start: string, goal: string): string[] | null {
  if (start === goal) return [start];
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const heap: Array<{ id: string; d: number }> = [{ id: start, d: 0 }];
  dist.set(start, 0);

  const push = (item: { id: string; d: number }) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].d <= heap[i].d) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (!heap.length) return top;
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < heap.length && heap[l].d < heap[best].d) best = l;
      if (r < heap.length && heap[r].d < heap[best].d) best = r;
      if (best === i) break;
      [heap[best], heap[i]] = [heap[i], heap[best]];
      i = best;
    }
    return top;
  };

  while (heap.length) {
    const cur = pop();
    if (cur.d !== dist.get(cur.id)) continue;
    if (cur.id === goal) break;
    for (const edge of g.adj.get(cur.id) ?? []) {
      const nd = cur.d + edge.w;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, cur.id);
        push({ id: edge.to, d: nd });
      }
    }
  }

  if (!dist.has(goal)) return null;
  const path = [goal];
  for (let at = goal; at !== start; ) {
    const p = prev.get(at);
    if (!p) return null;
    path.push(p);
    at = p;
  }
  path.reverse();
  return path;
}

function simplify(points: LatLng[], epsilonMeters: number): LatLng[] {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  const a = points[0];
  const b = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = projectOnSegment(
      { lat: points[i][0], lng: points[i][1] },
      { lat: a[0], lng: a[1] },
      { lat: b[0], lng: b[1] },
    ).dist;
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist <= epsilonMeters) return [a, b];
  const left = simplify(points.slice(0, index + 1), epsilonMeters);
  const right = simplify(points.slice(index), epsilonMeters);
  return [...left, ...right.slice(1)];
}

/**
 * Follow OSM tram rails between ordered stops. Returns null when coverage is
 * too poor so the caller can fall back to road routing.
 */
export function tramTrackCorridor(stops: Pt[]): DriveRoute | null {
  if (stops.length < 2) return null;
  const g = graph();
  const snaps: Snap[] = [];
  for (const s of stops) {
    const snap = snapToNetwork(s, g);
    if (!snap) return null;
    snaps.push(snap);
  }

  const points: LatLng[] = [];
  let distanceMeters = 0;
  let roadLegs = 0;
  let straightLegs = 0;

  const pushPt = (lat: number, lng: number) => {
    const last = points[points.length - 1];
    if (!last || last[0] !== lat || last[1] !== lng) points.push([lat, lng]);
  };

  for (let i = 0; i < snaps.length; i++) {
    const stop = stops[i];
    pushPt(stop.lat, stop.lng);
    for (const v of snaps[i].via) pushPt(v.lat, v.lng);

    if (i === snaps.length - 1) break;

    const path = dijkstra(g, snaps[i].node, snaps[i + 1].node);
    const straight = haversineMeters(stop.lat, stop.lng, stops[i + 1].lat, stops[i + 1].lng);
    if (!path || path.length < 1) {
      // Missing rail connectivity — fall back entirely so OSRM can try.
      return null;
    }

    let legM = 0;
    let prev: Pt = snaps[i].via[snaps[i].via.length - 1] ?? stop;
    for (const id of path) {
      const c = g.coords.get(id)!;
      legM += haversineMeters(prev.lat, prev.lng, c.lat, c.lng);
      pushPt(c.lat, c.lng);
      prev = c;
    }
    for (const v of snaps[i + 1].via) {
      legM += haversineMeters(prev.lat, prev.lng, v.lat, v.lng);
      pushPt(v.lat, v.lng);
      prev = v;
    }

    // Reject absurd shortcuts (graph hole) — path much shorter than stop gap is OK;
    // path >> gap means we wandered onto a wrong branch.
    if (legM > Math.max(straight * 3.5, straight + 600)) {
      return null;
    }

    distanceMeters += legM;
    roadLegs++;
  }

  if (points.length < 2) return null;

  return {
    points: simplify(points, SIMPLIFY_M),
    distanceMeters: Math.round(distanceMeters),
    durationMinutes: Math.max(1, Math.round(distanceMeters / 250)),
    fallback: false,
    mixed: straightLegs > 0 && roadLegs > 0,
    roadLegs,
    straightLegs,
    computedAt: Date.now(),
  };
}
