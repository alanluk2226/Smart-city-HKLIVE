import { cached, TTL } from "@/lib/cache";
import { geminiApiKey, geminiJson } from "@/lib/providers/gemini";
import { mtrTrip } from "@/lib/providers/mtr-trip";
import { lookupRouteInfo } from "@/lib/providers/route-fare";
import { getWeather, type WeatherSnapshot } from "@/lib/providers/weather";
import { walkRoute } from "@/lib/routing";
import {
  isNorthEalAnchor,
  isTungChungArea,
  isYatTung,
  resolveTripPlace,
  type ResolvedTripPlace,
} from "@/lib/static/hk-places";
import { MTR_LINE_NAMES } from "@/lib/static/mtr-stations";
import type { AiTripAdvice, AiTripGoal, AiTripOption, MtrTripPlan } from "@/lib/types";

/** AI 只評天氣／揀建議，唔再發明路線。 */
type AiRankOut = {
  weatherNote?: string;
  recommendedId?: string;
  annotations?: Array<{
    id?: string;
    why?: string;
    weatherFit?: string;
  }>;
};

const AI_RANK_SCHEMA = {
  type: "OBJECT",
  properties: {
    weatherNote: { type: "STRING" },
    recommendedId: { type: "STRING" },
    annotations: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          why: { type: "STRING" },
          weatherFit: { type: "STRING", enum: ["good", "ok", "poor"] },
        },
        required: ["id", "why", "weatherFit"],
      },
    },
  },
  required: ["weatherNote", "recommendedId", "annotations"],
} as const;

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

function asFit(value: string | undefined): AiTripOption["weatherFit"] {
  if (value === "good" || value === "ok" || value === "poor") return value;
  return "ok";
}

function fallbackNote(tone: ReturnType<typeof weatherTone>) {
  if (tone === "severe") return "現有惡劣天氣或強烈警報，優先有蓋、少露天轉車的港鐵。";
  if (tone === "wet") return "有雨或雷暴，短途步行要衡量有蓋行人通道；巴士／小巴可能塞車。";
  if (tone === "hot") return "天氣炎熱，短途仍可步行，長途優先有空調的港鐵、巴士或輕鐵。";
  return "天氣尚可。下面比較本站計算的固定路線方案。";
}

/** Deterministic pick when AI unavailable; AI pick is preferred but safety-checked. */
function pickRecommended(
  options: AiTripOption[],
  tone: ReturnType<typeof weatherTone>,
  aiRecommendedId?: string,
): string {
  if (!options.length) return "";
  const ids = new Set(options.map((o) => o.id));
  if (aiRecommendedId && ids.has(aiRecommendedId)) {
    const hit = options.find((o) => o.id === aiRecommendedId)!;
    if (tone === "severe" && hit.mode === "walk") {
      return options.find((o) => o.mode === "mtr")?.id ?? hit.id;
    }
    if (tone === "wet" && hit.mode === "walk" && (hit.minutes ?? 0) > 12) {
      return options.find((o) => o.mode === "mtr")?.id ?? hit.id;
    }
    return hit.id;
  }
  const timed = options.filter((o) => o.minutes != null);
  const fastest = [...timed].sort((a, b) => (a.minutes ?? 99) - (b.minutes ?? 99))[0];
  if (tone === "severe") return options.find((o) => o.mode === "mtr")?.id ?? fastest?.id ?? options[0].id;
  if (tone === "wet" && fastest?.mode === "walk" && (fastest.minutes ?? 0) > 12) {
    return options.find((o) => o.mode === "mtr")?.id ?? fastest.id;
  }
  return fastest?.id ?? options.find((o) => o.mode === "mtr")?.id ?? options[0].id;
}

/** 東涌區／屋邨 ⇄ 大埔／北區：接駁＋E41＋東鐵（本站計算，唔經 AI 發明） */
function knownFastCorridor(input: {
  from: ResolvedTripPlace;
  to: ResolvedTripPlace;
  tone: ReturnType<typeof weatherTone>;
  railMinutes: number | null;
  railFare: number | null;
  e41Fare: number | null;
  e41SegmentMin: number;
}): AiTripOption | null {
  const { from, to, tone, railMinutes, railFare, e41Fare, e41SegmentMin } = input;
  const fromNorth = isNorthEalAnchor(from.anchor.code);
  const toNorth = isNorthEalAnchor(to.anchor.code);
  const fromTuc = isTungChungArea(from);
  const toTuc = isTungChungArea(to);
  if (!((fromTuc && toNorth) || (toTuc && fromNorth))) return null;

  const towardNorth = fromTuc && toNorth;
  const east = towardNorth ? to : from;
  const tucPlace = towardNorth ? from : to;
  const eastCode = east.anchor.code;
  const eastName = east.name;
  const walkMin = 6;
  const railMin = eastCode === "TAP" ? 0 : (railMinutes ?? 20);
  const feeder = tucPlace.feeder;
  const feederMin = feeder?.minutes ?? 0;
  const minutes = feederMin + e41SegmentMin + walkMin + railMin;
  const busFare = e41Fare ?? 14.4;
  const fareHkd =
    Math.round(((feeder?.fareHkd ?? 0) + busFare + (eastCode === "TAP" ? 0 : (railFare ?? 10))) * 10) / 10;

  if (isYatTung(tucPlace) && feeder) {
    const steps = towardNorth
      ? [
          `於${tucPlace.name}乘 ${feeder.route} 號巴士前往${feeder.alight}`,
          "轉乘 E41 巴士前往大埔墟",
          ...(eastCode === "TAP"
            ? ["下車後步行至大埔墟港鐵站／目的地（約 5–8 分）"]
            : ["下車步行至大埔墟港鐵站（約 5–8 分）", `乘東鐵綫大埔墟 → ${eastName}`]),
        ]
      : [
          ...(eastCode === "TAP"
            ? ["步行至大埔墟 E41 巴士站（約 5–8 分）"]
            : [`於${eastName}乘東鐵綫前往大埔墟`, "下車步行至 E41 巴士站（約 5–8 分）"]),
          "乘 E41 巴士前往東涌纜車站",
          `轉乘 ${feeder.route} 號巴士前往${tucPlace.name}`,
        ];
    return {
      id: "mix-38-e41-tap",
      mode: "mix",
      title: towardNorth
        ? `${feeder.route} 轉 E41 再東鐵往${eastName}`
        : `東鐵轉 E41／${feeder.route} 往${tucPlace.name}`,
      minutes,
      fareHkd,
      steps,
      why: "逸東邨先乘 38 到纜車站轉 E41，再入大埔墟港鐵；通常快過入東涌站再轉多次港鐵。",
      weatherFit: tone === "severe" ? "ok" : "good",
      badges: [],
      source: "computed",
    };
  }

  const steps = towardNorth
    ? [
        ...(feeder
          ? [`於${tucPlace.name}乘 ${feeder.route} 號巴士前往${feeder.alight}`, "轉乘 E41 巴士前往大埔墟"]
          : ["於東涌乘 E41 巴士前往大埔墟"]),
        ...(eastCode === "TAP"
          ? ["下車後步行至大埔墟港鐵站／目的地（約 5–8 分）"]
          : ["下車步行至大埔墟港鐵站（約 5–8 分）", `乘東鐵綫大埔墟 → ${eastName}`]),
      ]
    : [
        ...(eastCode === "TAP"
          ? ["步行至大埔墟 E41 巴士站（約 5–8 分）"]
          : [`於${eastName}乘東鐵綫前往大埔墟`, "下車步行至 E41 巴士站（約 5–8 分）"]),
        feeder ? `乘 E41 巴士前往${feeder.alight}` : "乘 E41 巴士前往東涌",
        ...(feeder ? [`轉乘 ${feeder.route} 號巴士前往${tucPlace.name}`] : []),
      ];

  return {
    id: feeder ? "mix-feeder-e41-tap" : "mix-e41-tap",
    mode: "mix",
    title: towardNorth
      ? feeder
        ? `${feeder.route} 轉 E41 再東鐵往${eastName}`
        : eastCode === "TAP"
          ? "E41 直達大埔墟"
          : `E41 轉大埔墟港鐵往${eastName}`
      : feeder
        ? `東鐵轉 E41／${feeder.route} 往${tucPlace.name}`
        : eastCode === "TAP"
          ? "E41 大埔墟往東涌"
          : `東鐵至大埔墟轉 E41 往東涌`,
    minutes,
    fareHkd,
    steps,
    why: feeder
      ? `先接駁至${feeder.alight}再轉 E41 入大埔墟接東鐵，長途通常較快。`
      : "避開東涌線多次轉車；E41 直達大埔墟再接東鐵，長途通常較快。",
    weatherFit: tone === "severe" ? "ok" : "good",
    badges: [],
    source: "computed",
  };
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

function buildRankPrompt(input: {
  fromName: string;
  toName: string;
  weather: string;
  tone: string;
  forecast: string;
  warnings: string[];
  options: Array<{
    id: string;
    mode: string;
    title: string;
    minutes: number | null;
    fareHkd: number | null;
    steps: string[];
  }>;
}) {
  const catalog = input.options
    .map(
      (o) =>
        `- id=${o.id} | mode=${o.mode} | ${o.title} | ${o.minutes ?? "?"}分 | $${o.fareHkd ?? "?"} | steps: ${o.steps.join(" → ")}`,
    )
    .join("\n");

  return `你是香港出行天氣顧問。用香港粵語書面語（繁體）。

角色限制（極重要）：
- 路線、車費、時間、步驟已由本站用港鐵路網／巴士公開資料計算完畢。
- 你禁止發明新路線、禁止改路線號碼、禁止改 minutes／fare／steps／title。
- 你只根據天氣，為每個已有方案寫 why 同 weatherFit，並揀一個 recommendedId。

行程：${input.fromName} → ${input.toName}
天氣摘要：${input.weather}
預報：${input.forecast || "—"}
警報：${input.warnings.join("、") || "無"}
天氣等級：${input.tone}
（severe=優先有蓋港鐵；wet=少長途露天步行；hot=少長途步行；fair=可揀最快）

固定方案目錄（只能從以下 id 揀 recommendedId）：
${catalog}

輸出規則：
1. recommendedId 必須係上面其中一個 id。
2. annotations 必須覆蓋全部方案 id；why 一句講天氣點影響該方案。
3. weatherFit 只能 good | ok | poor。
4. weatherNote 一句話總結今日天氣點影響建議。`;
}

/** 北區走廊嘅較平備選（有粗略時間；非 E41 精確替代） */
function northCheaperBus(fromName: string, tone: ReturnType<typeof weatherTone>): AiTripOption {
  return {
    id: "bus-cheaper",
    mode: "bus",
    title: "巴士經青衣／荃灣（較平參考）",
    minutes: 120,
    fareHkd: 35,
    steps: [
      `於${fromName}乘巴士經青衣或荃灣往北區`,
      "轉乘較多，車程通常長過 E41 轉大埔墟",
      "適合唔趕時間、想慳車費時；實際請核對班次",
    ],
    why: "一般較平但較慢；時間為粗略估計，受路面影響。",
    weatherFit: tone === "severe" || tone === "wet" ? "poor" : "ok",
    badges: [],
    source: "computed",
  };
}

/** 未有第三條精確走廊時嘅誠實參考（唔扮精確分鐘） */
function referenceBusOption(
  fromName: string,
  toName: string,
  tone: ReturnType<typeof weatherTone>,
): AiTripOption {
  return {
    id: "bus-ref",
    mode: "bus",
    title: "其他巴士／轉乘（參考）",
    minutes: null,
    fareHkd: null,
    steps: [
      `由${fromName}往${toName}可查城巴／九巴／龍運 App 或地圖「公共交通」`,
      "長途巴士通常較港鐵平，但車程視路面，非本站精確計算",
    ],
    why: "本站暫未鎖定第三條精確走廊；此為一般參考，請以營運商為準。",
    weatherFit: tone === "severe" || tone === "wet" ? "poor" : "ok",
    badges: [],
    source: "computed",
  };
}

function padToThreeOptions(
  options: AiTripOption[],
  walkOption: AiTripOption | null,
  fromName: string,
  toName: string,
  tone: ReturnType<typeof weatherTone>,
  hasNorthCorridor: boolean,
): AiTripOption[] {
  const out = [...options];
  const has = (id: string) => out.some((o) => o.id === id);

  if (walkOption && !out.some((o) => o.mode === "walk")) out.push(walkOption);
  if (out.length < 3 && hasNorthCorridor && !has("bus-cheaper")) {
    out.push(northCheaperBus(fromName, tone));
  }
  if (out.length < 3 && !has("bus-ref")) {
    out.push(referenceBusOption(fromName, toName, tone));
  }
  return out.slice(0, 3);
}

const VARIABILITY_NOTE =
  "AI 只跟天氣寫評語同建議；每次俾出嘅方案（尤其「建議」標籤）有可能唔完全相同，請注意。";

/** 東涌 ⇄ 何文田／黃埔／愛民：城巴 E21A（一程直達市區） */
const E21A_DEST = new Set(["HOM", "WHA"]);

function isE21aArea(place: ResolvedTripPlace) {
  return E21A_DEST.has(place.anchor.code) || place.id === "estate-oi-man";
}

function e21aBusOption(input: {
  from: ResolvedTripPlace;
  to: ResolvedTripPlace;
  tone: ReturnType<typeof weatherTone>;
  fareHkd: number | null;
  journeyMinutes: number | null;
}): AiTripOption | null {
  const { from, to, tone, fareHkd, journeyMinutes } = input;
  const tucToCity = isTungChungArea(from) && isE21aArea(to);
  const cityToTuc = isTungChungArea(to) && isE21aArea(from);
  if (!tucToCity && !cityToTuc) return null;

  const tuc = tucToCity ? from : to;
  const city = tucToCity ? to : from;
  const feeder = tuc.feeder;
  const busMin = journeyMinutes != null && journeyMinutes > 40 ? Math.min(75, Math.max(55, Math.round(journeyMinutes * 0.7))) : 65;
  const minutes = (feeder?.minutes ?? 0) + busMin;
  const fare = Math.round(((feeder?.fareHkd ?? 0) + (fareHkd ?? 14)) * 10) / 10;

  const steps = tucToCity
    ? [
        ...(feeder
          ? [`於${tuc.name}乘 ${feeder.route} 號巴士前往${feeder.alight}／東涌市中心`]
          : [`於${tuc.name}前往東涌巴士站`]),
        "乘城巴 E21A（往愛民邨方向）",
        "途經青嶼幹線、葵涌，直達旺角／窩打老道／忠孝街一帶",
        `於${city.name}附近下車（何文田／愛民邨一帶）`,
      ]
    : [
        `於${city.name}一帶乘城巴 E21A（往機場／東涌方向）`,
        "途經窩打老道、旺角、葵涌、青嶼幹線往東涌",
        ...(feeder
          ? [`於東涌下車後轉 ${feeder.route} 號巴士前往${tuc.name}`]
          : [`下車後前往${tuc.name}`]),
      ];

  return {
    id: "bus-e21a",
    mode: "bus",
    title: tucToCity ? `城巴 E21A 往${city.name}一帶` : `城巴 E21A 往${tuc.name}`,
    minutes,
    fareHkd: fare,
    steps,
    why: "一程巴士直達市區，無需轉港鐵；車程受路面影響，惡劣天氣時港鐵較穩。",
    weatherFit: tone === "severe" || tone === "wet" ? "ok" : "good",
    badges: [],
    source: "computed",
  };
}

function buildChatReply(input: {
  fromName: string;
  toName: string;
  weatherNote: string;
  weatherSummary: string;
  recommendedId: string;
  options: AiTripOption[];
  disclaimer: string;
}): string {
  const lines: string[] = [];
  lines.push(`由${input.fromName}到${input.toName}，主要有以下公共交通方式：`);
  lines.push("");
  lines.push(`天氣：${input.weatherSummary}`);
  lines.push(input.weatherNote);
  lines.push("");

  for (const [i, opt] of input.options.entries()) {
    const tags: string[] = [];
    if (opt.id === input.recommendedId) tags.push("建議");
    if (opt.badges.includes("最快")) tags.push("最快");
    if (opt.badges.includes("最平")) tags.push("最平");
    const tagText = tags.length ? `（${tags.join("／")}）` : "";
    const time =
      opt.minutes != null ? `約 ${opt.minutes} 分鐘` : "時間視實際班次";
    const fare = opt.fareHkd != null ? `，成人車費約 $${opt.fareHkd}` : "";

    const ref = opt.id === "bus-ref" || opt.id === "bus-cheaper" ? "〔參考〕" : "";
    lines.push(`${i + 1}. ${opt.title}${tagText}${ref}`);
    lines.push(`路線：${opt.steps.join("；")}`);
    lines.push(
      opt.minutes == null
        ? "車程：視路面／班次（非本站精確計算）。"
        : `車程：${time}${fare}。`,
    );
    if (opt.why) lines.push(`說明：${opt.why}`);
    lines.push("");
  }

  lines.push(input.disclaimer);
  return lines.join("\n").trim();
}

function applyAiAnnotations(options: AiTripOption[], ai: AiRankOut): AiTripOption[] {
  const map = new Map(
    (ai.annotations ?? [])
      .filter((a) => a.id)
      .map((a) => [a.id!, { why: a.why?.trim(), weatherFit: asFit(a.weatherFit) }] as const),
  );
  return options.map((o) => {
    const hit = map.get(o.id);
    if (!hit) return o;
    return {
      ...o,
      why: hit.why || o.why,
      weatherFit: hit.weatherFit,
      // 路線仍係 computed；註解來自 AI
      source: o.source,
    };
  });
}

export async function adviseTrip(
  fromRaw: string,
  toRaw: string,
  _goal: AiTripGoal = "both",
): Promise<AiTripAdvice> {
  const from = resolveTripPlace(fromRaw);
  const to = resolveTripPlace(toRaw);
  if (!from || !to) {
    throw new Error("請輸入港鐵站、屋邨或地區，例如逸東邨、東涌、荃灣、羅湖、天水圍");
  }
  if (
    from.id === to.id ||
    (from.kind === "mtr" && to.kind === "mtr" && from.anchor.code === to.anchor.code && from.name === to.name)
  ) {
    throw new Error("起點與終點不能相同");
  }

  const weather = await getWeather().catch(() => null);
  const tone = weather ? weatherTone(weather) : "fair";

  const eastForE41 =
    isTungChungArea(from) && isNorthEalAnchor(to.anchor.code)
      ? to.anchor.code
      : isTungChungArea(to) && isNorthEalAnchor(from.anchor.code)
        ? from.anchor.code
        : null;
  const needTapRail = eastForE41 != null && eastForE41 !== "TAP";
  const needAccessWalk = from.kind !== "mtr";
  const needEgressWalk = to.kind !== "mtr";
  const needE41Meta = eastForE41 != null;
  const needE21a =
    (isTungChungArea(from) && isE21aArea(to)) || (isTungChungArea(to) && isE21aArea(from));

  const [plan, walk, tapRail, accessWalk, egressWalk, e41Meta, e21aMeta] = await Promise.all([
    mtrTrip(from.anchor.code, to.anchor.code).catch(() => null),
    walkRoute(from.lat, from.lng, to.lat, to.lng).catch(() => null),
    needTapRail ? mtrTrip("TAP", eastForE41).catch(() => null) : Promise.resolve(null),
    needAccessWalk
      ? walkRoute(from.lat, from.lng, from.anchor.lat, from.anchor.lng).catch(() => null)
      : Promise.resolve(null),
    needEgressWalk
      ? walkRoute(to.anchor.lat, to.anchor.lng, to.lat, to.lng).catch(() => null)
      : Promise.resolve(null),
    needE41Meta
      ? lookupRouteInfo({ operator: "kmb", route: "E41", dest: "大埔頭" }).catch(() => null)
      : Promise.resolve(null),
    needE21a
      ? lookupRouteInfo({ operator: "ctb", route: "E21A", dest: "愛民" }).catch(() => null)
      : Promise.resolve(null),
  ]);

  // E41 全程約 100 分；東涌↔大埔墟約佔一半多，取公開資料校準後夾在 50–70
  const e41SegmentMin = (() => {
    const jt = e41Meta?.journeyMinutes;
    if (jt != null && jt > 40) return Math.min(70, Math.max(50, Math.round(jt * 0.55)));
    return 55;
  })();
  const e41Fare = e41Meta?.fareAdult ?? 14.4;

  const knownCorridor = knownFastCorridor({
    from,
    to,
    tone,
    railMinutes: tapRail?.minutes ?? null,
    railFare: tapRail?.fares.adult ?? null,
    e41Fare,
    e41SegmentMin,
  });

  const e21aOption = e21aBusOption({
    from,
    to,
    tone,
    fareHkd: e21aMeta?.fareAdult ?? null,
    journeyMinutes: e21aMeta?.journeyMinutes ?? null,
  });

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
        why: "兩地好近，搭車往往要兜路。",
        weatherFit: tone === "severe" ? "poor" : tone === "wet" && walk.durationMinutes > 12 ? "ok" : "good",
        badges: [],
        source: "computed",
      }
    : null;

  const accessMin =
    from.feeder?.minutes ??
    (accessWalk && accessWalk.durationMinutes <= 25 ? accessWalk.durationMinutes : from.kind === "mtr" ? 0 : 12);
  const egressMin =
    egressWalk && egressWalk.durationMinutes <= 25
      ? egressWalk.durationMinutes
      : to.kind === "mtr"
        ? 0
        : to.kind === "district"
          ? 10
          : 8;

  const mtrOption: AiTripOption | null = plan
    ? {
        id: "mtr",
        mode: "mtr",
        title:
          from.kind === "mtr" && to.kind === "mtr"
            ? `港鐵 ${plan.fromName} → ${plan.toName}`
            : `經港鐵 ${from.name} → ${to.name}`,
        minutes: plan.minutes + accessMin + egressMin,
        fareHkd: plan.fares.adult,
        steps: [
          ...(from.kind !== "mtr"
            ? [
                from.feeder
                  ? `於${from.name}乘 ${from.feeder.route} 號巴士／步行前往${from.anchor.name}站（約 ${accessMin} 分）`
                  : `由${from.name}前往${from.anchor.name}站（約 ${accessMin} 分）`,
              ]
            : []),
          ...mtrSteps(plan),
          ...(to.kind !== "mtr" ? [`由${to.anchor.name}站前往${to.name}（約 ${egressMin} 分）`] : []),
        ],
        why:
          plan.interchangeCount === 0
            ? "港鐵段直達；時間以本站路網加接駁估計。"
            : `港鐵轉車 ${plan.interchangeCount} 次；有蓋為主，天氣差時較穩陣。`,
        weatherFit: tone === "severe" ? "good" : "ok",
        badges: [],
        source: "computed",
        mtrFrom: from.anchor.code,
        mtrTo: to.anchor.code,
      }
    : null;

  // —— 盡量 3 個方案：精確走廊優先，不足則加誠實「參考」——
  let options: AiTripOption[] = [];
  if (mtrOption) options.push(mtrOption);
  if (knownCorridor) options.push(knownCorridor);
  if (e21aOption) options.push(e21aOption);
  options = padToThreeOptions(
    options,
    walkOption,
    from.name,
    to.name,
    tone,
    Boolean(knownCorridor),
  );
  if (!options.length) throw new Error("未能規劃此行程");

  const warnings = weather?.warnings.map((w) => w.name).filter(Boolean) ?? [];
  const summary = weather ? weatherSummary(weather) : "未能載入天氣";

  let usedAi = false;
  let aiError: string | null = null;
  let weatherNote = fallbackNote(tone);
  let aiRecommendedId: string | undefined;
  const hasGeminiKey = Boolean(geminiApiKey());

  // —— AI 只做 Context：天氣評語 + 揀建議（唔改路線）——
  if (hasGeminiKey && weather) {
    try {
      const prompt = buildRankPrompt({
        fromName: from.name,
        toName: to.name,
        weather: summary,
        tone,
        forecast: weather.forecast,
        warnings,
        options: options.map((o) => ({
          id: o.id,
          mode: o.mode,
          title: o.title,
          minutes: o.minutes,
          fareHkd: o.fareHkd,
          steps: o.steps,
        })),
      });
      const cacheKey = `ai-trip:rank:v3:${from.id}:${to.id}:${tone}:${options.map((o) => o.id).join(",")}`;
      const ai = await cached(cacheKey, TTL.aiTrip, () =>
        geminiJson<AiRankOut>(prompt, 14_000, AI_RANK_SCHEMA as unknown as Record<string, unknown>),
      );
      usedAi = true;
      if (ai.weatherNote?.trim()) weatherNote = ai.weatherNote.trim();
      aiRecommendedId = ai.recommendedId?.trim();
      options = applyAiAnnotations(options, ai);
    } catch (err) {
      usedAi = false;
      const raw = err instanceof Error ? err.message : "Gemini 失敗";
      if (/location is not supported/i.test(raw)) {
        aiError =
          "Gemini API 不支援目前所在地區（本機香港網絡常見）。路線仍用本站計算；天氣評語暫用預設。部署到 Vercel 通常可正常呼叫。";
      } else {
        aiError = `AI 天氣建議暫未能使用：${raw}`;
      }
    }
  } else if (!hasGeminiKey) {
    aiError = "未設定 GEMINI_API_KEY（本機用 .env.local；線上用 Vercel Environment Variables）。";
  }

  const recommendedId = pickRecommended(options, tone, aiRecommendedId);
  const badged = withBadges(options, recommendedId);
  const disclaimer = [
    VARIABILITY_NOTE,
    `以上共 ${badged.length} 個方案；標「參考」者車程視路面，非精確計算。`,
    usedAi
      ? "有時間／車費嘅方案來自港鐵／巴士公開資料；請以營運商到達時間為準。"
      : aiError
        ? aiError
        : "有時間／車費嘅方案來自港鐵／巴士公開資料；請以營運商到達時間為準。",
  ].join(" ");

  const reply = buildChatReply({
    fromName: from.name,
    toName: to.name,
    weatherNote,
    weatherSummary: summary,
    recommendedId,
    options: badged,
    disclaimer,
  });

  return {
    fromName: from.name,
    toName: to.name,
    fromCode: from.kind === "mtr" ? from.anchor.code : from.id,
    toCode: to.kind === "mtr" ? to.anchor.code : to.id,
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
    reply,
    disclaimer,
    usedAi,
    aiError,
  };
}
