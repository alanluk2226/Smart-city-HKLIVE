import { unstable_cache } from "next/cache";

type Entry<T> = { value: T; expires: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

/** Persist across Vercel cold starts; skip for short-lived ETA-style data. */
const DATA_CACHE_MIN_TTL_MS = 60_000;

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const task = (async () => {
    const value =
      ttlMs >= DATA_CACHE_MIN_TTL_MS
        ? await unstable_cache(loader, [key], {
            revalidate: Math.max(1, Math.ceil(ttlMs / 1000)),
            tags: [key],
          })()
        : await loader();
    store.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

export const TTL = {
  route: 12 * 60 * 60 * 1000,
  stop: 12 * 60 * 60 * 1000,
  eta: 20_000,
  weather: 5 * 60 * 1000,
  hospital: 5 * 60 * 1000,
  parkingInfo: 6 * 60 * 60 * 1000,
  parkingVacancy: 60_000,
  traffic: 2 * 60 * 1000,
  alerts: 60_000,
  facility: 5 * 60 * 1000,
  toilet: 6 * 60 * 60 * 1000,
  /** Same origin/destination + weather tone → stable AI trip options. */
  aiTrip: 30 * 60 * 1000,
  hsr: 30 * 60 * 1000,
  taxi: 6 * 60 * 60 * 1000,
};
