import { jsonError, jsonOk } from "@/lib/api";
import { hsrFromWestKowloon } from "@/lib/providers/hsr";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await hsrFromWestKowloon());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入高鐵班次", 502);
  }
}
