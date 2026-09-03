import { cached, TTL } from "@/lib/cache";
import { fetchJson } from "@/lib/http";
import type { AlertSeverity, CityAlert } from "@/lib/providers/alerts";
import { MTR_LINE_NAMES, MTR_LINE_ORDER } from "@/lib/static/mtr-stations";

type MtrScheduleAlert = {
  status?: number;
  message?: string;
  url?: string;
  isdelay?: string;
  cur_time?: string;
  curr_time?: string;
  data?: Record<
    string,
    {
      UP?: unknown[];
      DOWN?: unknown[];
    }
  >;
};

/** One hub station per heavy-rail line for service-status probes. */
const LINE_PROBE: Record<string, string> = {
  TWL: "CEN",
  ISL: "ADM",
  KTL: "DIH",
  TKL: "TKO",
  EAL: "ADM",
  TML: "HUH",
  TCL: "TUC",
  AEL: "AIR",
  SIL: "SOH",
  DRL: "DIS",
};

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function firstSentence(text: string) {
  const cleaned = compact(text);
  const idx = cleaned.search(/[。！？.!]/);
  const cut = idx >= 0 ? cleaned.slice(0, idx + 1) : cleaned;
  return cut.length > 56 ? `${cut.slice(0, 54)}…` : cut;
}

function classifyMessage(message: string): { label: string; severity: AlertSeverity } {
  if (/暫停|封閉|停運|suspend/i.test(message)) {
    return { label: "車站／路段暫停", severity: "critical" };
  }
  if (/信號|訊號|故障|特別列車|特別服務|特別安排/i.test(message)) {
    return { label: "特別列車安排", severity: "critical" };
  }
  if (/延誤|delay/i.test(message)) {
    return { label: "服務延誤", severity: "high" };
  }
  return { label: "港鐵服務提示", severity: "high" };
}

function hasTrainRows(json: MtrScheduleAlert, line: string, sta: string) {
  const block = json.data?.[`${line}-${sta}`];
  if (!block) return false;
  return Boolean((block.UP?.length ?? 0) + (block.DOWN?.length ?? 0));
}

async function probeLine(line: string, sta: string): Promise<CityAlert | null> {
  const json = await fetchJson<MtrScheduleAlert>(
    `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${encodeURIComponent(line)}&sta=${encodeURIComponent(sta)}&lang=tc`,
    10_000,
  );
  const lineName = MTR_LINE_NAMES[line] ?? line;
  const when = json.cur_time || json.curr_time || null;

  if (json.status === 0) {
    const message = compact(json.message || "港鐵現有特別列車服務安排。");
    const { label, severity } = classifyMessage(message);
    return {
      id: `mtr:special:${line}:${message.slice(0, 40)}`,
      kind: "transit",
      severity,
      source: "港鐵",
      label,
      headline: `${lineName} · ${firstSentence(message)}`,
      detail: json.url ? `${message}（詳情：${json.url}）` : message,
      href: "/transit/mtr",
      updatedAt: when,
    };
  }

  if (json.isdelay === "Y") {
    const trains = hasTrainRows(json, line, sta);
    const message = trains
      ? `${lineName}現正出現服務延誤，到站時間可能受影響。`
      : `${lineName}暫時未能提供到站資料，可能有服務延誤或突發狀況。`;
    return {
      id: `mtr:delay:${line}`,
      kind: "transit",
      severity: trains ? "high" : "critical",
      source: "港鐵",
      label: trains ? "服務延誤" : "無到站資料",
      headline: message,
      detail: message,
      href: "/transit/mtr",
      updatedAt: when,
    };
  }

  return null;
}

/** Scan heavy-rail lines for special arrangements / delays via Next Train API. */
export async function loadMtrServiceAlerts(): Promise<CityAlert[]> {
  return cached("alerts:mtr:v1", TTL.alerts, async () => {
    const results = await Promise.all(
      MTR_LINE_ORDER.map(async (line) => {
        const sta = LINE_PROBE[line];
        if (!sta) return null;
        try {
          return await probeLine(line, sta);
        } catch {
          return null;
        }
      }),
    );

    const seen = new Set<string>();
    const out: CityAlert[] = [];
    for (const row of results) {
      if (!row) continue;
      // Dedupe identical headlines across lines (same system-wide notice)
      const dedupe = `${row.label}:${row.headline}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(row);
    }
    return out;
  });
}

/** Detect MTR-related items already present in TD special traffic news. */
export function isMtrTrafficText(text: string) {
  return /港鐵|輕鐵|機場快線|屯馬線|東涌線|東鐵|觀塘線|荃灣線|港島線|將軍澳線|南港島|迪士尼線|信號故障|訊號故障|港鐵站/.test(
    text,
  );
}

export function asMtrTrafficAlert(base: CityAlert): CityAlert {
  const detail = `${base.headline} ${base.detail}`;
  const { label, severity } = /信號|訊號|故障/.test(detail)
    ? { label: "信號／設備故障", severity: "critical" as const }
    : /站|車站|暫停|封閉/.test(detail)
      ? { label: "車站突發狀況", severity: "high" as const }
      : { label: "港鐵相關消息", severity: base.severity };
  return {
    ...base,
    id: `mtr-td:${base.id}`,
    kind: "transit",
    severity: severity === "medium" ? "high" : severity,
    source: "港鐵／運輸署",
    label,
    href: "/transit/mtr",
  };
}
