import { cached, TTL } from "@/lib/cache";
import { fetchJson, fetchText } from "@/lib/http";
import {
  asMtrTrafficAlert,
  isMtrTrafficText,
  loadMtrServiceAlerts,
} from "@/lib/providers/mtr-alerts";
import { getWeather } from "@/lib/providers/weather";

export type AlertKind = "weather" | "traffic" | "transit";
export type AlertSeverity = "critical" | "high" | "medium";

export type CityAlert = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  source: string;
  label: string;
  headline: string;
  detail: string;
  href: string;
  updatedAt: string | null;
};

export type AlertsSnapshot = {
  alerts: CityAlert[];
  updatedAt: string;
};

type SwtPayload = {
  swt?: Array<{ desc?: string; updateTime?: string }>;
};

const TRAFFIC_V2 = "https://www.td.gov.hk/tc/special_news/trafficnews.xml";
const TRAFFIC_V1 = "https://resource.data.one.gov.hk/td/en/specialtrafficnews.xml";

const RANK: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2 };

function decodeXml(text: string) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function xmlTag(chunk: string, tag: string) {
  const m = chunk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeXml(m[1].trim()) : "";
}

function xmlBlocks(xml: string, tag: string) {
  const out: string[] = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out.push(match[1]);
  return out;
}

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function firstSentence(text: string) {
  const cleaned = compact(text);
  const idx = cleaned.search(/[。！？]/);
  const cut = idx >= 0 ? cleaned.slice(0, idx + 1) : cleaned;
  return cut.length > 56 ? `${cut.slice(0, 54)}…` : cut;
}

function weatherSeverity(name: string): AlertSeverity {
  if (/黑雨|十號|九號|八號/.test(name)) return "critical";
  return "high";
}

function isClearedTraffic(status: string, content: string) {
  return /解除|已解封|已恢復|已重開|re-opened/i.test(`${status} ${content}`);
}

function parseHkTime(iso: string) {
  if (!iso) return NaN;
  if (/Z$|[+-]\d{2}(:?\d{2})?$/.test(iso)) return Date.parse(iso);
  return Date.parse(`${iso}+08:00`);
}

function isRecent(iso: string, maxMs: number) {
  const t = parseHkTime(iso);
  return Number.isFinite(t) && Date.now() - t < maxMs;
}

function parseTrafficV2(xml: string): CityAlert[] {
  return xmlBlocks(xml, "message").flatMap((chunk) => {
    const content = compact(xmlTag(chunk, "CONTENT_CN") || xmlTag(chunk, "CONTENT_EN"));
    const status = xmlTag(chunk, "INCIDENT_STATUS_CN") || xmlTag(chunk, "INCIDENT_STATUS_EN");
    const announced = xmlTag(chunk, "ANNOUNCEMENT_DATE");
    if (!content) return [];
    const cleared = isClearedTraffic(status, content);
    if (cleared && !isRecent(announced, 45 * 60 * 1000)) return [];
    const id = xmlTag(chunk, "INCIDENT_NUMBER") || xmlTag(chunk, "ID");
    const heading = xmlTag(chunk, "INCIDENT_HEADING_CN");
    const detailType = xmlTag(chunk, "INCIDENT_DETAIL_CN");
    const location = xmlTag(chunk, "LOCATION_CN");
    const direction = xmlTag(chunk, "DIRECTION_CN");
    const near = xmlTag(chunk, "NEAR_LANDMARK_CN");
    const place = [location, direction ? `往${direction}` : "", near ? `近${near}` : ""]
      .filter(Boolean)
      .join(" ");
    const label = cleared ? "已解封" : detailType || heading || "特別交通消息";
    const headline = place
      ? `${cleared ? "已解封" : label} · ${place}`
      : firstSentence(content);
    const accident = /意外|封閉|積水|塌樹|山泥/.test(`${label} ${content}`);
    return [
      {
        id: `td2:${id || content.slice(0, 24)}`,
        kind: "traffic" as const,
        severity: cleared ? "medium" : accident ? "high" : "medium",
        source: "運輸署",
        label,
        headline,
        detail: content,
        href: "/traffic",
        updatedAt: announced || null,
      },
    ];
  });
}

function swtHeadline(desc: string) {
  const signal = desc.match(/天文台[^。\n]{0,48}發出[^。\n]{0,24}信號/);
  if (signal) return compact(signal[0]);
  return firstSentence(desc);
}

async function loadSpecialWeatherTips(): Promise<CityAlert[]> {
  try {
    const data = await fetchJson<SwtPayload>(
      "https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=swt&lang=tc",
    );
    return (data.swt ?? [])
      .filter((row) => row.desc?.trim())
      .map((row, i) => {
        const desc = compact(row.desc ?? "");
        return {
          id: `swt:${row.updateTime ?? i}`,
          kind: "weather" as const,
          severity: /八號|九號|十號|黑雨|一號|三號|信號/.test(desc) ? "high" : "medium",
          source: "天文台",
          label: "特別天氣提示",
          headline: swtHeadline(desc),
          detail: desc,
          href: "/weather",
          updatedAt: row.updateTime ?? null,
        };
      });
  } catch {
    return [];
  }
}

function parseTrafficV1(xml: string): CityAlert[] {
  return xmlBlocks(xml, "message").flatMap((chunk) => {
    const status = xmlTag(chunk, "CurrentStatus");
    if (status === "3") return [];
    const text = compact(xmlTag(chunk, "ChinShort") || xmlTag(chunk, "ChinText"));
    if (!text || isClearedTraffic("", text)) return [];
    const id = xmlTag(chunk, "msgID");
    const accident = /意外|封閉|積水|塌樹|山泥/.test(text);
    return [
      {
        id: `td1:${id || text.slice(0, 24)}`,
        kind: "traffic" as const,
        severity: accident ? "high" : "medium",
        source: "運輸署",
        label: /意外/.test(text) ? "交通意外" : "特別交通消息",
        headline: firstSentence(text),
        detail: text,
        href: "/traffic",
        updatedAt: compact(xmlTag(chunk, "ReferenceDate")) || null,
      },
    ];
  });
}

async function loadTrafficNews(): Promise<CityAlert[]> {
  return cached("alerts:traffic:v2", TTL.alerts, async () => {
    try {
      return parseTrafficV2(await fetchText(TRAFFIC_V2));
    } catch {
      try {
        return parseTrafficV1(await fetchText(TRAFFIC_V1));
      } catch {
        return [];
      }
    }
  });
}

function weatherAlertsFromSnapshot(
  warnings: Array<{ name: string; type: string }>,
  warningMessage: string,
  tropicalMessage: string,
): CityAlert[] {
  const alerts: CityAlert[] = [];
  for (const w of warnings) {
    const name = compact(w.name);
    if (!name) continue;
    alerts.push({
      id: `hko:${name}:${w.type}`,
      kind: "weather",
      severity: weatherSeverity(name),
      source: "天文台",
      label: "天氣警告",
      headline: w.type ? `${name} · ${compact(w.type)}` : name,
      detail: compact(warningMessage || tropicalMessage) || `${name}現正生效。`,
      href: "/weather",
      updatedAt: null,
    });
  }
  if (!alerts.length && warningMessage) {
    alerts.push({
      id: `hko:msg:${warningMessage.slice(0, 24)}`,
      kind: "weather",
      severity: weatherSeverity(warningMessage),
      source: "天文台",
      label: "天氣警告",
      headline: firstSentence(warningMessage),
      detail: compact(warningMessage),
      href: "/weather",
      updatedAt: null,
    });
  }
  if (tropicalMessage && !alerts.some((a) => a.detail.includes(tropicalMessage.slice(0, 20)))) {
    alerts.push({
      id: `hko:tc:${tropicalMessage.slice(0, 24)}`,
      kind: "weather",
      severity: /八號|九號|十號/.test(tropicalMessage) ? "critical" : "high",
      source: "天文台",
      label: "熱帶氣旋",
      headline: firstSentence(tropicalMessage),
      detail: compact(tropicalMessage),
      href: "/weather",
      updatedAt: null,
    });
  }
  return alerts;
}

export async function getCityAlerts(): Promise<AlertsSnapshot> {
  return cached("alerts:all:v3", TTL.alerts, async () => {
    const [weather, swt, trafficRaw, mtr] = await Promise.all([
      getWeather().catch(() => null),
      loadSpecialWeatherTips(),
      loadTrafficNews(),
      loadMtrServiceAlerts().catch(() => [] as CityAlert[]),
    ]);

    const official = weather
      ? weatherAlertsFromSnapshot(weather.warnings, weather.warningMessage, weather.tropicalMessage)
      : [];

    const tips = official.length
      ? swt.filter((tip) => !official.some((w) => tip.headline.includes(w.headline.slice(0, 8))))
      : swt;

    // Promote TD items that are really MTR signal / station incidents
    const traffic = trafficRaw.map((row) =>
      isMtrTrafficText(`${row.headline} ${row.detail} ${row.label}`)
        ? asMtrTrafficAlert(row)
        : row,
    );

    const alerts = [...official, ...tips, ...mtr, ...traffic].sort(
      (a, b) => RANK[a.severity] - RANK[b.severity],
    );

    return {
      alerts,
      updatedAt: new Date().toISOString(),
    };
  });
}
