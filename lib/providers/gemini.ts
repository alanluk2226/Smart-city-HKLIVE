const MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
];

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

export async function geminiJson<T>(prompt: string): Promise<T> {
  const key = geminiApiKey();
  if (!key) throw new Error("未設定 GEMINI_API_KEY");

  let last: Error | null = null;
  for (const model of MODELS) {
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
          signal: AbortSignal.timeout(22_000),
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
    }
  }
  throw last ?? new Error("Gemini 失敗");
}
