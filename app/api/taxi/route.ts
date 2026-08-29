import { jsonError, jsonOk } from "@/lib/api";
import { getTaxiDirectory } from "@/lib/providers/taxi";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const kindParam = p.get("kind");
  const kind =
    kindParam === "stand" || kindParam === "pickup" || kindParam === "all" ? kindParam : "all";
  const lat = p.get("lat");
  const lng = p.get("lng");
  try {
    return jsonOk(
      await getTaxiDirectory({
        kind,
        q: p.get("q") ?? undefined,
        lat: lat != null ? Number(lat) : undefined,
        lng: lng != null ? Number(lng) : undefined,
        limit: p.get("limit") ? Number(p.get("limit")) : undefined,
      }),
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入的士資料", 502);
  }
}
