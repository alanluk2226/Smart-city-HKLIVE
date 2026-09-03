import type { TransitFavorite } from "@/lib/transit-favorites-store";
import { favoriteHref, favoriteKey } from "@/lib/transit-favorites-store";

const ACTIVE_KEY = "hk-live:transit:active-trip";
export const TRANSIT_ACTIVE_CHANGED = "hk-live:transit-active-changed";

function isFavorite(item: unknown): item is TransitFavorite {
  if (!item || typeof item !== "object") return false;
  const row = item as TransitFavorite;
  return typeof row.label === "string" && typeof row.kind === "string";
}

export function loadActiveTrip(): TransitFavorite | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isFavorite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function setActiveTrip(trip: TransitFavorite) {
  if (typeof window === "undefined") return;
  const current = loadActiveTrip();
  if (current && favoriteKey(current) === favoriteKey(trip)) {
    // Keep existing savedAt; still refresh label fields
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...trip, savedAt: current.savedAt }));
  } else {
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...trip, savedAt: Date.now() }));
  }
  try {
    window.dispatchEvent(new Event(TRANSIT_ACTIVE_CHANGED));
  } catch {
    // ignore
  }
}

export function clearActiveTrip() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACTIVE_KEY);
  try {
    window.dispatchEvent(new Event(TRANSIT_ACTIVE_CHANGED));
  } catch {
    // ignore
  }
}

export function activeTripHref(trip: TransitFavorite) {
  return favoriteHref(trip);
}
