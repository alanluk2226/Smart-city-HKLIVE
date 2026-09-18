type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Best-effort in-memory limiter (per server instance). */
export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const hit = buckets.get(opts.key);
  if (!hit || hit.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (hit.count >= opts.limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hit.resetAt - now) / 1000)) };
  }
  hit.count += 1;
  return { ok: true };
}

/**
 * Resolve the connecting client IP without trusting a caller-supplied
 * `X-Forwarded-For` chain. Spoofing the leftmost XFF entry is a common way to
 * burn through per-IP quotas (AI / walk / drive) by rotating fake identities.
 *
 * Prefer platform headers Vercel sets from the TCP peer, then fall back to the
 * rightmost XFF hop (the one the trusted edge appended).
 */
export function clientIp(request: Request): string {
  const vercel = firstHop(request.headers.get("x-vercel-forwarded-for"));
  if (vercel) return vercel;

  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;

  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const parts = xf
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Rightmost = closest to us; leftmost may be attacker-controlled.
    if (parts.length) return parts[parts.length - 1]!;
  }

  return "unknown";
}

function firstHop(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first || null;
}

/** Occasional cleanup so the Map does not grow forever on long-lived processes. */
export function pruneRateLimits(maxEntries = 5_000) {
  if (buckets.size <= maxEntries) return;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size > maxEntries) {
    const overflow = buckets.size - maxEntries;
    let i = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++i >= overflow) break;
    }
  }
}
