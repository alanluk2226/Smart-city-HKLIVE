import { haversineMeters } from "@/lib/geo";
import { geminiApiKey, geminiJson } from "@/lib/providers/gemini";
import { mtrTrip } from "@/lib/providers/mtr-trip";
import { getWeather, type WeatherSnapshot } from "@/lib/providers/weather";
import { walkRoute } from "@/lib/routing";
import { MTR_LINE_NAMES, resolveMtrPlace } from "@/lib/static/mtr-stations";
import type { AiTripAdvice, AiTripGoal, AiTripMode, AiTripOption, MtrTripPlan } from "@/lib/types";

type GeminiOut = {
  weatherNote?: string;
  recommendedMode?: string;
  options?: Array<{
    mode?: string;
    title?: string;
    minutes?: number | null;
    fareHkd?: number | null;
    steps?: string[];
    why?: string;
    weatherFit?: string;
  }>;
};

const SURFACE_MODES = new Set<AiTripMode>([
  "walk",
  "bus",
  "minibus",
  "ferry",
  "lrt",
  "tram",
  "mix",
]);

function weatherTone(w: WeatherSnapshot): "severe" | "wet" | "hot" | "fair" {
  const blob = [
    w.warningMessage,
    w.tropicalMessage,
    w.forecast,
    ...w.warnings.map((x) => `${x.name}${x.type}`),
  ]
    .join(" ")
    .toLowerCase();
  if (
    /八號|九號|十號|黑色暴雨|紅色暴雨|強烈季候風|酷熱天氣警告/.test(blob) ||
    w.warnings.some((x) => /八號|九號|十號|黑色|紅色暴雨/.test(x.name + x.type))
  ) {
    return "severe";
  }
  if (/雷暴|暴雨|黃色暴雨|雨/.test(blob) || w.rainfall.some((r) => r.max >= 5)) return "wet";
  if ((w.temperature ?? 0) >= 32) return "hot";
  return "fair";
}

function weatherSummary(w: WeatherSnapshot) {
  const warn = w.warnings[0]?.name;
  const rain = w.rainfall[0];
  const bits = [
    w.temperature != null ? `${w.temperature}°C` : null,
    w.humidity != null ? `濕度 ${w.humidity}%` : null,
    warn,
    rain ? `${rain.place} 降雨 ${rain.max} mm` : null,
  ].filter(Boolean);
  return bits.join(" · ") || w.forecast.slice(0, 80) || "天氣資料不足";
}

function mtrSteps(plan: MtrTripPlan) {
  return plan.legs.map((leg) => {
    if (leg.line === "WALK") {
      return `步行 ${leg.fromName} → ${leg.toName}（約 ${Math.round(leg.minutes)} 分）`;
    }
    const line = MTR_LINE_NAMES[leg.line] ?? leg.lineName;
    return `${line} ${leg.fromName} → ${leg.toName}（約 ${Math.round(leg.minutes)} 分）`;
  });
}

function asMode(value: string | undefined): AiTripMode | null {
  if (
    value === "walk" ||
    value === "mtr" ||
    value === "bus" ||
    value === "minibus" ||
    value === "ferry" ||
    value === "lrt" ||
    value === "tram" ||
    value === "mix"
  ) {
    return value;
  }
  return null;
}

function asFit(value: string | undefined): AiTripOption["weatherFit"] {
  if (value === "good" || value === "ok" || value === "poor") return value;
  return "ok";
}

function modeTitle(mode: AiTripMode) {
  switch (mode) {
    case "walk":
      return "步行";
    case "mtr":
      return "港鐵";
    case "bus":
      return "巴士";
    case "minibus":
      return "小巴";
    case "ferry":
      return "渡輪";
    case "lrt":
      return "輕鐵";
    case "tram":
      return "電車";
    case "mix":
      return "混合行程";
  }
}

function fallbackNote(tone: ReturnType<typeof weatherTone>) {
  if (tone === "severe") return "現有惡劣天氣或強烈警報，優先有蓋、少露天轉車的港鐵。";
  if (tone === "wet") return "有雨或雷暴，短途步行要衡量有蓋行人通道；巴士／小巴可能塞車。";
  if (tone === "hot") return "天氣炎熱，短途仍可步行，長途優先有空調的港鐵、巴士或輕鐵。";
  return "天氣尚可。下面固定比較港鐵，以及另外兩個地面／其他交通方案。";
}

function pickRecommended(
  options: AiTripOption[],
  tone: ReturnType<typeof weatherTone>,
  aiMode?: string,
): string {
  if (!options.length) return "";
  const ai = asMode(aiMode);
  if (ai && options.some((o) => o.mode === ai)) {
    const hit = options.find((o) => o.mode === ai);
    if (hit && !(tone === "severe" && hit.mode === "walk")) return hit.id;
  }
  const timed = options.filter((o) => o.minutes != null);
  const fastest = [...timed].sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99))[0];
  if (tone === "severe") return options.find((o) => o.mode === "mtr")?.id ?? fastest?.id ?? options[0].id;
  if (tone === "wet" && fastest?.mode === "walk" && (fastest.minutes ?? 0) > 12) {
    return options.find((o) => o.mode === "mtr")?.id ?? fastest.id;
  }
  return fastest?.id ?? options.find((o) => o.mode === "mtr")?.id ?? options[0].id;
}

function withBadges(options: AiTripOption[], recommendedId: string) {
  const timed = options.filter((o) => o.minutes != null);
  const fastestId = [...timed].sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99))[0]?.id;
  const priced = options.filter((o) => o.fareHkd != null);
  const cheapestId = [...priced].sort((a, b) => (a.fareHkd ?? 99) - (b.fareHkd ?? 99))[0]?.id;
  return options.map((o) => {
    const badges: string[] = [];
    if (o.id === recommendedId) badges.push("建議");
    if (o.id === fastestId) badges.push("最快");
    if (o.id === cheapestId) badges.push("最平");
    if (o.mode === "walk" && o.fareHkd === 0) badges.push("免費");
    if (o.weatherFit === "poor") badges.push("天氣不宜");
    return { ...o, badges };
  });
}

function buildPrompt(input: {
  fromName: string;
  toName: string;
  weather: string;
  tone: string;
  forecast: string;
  warnings: string[];
  mtr: MtrTripPlan | null;
  walk: { meters: number; minutes: number } | null;
}) {
  const mtrText = input.mtr
    ? `港鐵（本站已計算，你唔使再寫港鐵方案）：全程約 ${input.mtr.minutes} 分，成人八達通 $${input.mtr.fares.adult ?? "—"}，轉車 ${input.mtr.interchangeCount} 次。`
    : "未能計算港鐵行程。";
  const walkText = input.walk
    ? `步行可選（OSRM）：約 ${input.walk.meters} 米、${input.walk.minutes} 分、$0。短途可作為其中一個地面方案。`
    : "兩站距離較遠，唔好硬推長途步行做主方案。";

  return `你是香港出行顧問。用香港粵語書面語（繁體）回答。

任務：由「${input.fromName}」去「${input.toName}」。
本站會固定把「港鐵」列為第 1 個方案。你只需另外提供剛好 2 個非港鐵方案。

天氣：${input.weather}
預報：${input.forecast || "—"}
警報：${input.warnings.join("、") || "無"}
天氣等級：${input.tone}（severe=惡劣優先有蓋；wet=少露天步行；hot=少長途步行；fair=可步行）

已知：
- ${mtrText}
- ${walkText}

原則：
1. 必須輸出剛好 2 個 options，mode 只能係：walk | bus | minibus | ferry | lrt | tram | mix（禁止 mtr）。
2. 兩個方案要盡量唔同模式或走廊（例如一個巴士、一個小巴／渡輪／輕鐵／電車／混合）。
3. 巴士／小巴路線號碼必須真實；不確定就寫走廊（經青衣、荃灣）而唔好亂作編號。
4. 東涌去上水／粉嶺等長途，可寫 E 線轉 278X 等真實走廊；時間可為 null 表示視路面。
5. 荃灣⇄荃灣西、尖沙咀⇄尖東等短途，好天可把 walk 作為其中一個方案。
6. 有渡輪／輕鐵／電車更合理時優先用對應 mode，唔好一律寫 bus。
7. 惡劣天氣不要主推長途步行。

請輸出 JSON：
{
  "weatherNote": "一句話講天氣點影響今次選擇",
  "recommendedMode": "mtr | walk | bus | minibus | ferry | lrt | tram | mix",
  "options": [
    {
      "mode": "bus",
      "title": "短標題",
      "minutes": 40,
      "fareHkd": 12.5,
      "steps": ["步驟1", "步驟2"],
      "why": "點解合今次天氣",
      "weatherFit": "good | ok | poor"
    }
  ]
}`;
}

function surfaceFallbacks(
  fromName: string,
  toName: string,
  walkOption: AiTripOption | null,
  tone: ReturnType<typeof weatherTone>,
  straight: number,
): AiTripOption[] {
  const out: AiTripOption[] = [];
  if (walkOption) out.push(walkOption);
  if (out.length < 2 && straight > 8000) {
    out.push({
      id: "bus-hint",
      mode: "bus",
      title: "巴士走廊（參考）",
      minutes: null,
      fareHkd: null,
      steps: ["長途可經青衣／荃灣等巴士走廊，通常比港鐵平", "實際路線請核對到達時間"],
      why: "港鐵長途八達通較貴；巴士較平但受路面影響。",
      weatherFit: tone === "severe" ? "poor" : "ok",
      badges: [],
      source: "computed",
    });
  }
  if (out.length < 2) {
    out.push({
      id: "mix-hint",
      mode: "mix",
      title: `混合行程 ${fromName} → ${toName}`,
      minutes: null,
      fareHkd: null,
      steps: ["可組合巴士／小巴／渡輪／輕鐵／電車", "請按實際站點查到達時間"],
      why: "作為港鐵以外的備選；時間視接駁同路面。",
      weatherFit: tone === "severe" ? "ok" : "good",
      badges: [],
      source: "computed",
    });
  }
  return out.slice(0, 2);
}

export async function adviseTrip(
  fromRaw: string,
  toRaw: string,
  _goal: AiTripGoal = "both",
): Promise<AiTripAdvice> {
  const from = resolveMtrPlace(fromRaw);
  const to = resolveMtrPlace(toRaw);
  if (!from || !to) {
    throw new Error("請輸入港鐵站名，例如荃灣、荃灣西、東涌、上水");
  }
  if (from.code === to.code) throw new Error("起點與終點不能相同");

  const weather = await getWeather().catch(() => null);
  const tone = weather ? weatherTone(weather) : "fair";

  const [plan, walk] = await Promise.all([
    mtrTrip(from.code, to.code).catch(() => null),
    walkRoute(from.lat, from.lng, to.lat, to.lng).catch(() => null),
  ]);

  const straight = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  const walkOk = walk && walk.durationMinutes <= 40 && walk.distanceMeters <= 3200;
  const walkOption: AiTripOption | null = walkOk
    ? {
        id: "walk",
        mode: "walk",
        title: `步行 ${from.name} → ${to.name}`,
        minutes: walk.durationMinutes,
        fareHkd: 0,
        steps: [
          `沿行人路約 ${(walk.distanceMeters / 1000).toFixed(1)} km`,
          walk.fallback ? "直線估算，實際或稍長" : "按行人路徑估計",
        ],
        why: "兩站好近，搭港鐵往往要轉綫兜路。",
        weatherFit: tone === "severe" ? "poor" : tone === "wet" && walk.durationMinutes > 12 ? "ok" : "good",
        badges: [],
        source: "computed",
      }
    : null;

  const mtrOption: AiTripOption | null = plan
    ? {
        id: "mtr",
        mode: "mtr",
        title: `港鐵 ${plan.fromName} → ${plan.toName}`,
        minutes: plan.minutes,
        fareHkd: plan.fares.adult,
        steps: mtrSteps(plan),
        why:
          plan.interchangeCount === 0
            ? "直達，時間同車費以本站路網計算。"
            : `轉車 ${plan.interchangeCount} 次；有蓋為主，天氣差時較穩陣。`,
        weatherFit: tone === "severe" ? "good" : "ok",
        badges: [],
        source: "computed",
        mtrFrom: from.code,
        mtrTo: to.code,
      }
    : null;

  const warnings = weather?.warnings.map((w) => w.name).filter(Boolean) ?? [];
  const summary = weather ? weatherSummary(weather) : "未能載入天氣";

  let usedAi = false;
  let aiError: string | null = null;
  let weatherNote = fallbackNote(tone);
  let aiMode: string | undefined;
  let surface: AiTripOption[] = [];
  const hasGeminiKey = Boolean(geminiApiKey());

  if (hasGeminiKey && weather) {
    try {
      const ai = await geminiJson<GeminiOut>(
        buildPrompt({
          fromName: from.name,
          toName: to.name,
          weather: summary,
          tone,
          forecast: weather.forecast,
          warnings,
          mtr: plan,
          walk: walkOk && walk ? { meters: walk.distanceMeters, minutes: walk.durationMinutes } : null,
        }),
      );
      usedAi = true;
      if (ai.weatherNote?.trim()) weatherNote = ai.weatherNote.trim();
      aiMode = ai.recommendedMode;
      for (const [i, opt] of (ai.options ?? []).entries()) {
        const mode = asMode(opt.mode);
        if (!mode || !SURFACE_MODES.has(mode)) continue;
        if (mode === "walk" && walkOption) {
          surface.push({
            ...walkOption,
            why: opt.why?.trim() || walkOption.why,
            weatherFit: asFit(opt.weatherFit),
            steps: opt.steps?.length ? opt.steps.slice(0, 6) : walkOption.steps,
            source: "ai",
          });
          continue;
        }
        if (mode === "walk" && !walkOption) continue;
        surface.push({
          id: `${mode}-${i}`,
          mode,
          title: opt.title?.trim() || `${modeTitle(mode)} ${from.name} → ${to.name}`,
          minutes: typeof opt.minutes === "number" ? Math.round(opt.minutes) : null,
          fareHkd: typeof opt.fareHkd === "number" ? Math.round(opt.fareHkd * 10) / 10 : null,
          steps: (opt.steps ?? []).slice(0, 6),
          why: opt.why?.trim() || `${modeTitle(mode)}可作港鐵以外選擇；時間視路面。`,
          weatherFit: asFit(opt.weatherFit),
          badges: [],
          source: "ai",
        });
        if (surface.length >= 2) break;
      }
    } catch (err) {
      usedAi = false;
      const raw = err instanceof Error ? err.message : "Gemini 失敗";
      if (/location is not supported/i.test(raw)) {
        aiError =
          "Gemini API 不支援目前所在地區（本機香港網絡常見）。方案 2／3 暫用參考提示；部署到 Vercel（美國等支援地區）通常可正常呼叫。";
      } else {
        aiError = `AI 建議暫未能使用：${raw}`;
      }
    }
  } else if (!hasGeminiKey) {
    aiError = "未設定 GEMINI_API_KEY（本機用 .env.local；線上用 Vercel Environment Variables）。";
  }

  if (surface.length < 2) {
    const fillers = surfaceFallbacks(from.name, to.name, walkOption, tone, straight).filter(
      (f) => !surface.some((s) => s.mode === f.mode && s.id === f.id),
    );
    for (const f of fillers) {
      if (surface.length >= 2) break;
      if (surface.some((s) => s.mode === f.mode && f.mode === "walk")) continue;
      surface.push(f);
    }
  }
  surface = surface.slice(0, 2);

  const options = [mtrOption, ...surface].filter(Boolean) as AiTripOption[];
  if (!options.length) throw new Error("未能規劃此行程");

  const recommendedId = pickRecommended(options, tone, aiMode);
  const badged = withBadges(options, recommendedId);

  return {
    fromName: from.name,
    toName: to.name,
    fromCode: from.code,
    toCode: to.code,
    goal: "both",
    weather: {
      temperature: weather?.temperature ?? null,
      humidity: weather?.humidity ?? null,
      summary,
      warnings,
      iconUrl: weather?.iconUrl ?? null,
    },
    weatherNote,
    recommendedId,
    options: badged,
    disclaimer: usedAi
      ? "第 1 個港鐵方案的時間／車費由本站路網計算。其餘方案為 AI 估計，請以營運商到達時間為準。"
      : aiError
        ? `第 1 個為港鐵（本站計算）。其餘為參考提示。${aiError}`
        : "第 1 個為港鐵（本站計算）。其餘為參考提示。",
    usedAi,
    aiError,
  };
}
