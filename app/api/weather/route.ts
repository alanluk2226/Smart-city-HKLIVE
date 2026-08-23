import { jsonError, jsonOk } from "@/lib/api";
import { getWeather } from "@/lib/providers/weather";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await getWeather());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入天氣", 502);
  }
}
