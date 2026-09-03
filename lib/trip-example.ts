import { haversineMeters } from "@/lib/geo";
import { MTR_STATIONS } from "@/lib/static/mtr-stations";

export const DEFAULT_TRIP_PLACEHOLDER = "逸東邨去瑪嘉烈醫院…";

/** 隨機終點候選（另一區／熱門目的地） */
const EXAMPLE_DESTINATIONS = [
  "觀塘",
  "中環",
  "荃灣",
  "東涌",
  "沙田",
  "屯門",
  "銅鑼灣",
  "尖沙咀",
  "黃大仙",
  "將軍澳",
  "大埔",
  "元朗",
  "葵芳",
  "何文田",
  "鑽石山",
  "青衣",
  "馬鞍山",
  "天水圍",
];

function nearestMtrName(lat: number, lng: number): string {
  let best = MTR_STATIONS[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of MTR_STATIONS) {
    const d = haversineMeters(lat, lng, s.lat, s.lng);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best.name;
}

function sameArea(origin: string, dest: string) {
  return origin === dest || origin.includes(dest) || dest.includes(origin);
}

/**
 * 用而家座標造輸入框例子：最近港鐵站 → 隨機另一區。
 * 例如喺旺角附近 →「旺角去觀塘…」
 */
export function buildLocationTripPlaceholder(lat: number, lng: number): string {
  const origin = nearestMtrName(lat, lng);
  const pool = EXAMPLE_DESTINATIONS.filter((d) => !sameArea(origin, d));
  if (!pool.length) return `${origin}去中環…`;
  const dest = pool[Math.floor(Math.random() * pool.length)]!;
  return `${origin}去${dest}…`;
}
