import { jsonError, jsonOk } from "@/lib/api";
import { ctbStopEta } from "@/lib/providers/ctb";
import { gmbStopEta, gmbStopEtaByStop } from "@/lib/providers/gmb";
import { kmbStopEta } from "@/lib/providers/kmb";
import { lrtEta } from "@/lib/providers/lrt";
import { mtrEta } from "@/lib/providers/mtr";
import { mtrBusStopEta } from "@/lib/providers/mtr-bus";
import { nlbStopAllEta, nlbStopEta } from "@/lib/providers/nlb";
import { tramEtaForStop, type TramDirection } from "@/lib/providers/tram";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const operator = p.get("operator");
  const stopId = p.get("stopId") ?? "";
  const stopName = p.get("stopName") ?? "";
  try {
    if (operator === "kmb") {
      const route = p.get("route");
      const seq = p.get("seq");
      return jsonOk(
        await kmbStopEta(stopId, stopName, route ?? undefined, {
          bound: p.get("bound") ?? undefined,
          serviceType: p.get("serviceType") ?? undefined,
          seq: seq != null ? Number(seq) : undefined,
        }),
      );
    }
    if (operator === "ctb") {
      const route = p.get("route");
      if (!route) return jsonError("城巴需要路線編號");
      return jsonOk(await ctbStopEta(stopId, route, stopName));
    }
    if (operator === "nlb") {
      const routeId = p.get("routeId");
      if (!stopId) return jsonError("嶼巴需要 stopId");
      if (p.get("allRoutes") === "1") {
        return jsonOk(
          await nlbStopAllEta({
            operator: "nlb",
            operatorName: "嶼巴",
            stopId,
            name: stopName,
            routeIds: p.get("routeIds")?.split(",").filter(Boolean),
            routeId: routeId ?? undefined,
          }),
        );
      }
      if (!routeId) return jsonError("嶼巴需要 routeId");
      return jsonOk(await nlbStopEta(routeId, stopId, stopName));
    }
    if (operator === "gmb") {
      const routeId = p.get("routeId") ?? p.get("route");
      if (!routeId) return jsonOk(await gmbStopEtaByStop(stopId, stopName));
      return jsonOk(await gmbStopEta(routeId, stopId, stopName));
    }
    if (operator === "mtrb") {
      if (!stopId) return jsonError("港鐵巴士需要 stopId");
      return jsonOk(await mtrBusStopEta(stopId, stopName, p.get("route") ?? undefined));
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
    if (operator === "tram") {
      if (!stopId) return jsonError("電車需要 stopKey");
      const direction = (p.get("direction") === "west" ? "west" : "east") as TramDirection;
      return jsonOk(tramEtaForStop(stopId, direction));
    }
    return jsonError("不支援的營運商");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入到達時間", 502);
  }
}
