import { jsonError, jsonOk } from "@/lib/api";
import { lrtTrip } from "@/lib/providers/lrt-trip";
import { lrtStation } from "@/lib/static/lrt-stations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const from = (p.get("from") ?? "").trim();
  const to = (p.get("to") ?? "").trim();
  if (!from || !to) return jsonError("需要起點與終點車站");
  if (from === to) return jsonError("起點與終點不能相同");
  if (!lrtStation(from) || !lrtStation(to)) return jsonError("找不到車站");
  try {
    return jsonOk(await lrtTrip(from, to));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法規劃行程", 502);
  }
}
