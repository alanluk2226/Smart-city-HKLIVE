import { adviseTrip } from "@/lib/providers/ai-trip";
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
- intent=route 只適用：由真實地理起點去真實地理終點（屋邨、醫院、商場、港鐵站、街道、地區等），想搭公共交通。
- from／to 必須係地名，絕對唔可以係抽象概念（Embedding、Transformer、Token、Model、知識、理論等）。
- 科技／AI／LLM／程式／數學／閒聊／解釋概念／天氣閒談 → 一律 intent=chat。
- 英文句入面有 "to"（例如 send them to transformer）唔等於去邊度。
- 有疑問時一定選 chat；唔好為咗答得似出行顧問而硬當 route。
- 只有真係問點去但又缺地名時先 askClarify=true。
- 若有上一程，用戶只講「巴士呢／港鐵呢／混合呢／直達巴士」→ intent=route，from／to 沿用上一程。`;

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

重要（必須遵守）：
- 呢個模式係普通對話，唔係出行規劃模式。
- 禁止用「出行顧問」「知識路線」「港鐵直達法」「巴士特快線」「方案一／二／三」「預計車費／車程」等旅行框架去包裝任何非出行問題。
- 用戶問科技、AI、LLM、Embedding、學習方法、閒聊等 → 直接答內容本身，唔好比喻成搭車。
- 唔好提熱帶氣旋／天氣，除非用戶問天氣或出門。
- 唔好主動規劃去邊度；用戶叫你點去先至講路線。

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

function preferModeInstruction(preferMode: TripPreferMode) {
  if (preferMode === "bus") {
    return "用戶只要巴士／小巴方案：優先一程直達；必須寫完整編號＋方向＋上落車站。唔好主推港鐵。若本站未提供可用巴士，寧願講未搵到可靠巴士方案，叫用戶用「交通工具」頁或營運商 App 查——絕對唔好虛構轉乘鏈。";
  }
  if (preferMode === "mtr") {
    return "用戶只要港鐵方案：詳細寫綫路同轉車；巴士只可當一句備註。";
  }
  if (preferMode === "mix") {
    return "用戶要巴士＋港鐵混合：寫清楚喺邊站轉；可同時提純巴士作對照，但主方案必須係混合。混合入面嘅巴士編號亦只可用本站列出嘅，唔好另砌。";
  }
  return "交通方式不限：可同時列港鐵、直達巴士、混合；第一個方案用你認為最方便快捷嘅。";
}

function groundedBusLines(grounded: AiTripAdvice | null) {
  if (!grounded) return "本站未掃到直達巴士（唔好亂估編號；可叫用戶查城巴／九巴 App 或本站「交通工具」）。";
  const buses = grounded.options.filter((o) => o.mode === "bus" || o.mode === "minibus");
  if (!buses.length) return "本站未掃到直達巴士（唔好亂估編號；可叫用戶查城巴／九巴 App 或本站「交通工具」）。";
  return buses
    .map((o) => `- ${o.title}｜約 ${o.minutes ?? "?"} 分｜約 $${o.fareHkd ?? "?"}｜${o.steps.join(" → ")}`)
    .join("\n");
}

function groundedAllowList(grounded: AiTripAdvice | null): string {
  if (!grounded?.options.length) return "（無）";
  return grounded.options
    .map((o) => `${o.mode}:${o.title}`)
    .join("；");
}

/**
 * Gemini 主導規劃：接受任意地名；本站港鐵／巴士掃描作硬約束參考。
 * 天氣／路況建議交畀模型自行決定。
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

  const weatherLine = await weatherContextLine();
  const hasGroundedBuses = Boolean(
    grounded?.options.some((o) => o.mode === "bus" || o.mode === "minibus"),
  );
  const groundedBlock = grounded
    ? `本站公開資料已計算嘅方案（港鐵時間／車費、直達巴士掃描）。你只可以喺呢啲方案上改寫語氣、排序、按天氣揀邊個先講；路線步驟同巴士編號唔可以自行改寫成另一套。\n${grounded.reply}`
    : "本站站庫未能計算精確路線。你可以講大致方向（例如優先港鐵、或叫用戶去「交通工具」查），但禁止寫出具體巴士／小巴編號同虛構轉乘站。";

  const system = `你是香港出行顧問（HK LIVE）。用香港粵語書面語（繁體），語氣像 Gemini，自然對話。

任務：為用戶規劃由起點到終點嘅公共交通（可含步行接駁）。
起點同終點可以係任何香港地點：屋邨、醫院、商場、街道、港鐵站等——唔好因為唔係港鐵站就拒絕。

即時天氣／警報背景：${weatherLine}

${groundedBlock}

本站掃到嘅直達巴士（有列出＝唯一准用嘅巴士編號來源；冇列出＝唔准自己砌轉乘）：
${groundedBusLines(grounded)}

本站已有方案一覽：${groundedAllowList(grounded)}
本站有直達巴士資料：${hasGroundedBuses ? "有" : "無"}

今次指定交通方式：${preferModeInstruction(preferMode)}

硬性規則（違反即幻覺，絕對禁止）：
A. 唔好虛構巴士／小巴編號、方向、上落站、轉乘組合。未出現喺「本站掃到嘅直達巴士」或「本站已計算方案」入面嘅編號一律唔准用。
B. 香港地理要順路：轉乘唔可以先向相反方向越行越遠再轉（例如九龍塘去觀塘，唔好先北上樂富／竹園再轉去觀塘）。不確定就唔好寫。
C. 唔好假設兩條線喺某站一定轉得到；你對唔熟嘅轉乘站，寧願唔寫，改推港鐵或叫用戶查營運商。
D. 若用戶要巴士但本站無可靠巴士：老實講未掃到／不確定，建議港鐵或「交通工具」頁；唔好為咗湊夠 2–3 個方案而亂砌。
E. 巴士編號必須完整（含字母）＋方向＋上落車站。唔好把同一系列當成同一條線（例如有 E21A 就唔好改推 E21）。
F. 唔好虛構即時到站分鐘；唔好聲稱可控制交通燈。

輸出要求：
1. 先用 1–2 句按天氣或用戶提到嘅路況，講你建議邊個方案同原因。
2. 然後列 1–3 個方案（跟上面指定方式）。每個含步驟、約略時間、約略車費（用「約」）。方案數量寧少莫假。
3. 例子：落雨→優先港鐵；塞車→避長途巴士改港鐵；港鐵故障→只可以引用本站已有巴士或叫用戶查 App。
4. 結尾提醒：估計僅供參考，請以營運商為準；AI 建議可能因天氣／對話而每次唔同。`;

  const userText = [
    `由「${trip.from}」去「${trip.to}」。`,
    userHint && userHint !== `${from}去${to}` && userHint !== `${from}到${to}`
      ? `用戶原話／補充：${userHint}`
      : "",
    "請給出行方案同建議。記住：唔准虛構巴士轉乘。",
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
