import { jsonError, jsonOk, jsonUpstreamError } from "@/lib/api";
import { ctbRouteStops } from "@/lib/providers/ctb";
import { gmbRouteStops } from "@/lib/providers/gmb";
import { kmbRouteStops } from "@/lib/providers/kmb";
import { mtrBusRouteStops } from "@/lib/providers/mtr-bus";
import { nlbRouteStops } from "@/lib/providers/nlb";
import { clientIp, pruneRateLimits, rateLimitShared } from "@/lib/rate-limit";
import {
  BadInputError,
  safeBound,
  safeNumericId,
  safeRouteCode,
  safeServiceType,
  safeToken,
} from "@/lib/safe-id";

export const dynamic = "force-dynamic";

const STOPS_LIMIT_PER_MIN = 40;

export async function GET(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const limited = await rateLimitShared({
    key: `stops:min:${ip}`,
    limit: STOPS_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return jsonError("車站請求過於頻繁，請稍後再試。", 429, {
      retryAfter: limited.retryAfterSec,
    });
  }

  const { searchParams } = new URL(request.url);
  const operator = searchParams.get("operator");
  try {
    if (operator === "kmb") {
      const route = searchParams.get("route");
      const bound = searchParams.get("bound") ?? "O";
      const serviceType = searchParams.get("serviceType") ?? "1";
      if (!route) return jsonError("缺少 route");
      return jsonOk(
        await kmbRouteStops(safeRouteCode(route), safeBound(bound), safeServiceType(serviceType)),
      );
    }
    if (operator === "ctb") {
      const route = searchParams.get("route");
      const bound = searchParams.get("bound") ?? "O";
      if (!route) return jsonError("缺少 route");
      return jsonOk(await ctbRouteStops(safeRouteCode(route), safeBound(bound)));
    }
    if (operator === "nlb") {
      const routeId = searchParams.get("routeId");
      if (!routeId) return jsonError("嶼巴需要 routeId");
      return jsonOk(await nlbRouteStops(safeToken(routeId, "路線")));
    }
    if (operator === "mtrb") {
      const route = searchParams.get("route");
      const bound = searchParams.get("bound") ?? "O";
      const routeId = searchParams.get("routeId") ?? undefined;
      if (!route) return jsonError("缺少 route");
      return jsonOk(
        await mtrBusRouteStops(
          safeRouteCode(route),
          safeBound(bound),
          routeId ? safeToken(routeId, "路線") : undefined,
        ),
      );
    }
    if (operator === "gmb") {
      const routeId = searchParams.get("routeId");
      const routeSeq = searchParams.get("bound") ?? "1";
      if (!routeId) return jsonError("缺少 routeId");
      return jsonOk(await gmbRouteStops(safeToken(routeId, "路線"), safeNumericId(routeSeq, "方向")));
    }
    return jsonError("不支援的營運商");
  } catch (error) {
    if (error instanceof BadInputError) return jsonError(error.message, 400);
    return jsonUpstreamError("stops", error, "無法載入車站");
  }
}
