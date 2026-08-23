import { jsonError, jsonOk } from "@/lib/api";
import { ctbStopEta } from "@/lib/providers/ctb";
import { gmbStopEta } from "@/lib/providers/gmb";
import { kmbStopEta } from "@/lib/providers/kmb";
import { lrtEta } from "@/lib/providers/lrt";
import { mtrEta } from "@/lib/providers/mtr";
import { nlbStopEta } from "@/lib/providers/nlb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const operator = p.get("operator");
  const stopId = p.get("stopId") ?? "";
  const stopName = p.get("stopName") ?? "";
  try {
    if (operator === "kmb") return jsonOk(await kmbStopEta(stopId, stopName));
    if (operator === "ctb") {
      const route = p.get("route");
      if (!route) return jsonError("城巴需要路線編號");
      return jsonOk(await ctbStopEta(stopId, route, stopName));
    }
    if (operator === "nlb") {
      const routeId = p.get("routeId");
      if (!routeId) return jsonError("嶼巴需要 routeId");
      if (!stopId) return jsonError("嶼巴需要 stopId");
      return jsonOk(await nlbStopEta(routeId, stopId, stopName));
    }
    if (operator === "gmb") {
      const routeId = p.get("routeId") ?? p.get("route");
      if (!routeId) return jsonError("小巴需要 routeId");
      return jsonOk(await gmbStopEta(routeId, stopId, stopName));
    }
    if (operator === "mtr") {
      const line = p.get("line");
      const sta = p.get("sta") ?? stopId;
      if (!line || !sta) return jsonError("港鐵需要 line 與 sta");
      return jsonOk(await mtrEta(line, sta));
    }
    if (operator === "lrt") {
      if (!stopId) return jsonError("輕鐵需要 station_id");
      return jsonOk(await lrtEta(stopId, stopName));
    }
    return jsonError("不支援的營運商");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入到達時間", 502);
  }
}
