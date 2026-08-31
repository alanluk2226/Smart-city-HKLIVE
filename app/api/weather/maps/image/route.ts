import { jsonError } from "@/lib/api";
import { getWeatherMapImage } from "@/lib/providers/weather-maps";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
    return jsonError(error instanceof Error ? error.message : "無法載入影像", 502);
  }
}
