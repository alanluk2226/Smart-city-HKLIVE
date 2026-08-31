import { cached, TTL } from "@/lib/cache";
import { fetchBuffer, fetchJson } from "@/lib/http";

const RADAR_JSON = "https://www.hko.gov.hk/wxinfo/radars/temp_json/nradar_img.json";
const WIND_JSON = "https://www.hko.gov.hk/wxinfo/ts/wb_animation_c.json";
const RADAR_BASE = "https://www.hko.gov.hk/wxinfo/radars/";
const WIND_BASE = "https://www.hko.gov.hk/wxinfo/ts/";

/** 64 km range — best local spatial awareness for Hong Kong */
const RADAR_RANGE_KEY = "range2";
const RADAR_FILE_RE = /^rad_[0-9a-z_]+\/[0-9a-z_]+\.jpe?g$/i;
const WIND_FILE_RE = /^windchk_\d{4}\.png$/i;

export type WeatherMapLayer = {
  kind: "radar" | "wind";
  title: string;
  subtitle: string;
  /** Same-origin proxy URL for the latest frame */
  imageUrl: string;
  /** Proxied frame URLs for short radar loop (wind usually has one latest) */
  frames: string[];
  updatedAt: string | null;
  officialUrl: string;
};

export type WeatherMapsSnapshot = {
  radar: WeatherMapLayer;
  wind: WeatherMapLayer;
  fetchedAt: string;
};

type RadarJson = {
  radar?: Record<string, { image?: string[] }>;
};

type WindJson = {
  latest_image_link?: string;
  image_list?: string[];
  issued_at?: string;
};

function parseRadarPicture(entry: string): string | null {
  const m = entry.match(/picture\[\d+\]\[\d+\]="([^"]+)"/);
  const file = m?.[1]?.trim() ?? "";
  return RADAR_FILE_RE.test(file) ? file : null;
}

function parseWindIssuedAt(raw: string | undefined): string | null {
  if (!raw) return null;
  // e.g. 2026_08_31T19:50:00+0800
  const normalized = raw.replace(/^(\d{4})_(\d{2})_(\d{2})T/, "$1-$2-$3T").replace(/(\+\d{2})(\d{2})$/, "$1:$2");
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function radarUpdatedAt(file: string): string | null {
  const m = file.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\.jpe?g$/i);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00+08:00`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export async function getWeatherMaps(): Promise<WeatherMapsSnapshot> {
  return cached("weather:maps:v1", TTL.weather, async () => {
    const [radarJson, windJson] = await Promise.all([
      fetchJson<RadarJson>(RADAR_JSON, 12_000),
      fetchJson<WindJson>(WIND_JSON, 12_000),
    ]);

    const radarEntries = radarJson.radar?.[RADAR_RANGE_KEY]?.image ?? [];
    const radarFiles = radarEntries
      .map(parseRadarPicture)
      .filter((f): f is string => Boolean(f));
    if (!radarFiles.length) throw new Error("未能取得降雨雷達圖");

    const radarLatest = radarFiles[radarFiles.length - 1]!;
    const radarLoop = radarFiles.slice(-10);
    const radarFrames = radarLoop.map(
      (file) => `/api/weather/maps/image?kind=radar&file=${encodeURIComponent(file)}`,
    );

    const windLatest = windJson.latest_image_link?.trim() || "";
    if (!WIND_FILE_RE.test(windLatest)) throw new Error("未能取得風力風向圖");
    const windUrl = `/api/weather/maps/image?kind=wind&file=${encodeURIComponent(windLatest)}`;

    return {
      radar: {
        kind: "radar",
        title: "降雨雷達圖",
        subtitle: "64 公里範圍 · 天文台雷達",
        imageUrl: radarFrames[radarFrames.length - 1]!,
        frames: radarFrames,
        updatedAt: radarUpdatedAt(radarLatest),
        officialUrl: "https://www.hko.gov.hk/tc/wxinfo/radars/radar_range1.htm",
      },
      wind: {
        kind: "wind",
        title: "風力／風向圖",
        subtitle: "全港測風站 · 平均風向及風速",
        imageUrl: windUrl,
        frames: [windUrl],
        updatedAt: parseWindIssuedAt(windJson.issued_at),
        officialUrl: "https://www.hko.gov.hk/tc/wxinfo/ts/wb_animation.htm",
      },
      fetchedAt: new Date().toISOString(),
    };
  });
}

export async function getWeatherMapImage(
  kind: "radar" | "wind",
  file: string,
): Promise<{ body: ArrayBuffer; contentType: string }> {
  let upstream: string;
  if (kind === "radar") {
    if (!RADAR_FILE_RE.test(file)) throw new Error("無效雷達圖檔");
    upstream = `${RADAR_BASE}${file}`;
  } else {
    if (!WIND_FILE_RE.test(file)) throw new Error("無效風力圖檔");
    upstream = `${WIND_BASE}${file}`;
  }
  return fetchBuffer(upstream, 15_000);
}
