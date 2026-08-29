import { jsonError, jsonOk, num } from "@/lib/api";
import { walkRoute } from "@/lib/routing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const fromLat = num(p.get("fromLat"));
  const fromLng = num(p.get("fromLng"));
  const toLat = num(p.get("toLat"));
  const toLng = num(p.get("toLng"));
  if (fromLat == null || fromLng == null || toLat == null || toLng == null) {
    return jsonError("需要 fromLat / fromLng / toLat / toLng");
  }
  try {
    return jsonOk(await walkRoute(fromLat, fromLng, toLat, toLng));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法規劃導航路線", 502);
  }
}
