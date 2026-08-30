import { jsonError, jsonOk } from "@/lib/api";
import { getSopWaitsForCluster } from "@/lib/providers/sop";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cluster = new URL(request.url).searchParams.get("cluster")?.trim();
  if (!cluster) return jsonError("缺少 cluster", 400);
  try {
    const snap = await getSopWaitsForCluster(cluster);
    if (!snap) return jsonError("找不到該聯網專科門診資料", 404);
    return jsonOk(snap);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入專科門診資料", 502);
  }
}
