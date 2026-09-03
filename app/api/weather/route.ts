import { jsonError, jsonOk } from "@/lib/api";
import { getWeather } from "@/lib/providers/weather";

export async function GET() {
  try {
    return jsonOk(await getWeather(), {
      cacheSeconds: 300,
      staleWhileRevalidate: 60,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入天氣", 502);
  }
}
