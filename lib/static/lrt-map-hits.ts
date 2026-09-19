/** Click targets on `public/lrt-system-map.svg` (viewBox 1200 × 561). */
export const LRT_MAP_SIZE = { w: 1200, h: 561 } as const;

/**
 * Station hit on the schematic.
 * `rx`/`ry` (optional) match white capsule markers that span parallel tracks;
 * omit them for ordinary round station dots (feedback stays circular).
 */
export type LrtMapHit = { x: number; y: number; rx?: number; ry?: number; ghost?: boolean };

/**
 * Station-dot centres from SVG white capsules / circles, keyed by station id.
 * Capsule orientation: tall (rx < ry) spans E–W tracks; wide (rx > ry) spans N–S tracks.
 */
export const LRT_MAP_HITS: Record<string, LrtMapHit> = {
  "1": { x: 90.7, y: 250.2 }, // FEP 屯門碼頭 — hub
  "10": { x: 88.9, y: 179.6, rx: 14, ry: 9 }, // MEG 美樂
  "15": { x: 115.7, y: 138.7, rx: 9, ry: 14 }, // BUT 蝴蝶
  "20": { x: 164.8, y: 138.7, rx: 9, ry: 14 }, // LRD 輕鐵車廠
  "30": { x: 214.1, y: 138.7, rx: 9, ry: 14 }, // LUM 龍門
  "40": { x: 267.8, y: 138.7, rx: 9, ry: 14 }, // TSS 青山村
  "50": { x: 319.8, y: 138.7, rx: 9, ry: 14 }, // TWN 青雲
  "60": { x: 355.3, y: 221.3 }, // KIO 建安 — round
  // 屯門以東水平路軌（白直膠囊中心；transform 原點在膠囊左下，要偏 +rx/−ry）
  "70": { x: 372.4, y: 282.7, rx: 9, ry: 14 }, // HOT 河田
  "75": { x: 425.2, y: 282.7, rx: 9, ry: 14 }, // CYB 蔡意橋
  "80": { x: 499.2, y: 282.7, rx: 9, ry: 14 }, // AFF 澤豐
  "90": { x: 552.8, y: 282.7, rx: 9, ry: 14 }, // TMH 屯門醫院
  "100": { x: 628.0, y: 300.0 }, // SHL 兆康 — hub
  "110": { x: 629.3, y: 231.9, rx: 14, ry: 9 }, // KEL 麒麟
  "120": { x: 607.4, y: 182.0, rx: 14, ry: 9 }, // CHC 青松
  "130": { x: 607.4, y: 142.5, rx: 14, ry: 9 }, // KIS 建生
  "140": { x: 607.4, y: 103.0, rx: 14, ry: 9 }, // TNK 田景
  "150": { x: 573.2, y: 62.9, rx: 9, ry: 14 }, // LEK 良景
  "160": { x: 534.4, y: 62.9, rx: 9, ry: 14 }, // SAW 新圍
  "170": { x: 427.6, y: 135.6, rx: 9, ry: 14 }, // SHP 石排
  "180": { x: 396.2, y: 101.2 }, // SKN 山景(北) — round
  "190": { x: 364.8, y: 101.2 }, // SKS 山景(南) — round
  "200": { x: 372.4, y: 135.6, rx: 9, ry: 14 }, // MIK 鳴琴
  "212": { x: 467.8, y: 192.3, rx: 14, ry: 9 }, // THN 大興(北)
  "220": { x: 467.8, y: 225.5, rx: 14, ry: 9 }, // THS 大興(南)
  "230": { x: 467.8, y: 256.6, rx: 14, ry: 9 }, // NGW 銀圍
  "240": { x: 88.9, y: 304.1, rx: 14, ry: 9 }, // SHE 兆禧
  "250": { x: 118.4, y: 341.3, rx: 9, ry: 14 }, // TSP 海皇路
  "260": { x: 160.6, y: 341.3, rx: 9, ry: 14 }, // GOG 豐景園
  "265": { x: 216.8, y: 338.4, rx: 9, ry: 14 }, // SIL 兆麟
  "270": { x: 264.3, y: 335.7, rx: 9, ry: 16 }, // ONT 安定
  "275": { x: 264.3, y: 291.3, rx: 9, ry: 10 }, // YAO 友愛
  "280": { x: 310.9, y: 335.7, rx: 9, ry: 16 }, // TOC 市中心
  // 屯門：橫向白膠囊中心（transform 在右側，中心約 −rx）
  "295": { x: 347.3, y: 309.7, rx: 14, ry: 9 }, // TML 屯門
  "300": { x: 352.8, y: 389.0, rx: 14, ry: 9 }, // PUT 杯渡
  "310": { x: 397.7, y: 404.7, rx: 9, ry: 14 }, // HFT 何福堂
  "320": { x: 445.6, y: 404.7, rx: 9, ry: 14 }, // SAH 新墟
  "330": { x: 493.8, y: 404.7, rx: 9, ry: 14 }, // PRV 景峰
  "340": { x: 558.3, y: 404.7, rx: 9, ry: 14 }, // FUT 鳳地
  "350": { x: 660.9, y: 291.3, rx: 9, ry: 14 }, // LTE 藍地
  "360": { x: 689.9, y: 291.3, rx: 9, ry: 14 }, // NAW 泥圍
  "370": { x: 728.0, y: 291.3, rx: 9, ry: 14 }, // CUT 鍾屋村
  "380": { x: 790.9, y: 290.8, rx: 9, ry: 14 }, // HSK 洪水橋
  // 上方水平路軌東段（與下方豐年路／水邊圍同 x）
  "390": { x: 1059.1, y: 291.0, rx: 9, ry: 14 }, // TOF 塘坊村
  "400": { x: 1117.0, y: 291.0, rx: 9, ry: 14 }, // PIS 屏山
  // 天水圍：示意 x 與經度同向（西小東大）；以下曾左右／南北對調過
  "425": { x: 929.4, y: 247.5, rx: 14, ry: 9 }, // HMT 坑尾村（原誤種在樂湖）
  "430": { x: 982.0, y: 214.0 }, // TSL 天水圍 — hub
  "435": { x: 1027.9, y: 201.0, rx: 9, ry: 14 }, // TIT 天慈（原誤種在頌富）
  "445": { x: 896.9, y: 206.8, rx: 9, ry: 14 }, // TIY 天耀
  "448": { x: 856.8, y: 206.8, rx: 9, ry: 14 }, // LOC 樂湖（原誤種在坑尾村）
  "450": { x: 1059.2, y: 201.0, rx: 9, ry: 14 }, // TWU 天湖（原誤種在翠湖）
  "455": { x: 1090.5, y: 201.0, rx: 9, ry: 14 }, // GIN 銀座
  "460": { x: 819.7, y: 172.4, rx: 14, ry: 9 }, // TSU 天瑞
  "468": { x: 822.7, y: 96.1, rx: 14, ry: 9 }, // CHF 頌富（原誤種在天慈）
  "480": { x: 853.7, y: 55.4, rx: 9, ry: 14 }, // TFU 天富
  "490": { x: 928.5, y: 140.1 }, // CHE 翠湖（原誤種在天湖）
  "500": { x: 1115.8, y: 161.6, rx: 14, ry: 9 }, // TWI 天榮
  "510": { x: 1118.8, y: 96.0, rx: 14, ry: 9 }, // TYU 天悅
  "520": { x: 1091.2, y: 55.4, rx: 9, ry: 14 }, // TSA 天秀
  "530": { x: 1035.7, y: 55.4, rx: 9, ry: 14 }, // WEP 濕地公園
  "540": { x: 985.9, y: 55.4, rx: 9, ry: 14 }, // THE 天恒
  "550": { x: 914.0, y: 56.0 }, // TYA 天逸 — hub
  // 元朗列：示意上元朗在左、水邊圍在右（與經度相反）
  "560": { x: 1117.0, y: 382.3, rx: 9, ry: 14 }, // SPW 水邊圍
  "570": { x: 1059.1, y: 382.3, rx: 9, ry: 14 }, // FNR 豐年路（原誤種在大棠路）
  "580": { x: 1001.3, y: 382.3, rx: 9, ry: 14 }, // HLR 康樂路
  "590": { x: 943.1, y: 382.3, rx: 9, ry: 14 }, // TTR 大棠路（原誤種在豐年路）
  "600": { x: 880.0, y: 382.0 }, // YLL 元朗 — hub
  "920": { x: 195.7, y: 395.9, rx: 9, ry: 10 }, // SAS 三聖
};

/** Extra tap targets for the same station (unused; keep empty). */
export const LRT_MAP_EXTRA_HITS: { code: string; x: number; y: number }[] = [];

/**
 * One large tap/hover circle covering a cluster of route-number capsules.
 * Clicking the hub selects that station and shows every route together.
 */
export const LRT_MAP_HUBS: Record<string, { x: number; y: number; r: number }> = {
  "1": { x: 90.7, y: 250.2, r: 32 },
  "550": { x: 914.0, y: 56.0, r: 32 },
  "430": { x: 982.0, y: 214.0, r: 26 },
  "100": { x: 628.0, y: 300.0, r: 27 },
  "600": { x: 880.0, y: 382.0, r: 26 },
};
