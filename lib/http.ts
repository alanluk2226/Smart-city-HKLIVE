const UA = "hk-city-live/0.1 (Hong Kong open data dashboard)";

export async function fetchJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function fetchText(url: string, timeoutMs = 15_000): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
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
