import { jsonError, jsonOk, num } from "@/lib/api";
import { getToiletsSnapshot } from "@/lib/providers/toilets";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    return jsonOk(
      await getToiletsSnapshot({
        lat: num(p.get("lat")),
        lng: num(p.get("lng")),
        region: p.get("region")?.trim() || undefined,
        district: p.get("district")?.trim() || undefined,
        type: p.get("type")?.trim() || undefined,
        limit: num(p.get("limit")) ?? undefined,
      }),
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入公共廁所", 502);
  }
}
