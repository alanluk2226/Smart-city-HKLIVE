import { createHash } from "node:crypto";
import { jsonError, jsonOk } from "@/lib/api";
import { clientIp, pruneRateLimits, rateLimitShared } from "@/lib/rate-limit";
import { roadCorridor } from "@/lib/road-corridor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const HK_BOUNDS = {
  minLat: 22.12,
  maxLat: 22.58,
  minLng: 113.8,
  maxLng: 114.5,
};

/** Bump when the corridor algorithm changes so stored shapes are recomputed. */
const CORRIDOR_VERSION = "v7";

const DRIVE_LIMIT_PER_MIN = 20;
const DRIVE_LIMIT_PER_HOUR = 80;
/**
 * Tram mainline alone has ~74 stops; bus routes are usually shorter.
 * Chunking inside `driveRouteThrough` keeps each OSRM call tractable.
 */
const MAX_POINTS = 90;

function inHongKong(lat: number, lng: number) {
  return (
    lat >= HK_BOUNDS.minLat &&
    lat <= HK_BOUNDS.maxLat &&
    lng >= HK_BOUNDS.minLng &&
    lng <= HK_BOUNDS.maxLng
  );
}

function asPoints(raw: unknown): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ lat: number; lng: number }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const lat = (item as { lat?: unknown }).lat;
    const lng = (item as { lng?: unknown }).lng;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ lat, lng });
  }
  return out;
}

export async function POST(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const perMin = await rateLimitShared({
    key: `drive:min:${ip}`,
    limit: DRIVE_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!perMin.ok) {
    return jsonError("行車路線請求過於頻繁，請稍後再試。", 429, {
      retryAfter: perMin.retryAfterSec,
    });
  }
  const perHour = await rateLimitShared({
    key: `drive:hour:${ip}`,
    limit: DRIVE_LIMIT_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  if (!perHour.ok) {
    return jsonError("行車路線本小時用量已達上限，請稍後再試。", 429, {
      retryAfter: perHour.retryAfterSec,
    });
  }

  let body: { points?: unknown; routeKey?: unknown; bidirectional?: unknown };
  try {
    body = (await request.json()) as {
      points?: unknown;
      routeKey?: unknown;
      bidirectional?: unknown;
    };
  } catch {
    return jsonError("請提供站點座標列表");
  }

  const points = asPoints(body.points).slice(0, MAX_POINTS);
  if (points.length < 2) {
    return jsonError("至少需要兩個站點才能畫出行車路線");
  }
  if (points.some((p) => !inHongKong(p.lat, p.lng))) {
    return jsonError("行車路線只支援香港範圍內的站點", 400);
  }

  // Stop coordinates are the identity of the shape: a re-routed line gets a new
  // fingerprint and is recomputed automatically.
  const fingerprint = createHash("sha1")
    .update(
      points
        .map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
        .join("|"),
    )
    .digest("hex")
    .slice(0, 16);
  const routeKey =
    typeof body.routeKey === "string" ? body.routeKey.replace(/[^\w:.-]/g, "").slice(0, 60) : "";
  const bidirectional = body.bidirectional === true;

  try {
    const { route, source } = await roadCorridor(
      `roadline:${CORRIDOR_VERSION}:${bidirectional ? "bi" : "uni"}:${routeKey || "anon"}:${fingerprint}`,
      points,
      { bidirectional },
    );
    return jsonOk({ ...route, source });
  } catch (error) {
    console.error("[route/drive]", error instanceof Error ? error.message : error);
    return jsonError("無法規劃行車路線", 502);
  }
}
