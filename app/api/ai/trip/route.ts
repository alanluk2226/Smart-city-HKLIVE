import { jsonError, jsonOk } from "@/lib/api";
import { clientIp, pruneRateLimits, rateLimit } from "@/lib/rate-limit";
import { runAssistant } from "@/lib/providers/ai-assistant";
import type { AiAssistantChatTurn } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
/**
 * Gemini API blocks Hong Kong origins (hkg1). Keep this route in US East.
 * Must also match vercel.json `regions` — project-level hkg1 would override this.
 */
export const preferredRegion = ["iad1"];

/** Soft per-IP caps so free Gemini quota is not burned by scrape/abuse. */
const AI_LIMIT_PER_MIN = 8;
const AI_LIMIT_PER_HOUR = 40;

function asTurns(raw: unknown): AiAssistantChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AiAssistantChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if ((role === "user" || role === "assistant") && typeof text === "string" && text.trim()) {
      out.push({ role, text: text.trim() });
    }
  }
  return out.slice(-16);
}

export async function POST(request: Request) {
  pruneRateLimits();
  const ip = clientIp(request);
  const perMin = rateLimit({
    key: `ai:min:${ip}`,
    limit: AI_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!perMin.ok) {
    return jsonError(
      `AI 請求過於頻繁，請約 ${Math.ceil(perMin.retryAfterSec / 60) || 1} 分鐘後再試。`,
      429,
      { retryAfter: perMin.retryAfterSec },
    );
  }
  const perHour = rateLimit({
    key: `ai:hour:${ip}`,
    limit: AI_LIMIT_PER_HOUR,
    windowMs: 60 * 60_000,
  });
  if (!perHour.ok) {
    return jsonError(
      `AI 今日／本小時用量已達上限，請約 ${Math.ceil(perHour.retryAfterSec / 60)} 分鐘後再試。`,
      429,
      { retryAfter: perHour.retryAfterSec },
    );
  }

  let body: {
    from?: unknown;
    to?: unknown;
    message?: unknown;
    messages?: unknown;
    lastTrip?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("請提供對話內容，或一句行程問題");
  }

  const from = typeof body.from === "string" ? body.from.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const messages = asTurns(body.messages);

  let lastTrip: { from: string; to: string } | null = null;
  if (body.lastTrip && typeof body.lastTrip === "object") {
    const lf = (body.lastTrip as { from?: unknown }).from;
    const lt = (body.lastTrip as { to?: unknown }).to;
    if (typeof lf === "string" && typeof lt === "string" && lf.trim() && lt.trim()) {
      lastTrip = { from: lf.trim(), to: lt.trim() };
    }
  }

  if (!messages.length && !message && !(from && to)) {
    return jsonError("請輸入問題，例如天氣點，或「東涌去何文田」");
  }

  try {
    const result = await runAssistant({
      messages,
      message: message || undefined,
      from: from || undefined,
      to: to || undefined,
      lastTrip,
    });
    return jsonOk(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "無法回應";
    if (/GEMINI_PAUSED|quota|RESOURCE_EXHAUSTED|429|rate.?limit/i.test(msg)) {
      return jsonError(msg.replace(/^GEMINI_PAUSED:\s*/i, ""), 503, { retryAfter: 900 });
    }
    return jsonError(msg, 502);
  }
}
