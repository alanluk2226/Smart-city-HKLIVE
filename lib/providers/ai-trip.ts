import { haversineMeters } from "@/lib/geo";
import { geminiApiKey, geminiJson } from "@/lib/providers/gemini";
import { mtrTrip } from "@/lib/providers/mtr-trip";
import { getWeather, type WeatherSnapshot } from "@/lib/providers/weather";
import { walkRoute } from "@/lib/routing";
import { MTR_LINE_NAMES, resolveMtrPlace } from "@/lib/static/mtr-stations";
import type { AiTripAdvice, AiTripGoal, AiTripOption, MtrTripPlan } from "@/lib/types";

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

function asMode(value: string | undefined): AiTripOption["mode"] | null {
  if (value === "walk" || value === "mtr" || value === "bus" || value === "mix") return value;
  return null;
}

function asFit(value: string | undefined): AiTripOption["weatherFit"] {
  if (value === "good" || value === "ok" || value === "poor") return value;
  return "ok";
}

function fallbackNote(tone: ReturnType<typeof weatherTone>, goal: AiTripGoal) {
  if (tone === "severe") return "現有惡劣天氣或強烈警報，優先有蓋、少露天轉車的港鐵。";
  if (tone === "wet") return "有雨或雷暴，短途步行要衡量有蓋行人通道；長途巴士可能塞車。";
  if (tone === "hot") return "天氣炎熱，短途仍可步行，長途優先有空調的港鐵或巴士。";
  if (goal === "cheapest") return "天氣尚可，短途步行最平；長途可試巴士走廊，通常比港鐵平。";
  return "天氣尚可。短途（例如荃灣⇄荃灣西）行路往往快過轉綫；長途先比較港鐵同巴士。";
}

function pickRecommended(
  options: AiTripOption[],
  goal: AiTripGoal,
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
  if (goal === "cheapest") {
    const walkCheap = options.find((o) => o.mode === "walk" && o.fareHkd === 0);
    if (walkCheap && tone !== "severe") return walkCheap.id;
    const bus = options.find((o) => o.mode === "bus" || o.mode === "mix");
    if (bus && tone !== "severe") return bus.id;
    const priced = [...options].sort((a, b) => (a.fareHkd ?? 99) - (b.fareHkd ?? 99));
    return priced[0].id;
  }
  const fastest = [...timed].sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99))[0];
  if (tone === "severe") return options.find((o) => o.mode === "mtr")?.id ?? fastest?.id ?? options[0].id;
  if (tone === "wet" && fastest?.mode === "walk" && (fastest.minutes ?? 0) > 12) {
    return options.find((o) => o.mode === "mtr")?.id ?? fastest.id;
  }
  return fastest?.id ?? options[0].id;
}

function withBadges(options: AiTripOption[], recommendedId: string, goal: AiTripGoal) {
  const timed = options.filter((o) => o.minutes != null);
  const fastestId = [...timed].sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99))[0]?.id;
  const cheapestId = [...options].sort((a, b) => (a.fareHkd ?? 99) - (b.fareHkd ?? 99))[0]?.id;
  return options.map((o) => {
    const badges: string[] = [];
    if (o.id === recommendedId) badges.push("建議");
    if (o.id === fastestId && (goal === "fastest" || goal === "both")) badges.push("最快");
    if (o.id === cheapestId && (goal === "cheapest" || goal === "both")) badges.push("最平");
    if (o.mode === "walk" && o.fareHkd === 0) badges.push("免費");
    if (o.weatherFit === "poor") badges.push("天氣不宜");
    return { ...o, badges };
  });
}

function buildPrompt(input: {
  fromName: string;
  toName: string;
  goal: AiTripGoal;
  weather: string;
  tone: string;
  forecast: string;
  warnings: string[];
  mtr: MtrTripPlan | null;
  walk: { meters: number; minutes: number } | null;
}) {
  const mtrText = input.mtr
    ? `港鐵（以本站實時路網計算，不可改時間／車費）：全程約 ${input.mtr.minutes} 分，成人八達通 $${input.mtr.fares.adult ?? "—"}，轉車 ${input.mtr.interchangeCount} 次。路段：${mtrSteps(input.mtr).join("；")}`
    : "未能計算港鐵行程。";
  const walkText = input.walk
    ? `步行（OSRM 行人路）：約 ${input.walk.meters} 米、${input.walk.minutes} 分、車費 $0。`
    : "兩站距離較遠，步行不是合理主方案。";

  return `你是香港出行顧問。用香港粵語書面語（繁體）回答。只根據事實＋你對香港巴士走廊的知識。

任務：由「${input.fromName}」去「${input.toName}」，用戶想要：${input.goal === "fastest" ? "最快" : input.goal === "cheapest" ? "最便宜" : "同時比較最快同最便宜"}。

天氣：${input.weather}
預報：${input.forecast || "—"}
警報：${input.warnings.join("、") || "無"}
天氣等級：${input.tone}（severe=惡劣優先有蓋交通；wet=有雨少露天步行；hot=炎熱少長途步行；fair=可步行）

已知方案：
- ${mtrText}
- ${walkText}

原則：
1. 港鐵時間同車費必須用上面數字，不可改。
2. 荃灣站⇄荃灣西站、尖沙咀⇄尖東、旺角⇄旺角東、中環⇄香港站 這類短途，好天時步行通常快過轉綫。
3. 東涌去上水／粉嶺／大埔等新界北，巴士經青衣、荃灣（例如 E 線轉 278X／273 系列）通常比港鐵平，時間視路面；唔好假裝有即時到站。
4. 巴士路線號碼必須係真實香港路線；不確定就寫走廊（經青衣、荃灣）而唔好亂作編號。
5. 惡劣天氣不要主推長途步行。
6. 只輸出 2–4 個方案。步行／港鐵必須各自最多一項；巴士可 1 項。

請輸出 JSON：
{
  "weatherNote": "一句話講天氣點影響今次選擇",
  "recommendedMode": "walk | mtr | bus | mix",
  "options": [
    {
      "mode": "walk | mtr | bus | mix",
      "title": "短標題",
      "minutes": 14,
      "fareHkd": 0,
      "steps": ["步驟1", "步驟2"],
      "why": "點解合今次天氣／目標",
      "weatherFit": "good | ok | poor"
    }
  ]
}`;
}

export async function adviseTrip(fromRaw: string, toRaw: string, goal: AiTripGoal): Promise<AiTripAdvice> {
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

  const computed = [walkOption, mtrOption].filter(Boolean) as AiTripOption[];
  const warnings = weather?.warnings.map((w) => w.name).filter(Boolean) ?? [];
  const summary = weather ? weatherSummary(weather) : "未能載入天氣";

  let usedAi = false;
  let weatherNote = fallbackNote(tone, goal);
  let aiMode: string | undefined;
  const extras: AiTripOption[] = [];

  if (geminiApiKey() && weather) {
    try {
      const ai = await geminiJson<GeminiOut>(
        buildPrompt({
          fromName: from.name,
          toName: to.name,
          goal,
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
        if (!mode) continue;
        if (mode === "walk" && walkOption) {
          walkOption.why = opt.why?.trim() || walkOption.why;
          walkOption.weatherFit = asFit(opt.weatherFit);
          if (opt.steps?.length) walkOption.steps = opt.steps.slice(0, 6);
          continue;
        }
        if (mode === "mtr" && mtrOption) {
          mtrOption.why = opt.why?.trim() || mtrOption.why;
          mtrOption.weatherFit = asFit(opt.weatherFit);
          continue;
        }
        if (mode === "bus" || mode === "mix") {
          extras.push({
            id: `${mode}-${i}`,
            mode,
            title: opt.title?.trim() || (mode === "bus" ? "巴士走廊" : "混合行程"),
            minutes: typeof opt.minutes === "number" ? Math.round(opt.minutes) : null,
            fareHkd: typeof opt.fareHkd === "number" ? Math.round(opt.fareHkd * 10) / 10 : null,
            steps: (opt.steps ?? []).slice(0, 6),
            why: opt.why?.trim() || "巴士通常比港鐵平，時間視路面。",
            weatherFit: asFit(opt.weatherFit),
            badges: [],
            source: "ai",
          });
        }
      }
    } catch {
      usedAi = false;
    }
  }

  if (!extras.length && straight > 15000 && goal !== "fastest") {
    extras.push({
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

  const options = [...computed, ...extras];
  if (!options.length) throw new Error("未能規劃此行程");

  const recommendedId = pickRecommended(options, goal, tone, aiMode);
  const badged = withBadges(options, recommendedId, goal);

  return {
    fromName: from.name,
    toName: to.name,
    fromCode: from.code,
    toCode: to.code,
    goal,
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
      ? "港鐵時間／車費由本站路網計算。巴士班次同車費為 AI 估計，請以營運商到達時間為準。"
      : "未使用 AI。港鐵同步行由本站計算；長途巴士僅作走廊提示。可在伺服器設定 GEMINI_API_KEY 以取得路線建議。",
    usedAi,
  };
}
