import { jsonError, jsonOk } from "@/lib/api";
import { clientIp, pruneRateLimits, rateLimit } from "@/lib/rate-limit";
import { runAssistant } from "@/lib/providers/ai-assistant";
import type { AiAssistantChatTurn } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
/**
 * Gemini API blocks Hong Kong (hkg1). Use Tokyo (hnd1): closer to HK for
 * transit APIs, and Japan is a supported Gemini region (unlike HK).
 * Must match vercel.json `regions`.
 */
export const preferredRegion = ["hnd1"];

/** Soft per-IP caps so free Gemini quota is not burned by scrape/abuse. */
const AI_LIMIT_PER_MIN = 8;
const AI_LIMIT_PER_HOUR = 40;
/** Cap prompt size so a single request cannot dump megabytes into Gemini. */
const MAX_TURN_CHARS = 1_500;
const MAX_TURNS = 16;
const MAX_PLACE_CHARS = 80;

function clip(text: string, max: number) {
  return text.length <= max ? text : text.slice(0, max);
}

function asTurns(raw: unknown): AiAssistantChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: AiAssistantChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if ((role === "user" || role === "assistant") && typeof text === "string" && text.trim()) {
      out.push({ role, text: clip(text.trim(), MAX_TURN_CHARS) });
    }
  }
  return out.slice(-MAX_TURNS);
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

  const from = typeof body.from === "string" ? clip(body.from.trim(), MAX_PLACE_CHARS) : "";
  const to = typeof body.to === "string" ? clip(body.to.trim(), MAX_PLACE_CHARS) : "";
  const message = typeof body.message === "string" ? clip(body.message.trim(), MAX_TURN_CHARS) : "";
  const messages = asTurns(body.messages);

  let lastTrip: { from: string; to: string } | null = null;
  if (body.lastTrip && typeof body.lastTrip === "object") {
    const lf = (body.lastTrip as { from?: unknown }).from;
    const lt = (body.lastTrip as { to?: unknown }).to;
    if (typeof lf === "string" && typeof lt === "string" && lf.trim() && lt.trim()) {
      lastTrip = {
        from: clip(lf.trim(), MAX_PLACE_CHARS),
        to: clip(lt.trim(), MAX_PLACE_CHARS),
      };
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
      return jsonError(
        "AI 配額暫時用盡，請稍後再試，或改用交通搜尋頁查路線。",
        503,
        { retryAfter: 900 },
      );
    }
    // Never echo raw upstream Gemini / network errors to the browser.
    console.error("[ai/trip]", msg);
    return jsonError("暫時無法回應，請稍後再試", 502);
  }
}
