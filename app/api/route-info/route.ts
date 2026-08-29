import { jsonError, jsonOk, num } from "@/lib/api";
import { lookupRouteInfo } from "@/lib/providers/route-fare";
import type { Operator } from "@/lib/types";

export const dynamic = "force-dynamic";

const OPERATORS: Operator[] = ["kmb", "ctb", "nlb", "mtrb", "gmb"];

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const operator = p.get("operator") as Operator | null;
  const route = p.get("route")?.trim() ?? "";
  if (!operator || !OPERATORS.includes(operator)) return jsonError("不支援的營運商");
  if (!route) return jsonError("需要 route");
  try {
    const info = await lookupRouteInfo({
      operator,
      route,
      bound: p.get("bound") ?? undefined,
      dest: p.get("dest") ?? undefined,
      serviceType: p.get("serviceType") ?? undefined,
      routeId: p.get("routeId") ?? undefined,
      seq: num(p.get("seq")) ?? undefined,
      stopCount: num(p.get("stopCount")) ?? undefined,
    });
    return jsonOk(info);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入車費", 502);
  }
}
