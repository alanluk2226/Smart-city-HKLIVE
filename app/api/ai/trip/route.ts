import { jsonError, jsonOk } from "@/lib/api";
import { adviseTrip } from "@/lib/providers/ai-trip";
import type { AiTripGoal } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function asGoal(value: unknown): AiTripGoal {
  if (value === "fastest" || value === "cheapest" || value === "both") return value;
  return "both";
}

export async function POST(request: Request) {
  let body: { from?: unknown; to?: unknown; goal?: unknown };
  try {
    body = (await request.json()) as { from?: unknown; to?: unknown; goal?: unknown };
  } catch {
    return jsonError("請提供起點與終點");
  }
  const from = typeof body.from === "string" ? body.from.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  if (!from || !to) return jsonError("請輸入起點與終點");
  try {
    return jsonOk(await adviseTrip(from, to, asGoal(body.goal)));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "無法建議行程", 502);
  }
}
