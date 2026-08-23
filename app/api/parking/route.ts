import { jsonError, jsonOk, num } from "@/lib/api";
import { DEFAULT_CENTER } from "@/lib/geo";
import { getParking } from "@/lib/providers/parking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const lat = num(p.get("lat")) ?? DEFAULT_CENTER.lat;
  const lng = num(p.get("lng")) ?? DEFAULT_CENTER.lng;
  try {
    return jsonOk(await getParking(lat, lng, 24));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入停車場", 502);
  }
}
