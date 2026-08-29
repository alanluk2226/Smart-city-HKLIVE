import { jsonError, jsonOk } from "@/lib/api";
import { tramEtaForStop, type TramDirection } from "@/lib/providers/tram";
import { TRAM_LINE } from "@/lib/providers/tram";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const mode = p.get("mode") ?? "line";
  try {
    if (mode === "line") {
      return jsonOk({
        routes: TRAM_LINE.routes,
        stops: TRAM_LINE.stops,
        headwayMinutesDay: TRAM_LINE.headwayMinutesDay,
        headwayMinutesNight: TRAM_LINE.headwayMinutesNight,
        note: TRAM_LINE.note,
      });
    }
    if (mode === "eta") {
      const stopKey = p.get("stopKey") ?? "";
      const direction = (p.get("direction") === "west" ? "west" : "east") as TramDirection;
      if (!stopKey) return jsonError("需要 stopKey");
      return jsonOk(tramEtaForStop(stopKey, direction));
    }
    return jsonError("不支援的 mode");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入電車資料", 502);
  }
}
