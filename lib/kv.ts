/**
 * Optional Redis-over-HTTP store (Vercel KV or Upstash — same REST protocol).
 * Absent env vars simply disable it; callers fall back to the Next data cache.
 */
const KV_URL = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "").replace(
  /\/+$/,
  "",
);
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const kvEnabled = Boolean(KV_URL && KV_TOKEN);

async function kvFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${KV_URL}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) throw new Error(`KV HTTP ${res.status}`);
  return (await res.json()) as { result?: unknown };
}

export async function kvGetJson<T>(key: string): Promise<T | null> {
  if (!kvEnabled) return null;
  try {
    const json = await kvFetch(`get/${encodeURIComponent(key)}`);
    if (typeof json.result !== "string") return null;
    return JSON.parse(json.result) as T;
  } catch {
    return null;
  }
}

export async function kvSetJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
  if (!kvEnabled) return false;
  try {
    await kvFetch(`set/${encodeURIComponent(key)}?EX=${Math.max(60, Math.round(ttlSeconds))}`, {
      method: "POST",
      body: JSON.stringify(value),
    });
    return true;
  } catch {
    return false;
  }
}
