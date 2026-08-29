import { jsonError, jsonOk } from "@/lib/api";
import { ferryHubSnapshot } from "@/lib/providers/ferry";
import { FERRY_HUBS } from "@/lib/static/ferry-hubs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const hubId = p.get("hub") ?? "central";
  try {
    if (p.get("list") === "1") {
      return jsonOk(
        FERRY_HUBS.map(({ id, name, nameEn, lat, lng }) => ({ id, name, nameEn, lat, lng })),
      );
    }
    return jsonOk(await ferryHubSnapshot(hubId));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入渡輪資料", 502);
  }
}
