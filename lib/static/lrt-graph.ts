import { haversineMeters } from "@/lib/geo";
import { LRT_EDGES } from "@/lib/static/lrt-edges";
import { LRT_STATIONS, lrtName } from "@/lib/static/lrt-stations";
import type { MtrTripLeg } from "@/lib/types";

const SPEED_KMH = 26;
const DWELL_MIN = 0.35;
const WAIT_MIN = 2.2;

type Edge = { to: string; minutes: number };

function hopMinutes(from: string, to: string) {
  const a = LRT_STATIONS.find((s) => String(s.id) === from);
  const b = LRT_STATIONS.find((s) => String(s.id) === to);
  if (!a || !b) return 1.6;
  const km = haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
  return Math.max(1.1, (km / SPEED_KMH) * 60 + DWELL_MIN);
}

function buildAdj() {
  const adj = new Map<string, Edge[]>();
  const add = (from: string, to: string) => {
    const minutes = hopMinutes(from, to);
    const list = adj.get(from) ?? [];
    if (!list.some((e) => e.to === to)) {
      list.push({ to, minutes });
      adj.set(from, list);
    }
  };
  for (const [a, b] of LRT_EDGES) {
    add(a, b);
    add(b, a);
  }
  return adj;
}

const ADJ = buildAdj();

export type LrtRoute = {
  from: string;
  to: string;
  minutes: number;
  interchangeCount: number;
  stops: Array<{ code: string; name: string }>;
  legs: MtrTripLeg[];
};

export function planLrtRoute(from: string, to: string): LrtRoute | null {
  if (from === to) return null;
  if (!ADJ.has(from) || !ADJ.has(to)) return null;

  const dist = new Map<string, number>();
  const prev = new Map<string, { from: string; minutes: number }>();
  const heap: Array<{ cost: number; id: string }> = [{ cost: WAIT_MIN, id: from }];
  dist.set(from, WAIT_MIN);

  while (heap.length) {
    let bestI = 0;
    for (let i = 1; i < heap.length; i++) {
      if (heap[i].cost < heap[bestI].cost) bestI = i;
    }
    const cur = heap.splice(bestI, 1)[0];
    if (cur.cost !== dist.get(cur.id)) continue;
    if (cur.id === to) break;
    for (const edge of ADJ.get(cur.id) ?? []) {
      const cost = cur.cost + edge.minutes;
      if (cost < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, cost);
        prev.set(edge.to, { from: cur.id, minutes: edge.minutes });
        heap.push({ cost, id: edge.to });
      }
    }
  }

  if (!prev.has(to) && from !== to) return null;
  const ids = [to];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur);
    if (!p) break;
    ids.unshift(p.from);
    cur = p.from;
  }
  const stops = ids.map((id) => ({ code: id, name: lrtName(id) }));
  const minutes = Math.max(1, Math.round(dist.get(to) ?? WAIT_MIN));
  return {
    from,
    to,
    minutes,
    interchangeCount: 0,
    stops,
    legs: [
      {
        line: "LRT",
        lineName: "輕鐵",
        from,
        fromName: lrtName(from),
        to,
        toName: lrtName(to),
        stops,
        minutes,
      },
    ],
  };
}
