const UA = "hk-city-live/0.1 (Hong Kong open data dashboard)";

/** Align with TTL.route / TTL.stop (12h) for bus route & stop catalogs. */
export const CATALOG_REVALIDATE_SECONDS = 12 * 60 * 60;

type FetchOpts = {
  timeoutMs?: number;
  /** When set, uses Next.js fetch Data Cache instead of no-store. */
  revalidateSeconds?: number;
};

function fetchInit(opts: FetchOpts = {}): RequestInit & { next?: { revalidate: number } } {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const signal = AbortSignal.timeout(timeoutMs);
  if (opts.revalidateSeconds != null) {
    return {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal,
      next: { revalidate: opts.revalidateSeconds },
    };
  }
  return {
    headers: { Accept: "application/json", "User-Agent": UA },
    cache: "no-store",
    signal,
  };
}

export async function fetchJson<T>(
  url: string,
  timeoutMs = 12_000,
  opts?: { revalidateSeconds?: number },
): Promise<T> {
  const res = await fetch(
    url,
    fetchInit({
      timeoutMs,
      revalidateSeconds: opts?.revalidateSeconds,
    }),
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  timeoutMs = 15_000,
  opts?: { revalidateSeconds?: number },
): Promise<string> {
  const res = await fetch(
    url,
    (() => {
      const init = fetchInit({
        timeoutMs,
        revalidateSeconds: opts?.revalidateSeconds,
      });
      // Text fetch uses Accept: application/json by default; override for CSV/XML.
      return {
        ...init,
        headers: { "User-Agent": UA },
      };
    })(),
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

export async function fetchBuffer(url: string, timeoutMs = 10_000): Promise<{
  body: ArrayBuffer;
  contentType: string;
}> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return {
    body: await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "application/octet-stream",
  };
}
