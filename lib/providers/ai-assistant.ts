import { adviseTrip } from "@/lib/providers/ai-trip";
import { getCityAlerts } from "@/lib/providers/alerts";
import {
  geminiApiKey,
  geminiChat,
  geminiJson,
  getGeminiPauseState,
} from "@/lib/providers/gemini";
import { getWeather } from "@/lib/providers/weather";
import {
  canResolveTripPair,
  isLikelyTransitTripQuery,
  parseTripQuery,
} from "@/lib/trip-query";
import type {
  AiAssistantChatTurn,
  AiAssistantResponse,
  AiTripAdvice,
  TripPreferMode,
} from "@/lib/types";

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

/** 「巴士呢／混合呢／港鐵呢」— 同一程，只換交通方式 */
function parseModeFollowUp(
  raw: string,
  lastTrip?: { from: string; to: string } | null,
): { from: string; to: string; preferMode: TripPreferMode } | null {
  if (!lastTrip?.from || !lastTrip.to) return null;
  const t = raw
    .trim()
    .replace(/[？?！!。．.]+$/g, "")
    .replace(/^(咁|噉|那|那麼|嗯|好|哦|喔|唔該|請問|想)/, "")
    .trim();
  if (!t) return null;

  const wantsMix = /混合|巴士.+(?:轉|加|\+|同).*(?:港鐵|地鐵)|(?:港鐵|地鐵).+(?:轉|加|\+|同).*巴士|轉車搭|巴士\s*\+\s*港鐵/.test(
    t,
  );
  if (wantsMix) {
    return { from: lastTrip.from, to: lastTrip.to, preferMode: "mix" };
  }

  if (
    /^(?:改|轉)?(?:搭|坐|乘)?(?:純)?巴士(?:直達)?(?:呢|呀|咋|啦|喎)?$/.test(t) ||
    /^(?:有冇|有沒有|有無)?直達巴士/.test(t) ||
    /巴士點搭|點搭巴士|改搭巴士|想搭巴士|巴士方案|純巴士/.test(t)
  ) {
    return { from: lastTrip.from, to: lastTrip.to, preferMode: "bus" };
  }

  if (
    /^(?:改|轉)?(?:搭|坐|乘)?(?:港鐵|地鐵)(?:呢|呀|咋|啦|喎)?$/.test(t) ||
    /港鐵方案|改搭港鐵|地鐵呢/.test(t)
  ) {
    return { from: lastTrip.from, to: lastTrip.to, preferMode: "mtr" };
  }

  return null;
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

  const prompt = `你係 HK LIVE 意圖分類器。只判斷用戶最新一句係咪喺問「香港實際地點之間點搭車／點去」。

${lastTripLine}

對話：
${transcript}

規則：
- intent=route 適用：由真實地理起點去真實地理終點，或追問上一程點搭（含夜班／通宵／末班／N 線）。
- from／to 必須係地名，絕對唔可以係抽象概念（Embedding、Transformer、Token、Model、知識、理論等）。
- 科技／AI／LLM／程式／數學／純閒聊／解釋概念 → 一律 intent=chat。
- 英文句入面有 "to"（例如 send them to transformer）唔等於去邊度。
- 有疑問時偏 chat；唔好硬把科技問題當 route。
- 只有真係問點去但又缺地名時先 askClarify=true。
- 若有上一程，用戶講「巴士呢／港鐵呢／混合呢／有冇夜班車／通宵點返／末班」→ intent=route，from／to 沿用上一程。`;

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

function pausedAssistantReply(extra?: string): AiAssistantResponse {
  const pause = getGeminiPauseState();
  const reason = pause.reason || "Gemini 配額已用盡，已暫時暫停 AI";
  const mins = Math.max(1, Math.ceil((pause.retryAfterSec || 1800) / 60));
  return {
    mode: "chat",
    reply: [
      reason,
      `約 ${mins} 分鐘後會自動恢復。期間可用「交通」頁搜尋巴士／港鐵／小巴。`,
      extra,
    ]
      .filter(Boolean)
      .join("\n\n"),
    usedAi: false,
    aiError: reason,
    advice: null,
  };
}

function formatAiError(raw: string) {
  const cleaned = raw.replace(/^GEMINI_PAUSED:\s*/i, "").trim();
  if (/location is not supported/i.test(cleaned)) {
    const region = process.env.VERCEL_REGION?.trim();
    if (region && /^hkg/i.test(region)) {
      return `Gemini API 不支援伺服器地區（${region}）。請將 Vercel Functions 設為 hnd1（東京）後重新部署。`;
    }
    if (process.env.VERCEL) {
      return `Gemini API 不支援目前伺服器地區${region ? `（${region}）` : ""}。請確認 vercel.json regions 為 hnd1（東京）並重新部署。`;
    }
    return "Gemini API 不支援目前所在地區（本機香港網絡常見）。部署到 Vercel（東京 hnd1）後通常可正常呼叫。";
  }
  return cleaned;
}

async function freeChat(messages: AiAssistantChatTurn[]): Promise<AiAssistantResponse> {
  if (getGeminiPauseState().paused) return pausedAssistantReply();

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
  const system = `你是 HK LIVE AI。用繁體中文（香港粵語書面語為主，用戶用英文可夾英文）自然回答，語氣同平常同 Gemini 傾偈一樣。

重要：
- 普通對話為主；用戶問科技、AI、LLM、Embedding、學習方法、閒聊 → 直接答，唔好硬套搭車比喻。
- 若用戶問夜班／通宵／點去邊度等交通問題 → 可以正常用路線知識回答，整理成清楚方案。
- 唔好提熱帶氣旋／天氣，除非用戶問天氣或出門。

可選香港天氣（多數情況可忽略）：${weatherLine}`;

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
    if (/GEMINI_PAUSED/i.test(raw) || getGeminiPauseState().paused) {
      return pausedAssistantReply();
    }
    const aiError = formatAiError(raw);
    return {
      mode: "chat",
      reply: `暫時未能回應：${aiError}`,
      usedAi: false,
      aiError,
      advice: null,
    };
  }
}

/** Dashboard 天氣 + 突發提示（路況／交通消息／港鐵服務）給 Gemini 做建議依據。 */
async function dashboardContextBlock() {
  const weatherLine = await weatherContextLine();
  let alertLines = "暫無突發提示";
  try {
    const snap = await getCityAlerts();
    const top = snap.alerts.slice(0, 8);
    if (top.length) {
      alertLines = top
        .map((a) => {
          const kind =
            a.kind === "weather" ? "天氣" : a.kind === "traffic" ? "路況" : "交通";
          const head = a.headline || a.label;
          const detail = a.detail ? `：${a.detail.slice(0, 100)}` : "";
          return `- [${kind}/${a.severity}] ${head}${detail}`;
        })
        .join("\n");
    }
  } catch {
    /* ignore */
  }
  return `即時天氣：${weatherLine}\n\n主控台突發提示（路況／新聞／服務）：\n${alertLines}`;
}

function preferModeInstruction(preferMode: TripPreferMode) {
  if (preferMode === "bus") {
    return "用戶偏向巴士／小巴：整理方案時可偏巴士，但仍可提其他合理去法。";
  }
  if (preferMode === "mtr") {
    return "用戶偏向港鐵：整理方案時可偏港鐵，但仍可提其他合理去法。";
  }
  if (preferMode === "mix") {
    return "用戶想混合轉乘：可把混合方案排前。";
  }
  return "按用戶問題同天氣／路況自行排序方案。";
}

function softGroundedHint(grounded: AiTripAdvice | null) {
  if (!grounded?.options.length) {
    return "本站暫無精確計算；請用你對香港交通嘅知識完整回答（含日班／夜班／通宵／末班如適用）。";
  }
  const lines = grounded.options
    .slice(0, 4)
    .map(
      (o) =>
        `- ${o.mode} ${o.title}｜約 ${o.minutes ?? "?"} 分｜約 $${o.fareHkd ?? "?"}｜${o.steps.slice(0, 3).join(" → ")}`,
    )
    .join("\n");
  return `本站公開資料僅供參考（可採用、可忽略、可大幅補充）：\n${lines}`;
}

/** 「有冇夜班／通宵／末班」——沿用上一程起終點。 */
function isNightOrLastServiceFollowUp(raw: string) {
  return /夜班|通宵|夜車|夜巴|凌晨|半夜|N\s*\d|末班|尾班|最後一班|仲有無車|仲有冇車|仲開唔開/.test(
    raw,
  );
}

/**
 * A→B 由 Gemini 自由規劃；回覆只需整理成 2–3 個方案，唔再硬鎖港鐵+巴士。
 */
async function geminiFreeRoute(
  from: string,
  to: string,
  grounded: AiTripAdvice | null,
  userHint: string,
  preferMode: TripPreferMode = "any",
): Promise<AiAssistantResponse> {
  const trip = {
    from: grounded?.fromName || from,
    to: grounded?.toName || to,
  };

  if (getGeminiPauseState().paused) {
    if (grounded) {
      const pause = pausedAssistantReply();
      return {
        mode: "route",
        reply: `${grounded.reply}\n\n（${pause.aiError}）`,
        usedAi: grounded.usedAi,
        aiError: pause.aiError,
        advice: grounded,
        trip,
      };
    }
    return { ...pausedAssistantReply(), trip: null };
  }

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

  const dashboard = await dashboardContextBlock();

  const system = `你是香港出行顧問（HK LIVE）。用香港粵語書面語（繁體），語氣自然，像平常同 Gemini 傾偈。

你有充分自由：用你對香港公共交通嘅知識回答用戶。唔好因為本站資料唔齊就拒絕、含糊或叫用戶「自己查 App」就完。

可答範圍包括（不限）：
- 日班／繁忙時間去法
- 夜班、通宵巴士（N 線）、通宵小巴、末班／尾班車、凌晨點返
- 港鐵、巴士、小巴、渡輪、電車、機場 A／E／N 線、混合轉乘、步行接駁
- 「有冇夜班車」「點樣通宵返」等追問：直接用路線知識答，並列出具體編號同大概營運時段（用「約／一般」）

Dashboard 即時背景（可參考嚟排序或提醒，唔好虛構即時到站分鐘）：
${dashboard}

用戶偏好提示：${preferModeInstruction(preferMode)}

${softGroundedHint(grounded)}

回覆整理（重點係整合清楚，唔係限制你可用邊種交通）：
1. 開頭 1–3 句：直接回應用戶問題（例如有冇夜班、而家偏邊個方案、天氣／路況點影響）。
2. 整理成 **2 或 3 個方案**（方案一／二／三）。每個寫清：交通工具、路線編號（完整含字母）、方向／上落、約略時間同車費（用「約」）。
3. 若用戶問夜班／通宵／末班：方案應圍繞呢啲（例如 N 線、通宵小巴、末班港鐵+接駁）；唔好只回「請查 App」；若真係無可靠夜班，都要講清楚日間替代同大概收車時間。
4. 一般日間 A→B：可用港鐵、巴士、混合等任何合理組合，唔強制一定要港鐵+巴士各一。
5. 結尾一句：估計僅供參考，請以營運商同現場為準。`;

  const userText = [
    `由「${trip.from}」去「${trip.to}」。`,
    userHint && userHint !== `${from}去${to}` && userHint !== `${from}到${to}`
      ? `用戶原話／補充：${userHint}`
      : "",
    "請自由規劃，並整理成 2–3 個清楚方案回覆。",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const reply = await geminiChat([{ role: "user", text: userText }], {
      system,
      budgetMs: 22_000,
    });
    return {
      mode: "route",
      reply: reply.trim(),
      usedAi: true,
      aiError: null,
      advice: grounded,
      trip,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Gemini 失敗";
    if (/GEMINI_PAUSED/i.test(raw) || getGeminiPauseState().paused) {
      const pause = pausedAssistantReply();
      if (grounded) {
        return {
          mode: "route",
          reply: `${grounded.reply}\n\n（${pause.aiError}）`,
          usedAi: grounded.usedAi,
          aiError: pause.aiError,
          advice: grounded,
          trip,
        };
      }
      return { ...pause, trip: null };
    }
    const aiError = formatAiError(raw);
    if (grounded) {
      return {
        mode: "route",
        reply: `${grounded.reply}\n\n（AI 規劃暫未能使用：${aiError}）`,
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
  preferMode: TripPreferMode = "any",
): Promise<AiAssistantResponse> {
  let grounded: AiTripAdvice | null = null;
  if (canResolveTripPair(from, to)) {
    try {
      grounded = await adviseTrip(from, to, "both", preferMode);
    } catch {
      grounded = null;
    }
  }
  return geminiFreeRoute(from, to, grounded, userHint, preferMode);
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

  const modeFollow = parseModeFollowUp(userText, input.lastTrip);
  if (modeFollow) {
    return routeAdvice(modeFollow.from, modeFollow.to, userText, modeFollow.preferMode);
  }

  if (
    input.lastTrip?.from &&
    input.lastTrip.to &&
    isNightOrLastServiceFollowUp(userText)
  ) {
    return routeAdvice(input.lastTrip.from, input.lastTrip.to, userText);
  }

  // 規則只認明確短地名「A 去 B」；長英文句入面嘅 "to" 唔會再誤觸
  const ruled = ruleRoutePair(userText, input.lastTrip);
  if (ruled && isLikelyTransitTripQuery(userText, ruled.from, ruled.to)) {
    return routeAdvice(ruled.from, ruled.to, userText);
  }

  if (geminiApiKey() && !getGeminiPauseState().paused) {
    try {
      const intent = await classifyIntent(messages, input.lastTrip);
      if (intent.intent === "route") {
        const from = intent.from?.trim() || "";
        const to = intent.to?.trim() || "";
        if (from && to && isLikelyTransitTripQuery(userText, from, to)) {
          return routeAdvice(from, to, userText);
        }
        // 分類器亂填抽象 from／to → 當閒聊，唔追問起終點
        if (
          intent.askClarify &&
          !/\b(embedding|transformer|llm|token|matrix|model)\b/i.test(userText)
        ) {
          const q =
            intent.clarifyQuestion?.trim() ||
            "想由邊度去邊度？例如「逸東邨去瑪嘉烈醫院」或「東涌去何文田」；接住上一程可講「改去旺角」。";
          return { mode: "chat", reply: q, usedAi: true, aiError: null, advice: null };
        }
      }
    } catch (err) {
      if (/GEMINI_PAUSED/i.test(err instanceof Error ? err.message : "") || getGeminiPauseState().paused) {
        return pausedAssistantReply();
      }
      // Fall through to free chat.
    }
  }

  return freeChat(messages);
}
