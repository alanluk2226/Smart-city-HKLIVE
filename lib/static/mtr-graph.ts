import { haversineMeters } from "@/lib/geo";
import { MTR_SCHEMATIC_LINES, MTR_WALK_LINKS } from "@/lib/static/mtr-schematic";
import { MTR_LINE_NAMES, MTR_STATIONS, mtrName } from "@/lib/static/mtr-stations";
import type { MtrTripLeg } from "@/lib/types";

const SPEED_KMH: Record<string, number> = {
  TWL: 36,
  ISL: 36,
  KTL: 36,
  TKL: 38,
  SIL: 40,
  TML: 50,
  EAL: 60,
  TCL: 72,
  AEL: 80,
  DRL: 42,
  WALK: 4.4,
};

const DWELL_MIN = 0.4;
const WAIT_MIN = 2;
/** Extra minutes for leaving a train, finding the next platform, and recovering. */
const INTERCHANGE_BUFFER = 1;
const INTERCHANGE_WALK_DEFAULT = 1.6;
const AEL_ONLY = new Set(["AIR", "AWE"]);
const RAC = "RAC";

/** Typical wait after arriving at a platform (≈ half headway). */
const BOARD_WAIT: Record<string, number> = {
  TWL: 2.2,
  ISL: 2.2,
  KTL: 2.2,
  TKL: 2.4,
  SIL: 2.4,
  TML: 2.5,
  EAL: 2.8,
  TCL: 3,
  DRL: 4,
  AEL: 6,
  WALK: 0,
};

/** Same-station walking time between lines (not including platform wait). */
const INTERCHANGE_WALK: Record<string, number> = {
  "HUH:EAL|TML": 4.5,
  "ADM:EAL|ISL": 3.5,
  "ADM:EAL|TWL": 3.5,
  "ADM:EAL|SIL": 3,
  "KOT:EAL|KTL": 2.2,
  "NAC:TCL|TML": 1.8,
  "LAK:TCL|TWL": 1.2,
  "PRE:KTL|TWL": 0.8,
  "MOK:KTL|TWL": 0.8,
  "YMT:KTL|TWL": 1.2,
  "MEF:TML|TWL": 1.5,
  "TAW:EAL|TML": 2.2,
  "DIH:KTL|TML": 1.8,
  "HOM:KTL|TML": 1.8,
  "QUB:ISL|TKL": 3.5,
  "NOP:ISL|TKL": 1.5,
  "YAT:KTL|TKL": 1.2,
  "TIK:KTL|TKL": 1.2,
  "TSY:AEL|TCL": 1.5,
  "HOK:AEL|TCL": 2.2,
  "SUN:DRL|TCL": 1.5,
};

function linesKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function interchangeWalk(station: string, fromLine: string, toLine: string) {
  return INTERCHANGE_WALK[`${station}:${linesKey(fromLine, toLine)}`] ?? INTERCHANGE_WALK_DEFAULT;
}

/** Extra minutes before boarding `toLine` at `station`. */
function boardExtra(station: string, fromLine: string | null, toLine: string) {
  if (toLine === "WALK") return 0;
  if (!fromLine) return 0;
  if (fromLine === "WALK") return BOARD_WAIT[toLine] ?? WAIT_MIN;
  if (fromLine === toLine) return 0;
  return interchangeWalk(station, fromLine, toLine) + (BOARD_WAIT[toLine] ?? WAIT_MIN) + INTERCHANGE_BUFFER;
}

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

const STATION_BY_CODE = new Map(MTR_STATIONS.map((s) => [s.code, s]));

function hopMinutes(from: string, to: string, line: string) {
  if (line === "WALK") {
    const fixed = WALK_MIN[`${from}|${to}`];
    if (fixed != null) return fixed;
  }
  const a = STATION_BY_CODE.get(from);
  const b = STATION_BY_CODE.get(to);
  if (!a || !b) return 3;
  const km = haversineMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
  const speed = SPEED_KMH[line] ?? 36;
  return Math.max(0.95, (km / speed) * 60 + (line === "WALK" ? 0 : DWELL_MIN));
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
  /** Pure ride / walk time for this hop (no interchange padding). */
  minutes: number;
  /** Same-station interchange wait before this hop, if any. */
  interchangeBefore?: number;
};

export type MtrRoute = {
  from: string;
  to: string;
  minutes: number;
  interchangeCount: number;
  rideMinutes: number;
  transferMinutes: number;
  waitMinutes: number;
  steps: MtrRouteStep[];
  legs: MtrTripLeg[];
};

export const MTR_WAIT_MIN = WAIT_MIN;
export const MTR_INTERCHANGE_MIN = INTERCHANGE_WALK_DEFAULT + WAIT_MIN + INTERCHANGE_BUFFER;

function packCost(time: number, ix: number, hops: number) {
  return Math.round(time * 10) * 1_000_000 + ix * 1_000 + hops;
}

export function planMtrRoute(from: string, to: string): MtrRoute | null {
  if (from === to) return null;
  if (!ADJ.has(from) || !ADJ.has(to)) return null;

  const aelOk = usesAel(from, to);
  const racOk = from === RAC || to === RAC;
  const dist = new Map<string, number>();
  const prev = new Map<string, { state: State; step: MtrRouteStep }>();
  const heap: Array<{ pack: number; time: number; ix: number; hops: number; state: State }> = [
    { pack: packCost(WAIT_MIN, 0, 0), time: WAIT_MIN, ix: 0, hops: 0, state: { station: from, line: null } },
  ];
  dist.set(key({ station: from, line: null }), heap[0].pack);

  while (heap.length) {
    let bestI = 0;
    for (let i = 1; i < heap.length; i++) {
      if (heap[i].pack < heap[bestI].pack) bestI = i;
    }
    const cur = heap.splice(bestI, 1)[0];
    const curKey = key(cur.state);
    if (cur.pack !== dist.get(curKey)) continue;
    if (cur.state.station === to) {
      return buildRoute(from, to, cur.state, prev, cur.time);
    }
    for (const edge of ADJ.get(cur.state.station) ?? []) {
      if (edge.line === "AEL" && !aelOk) continue;
      if (!racOk && (edge.to === RAC || cur.state.station === RAC)) continue;
      const change = boardExtra(cur.state.station, cur.state.line, edge.line);
      const next: State = { station: edge.to, line: edge.line };
      const nextKey = key(next);
      const time = cur.time + edge.minutes + change;
      const ix =
        cur.ix +
        (cur.state.line &&
        edge.line !== "WALK" &&
        cur.state.line !== "WALK" &&
        cur.state.line !== edge.line
          ? 1
          : 0);
      const hops = cur.hops + 1;
      const pack = packCost(time, ix, hops);
      if (pack < (dist.get(nextKey) ?? Infinity)) {
        dist.set(nextKey, pack);
        prev.set(nextKey, {
          state: cur.state,
          step: {
            from: cur.state.station,
            to: edge.to,
            line: edge.line,
            minutes: edge.minutes,
            interchangeBefore: change > 0 ? change : undefined,
          },
        });
        heap.push({ pack, time, ix, hops, state: next });
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
  const rideMinutes = steps
    .filter((s) => s.line !== "WALK")
    .reduce((n, s) => n + s.minutes, 0);
  const walkMinutes = steps
    .filter((s) => s.line === "WALK")
    .reduce((n, s) => n + s.minutes, 0);
  const interchangeMinutes = steps.reduce((n, s) => n + (s.interchangeBefore ?? 0), 0);
  return {
    from,
    to,
    minutes: Math.max(1, Math.round(minutes)),
    interchangeCount: Math.max(0, legs.filter((l) => l.line !== "WALK").length - 1),
    rideMinutes: Math.max(0, Math.round(rideMinutes)),
    transferMinutes: Math.max(0, Math.round(walkMinutes + interchangeMinutes)),
    waitMinutes: WAIT_MIN,
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
        lineName: step.line === "WALK" ? "出站轉乘步行" : (MTR_LINE_NAMES[step.line] ?? step.line),
        from: step.from,
        fromName: mtrName(step.from),
        to: step.to,
        toName: mtrName(step.to),
        stops: [
          { code: step.from, name: mtrName(step.from) },
          { code: step.to, name: mtrName(step.to) },
        ],
        minutes: step.minutes,
        interchangeBeforeMin: step.interchangeBefore,
      });
    }
  }
  return legs;
}
