/** Prefer one strong flash model, then one lite fallback — keep total under Vercel maxDuration. */
const MODELS = ["gemini-3.7-flash", "gemini-3.1-flash-lite", "gemini-3-flash-preview"];

const PER_MODEL_MS = 10_000;

export function geminiApiKey() {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
}

export type GeminiChatTurn = {
  role: "user" | "model";
  text: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

function extractText(json: GeminiResponse) {
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed) as unknown;
}

function isFatalGeminiError(message: string) {
  return /location is not supported|API key not valid|API_KEY_INVALID|PERMISSION_DENIED|403/i.test(
    message,
  );
}

/** Gemini 3.x: avoid unsupported candidateCount / over-constrained sampling. */
function jsonGenerationConfig(responseSchema?: Record<string, unknown>) {
  return {
    temperature: 0.2,
    responseMimeType: "application/json" as const,
    ...(responseSchema ? { responseSchema } : {}),
  };
}

function textGenerationConfig() {
  return {
    temperature: 0.7,
  };
}

async function generateContent(input: {
  model: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  systemInstruction?: string;
  generationConfig: Record<string, unknown>;
  timeoutMs: number;
  apiKey: string;
}): Promise<string> {
  const body: Record<string, unknown> = {
    contents: input.contents,
    generationConfig: input.generationConfig,
  };
  if (input.systemInstruction?.trim()) {
    body.systemInstruction = {
      parts: [{ text: input.systemInstruction.trim() }],
    };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs),
    },
  );
  const json = (await res.json()) as GeminiResponse;
  if (!res.ok) {
    throw new Error(json.error?.message || `Gemini HTTP ${res.status}`);
  }
  const text = extractText(json);
  if (!text) throw new Error("Gemini 沒有回傳內容");
  return text;
}

async function withModelFallback<T>(
  budgetMs: number,
  run: (model: string, timeoutMs: number) => Promise<T>,
): Promise<T> {
  const key = geminiApiKey();
  if (!key) throw new Error("未設定 GEMINI_API_KEY");

  const deadline = Date.now() + budgetMs;
  let last: Error | null = null;

  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 1_500) break;
    const timeoutMs = Math.min(PER_MODEL_MS, remaining);
    try {
      return await run(model, timeoutMs);
    } catch (err) {
      last = err instanceof Error ? err : new Error("Gemini 失敗");
      if (isFatalGeminiError(last.message)) throw last;
      if (/timeout|aborted|AbortError/i.test(last.message)) {
        last = new Error("Gemini 回應逾時");
      }
    }
  }
  throw last ?? new Error("Gemini 失敗");
}

export async function geminiJson<T>(
  prompt: string,
  budgetMs = 14_000,
  responseSchema?: Record<string, unknown>,
): Promise<T> {
  const key = geminiApiKey();
  const text = await withModelFallback(budgetMs, (model, timeoutMs) =>
    generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: jsonGenerationConfig(responseSchema),
      timeoutMs,
      apiKey: key,
    }),
  );
  return parseJsonObject(text) as T;
}

/** Multi-turn free-form chat. Roles must be user/model alternating (Gemini API). */
export async function geminiChat(
  messages: GeminiChatTurn[],
  opts?: { system?: string; budgetMs?: number },
): Promise<string> {
  const key = geminiApiKey();
  const contents = normalizeChatContents(messages);
  if (!contents.length) throw new Error("沒有可送出的對話內容");

  return withModelFallback(opts?.budgetMs ?? 14_000, (model, timeoutMs) =>
    generateContent({
      model,
      contents,
      systemInstruction: opts?.system,
      generationConfig: textGenerationConfig(),
      timeoutMs,
      apiKey: key,
    }),
  );
}

function normalizeChatContents(messages: GeminiChatTurn[]) {
  const out: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];
  for (const m of messages) {
    const text = m.text.trim();
    if (!text) continue;
    const role = m.role === "model" ? "model" : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) {
      last.parts[0].text = `${last.parts[0].text}\n${text}`;
    } else {
      out.push({ role, parts: [{ text }] });
    }
  }
  // Gemini requires the first content role to be user.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}
