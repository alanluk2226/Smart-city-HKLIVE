import { jsonError, jsonOk } from "@/lib/api";
import { adviseTrip } from "@/lib/providers/ai-trip";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
/** Gemini API blocks many HK origins; run this function in US East. */
export const preferredRegion = "iad1";

export async function POST(request: Request) {
  let body: { from?: unknown; to?: unknown };
  try {
    body = (await request.json()) as { from?: unknown; to?: unknown };
  } catch {
    return jsonError("請提供起點與終點");
  }
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!from || !to) return jsonError("請輸入起點與終點");
  try {
    return jsonOk(await adviseTrip(from, to));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法建議行程", 502);
  }
}
