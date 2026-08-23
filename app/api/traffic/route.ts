import { jsonError, jsonOk, num } from "@/lib/api";
import { getCameras } from "@/lib/providers/traffic";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    return jsonOk(await getCameras(num(p.get("lat")), num(p.get("lng")), 30));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入 CCTV", 502);
  }
}
