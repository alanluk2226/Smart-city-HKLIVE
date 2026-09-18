import { unstable_cache } from "next/cache";
import { kvEnabled, kvGetJson, kvSetJson } from "@/lib/kv";
import { driveRouteThrough, type DriveRoute } from "@/lib/routing";

export type CorridorSource = "memory" | "kv" | "cache" | "osrm";
export type CorridorResult = { route: DriveRoute; source: CorridorSource };

/** Geometry never changes unless the stop list does, so keep it for a month. */
const PERSIST_SECONDS = 30 * 24 * 60 * 60;
/** Per-lambda LRU — polylines are big, so keep only the hottest routes. */
const MEMORY_MAX = 40;
/** A value computed inside this window came from OSRM, not a cache layer. */
const FRESH_WINDOW_MS = 30_000;

const memory = new Map<string, DriveRoute>();
const inflight = new Map<string, Promise<CorridorResult>>();

function memoryGet(key: string): DriveRoute | undefined {
  const hit = memory.get(key);
  if (!hit) return undefined;
  memory.delete(key);
  memory.set(key, hit);
  return hit;
}

function memorySet(key: string, route: DriveRoute) {
  memory.set(key, route);
  while (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest == null) break;
    memory.delete(oldest);
  }
}

/**
 * Lazy caching for road corridors: the first viewer of a route pays for the
 * OSRM computation, everyone after that gets the stored polyline.
 *
 * Layers, fastest first: per-lambda memory, Vercel KV / Upstash (when
 * configured), then the Next.js data cache which survives cold starts.
 */
export async function roadCorridor(
  cacheKey: string,
  points: Array<{ lat: number; lng: number }>,
): Promise<CorridorResult> {
  const hot = memoryGet(cacheKey);
  if (hot) return { route: hot, source: "memory" };

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const task = (async (): Promise<CorridorResult> => {
    const stored = await kvGetJson<DriveRoute>(cacheKey);
    if (stored?.points?.length) {
      memorySet(cacheKey, stored);
      return { route: stored, source: "kv" };
    }

    const route = await unstable_cache(() => driveRouteThrough(points), [cacheKey], {
      revalidate: PERSIST_SECONDS,
      tags: [cacheKey],
    })();

    const fresh = Date.now() - (route.computedAt ?? 0) < FRESH_WINDOW_MS;
    memorySet(cacheKey, route);
    if (kvEnabled && !route.fallback) {
      void kvSetJson(cacheKey, route, PERSIST_SECONDS);
    }
    return { route, source: fresh ? "osrm" : "cache" };
  })().finally(() => {
    inflight.delete(cacheKey);
  });

  inflight.set(cacheKey, task);
  return task;
}
