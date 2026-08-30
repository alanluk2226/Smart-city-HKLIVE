import { jsonError, jsonOk, num } from "@/lib/api";
import { getTrafficSnapshot } from "@/lib/providers/traffic";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    const region = p.get("region")?.trim() || undefined;
    const district = p.get("district")?.trim() || undefined;
    const limit = num(p.get("limit"));
    return jsonOk(
      await getTrafficSnapshot({
        lat: num(p.get("lat")),
        lng: num(p.get("lng")),
        region,
        district,
        limit: limit ?? undefined,
      }),
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入 CCTV", 502);
  }
}
