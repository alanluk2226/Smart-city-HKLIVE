import { NextResponse } from "next/server";

type JsonOkInit = {
  status?: number;
  headers?: HeadersInit;
  /** public s-maxage (+ browser max-age) in seconds */
  cacheSeconds?: number;
  staleWhileRevalidate?: number;
};

type JsonErrorInit = {
  headers?: HeadersInit;
  retryAfter?: number;
};

function withCacheHeaders(
  headers: Headers,
  cacheSeconds?: number,
  staleWhileRevalidate?: number,
) {
  if (cacheSeconds == null || cacheSeconds < 0) return;
  const swr =
    staleWhileRevalidate != null
      ? staleWhileRevalidate
      : Math.max(30, Math.round(cacheSeconds / 5));
  headers.set(
    "Cache-Control",
    `public, s-maxage=${cacheSeconds}, max-age=${Math.min(60, cacheSeconds)}, stale-while-revalidate=${swr}`,
  );
}

export function jsonOk(data: unknown, extraOrInit?: Record<string, unknown> | JsonOkInit) {
  const isInit =
    extraOrInit != null &&
    ("cacheSeconds" in extraOrInit ||
      "headers" in extraOrInit ||
      "status" in extraOrInit ||
      "staleWhileRevalidate" in extraOrInit) &&
    !("ok" in extraOrInit);

  if (isInit) {
    const init = extraOrInit as JsonOkInit;
    const headers = new Headers(init.headers);
    withCacheHeaders(headers, init.cacheSeconds, init.staleWhileRevalidate);
    return NextResponse.json(
      { ok: true, data },
      { status: init.status ?? 200, headers },
    );
  }

  return NextResponse.json({ ok: true, data, ...(extraOrInit as Record<string, unknown> | undefined) });
}

export function jsonError(message: string, status = 400, init?: JsonErrorInit) {
  const headers = new Headers(init?.headers);
  if (init?.retryAfter != null) {
    headers.set("Retry-After", String(init.retryAfter));
  }
  return NextResponse.json({ ok: false, error: message }, { status, headers });
}

/** Log internal detail; return a fixed public message (no upstream URL leakage). */
export function jsonUpstreamError(scope: string, error: unknown, publicMessage: string) {
  console.error(`[${scope}]`, error instanceof Error ? error.message : error);
  const status =
    error && typeof error === "object" && "status" in error && typeof (error as { status: unknown }).status === "number"
      ? (error as { status: number }).status
      : 502;
  if (status === 400) {
    return jsonError(error instanceof Error ? error.message : publicMessage, 400);
  }
  return jsonError(publicMessage, 502);
}

export function num(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
