import type { AiTripGoal } from "@/lib/types";

export type SavedTrip = {
  from: string;
  to: string;
  goal: AiTripGoal;
  savedAt: number;
};

const HISTORY_KEY = "hk-live:ai-trip:history";
const STARS_KEY = "hk-live:ai-trip:stars";
export const TRIP_CHIP_LIMIT = 5;
const HISTORY_LIMIT = 10;
const STAR_LIMIT = 15;

export function tripPairKey(from: string, to: string) {
  return `${from.trim()}→${to.trim()}`;
}

function readList(key: string): SavedTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedTrip =>
        !!item &&
        typeof item === "object" &&
        typeof (item as SavedTrip).from === "string" &&
        typeof (item as SavedTrip).to === "string",
    );
  } catch {
    return [];
  }
}

function writeList(key: string, items: SavedTrip[]) {
  window.localStorage.setItem(key, JSON.stringify(items));
}

export function loadTripHistory() {
  return readList(HISTORY_KEY).slice(0, HISTORY_LIMIT);
}

export function loadTripStars() {
  return readList(STARS_KEY).slice(0, STAR_LIMIT);
}

export function pushTripHistory(trip: SavedTrip) {
  const next = [
    trip,
    ...loadTripHistory().filter((t) => tripPairKey(t.from, t.to) !== tripPairKey(trip.from, trip.to)),
  ].slice(0, HISTORY_LIMIT);
  writeList(HISTORY_KEY, next);
  return next;
}

export function isTripStarred(from: string, to: string, stars = loadTripStars()) {
  const key = tripPairKey(from, to);
  return stars.some((t) => tripPairKey(t.from, t.to) === key);
}

export function toggleTripStar(trip: SavedTrip): { starred: boolean; stars: SavedTrip[] } {
  const key = tripPairKey(trip.from, trip.to);
  const current = loadTripStars();
  const exists = current.some((t) => tripPairKey(t.from, t.to) === key);
  const stars = exists
    ? current.filter((t) => tripPairKey(t.from, t.to) !== key)
    : [{ ...trip, savedAt: Date.now() }, ...current].slice(0, STAR_LIMIT);
  writeList(STARS_KEY, stars);
  return { starred: !exists, stars };
}

export function removeTripHistory(from: string, to: string) {
  const key = tripPairKey(from, to);
  const next = loadTripHistory().filter((t) => tripPairKey(t.from, t.to) !== key);
  writeList(HISTORY_KEY, next);
  return next;
}

/** Starred first, then recent searches that are not already starred. 畫面最多 5 個. */
export function tripChips(stars = loadTripStars(), history = loadTripHistory()): SavedTrip[] {
  const seen = new Set<string>();
  const out: SavedTrip[] = [];
  for (const t of [...stars, ...history]) {
    const key = tripPairKey(t.from, t.to);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= TRIP_CHIP_LIMIT) break;
  }
  return out;
}
