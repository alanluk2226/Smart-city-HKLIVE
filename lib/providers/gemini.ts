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

export async function geminiJson<T>(prompt: string, budgetMs = 14_000): Promise<T> {
  const key = geminiApiKey();
  if (!key) throw new Error("未設定 GEMINI_API_KEY");

  const deadline = Date.now() + budgetMs;
  let last: Error | null = null;

  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 1_500) break;
    const timeoutMs = Math.min(PER_MODEL_MS, remaining);

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.25,
              responseMimeType: "application/json",
            },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
      const json = (await res.json()) as GeminiResponse;
      if (!res.ok) {
        throw new Error(json.error?.message || `Gemini HTTP ${res.status}`);
      }
      const text = extractText(json);
      if (!text) throw new Error("Gemini 沒有回傳內容");
      return parseJsonObject(text) as T;
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
