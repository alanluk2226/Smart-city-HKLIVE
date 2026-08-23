import { haversineMeters } from "@/lib/geo";
import { MTR_SCHEMATIC_LINES, MTR_WALK_LINKS } from "@/lib/static/mtr-schematic";
import { MTR_LINE_NAMES, MTR_STATIONS, mtrName } from "@/lib/static/mtr-stations";
import type { MtrTripLeg } from "@/lib/types";

const SPEED_KMH: Record<string, number> = {
  TWL: 34,
  ISL: 34,
  KTL: 34,
  TKL: 36,
  SIL: 40,
  TML: 48,
  EAL: 52,
  TCL: 74,
  AEL: 80,
  DRL: 42,
  WALK: 4.4,
};

const DWELL_MIN = 0.5;
const WAIT_MIN = 2;
const INTERCHANGE_MIN = 3.5;
const AEL_PENALTY = 18;
const AEL_ONLY = new Set(["AIR", "AWE"]);
const RAC = "RAC";

type Edge = { to: string; line: string; minutes: number };

type State = { station: string; line: string | null };

function lineId(id: string) {
  return id.replace(/\d+$/, "");
}

const WALK_MIN: Record<string, number> = {
  "AUS|WEK": 6,
  "WEK|AUS": 6,
  "KOW|WEK": 8,
  "WEK|KOW": 8,
};

function hopMinutes(from: string, to: string, line: string) {
  if (line === "WALK") {
    const fixed = WALK_MIN[`${from}|${to}`];
    if (fixed != null) return fixed;
  }
  const a = MTR_STATIONS.find((s) => s.code === from);
  const b = MTR_STATIONS.find((s) => s.code === to);
  if (!a || !b) return 3;
  const km = haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
  const speed = SPEED_KMH[line] ?? 34;
  return Math.max(1.3, (km / speed) * 60 + (line === "WALK" ? 0 : DWELL_MIN));
}

function buildAdj(): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>();
  const add = (from: string, to: string, line: string) => {
    const minutes = hopMinutes(from, to, line);
    const list = adj.get(from) ?? [];
    if (!list.some((e) => e.to === to && e.line === line)) {
      list.push({ to, line, minutes });
      adj.set(from, list);
    }
  };
  for (const line of MTR_SCHEMATIC_LINES) {
    const id = lineId(line.id);
    const codes = line.path.filter((n): n is string => typeof n === "string");
    for (let i = 0; i < codes.length - 1; i++) {
      add(codes[i], codes[i + 1], id);
      add(codes[i + 1], codes[i], id);
    }
  }
  for (const [a, b] of MTR_WALK_LINKS) {
    add(a, b, "WALK");
    add(b, a, "WALK");
  }
  return adj;
}

const ADJ = buildAdj();

function key(s: State) {
  return `${s.station}|${s.line ?? ""}`;
}

function usesAel(from: string, to: string) {
  return AEL_ONLY.has(from) || AEL_ONLY.has(to);
}

export type MtrRouteStep = {
  from: string;
  to: string;
  line: string;
  minutes: number;
};

export type MtrRoute = {
  from: string;
  to: string;
  minutes: number;
  interchangeCount: number;
  steps: MtrRouteStep[];
  legs: MtrTripLeg[];
};

export function planMtrRoute(from: string, to: string): MtrRoute | null {
  if (from === to) return null;
  if (!ADJ.has(from) || !ADJ.has(to)) return null;

  const aelOk = usesAel(from, to);
  const racOk = from === RAC || to === RAC;
  const dist = new Map<string, number>();
  const prev = new Map<string, { state: State; step: MtrRouteStep }>();
  const heap: Array<{ cost: number; state: State }> = [{ cost: WAIT_MIN, state: { station: from, line: null } }];
  dist.set(key({ station: from, line: null }), WAIT_MIN);

  while (heap.length) {
    let bestI = 0;
    for (let i = 1; i < heap.length; i++) {
      if (heap[i].cost < heap[bestI].cost) bestI = i;
    }
    const cur = heap.splice(bestI, 1)[0];
    const curKey = key(cur.state);
    if (cur.cost !== dist.get(curKey)) continue;
    if (cur.state.station === to) {
      return buildRoute(from, to, cur.state, prev, cur.cost);
    }
    for (const edge of ADJ.get(cur.state.station) ?? []) {
      if (edge.line === "AEL" && !aelOk) continue;
      if (!racOk && (edge.to === RAC || cur.state.station === RAC)) continue;
      const change =
        cur.state.line &&
        cur.state.line !== edge.line &&
        cur.state.line !== "WALK" &&
        edge.line !== "WALK"
          ? INTERCHANGE_MIN
          : 0;
      const extra = edge.line === "AEL" && !aelOk ? AEL_PENALTY : 0;
      const next: State = { station: edge.to, line: edge.line };
      const nextKey = key(next);
      const cost = cur.cost + edge.minutes + change + extra;
      if (cost < (dist.get(nextKey) ?? Infinity)) {
        dist.set(nextKey, cost);
        prev.set(nextKey, {
          state: cur.state,
          step: { from: cur.state.station, to: edge.to, line: edge.line, minutes: edge.minutes + change },
        });
        heap.push({ cost, state: next });
      }
    }
  }
  return null;
}

function buildRoute(
  from: string,
  to: string,
  end: State,
  prev: Map<string, { state: State; step: MtrRouteStep }>,
  minutes: number,
): MtrRoute {
  const steps: MtrRouteStep[] = [];
  let cur = end;
  while (cur.station !== from || cur.line !== null) {
    const p = prev.get(key(cur));
    if (!p) break;
    steps.unshift(p.step);
    cur = p.state;
  }
  const legs = collapseLegs(steps);
  return {
    from,
    to,
    minutes: Math.max(1, Math.round(minutes)),
    interchangeCount: Math.max(0, legs.filter((l) => l.line !== "WALK").length - 1),
    steps,
    legs,
  };
}

function collapseLegs(steps: MtrRouteStep[]): MtrTripLeg[] {
  const legs: MtrTripLeg[] = [];
  for (const step of steps) {
    const last = legs[legs.length - 1];
    if (last && last.line === step.line) {
      last.to = step.to;
      last.toName = mtrName(step.to);
      last.stops.push({ code: step.to, name: mtrName(step.to) });
      last.minutes += step.minutes;
    } else {
      legs.push({
        line: step.line,
        lineName: step.line === "WALK" ? "步行轉乘" : (MTR_LINE_NAMES[step.line] ?? step.line),
        from: step.from,
        fromName: mtrName(step.from),
        to: step.to,
        toName: mtrName(step.to),
        stops: [
          { code: step.from, name: mtrName(step.from) },
          { code: step.to, name: mtrName(step.to) },
        ],
        minutes: step.minutes,
      });
    }
  }
  return legs;
}
