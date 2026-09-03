import { jsonError, jsonOk } from "@/lib/api";
import { getCityAlerts } from "@/lib/providers/alerts";

export async function GET() {
  try {
    return jsonOk(await getCityAlerts(), {
      cacheSeconds: 60,
      staleWhileRevalidate: 30,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入突發提示", 502);
  }
}
