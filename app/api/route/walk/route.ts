import { jsonError, jsonOk, num } from "@/lib/api";
import { clientIp, pruneRateLimits, rateLimit } from "@/lib/rate-limit";
import { haversineMeters } from "@/lib/geo";
import { walkRoute } from "@/lib/routing";

export const dynamic = "force-dynamic";

/** Generous HK + nearby waters / Shenzhen border margin for walk legs. */
const HK_BOUNDS = {
  minLat: 22.12,
  maxLat: 22.58,
  minLng: 113.8,
  maxLng: 114.5,
};

/** Walk routes beyond this are unlikely to be used in-app; reject abuse. */
const MAX_WALK_METERS = 12_000;

const WALK_LIMIT_PER_MIN = 30;
const WALK_LIMIT_PER_HOUR = 120;

function inHongKong(lat: number, lng: number) {
  return (
    lat >= HK_BOUNDS.minLat &&
    lat <= HK_BOUNDS.maxLat &&
    lng >= HK_BOUNDS.minLng &&
    lng <= HK_BOUNDS.maxLng
  );
}

export async function GET(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const perMin = rateLimit({
    key: `walk:min:${ip}`,
    limit: WALK_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!perMin.ok) {
    return jsonError("步行路線請求過於頻繁，請稍後再試。", 429, {
      retryAfter: perMin.retryAfterSec,
    });
  }
  const perHour = rateLimit({
    key: `walk:hour:${ip}`,
    limit: WALK_LIMIT_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  if (!perHour.ok) {
    return jsonError("步行路線本小時用量已達上限，請稍後再試。", 429, {
      retryAfter: perHour.retryAfterSec,
    });
  }

  const p = new URL(request.url).searchParams;
  const fromLat = num(p.get("fromLat"));
  const fromLng = num(p.get("fromLng"));
  const toLat = num(p.get("toLat"));
  const toLng = num(p.get("toLng"));
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    return jsonError("需要 fromLat / fromLng / toLat / toLng");
  }

  if (!inHongKong(fromLat, fromLng) || !inHongKong(toLat, toLng)) {
    return jsonError("步行路線只支援香港範圍內的起終點", 400);
  }

  const straight = haversineMeters(fromLat, fromLng, toLat, toLng);
  if (straight > MAX_WALK_METERS) {
    return jsonError("起終點距離過遠，請改用交通工具", 400);
  }

  try {
    return jsonOk(await walkRoute(fromLat, fromLng, toLat, toLng));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法規劃導航路線", 502);
  }
}
