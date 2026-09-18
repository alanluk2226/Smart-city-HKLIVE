import { jsonError, jsonOk, jsonUpstreamError } from "@/lib/api";
import { ctbStopEta } from "@/lib/providers/ctb";
import { gmbStopEta, gmbStopEtaByStop } from "@/lib/providers/gmb";
import { kmbStopEta } from "@/lib/providers/kmb";
import { lrtEta } from "@/lib/providers/lrt";
import { mtrEta } from "@/lib/providers/mtr";
import { mtrBusStopEta } from "@/lib/providers/mtr-bus";
import { nlbStopAllEta, nlbStopEta } from "@/lib/providers/nlb";
import { tramEtaForStop, type TramDirection } from "@/lib/providers/tram";
import { clientIp, pruneRateLimits, rateLimitShared } from "@/lib/rate-limit";
import {
  BadInputError,
  parseIdList,
  safeBound,
  safeRouteCode,
  safeServiceType,
  safeToken,
} from "@/lib/safe-id";

export const dynamic = "force-dynamic";

const ETA_LIMIT_PER_MIN = 60;
const MAX_NLB_ROUTE_IDS = 8;

export async function GET(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const limited = await rateLimitShared({
    key: `eta:min:${ip}`,
    limit: ETA_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return jsonError("到達時間請求過於頻繁，請稍後再試。", 429, {
      retryAfter: limited.retryAfterSec,
    });
  }

  const p = new URL(request.url).searchParams;
  const operator = p.get("operator");
  try {
    const stopIdRaw = p.get("stopId") ?? "";
    const stopName = (p.get("stopName") ?? "").slice(0, 80);
    if (operator === "kmb") {
      const stopId = safeToken(stopIdRaw, "車站");
      const route = p.get("route");
      const seq = p.get("seq");
      return jsonOk(
        await kmbStopEta(stopId, stopName, route ? safeRouteCode(route) : undefined, {
          bound: p.get("bound") ? safeBound(p.get("bound")!) : undefined,
          serviceType: p.get("serviceType") ? safeServiceType(p.get("serviceType")!) : undefined,
          seq: seq != null ? Number(seq) : undefined,
        }),
      );
    }
    if (operator === "ctb") {
      const stopId = safeToken(stopIdRaw, "車站");
      const route = p.get("route");
      if (!route) return jsonError("城巴需要路線編號");
      return jsonOk(await ctbStopEta(stopId, safeRouteCode(route), stopName));
    }
    if (operator === "nlb") {
      const stopId = safeToken(stopIdRaw, "車站");
      const routeId = p.get("routeId");
      if (p.get("allRoutes") === "1") {
        return jsonOk(
          await nlbStopAllEta({
            operator: "nlb",
            operatorName: "嶼巴",
            stopId,
            name: stopName,
            routeIds: parseIdList(p.get("routeIds"), MAX_NLB_ROUTE_IDS, "路線"),
            routeId: routeId ? safeToken(routeId, "路線") : undefined,
          }),
        );
      }
      if (!routeId) return jsonError("嶼巴需要 routeId");
      return jsonOk(await nlbStopEta(safeToken(routeId, "路線"), stopId, stopName));
    }
    if (operator === "gmb") {
      const stopId = safeToken(stopIdRaw, "車站");
      const routeId = p.get("routeId") ?? p.get("route");
      if (!routeId) return jsonOk(await gmbStopEtaByStop(stopId, stopName));
      return jsonOk(await gmbStopEta(safeToken(routeId, "路線"), stopId, stopName));
    }
    if (operator === "mtrb") {
      const stopId = safeToken(stopIdRaw, "車站");
      const route = p.get("route");
      return jsonOk(
        await mtrBusStopEta(stopId, stopName, route ? safeRouteCode(route) : undefined),
      );
    }
    if (operator === "mtr") {
      const line = p.get("line");
      const sta = p.get("sta") ?? stopIdRaw;
      if (!line || !sta) return jsonError("港鐵需要 line 與 sta");
      return jsonOk(await mtrEta(safeToken(line, "綫"), safeToken(sta, "車站")));
    }
    if (operator === "lrt") {
      if (!stopIdRaw) return jsonError("輕鐵需要 station_id");
      return jsonOk(await lrtEta(safeToken(stopIdRaw, "車站"), stopName));
    }
    if (operator === "tram") {
      if (!stopIdRaw) return jsonError("電車需要 stopKey");
      const direction = (p.get("direction") === "west" ? "west" : "east") as TramDirection;
      return jsonOk(tramEtaForStop(safeToken(stopIdRaw, "車站"), direction));
    }
    return jsonError("不支援的營運商");
  } catch (error) {
    if (error instanceof BadInputError) return jsonError(error.message, 400);
    return jsonUpstreamError("eta", error, "無法載入到達時間");
  }
}
