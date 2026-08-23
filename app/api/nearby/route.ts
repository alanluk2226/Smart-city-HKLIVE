import { jsonError, jsonOk, num } from "@/lib/api";
import { nearbyKmbStops } from "@/lib/providers/kmb";
import { nearbyMtrStations } from "@/lib/providers/mtr";
import { MTR_STATIONS } from "@/lib/static/mtr-stations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const lat = num(p.get("lat"));
  const lng = num(p.get("lng"));
  if (lat == null || lng == null) return jsonError("需要 lat / lng");
  try {
    const kmb = await nearbyKmbStops(lat, lng, 12).catch(() => []);
    const mtr = nearbyMtrStations(lat, lng, 6).map((s) => {
      const station = MTR_STATIONS.find((row) => row.code === s.stopId);
      return { ...s, lines: station?.lines ?? [] };
    });
    return jsonOk({ kmb, mtr });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入附近車站", 502);
  }
}
