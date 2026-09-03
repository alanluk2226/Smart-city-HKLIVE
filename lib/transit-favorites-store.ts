import type { Operator, RouteHit } from "@/lib/types";

export type TransitFavorite =
  | {
      kind: "route";
      mode: "bus" | "minibus";
      operator: Operator;
      operatorName: string;
      route: string;
      orig: string;
      dest: string;
      bound?: string;
      serviceType?: string;
      region?: string;
      routeId?: string;
      subtitle: string;
      label: string;
      savedAt: number;
    }
  | {
      kind: "tram";
      stopKey: string;
      direction: "east" | "west";
      stopName: string;
      label: string;
      savedAt: number;
    }
  | {
      kind: "ferry";
      hubId: string;
      hubName: string;
      dest?: string;
      label: string;
      savedAt: number;
    }
  | {
      kind: "trip";
      mode: "mtr" | "lrt";
      from: string;
      to: string;
      fromName: string;
      toName: string;
      label: string;
      savedAt: number;
    };

const FAVORITES_KEY = "hk-live:transit:favorites";
/** Soft cap for localStorage; newest first, oldest drop when full. */
export const TRANSIT_FAVORITE_LIMIT = 40;
export const TRANSIT_FAVORITES_CHANGED = "hk-live:transit-favorites-changed";

export function favoriteKey(f: TransitFavorite): string {
  switch (f.kind) {
    case "route":
      return [
        "route",
        f.mode,
        f.operator,
        f.route,
        f.bound ?? "O",
        f.serviceType ?? "1",
        f.routeId ?? "",
        f.region ?? "",
      ].join(":");
    case "tram":
      return `tram:${f.stopKey}:${f.direction}`;
    case "ferry":
      return `ferry:${f.hubId}:${f.dest ?? ""}`;
    case "trip":
      return `trip:${f.mode}:${f.from}:${f.to}`;
  }
}

function readFavorites(): TransitFavorite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTransitFavorite);
  } catch {
    return [];
  }
}

function writeFavorites(items: TransitFavorite[]) {
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
  try {
    window.dispatchEvent(new Event(TRANSIT_FAVORITES_CHANGED));
  } catch {
    // ignore
  }
}

function isTransitFavorite(item: unknown): item is TransitFavorite {
  if (!item || typeof item !== "object") return false;
  const row = item as TransitFavorite;
  if (typeof row.label !== "string" || typeof row.savedAt !== "number") return false;
  if (row.kind === "route") {
    return (
      (row.mode === "bus" || row.mode === "minibus") &&
      typeof row.operator === "string" &&
      typeof row.route === "string"
    );
  }
  if (row.kind === "tram") {
    return typeof row.stopKey === "string" && (row.direction === "east" || row.direction === "west");
  }
  if (row.kind === "ferry") {
    return typeof row.hubId === "string";
  }
  if (row.kind === "trip") {
    return (
      (row.mode === "mtr" || row.mode === "lrt") &&
      typeof row.from === "string" &&
      typeof row.to === "string"
    );
  }
  return false;
}

export function loadTransitFavorites() {
  return readFavorites().slice(0, TRANSIT_FAVORITE_LIMIT);
}

export function isFavorited(key: string, list = loadTransitFavorites()) {
  return list.some((f) => favoriteKey(f) === key);
}

export function toggleTransitFavorite(
  fav: TransitFavorite,
): { starred: boolean; favorites: TransitFavorite[] } {
  const key = favoriteKey(fav);
  const current = loadTransitFavorites();
  const exists = current.some((f) => favoriteKey(f) === key);
  const favorites = exists
    ? current.filter((f) => favoriteKey(f) !== key)
    : [{ ...fav, savedAt: Date.now() }, ...current].slice(0, TRANSIT_FAVORITE_LIMIT);
  writeFavorites(favorites);
  return { starred: !exists, favorites };
}

export function removeTransitFavorite(key: string) {
  const favorites = loadTransitFavorites().filter((f) => favoriteKey(f) !== key);
  writeFavorites(favorites);
  return favorites;
}

export function favoriteFromRouteHit(mode: "bus" | "minibus", route: RouteHit): TransitFavorite {
  const label =
    mode === "minibus"
      ? `小巴 ${route.route} ${route.orig}→${route.dest}`
      : `${route.operatorName} ${route.route} ${route.orig}→${route.dest}`;
  return {
    kind: "route",
    mode,
    operator: route.operator,
    operatorName: route.operatorName,
    route: route.route,
    orig: route.orig,
    dest: route.dest,
    bound: route.bound,
    serviceType: route.serviceType,
    region: route.region,
    routeId: route.routeId,
    subtitle: route.subtitle,
    label,
    savedAt: Date.now(),
  };
}

export function routeHitFromFavorite(fav: Extract<TransitFavorite, { kind: "route" }>): RouteHit {
  return {
    operator: fav.operator,
    operatorName: fav.operatorName,
    route: fav.route,
    orig: fav.orig,
    dest: fav.dest,
    bound: fav.bound,
    serviceType: fav.serviceType,
    region: fav.region,
    routeId: fav.routeId,
    subtitle: fav.subtitle,
  };
}

/** Deep-link href to open a favorite. */
export function favoriteHref(f: TransitFavorite): string {
  switch (f.kind) {
    case "route": {
      const base = f.mode === "minibus" ? "/transit/minibus" : "/transit/bus";
      const p = new URLSearchParams({
        op: f.operator,
        route: f.route,
        bound: f.bound ?? (f.mode === "minibus" ? "1" : "O"),
      });
      if (f.serviceType) p.set("st", f.serviceType);
      if (f.routeId) p.set("rid", f.routeId);
      if (f.region) p.set("region", f.region);
      return `${base}?${p}`;
    }
    case "tram":
      return `/transit/tram?stop=${encodeURIComponent(f.stopKey)}&dir=${f.direction}`;
    case "ferry": {
      const p = new URLSearchParams({ hub: f.hubId });
      if (f.dest) p.set("dest", f.dest);
      return `/transit/ferry?${p}`;
    }
    case "trip":
      return `/transit/${f.mode}?from=${encodeURIComponent(f.from)}&to=${encodeURIComponent(f.to)}`;
  }
}

export function modeBadge(f: TransitFavorite): string {
  switch (f.kind) {
    case "route":
      return f.mode === "minibus" ? "小巴" : "巴士";
    case "tram":
      return "電車";
    case "ferry":
      return "渡輪";
    case "trip":
      return f.mode === "mtr" ? "港鐵" : "輕鐵";
  }
}
