import { adviseTrip } from "@/lib/providers/ai-trip";
import { geminiApiKey, geminiChat, geminiJson } from "@/lib/providers/gemini";
import { getWeather } from "@/lib/providers/weather";
import { canResolveTripPair, parseTripQuery } from "@/lib/trip-query";
import type { AiAssistantChatTurn, AiAssistantResponse, AiTripAdvice } from "@/lib/types";

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

/** 「改去旺角」「咁去中環呢」— reuse lastTrip.from；唔再要求站庫認得終點 */
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
    return { from: lastTrip.from, to };
  }
  return null;
}

function ruleRoutePair(
  message: string,
  lastTrip?: { from: string; to: string } | null,
): { from: string; to: string } | null {
  const parsed = parseTripQuery(message);
  if (parsed?.from && parsed?.to) return parsed;
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

  const prompt = `你係 HK LIVE 意圖分類器。只判斷用戶最新一句係咪喺問「點由 A 去 B」嘅公共交通行程。

${lastTripLine}

對話：
${transcript}

規則：
- 明確問由 A 去 B、改終點、點樣搭車去某地 → intent=route，填 from／to（可用用戶原詞）。
- 其他全部 intent=chat：閒聊、科技／AI／LLM、一般知識、天氣本身、塞車閒談、問候、解釋概念等。
- 句中出現「去」「build」「model」等英／中詞，但唔係問香港點搭車 → 仍然係 chat。
- 只有真正唔知起終點嘅「點去」先 askClarify=true；閒聊唔好追問起終點。
- 有疑問時寧願選 chat，唔好亂當 route。`;

  return geminiJson<IntentOut>(prompt, 8_000, INTENT_SCHEMA as unknown as Record<string, unknown>);
}

async function weatherContextLine() {
  try {
    const w = await getWeather();
    const warn = w.warnings.map((x) => x.name).filter(Boolean).slice(0, 4).join("、");
    const bits = [
      w.temperature != null ? `${w.temperature}°C` : null,
      w.humidity != null ? `濕度 ${w.humidity}%` : null,
      warn || null,
      w.forecast ? w.forecast.slice(0, 160) : null,
    ].filter(Boolean);
    return bits.join(" · ") || "天氣資料暫缺";
  } catch {
    return "天氣資料暫缺";
  }
}

async function freeChat(messages: AiAssistantChatTurn[]): Promise<AiAssistantResponse> {
  if (!geminiApiKey()) {
    return {
      mode: "chat",
      reply:
        "未設定 GEMINI_API_KEY，暫時無法自由對話。部署到 Vercel 並設定金鑰後，可以問任意地點點去，或天氣／路況建議。",
      usedAi: false,
      aiError: "未設定 GEMINI_API_KEY",
      advice: null,
    };
  }

  const weatherLine = await weatherContextLine();
  const system = `你是 HK LIVE AI，香港智慧城市主控台入面嘅對話助手。用香港粵語書面語（繁體）回答，簡潔自然，像朋友傾偈（Gemini 風格）。

你嘅角色：
- 可以閒聊、答一般知識、科技／AI、天氣、交通……跟住用戶真正問嘅嘢答。
- 「傾下偈都得」——唔係每一次都要畀出行方案。
- 只有用戶明確問「點去／點搭車／由 A 去 B」時，先討論路線；否則禁止硬拗成港鐵／巴士方案，亦唔好亂估起終點。

可選背景（只有問天氣／出門先引用；閒聊／科技題唔使硬扯）：
${weatherLine}

回答原則：
- 直接答用戶問題；唔好離題。
- 唔好為無關話題編造路線、車費、車程。
- 回答長度適中，唔好過長。`;

  try {
    const turns = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({
        role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
        text: m.text,
      }));
    const reply = await geminiChat(turns, { system, budgetMs: 16_000 });
    return { mode: "chat", reply: reply.trim(), usedAi: true, aiError: null, advice: null };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Gemini 失敗";
    const aiError = /location is not supported/i.test(raw)
      ? "Gemini API 不支援目前所在地區（本機香港網絡常見）。部署到 Vercel 通常可正常呼叫。"
      : raw;
    return {
      mode: "chat",
      reply: `暫時未能回應：${aiError}`,
      usedAi: false,
      aiError,
      advice: null,
    };
  }
}

/**
 * Gemini 主導規劃：接受任意地名；本站港鐵計算只作可選參考。
 * 天氣／路況建議交畀模型自行決定。
 */
async function geminiFreeRoute(
  from: string,
  to: string,
  grounded: AiTripAdvice | null,
  userHint: string,
): Promise<AiAssistantResponse> {
  const trip = {
    from: grounded?.fromName || from,
    to: grounded?.toName || to,
  };

  if (!geminiApiKey()) {
    if (grounded) {
      return {
        mode: "route",
        reply: grounded.reply,
        usedAi: grounded.usedAi,
        aiError: grounded.aiError ?? null,
        advice: grounded,
        trip,
      };
    }
    return {
      mode: "chat",
      reply:
        "未設定 GEMINI_API_KEY，而本站站庫又未能計算此程。請設定金鑰後再問任意地點（例如逸東邨去瑪嘉烈醫院）。",
      usedAi: false,
      aiError: "未設定 GEMINI_API_KEY",
      advice: null,
      trip: null,
    };
  }

  const weatherLine = await weatherContextLine();
  const groundedBlock = grounded
    ? `本站公開資料可選參考（可引用、可調整，唔使照抄）：\n${grounded.reply}`
    : "本站站庫未能計算精確路線；請你用香港公共交通常識規劃。";

  const system = `你是香港出行顧問（HK LIVE）。用香港粵語書面語（繁體），語氣像 Gemini，自然對話。

任務：為用戶規劃由起點到終點嘅公共交通（可含步行接駁）。
起點同終點可以係任何香港地點：屋邨、醫院、商場、街道、港鐵站等——唔好因為唔係港鐵站就拒絕。

即時天氣／警報背景：${weatherLine}

${groundedBlock}

輸出要求：
1. 先用 1–2 句按天氣或用戶提到嘅路況／故障，講你建議邊個方案同原因（由你自行決定）。
2. 然後列 2–3 個方案（港鐵／巴士／小巴／混合皆可），每項含路線步驟、約略時間、約略車費（用「約」）。
3. 例子：落雨→優先港鐵；太子塞車→避巴士改港鐵；港鐵故障→改巴士／小巴。
4. 巴士編號（重要）：有字母變體嘅線（E21／E21A／E21B／E21C／E21D／E21X 等）一定要寫完整編號 + 往邊個終點／方向 + 落車站。禁止淨寫「搭 E21」。東涌⇄旺角優先「城巴 E21（往大角咀／維港灣），旺角一帶下車」；E21A 係往愛民（可途經旺角落車，但唔好同 E21 混為一談）。
5. 唔好虛構即時到站分鐘；唔好聲稱可控制交通燈。
6. 結尾提醒：估計僅供參考，請以營運商為準；AI 建議可能因天氣／對話而每次唔同。`;

  const userText = [
    `由「${trip.from}」去「${trip.to}」。`,
    userHint && userHint !== `${from}去${to}` && userHint !== `${from}到${to}`
      ? `用戶原話／補充：${userHint}`
      : "",
    "請給出行方案同建議。",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const reply = await geminiChat([{ role: "user", text: userText }], {
      system,
      budgetMs: 20_000,
    });
    return {
      mode: "route",
      reply: reply.trim(),
      usedAi: true,
      aiError: null,
      // 若有本站計算仍附上，方便前端路綫圖；回覆正文以 Gemini 為準
      advice: grounded,
      trip,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Gemini 失敗";
    const aiError = /location is not supported/i.test(raw)
      ? "Gemini API 不支援目前所在地區（本機香港網絡常見）。部署到 Vercel 通常可正常呼叫。"
      : raw;
    if (grounded) {
      return {
        mode: "route",
        reply: `${grounded.reply}\n\n（AI 自由規劃暫未能使用：${aiError}）`,
        usedAi: grounded.usedAi,
        aiError,
        advice: grounded,
        trip,
      };
    }
    return {
      mode: "chat",
      reply: `暫時未能規劃「${trip.from}」→「${trip.to}」：${aiError}`,
      usedAi: false,
      aiError,
      advice: null,
      trip: null,
    };
  }
}

async function routeAdvice(
  from: string,
  to: string,
  userHint = "",
): Promise<AiAssistantResponse> {
  let grounded: AiTripAdvice | null = null;
  if (canResolveTripPair(from, to)) {
    try {
      grounded = await adviseTrip(from, to);
    } catch {
      grounded = null;
    }
  }
  return geminiFreeRoute(from, to, grounded, userHint);
}

/**
 * Multi-turn assistant: Gemini-first free chat & open-world trip advice.
 */
export async function runAssistant(input: {
  messages: AiAssistantChatTurn[];
  lastTrip?: { from: string; to: string } | null;
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
      reply: "請問想問天氣、交通，定係邊度去邊度？例如：逸東邨去瑪嘉烈醫院、東涌去何文田。",
      usedAi: false,
      advice: null,
    };
  }

  if (input.from?.trim() && input.to?.trim()) {
    return routeAdvice(input.from.trim(), input.to.trim(), userText);
  }

  // 規則只認明確「A 去 B」句式；其餘交意圖分類，有疑問當閒聊
  const ruled = ruleRoutePair(userText, input.lastTrip);
  if (ruled) return routeAdvice(ruled.from, ruled.to, userText);

  if (geminiApiKey()) {
    try {
      const intent = await classifyIntent(messages, input.lastTrip);
      if (intent.intent === "route") {
        const from = intent.from?.trim() || input.lastTrip?.from || "";
        const to = intent.to?.trim() || "";
        if (from && to) {
          return routeAdvice(from, to, userText);
        }
        // 起終點唔清：只喺確實係 route 意圖時先追問；否則當閒聊
        if (intent.askClarify) {
          const q =
            intent.clarifyQuestion?.trim() ||
            "想由邊度去邊度？例如「逸東邨去瑪嘉烈醫院」或「東涌去何文田」；接住上一程可講「改去旺角」。";
          return { mode: "chat", reply: q, usedAi: true, aiError: null, advice: null };
        }
      }
    } catch {
      // Fall through to free chat.
    }
  }

  return freeChat(messages);
}
