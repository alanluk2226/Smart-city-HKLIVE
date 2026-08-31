import { MTR_SCHEMATIC_LINES, type PathNode } from "@/lib/static/mtr-schematic";
import { mtrName } from "@/lib/static/mtr-stations";
import type { MtrTripLeg } from "@/lib/types";

function codesOf(path: PathNode[]) {
  return path.filter((n): n is string => typeof n === "string");
}

function lineKey(id: string) {
  return id.replace(/\d+$/, "");
}

function expandBranches(routes: string[][]): string[][] {
  if (routes.length <= 1) return routes;
  const byLen = [...routes].sort((a, b) => b.length - a.length);
  const main = byLen[0];
  const extras = byLen.slice(1);
  const out = [main];
  for (const extra of extras) {
    if (extra.includes("RAC")) {
      out.push(extra);
      continue;
    }
    const junction = extra.find((s) => main.includes(s));
    if (!junction) {
      out.push(extra);
      continue;
    }
    const mi = main.indexOf(junction);
    const branch = extra.filter((s) => s !== junction);
    if (!branch.length) continue;
    const left = main.slice(0, mi);
    const right = main.slice(mi + 1);
    if (right.length > left.length) {
      out.push([...branch.slice().reverse(), junction, ...right]);
    } else {
      out.push([...left, junction, ...branch]);
    }
  }
  return out;
}

const LINE_ROUTES: Record<string, string[][]> = (() => {
  const grouped = new Map<string, string[][]>();
  for (const line of MTR_SCHEMATIC_LINES) {
    const id = lineKey(line.id);
    const list = grouped.get(id) ?? [];
    list.push(codesOf(line.path));
    grouped.set(id, list);
  }
  const out: Record<string, string[][]> = {};
  for (const [id, routes] of grouped) {
    out[id] = expandBranches(routes);
  }
  return out;
})();

function terminusCode(line: string, from: string, next: string, dest: string) {
  const routes = LINE_ROUTES[line] ?? [];
  let fallback: string | null = null;
  for (const codes of routes) {
    const i = codes.indexOf(from);
    const j = codes.indexOf(next);
    if (i < 0 || j < 0 || i === j) continue;
    const term = j > i ? codes[codes.length - 1] : codes[0];
    if (codes.includes(dest)) return term;
    fallback ??= term;
  }
  return fallback;
}

function signName(line: string, term: string, dest: string) {
  if (line === "AEL" && term === "AWE" && dest !== "AWE") return "機場";
  return mtrName(term);
}

/** Platform-style direction, e.g. 往香港方向 — the terminus, not the next stop. */
export function mtrDirectionHint(leg: MtrTripLeg) {
  if (leg.line === "WALK") return "";
  const next = leg.stops[1]?.code ?? leg.to;
  const term = terminusCode(leg.line, leg.from, next, leg.to);
  const name = term ? signName(leg.line, term, leg.to) : leg.toName;
  return `往 ${name} 方向`;
}
