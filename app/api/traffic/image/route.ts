import { jsonError } from "@/lib/api";
import { clientIp, pruneRateLimits, rateLimit } from "@/lib/rate-limit";
import { getCameraImage } from "@/lib/providers/traffic";

export const dynamic = "force-dynamic";

const IMAGE_LIMIT_PER_MIN = 60;
const IMAGE_LIMIT_PER_HOUR = 400;

export async function GET(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const perMin = rateLimit({
    key: `cctv:min:${ip}`,
    limit: IMAGE_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!perMin.ok) {
    return jsonError("CCTV 影像請求過於頻繁，請稍後再試。", 429, {
      retryAfter: perMin.retryAfterSec,
    });
  }
  const perHour = rateLimit({
    key: `cctv:hour:${ip}`,
    limit: IMAGE_LIMIT_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  if (!perHour.ok) {
    return jsonError("CCTV 影像本小時用量已達上限，請稍後再試。", 429, {
      retryAfter: perHour.retryAfterSec,
    });
  }

  const key = new URL(request.url).searchParams.get("key") ?? "";
  try {
    const { body, contentType } = await getCameraImage(key);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (error) {
    console.error("[traffic/image]", error instanceof Error ? error.message : error);
    return jsonError("無法載入影像", 502);
  }
}
