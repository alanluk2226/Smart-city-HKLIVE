import { jsonError, jsonOk } from "@/lib/api";
import { getWeatherMaps } from "@/lib/providers/weather-maps";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getWeatherMaps();
    return jsonOk(data);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入天氣圖層", 502);
  }
}
