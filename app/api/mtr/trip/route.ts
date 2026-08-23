import { jsonError, jsonOk } from "@/lib/api";
import { mtrTrip } from "@/lib/providers/mtr-trip";
import { MTR_STATIONS } from "@/lib/static/mtr-stations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const from = (p.get("from") ?? "").trim().toUpperCase();
  const to = (p.get("to") ?? "").trim().toUpperCase();
  if (!from || !to) return jsonError("需要起點與終點車站");
  if (from === to) return jsonError("起點與終點不能相同");
  if (!MTR_STATIONS.some((s) => s.code === from) || !MTR_STATIONS.some((s) => s.code === to)) {
    return jsonError("找不到車站");
  }
  try {
    return jsonOk(await mtrTrip(from, to));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法規劃行程", 502);
  }
}
