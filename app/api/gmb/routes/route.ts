import { jsonError, jsonOk } from "@/lib/api";
import { gmbRouteIndex } from "@/lib/providers/gmb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const region = new URL(request.url).searchParams.get("region");
  try {
    const index = await gmbRouteIndex();
    if (region && index[region]) return jsonOk(index[region]);
    return jsonOk(index);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入小巴路線", 502);
  }
}
