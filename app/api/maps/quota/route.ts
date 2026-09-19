import { jsonError, jsonOk } from "@/lib/api";
import {
  getGoogleMapsQuotaStatus,
  recordGoogleMapLoad,
} from "@/lib/google-maps-quota";
import { clientIp, pruneRateLimits, rateLimitShared } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Burst cap — map panels remount; keep abuse from inflating the shared counter too fast. */
const RECORD_LIMIT_PER_MIN = 20;

/** Check whether Google Dynamic Maps should stay off (prefer OSM). */
export async function GET() {
  try {
    const status = await getGoogleMapsQuotaStatus();
    return jsonOk(status);
  } catch (error) {
    console.error("[maps/quota GET]", error instanceof Error ? error.message : error);
    return jsonError("無法讀取地圖配額狀態", 502);
  }
}

/** Record one successful Google map load toward the monthly free budget. */
export async function POST(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const perMin = await rateLimitShared({
    key: `maps:rec:${ip}`,
    limit: RECORD_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!perMin.ok) {
    // Still return current status — do not invent extra loads.
    try {
      const status = await getGoogleMapsQuotaStatus();
      return jsonOk(status);
    } catch {
      return jsonError("地圖配額記錄過於頻繁", 429, { retryAfter: perMin.retryAfterSec });
    }
  }

  try {
    const status = await recordGoogleMapLoad();
    return jsonOk(status);
  } catch (error) {
    console.error("[maps/quota POST]", error instanceof Error ? error.message : error);
    return jsonError("無法記錄地圖用量", 502);
  }
}
