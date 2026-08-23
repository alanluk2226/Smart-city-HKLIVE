import { jsonError, jsonOk } from "@/lib/api";
import { ctbRouteStops } from "@/lib/providers/ctb";
import { gmbRouteStops } from "@/lib/providers/gmb";
import { kmbRouteStops } from "@/lib/providers/kmb";
import { nlbRouteStops } from "@/lib/providers/nlb";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const operator = searchParams.get("operator");
  try {
    if (operator === "kmb") {
      const route = searchParams.get("route");
      const bound = searchParams.get("bound") ?? "O";
      const serviceType = searchParams.get("serviceType") ?? "1";
      if (!route) return jsonError("缺少 route");
      return jsonOk(await kmbRouteStops(route, bound, serviceType));
    }
    if (operator === "ctb") {
      const route = searchParams.get("route");
      const bound = searchParams.get("bound") ?? "O";
      if (!route) return jsonError("缺少 route");
      return jsonOk(await ctbRouteStops(route, bound));
    }
    if (operator === "nlb") {
      const routeId = searchParams.get("routeId");
      if (!routeId) return jsonError("嶼巴需要 routeId");
      return jsonOk(await nlbRouteStops(routeId));
    }
    if (operator === "gmb") {
      const routeId = searchParams.get("routeId");
      const routeSeq = searchParams.get("bound") ?? "1";
      if (!routeId) return jsonError("缺少 routeId");
      return jsonOk(await gmbRouteStops(routeId, routeSeq));
    }
    return jsonError("不支援的營運商");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入車站", 502);
  }
}
