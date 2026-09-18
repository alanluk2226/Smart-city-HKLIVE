import { jsonError } from "@/lib/api";
import { clientIp, pruneRateLimits, rateLimit } from "@/lib/rate-limit";
import { getWeatherMapImage } from "@/lib/providers/weather-maps";

export const dynamic = "force-dynamic";

const IMAGE_LIMIT_PER_MIN = 60;
const IMAGE_LIMIT_PER_HOUR = 400;

export async function GET(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const perMin = rateLimit({
    key: `wximg:min:${ip}`,
    limit: IMAGE_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!perMin.ok) {
    return jsonError("天氣圖請求過於頻繁，請稍後再試。", 429, {
      retryAfter: perMin.retryAfterSec,
    });
  }
  const perHour = rateLimit({
    key: `wximg:hour:${ip}`,
    limit: IMAGE_LIMIT_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  if (!perHour.ok) {
    return jsonError("天氣圖本小時用量已達上限，請稍後再試。", 429, {
      retryAfter: perHour.retryAfterSec,
    });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const file = url.searchParams.get("file") ?? "";

  if (kind !== "radar" && kind !== "wind") {
    return jsonError("缺少 kind 參數", 400);
  }
  if (!file) {
    return jsonError("缺少 file 參數", 400);
  }

  try {
    const { body, contentType } = await getWeatherMapImage(kind, file);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=120",
      },
    });
  } catch (error) {
    console.error("[weather/maps/image]", error instanceof Error ? error.message : error);
    return jsonError("無法載入影像", 502);
  }
}
