import { cached, TTL } from "@/lib/cache";
import { fetchJson } from "@/lib/http";

export type WeatherWarning = { name: string; type: string; action: string };

export type NineDayForecast = {
  date: string;
  week: string;
  /** Display label e.g. 8/31 */
  dateLabel: string;
  forecastWeather: string;
  forecastWind: string;
  forecastMaxtemp: number;
  forecastMintemp: number;
  ForecastIcon: number | null;
  iconUrl: string | null;
  PSR: string;
};

export type UvIndex = {
  value: number;
  desc: string;
  place: string;
  recordDesc: string;
};

export type AqhiSummary = {
  /** Display value: single number or range e.g. "2–4" across general stations */
  value: number | string;
  min: number;
  max: number;
  risk: string;
  riskTc: string;
  /** e.g. 全港一般監測站 */
  scopeLabel: string;
  updatedAt: string | null;
};

export type WeatherSnapshot = {
  temperature: number | null;
  humidity: number | null;
  place: string;
  icon: number | null;
  iconUrl: string | null;
  rainfall: { place: string; max: number }[];
  warningMessage: string;
  tropicalMessage: string;
  updateTime: string | null;
  forecast: string;
  outlook: string;
  /** Today's wind from 9-day forecast (HKO has no live wind in rhrread) */
  todayWind: string;
  uv: UvIndex | null;
  aqhi: AqhiSummary | null;
  nineDay: NineDayForecast[];
  warnings: WeatherWarning[];
};

type Rhr = {
  temperature?: { data: Array<{ place: string; value: number }> };
  humidity?: { data: Array<{ place: string; value: number }> };
  rainfall?: { data: Array<{ place: string; max: number }> };
  warningMessage?: string | string[];
  tcmessage?: string | string[];
  icon?: number[];
  updateTime?: string;
  uvindex?: {
    data?: Array<{ place: string; value: number; desc: string }>;
    recordDesc?: string;
  };
};

type Flw = {
  forecastDesc?: string;
  outlook?: string;
};

type Fnd = {
  weatherForecast?: Array<{
    forecastDate: string;
    week: string;
    forecastWeather: string;
    forecastWind?: string;
    forecastMaxtemp: { value: number };
    forecastMintemp: { value: number };
    ForecastIcon?: number;
    PSR: string;
  }>;
};

type WarnSum = Record<string, { name?: string; type?: string; actionCode?: string }>;

type AqhiRow = {
  station?: string;
  aqhi?: number | string;
  health_risk?: string;
  publish_date?: string;
};

const ROADSIDE = new Set(["Causeway Bay", "Central", "Mong Kok"]);

const RISK_TC: Record<string, string> = {
  Low: "低",
  Moderate: "中",
  High: "高",
  "Very High": "甚高",
  Serious: "嚴重",
};

function asText(value: string | string[] | undefined) {
  if (!value) return "";
  return Array.isArray(value) ? value.join("\n") : value;
}

function hkoIconUrl(icon: number | null | undefined) {
  if (icon == null || !Number.isFinite(icon)) return null;
  return `https://www.hko.gov.hk/images/HKOWxIconOutline/pic${icon}.png`;
}

/** YYYYMMDD → 8/31 */
function dateLabelFromYmd(ymd: string) {
  const m = ymd.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return ymd;
  return `${Number(m[2])}/${Number(m[3])}`;
}

function aqhiNumeric(v: number | string | undefined): number {
  if (v == null) return NaN;
  if (v === "10+" || v === "10＋") return 11;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function formatAqhiValue(n: number): string {
  return n >= 11 ? "10+" : String(n);
}

/** Map numeric AQHI to EPD health-risk band (for range max). */
function riskFromAqhi(n: number): string {
  if (n <= 3) return "Low";
  if (n <= 6) return "Moderate";
  if (n <= 7) return "High";
  if (n <= 10) return "Very High";
  return "Serious";
}

function pickAqhi(rows: AqhiRow[]): AqhiSummary | null {
  const general = rows.filter((r) => r.station && !ROADSIDE.has(r.station));
  const pool = general.length ? general : rows;
  const nums = pool.map((r) => aqhiNumeric(r.aqhi)).filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const risk = riskFromAqhi(max);
  const updatedAt = pool.find((r) => r.publish_date)?.publish_date ?? null;
  return {
    value: min === max ? formatAqhiValue(min) : `${formatAqhiValue(min)}–${formatAqhiValue(max)}`,
    min,
    max,
    risk,
    riskTc: RISK_TC[risk] ?? risk,
    scopeLabel: general.length ? "全港一般監測站" : "監測站",
    updatedAt,
  };
}

async function fetchAqhi(): Promise<AqhiSummary | null> {
  try {
    const rows = await fetchJson<AqhiRow[]>(
      "https://dashboard.data.gov.hk/api/aqhi-individual?format=json",
    );
    return pickAqhi(Array.isArray(rows) ? rows : []);
  } catch {
    return null;
  }
}

export async function getWeather(): Promise<WeatherSnapshot> {
  return cached("weather:all:v4", TTL.weather, async () => {
    const [rhr, flw, fnd, warn, aqhi] = await Promise.all([
      fetchJson<Rhr>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=rhrread&lang=tc"),
      fetchJson<Flw>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=flw&lang=tc"),
      fetchJson<Fnd>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=fnd&lang=tc"),
      fetchJson<WarnSum>("https://data.weather.gov.hk/weatherAPI/opendata/weather.php?dataType=warnsum&lang=tc"),
      fetchAqhi(),
    ]);
    const hkoTemp = rhr.temperature?.data.find((d) => d.place === "香港天文台") ?? rhr.temperature?.data[0];
    const humidity = rhr.humidity?.data[0];
    const icon = rhr.icon?.[0] ?? null;
    const uvRow = rhr.uvindex?.data?.[0];
    const warnings = Object.values(warn ?? {})
      .filter((w) => w?.name)
      .map((w) => ({
        name: w.name ?? "",
        type: w.type ?? "",
        action: w.actionCode ?? "",
      }));
    const nineDay = (fnd.weatherForecast ?? []).map((d) => {
      const ForecastIcon = d.ForecastIcon ?? null;
      return {
        date: d.forecastDate,
        week: d.week,
        dateLabel: dateLabelFromYmd(d.forecastDate),
        forecastWeather: d.forecastWeather,
        forecastWind: d.forecastWind ?? "",
        forecastMaxtemp: d.forecastMaxtemp.value,
        forecastMintemp: d.forecastMintemp.value,
        ForecastIcon,
        iconUrl: hkoIconUrl(ForecastIcon),
        PSR: d.PSR,
      };
    });
    return {
      temperature: hkoTemp?.value ?? null,
      humidity: humidity?.value ?? null,
      place: hkoTemp?.place ?? "香港天文台",
      icon,
      iconUrl: hkoIconUrl(icon),
      rainfall: (rhr.rainfall?.data ?? [])
        .filter((d) => d.max > 0)
        .map((d) => ({ place: d.place, max: d.max })),
      warningMessage: asText(rhr.warningMessage),
      tropicalMessage: asText(rhr.tcmessage),
      updateTime: rhr.updateTime ?? null,
      forecast: flw.forecastDesc ?? "",
      outlook: flw.outlook ?? "",
      todayWind: nineDay[0]?.forecastWind ?? "",
      uv: uvRow
        ? {
            value: uvRow.value,
            desc: uvRow.desc,
            place: uvRow.place,
            recordDesc: rhr.uvindex?.recordDesc ?? "",
          }
        : null,
      aqhi,
      nineDay,
      warnings,
    };
  });
}
