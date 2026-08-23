import { jsonError, jsonOk, num } from "@/lib/api";
import { getHospitals } from "@/lib/providers/hospitals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    return jsonOk(await getHospitals(num(p.get("lat")), num(p.get("lng"))));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入急症室資料", 502);
  }
}
