import { jsonError, jsonOk } from "@/lib/api";
import { adviseTrip } from "@/lib/providers/ai-trip";
import { canResolveTripPair, parseTripQuery } from "@/lib/trip-query";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
/** Gemini API blocks many HK origins; run this function in US East. */
export const preferredRegion = "iad1";

export async function POST(request: Request) {
  let body: { from?: unknown; to?: unknown; message?: unknown };
  try {
    body = (await request.json()) as { from?: unknown; to?: unknown; message?: unknown };
  } catch {
    return jsonError("請提供起點與終點，或一句行程問題");
  }

  let from = typeof body.from === "string" ? body.from.trim() : "";
  let to = typeof body.to === "string" ? body.to.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if ((!from || !to) && message) {
    const parsed = parseTripQuery(message);
    if (!parsed) {
      return jsonError("請用「東涌去何文田」或「逸東邨到羅湖」呢種問法；起終點要係港鐵站、屋邨或行政區。");
    }
    from = parsed.from;
    to = parsed.to;
  }

  if (!from || !to) return jsonError("請輸入起點與終點，例如：東涌去何文田");
  if (!canResolveTripPair(from, to)) {
    return jsonError(`未能辨識「${from}」或「${to}」。試下港鐵站、屋邨或行政區名，例如東涌、何文田、逸東邨、羅湖。`);
  }

  try {
    return jsonOk(await adviseTrip(from, to));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法建議行程", 502);
  }
}
