import { jsonError, jsonOk } from "@/lib/api";
import { racecourseStatus } from "@/lib/providers/racecourse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(await racecourseStatus());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法載入馬場站狀態", 502);
  }
}
