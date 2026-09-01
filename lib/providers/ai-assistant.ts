import { adviseTrip } from "@/lib/providers/ai-trip";
import { geminiApiKey, geminiChat, geminiJson } from "@/lib/providers/gemini";
import { getWeather } from "@/lib/providers/weather";
import { canResolveTripPair, parseTripQuery } from "@/lib/trip-query";
import type { AiAssistantChatTurn, AiAssistantResponse } from "@/lib/types";

const INTENT_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: ["route", "chat"] },
    from: { type: "STRING" },
    to: { type: "STRING" },
    askClarify: { type: "BOOLEAN" },
    clarifyQuestion: { type: "STRING" },
  },
  required: ["intent"],
} as const;

type IntentOut = {
  intent?: string;
  from?: string;
  to?: string;
  askClarify?: boolean;
  clarifyQuestion?: string;
};

function lastUserText(messages: AiAssistantChatTurn[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].text.trim()) {
      return messages[i].text.trim();
    }
  }
  return "";
}

/** 「改去旺角」「咁去中環呢」「終點改去羅湖」— reuse lastTrip.from */
function parseRouteFollowUp(
  raw: string,
  lastTrip?: { from: string; to: string } | null,
): { from: string; to: string } | null {
  if (!lastTrip?.from) return null;
  const text = raw
    .trim()
    .replace(/[？?！!。．.]+$/g, "")
    .replace(/^(咁|噉|那|那麼|嗯|好|哦|喔|唔該|請問)/, "")
    .trim();

  const patterns = [
    /^(?:改|轉|換成?|改成?|改為)?(?:去到|去|到|至|往)\s*(.+)$/,
    /^(?:終點|目的地|去邊|去哪)(?:改|轉|換成?|改成?)?(?:去到|去|到|至|往)?\s*(.+)$/,
    /^去\s*(.+?)(?:呢|呀|嗎)?$/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const to = m[1].replace(/(呢|呀|嗎|啦|喎)$/g, "").trim();
    if (!to || to === lastTrip.from) continue;
    if (canResolveTripPair(lastTrip.from, to)) {
      return { from: lastTrip.from, to };
    }
  }
  return null;
}

function ruleRoutePair(
  message: string,
  lastTrip?: { from: string; to: string } | null,
): { from: string; to: string } | null {
  const parsed = parseTripQuery(message);
  if (parsed && canResolveTripPair(parsed.from, parsed.to)) {
    return parsed;
  }
  return parseRouteFollowUp(message, lastTrip);
}

async function classifyIntent(
  messages: AiAssistantChatTurn[],
  lastTrip?: { from: string; to: string } | null,
): Promise<IntentOut> {
  const recent = messages.slice(-8);
  const transcript = recent
    .map((m) => `${m.role === "user" ? "用戶" : "助手"}：${m.text}`)
    .join("\n");
  const lastTripLine = lastTrip
    ? `上一程成功行程：${lastTrip.from} → ${lastTrip.to}`
    : "上一程成功行程：無";

  const prompt = `你係 HK LIVE 意圖分類器。判斷用戶最新一句係咪問「點去／點轉／改去邊」公共交通行程。

${lastTripLine}

對話：
${transcript}

規則：
- 問由 A 去 B、改終點、點樣搭車 → intent=route，盡量填 from／to（地名用用戶原詞或上一程起點）。
- 天氣、塞車、閒聊、一般知識 → intent=chat。
- route 但起終點唔清 → askClarify=true，clarifyQuestion 用粵語書面語追問一句。
- 唔好發明香港以外嘅地名。`;

  return geminiJson<IntentOut>(prompt, 8_000, INTENT_SCHEMA as unknown as Record<string, unknown>);
}

async function weatherContextLine() {
  try {
    const w = await getWeather();
    const warn = w.warnings[0]?.name;
    const bits = [
      w.temperature != null ? `${w.temperature}°C` : null,
      w.humidity != null ? `濕度 ${w.humidity}%` : null,
      warn,
      w.forecast ? w.forecast.slice(0, 120) : null,
    ].filter(Boolean);
    return bits.join(" · ") || "天氣資料暫缺";
  } catch {
    return "天氣資料暫缺";
  }
}

async function freeChat(
  messages: AiAssistantChatTurn[],
): Promise<AiAssistantResponse> {
  if (!geminiApiKey()) {
    return {
      mode: "chat",
      reply:
        "未設定 GEMINI_API_KEY，暫時無法自由對話。你可以問「東涌去何文田」等點去問題——路線仍可由本站計算。",
      usedAi: false,
      aiError: "未設定 GEMINI_API_KEY",
      advice: null,
    };
  }

  const weatherLine = await weatherContextLine();
  const system = `你是 HK LIVE 智能助手（香港智慧城市主控台）。用香港粵語書面語（繁體）回答，簡潔自然，像 Gemini 對話。

你可以討論天氣、交通概況、出行建議、本站功能等。
本站即時天氣背景（可引用，勿假裝係你即時觀測）：${weatherLine}

限制：
- 唔好捏造精確車費、分鐘、班次；若用戶問點去某地，請引導佢用「A去B」句式，系統會用固定格式同本站計算路線。
- 唔好聲稱可控制真實交通燈或改班次。
- 回答勿過長；重點先講。`;

  try {
    const turns = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        text: m.text,
      }));
    const reply = await geminiChat(turns, { system, budgetMs: 14_000 });
    return { mode: "chat", reply: reply.trim(), usedAi: true, aiError: null, advice: null };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Gemini 失敗";
    const aiError = /location is not supported/i.test(raw)
      ? "Gemini API 不支援目前所在地區（本機香港網絡常見）。部署到 Vercel 通常可正常呼叫。"
      : raw;
    return {
      mode: "chat",
      reply: `暫時未能回應：${aiError}\n\n你可以改問「荃灣去中環」等點去問題，路線會用本站計算。`,
      usedAi: false,
      aiError,
      advice: null,
    };
  }
}

async function routeAdvice(from: string, to: string): Promise<AiAssistantResponse> {
  try {
    const advice = await adviseTrip(from, to);
    return {
      mode: "route",
      reply: advice.reply,
      usedAi: advice.usedAi,
      aiError: advice.aiError ?? null,
      advice,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "無法建議行程";
    return {
      mode: "chat",
      reply: `${msg}\n\n試下用港鐵站、屋邨或行政區名，例如「東涌去何文田」「逸東邨到羅湖」。`,
      usedAi: false,
      aiError: msg,
      advice: null,
    };
  }
}

/**
 * Multi-turn assistant: free Gemini chat, or grounded trip advice in fixed format.
 */
export async function runAssistant(input: {
  messages: AiAssistantChatTurn[];
  lastTrip?: { from: string; to: string } | null;
  /** Legacy single-shot fields */
  message?: string;
  from?: string;
  to?: string;
}): Promise<AiAssistantResponse> {
  const messages = [...input.messages];
  if (!messages.length && input.message?.trim()) {
    messages.push({ role: "user", text: input.message.trim() });
  }
  if (input.from?.trim() && input.to?.trim() && !messages.length) {
    return routeAdvice(input.from.trim(), input.to.trim());
  }

  const userText = lastUserText(messages);
  if (!userText) {
    return {
      mode: "chat",
      reply: "請問想問天氣、交通，定係「邊度去邊度」？例如：荃灣去中環。",
      usedAi: false,
      advice: null,
    };
  }

  // Explicit from/to in body still wins.
  if (input.from?.trim() && input.to?.trim()) {
    return routeAdvice(input.from.trim(), input.to.trim());
  }

  const ruled = ruleRoutePair(userText, input.lastTrip);
  if (ruled) return routeAdvice(ruled.from, ruled.to);

  // Ambiguous: classify with Gemini when key present; else treat as chat/clarify.
  if (geminiApiKey()) {
    try {
      const intent = await classifyIntent(messages, input.lastTrip);
      if (intent.intent === "route") {
        const from = intent.from?.trim() || input.lastTrip?.from || "";
        const to = intent.to?.trim() || "";
        if (from && to && canResolveTripPair(from, to)) {
          return routeAdvice(from, to);
        }
        if (intent.askClarify || !from || !to) {
          const q =
            intent.clarifyQuestion?.trim() ||
            "想由邊度去邊度？可用「東涌去何文田」呢種講法；若接住上一程，可講「改去旺角」。";
          return { mode: "chat", reply: q, usedAi: true, aiError: null, advice: null };
        }
        return {
          mode: "chat",
          reply: `未能辨識「${from || "？"}」或「${to || "？"}」。試下港鐵站、屋邨或行政區名。`,
          usedAi: true,
          advice: null,
        };
      }
    } catch {
      // Fall through to free chat.
    }
  }

  return freeChat(messages);
}
