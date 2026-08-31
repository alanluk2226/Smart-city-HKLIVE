import { jsonError, jsonOk } from "@/lib/api";
import { getCityAlerts } from "@/lib/providers/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await getCityAlerts());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入突發提示", 502);
  }
}
