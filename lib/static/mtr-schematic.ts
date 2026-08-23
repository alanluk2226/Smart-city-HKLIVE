import { MTR_LINE_NAMES } from "@/lib/static/mtr-stations";

export const MTR_LINE_COLORS: Record<string, string> = {
  TWL: "#E2231A",
  ISL: "#007DC5",
  KTL: "#00AB4E",
  TKL: "#7D499D",
  TML: "#9A3820",
  TCL: "#F7943E",
  AEL: "#00888A",
  EAL: "#53B7E8",
  SIL: "#B6BD00",
  DRL: "#F173AC",
  HSR: "#A7A9AC",
};

const MTR_LINE_COLOR_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(MTR_LINE_NAMES).map(([code, name]) => [name, MTR_LINE_COLORS[code]]),
);

export function mtrLineColor(codeOrName: string): string | undefined {
  return MTR_LINE_COLORS[codeOrName] ?? MTR_LINE_COLOR_BY_NAME[codeOrName];
}

export function mtrLineInk(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return "#ffffff";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.68 ? "#071018" : "#ffffff";
}

export const SCHEMATIC_SIZE = { w: 2000, h: 1320 } as const;

export type LabelDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type Pt = { x: number; y: number };
export type StationPos = Pt & { label: LabelDir };
export type PathNode = string | Pt;

/** Official-map topology: octolinear, same line geography as the MTR system map. */
export const MTR_SCHEMATIC: Record<string, StationPos> = {
  // Lantau / Airport
  AWE: { x: 48, y: 780, label: "w" },
  AIR: { x: 48, y: 868, label: "w" },
  TUC: { x: 138, y: 968, label: "s" },
  SUN: { x: 252, y: 792, label: "n" },
  DIS: { x: 338, y: 712, label: "n" },
  TSY: { x: 352, y: 632, label: "n" },
  LAK: { x: 428, y: 540, label: "n" },
  NAC: { x: 548, y: 708, label: "w" },
  OLY: { x: 612, y: 792, label: "e" },
  KOW: { x: 652, y: 888, label: "e" },
  HOK: { x: 528, y: 988, label: "w" },

  // Tsuen Wan Line
  TSW: { x: 188, y: 300, label: "n" },
  TWH: { x: 248, y: 360, label: "n" },
  KWH: { x: 308, y: 420, label: "n" },
  KWF: { x: 368, y: 480, label: "n" },
  MEF: { x: 548, y: 540, label: "n" },
  LCK: { x: 628, y: 540, label: "n" },
  CSW: { x: 698, y: 540, label: "n" },
  SSP: { x: 758, y: 540, label: "n" },
  PRE: { x: 780, y: 620, label: "w" },
  MOK: { x: 780, y: 700, label: "w" },
  YMT: { x: 780, y: 780, label: "w" },
  JOR: { x: 780, y: 850, label: "w" },
  TST: { x: 780, y: 920, label: "w" },
  ADM: { x: 780, y: 1044, label: "n" },
  CEN: { x: 620, y: 1044, label: "s" },

  // Island Line
  KET: { x: 168, y: 1044, label: "s" },
  HKU: { x: 268, y: 1044, label: "s" },
  SYP: { x: 368, y: 1044, label: "s" },
  SHW: { x: 468, y: 1044, label: "s" },
  WAC: { x: 900, y: 1044, label: "s" },
  CAB: { x: 1020, y: 1044, label: "s" },
  TIH: { x: 1128, y: 1044, label: "s" },
  FOH: { x: 1230, y: 1044, label: "s" },
  NOP: { x: 1340, y: 1044, label: "n" },
  QUB: { x: 1460, y: 1044, label: "n" },
  TAK: { x: 1575, y: 1044, label: "s" },
  SWH: { x: 1675, y: 1044, label: "s" },
  SKW: { x: 1770, y: 1044, label: "e" },
  HFC: { x: 1860, y: 1128, label: "e" },
  CHW: { x: 1860, y: 1220, label: "e" },

  // Kwun Tong Line
  WHA: { x: 1040, y: 848, label: "e" },
  HOM: { x: 900, y: 820, label: "n" },
  SKM: { x: 880, y: 620, label: "n" },
  KOT: { x: 980, y: 620, label: "e" },
  LOF: { x: 1100, y: 620, label: "n" },
  WTS: { x: 1220, y: 620, label: "n" },
  DIH: { x: 1340, y: 620, label: "n" },
  CHT: { x: 1470, y: 620, label: "n" },
  LAT: { x: 1575, y: 680, label: "e" },
  KOB: { x: 1655, y: 750, label: "e" },
  NTW: { x: 1710, y: 810, label: "e" },
  YAT: { x: 1710, y: 900, label: "w" },
  TIK: { x: 1820, y: 900, label: "n" },

  // Tseung Kwan O
  TKO: { x: 1820, y: 800, label: "e" },
  HAH: { x: 1820, y: 720, label: "e" },
  POA: { x: 1820, y: 640, label: "e" },
  LHP: { x: 1935, y: 980, label: "e" },

  // East Rail
  LOW: { x: 1055, y: 48, label: "e" },
  LMC: { x: 850, y: 72, label: "w" },
  SHS: { x: 980, y: 108, label: "e" },
  FAN: { x: 980, y: 168, label: "e" },
  TWO: { x: 980, y: 228, label: "e" },
  TAP: { x: 980, y: 288, label: "e" },
  UNI: { x: 980, y: 348, label: "e" },
  FOT: { x: 980, y: 408, label: "w" },
  RAC: { x: 1090, y: 408, label: "e" },
  SHT: { x: 980, y: 468, label: "e" },
  TAW: { x: 980, y: 528, label: "w" },
  MKK: { x: 980, y: 700, label: "e" },
  HUH: { x: 980, y: 888, label: "e" },
  EXC: { x: 880, y: 980, label: "e" },

  // Tuen Ma west → east
  TUM: { x: 72, y: 500, label: "w" },
  SIH: { x: 72, y: 380, label: "w" },
  TIS: { x: 165, y: 210, label: "n" },
  LOP: { x: 265, y: 210, label: "n" },
  YUL: { x: 350, y: 250, label: "n" },
  KSR: { x: 430, y: 330, label: "n" },
  TWW: { x: 490, y: 430, label: "w" },
  AUS: { x: 680, y: 888, label: "w" },
  ETS: { x: 720, y: 920, label: "s" },
  TKW: { x: 1080, y: 780, label: "e" },
  SUW: { x: 1200, y: 720, label: "n" },
  KAT: { x: 1280, y: 670, label: "n" },
  HIK: { x: 1160, y: 570, label: "s" },
  CKT: { x: 1100, y: 468, label: "e" },
  STW: { x: 1220, y: 418, label: "n" },
  CIO: { x: 1340, y: 368, label: "n" },
  SHM: { x: 1460, y: 328, label: "n" },
  TSH: { x: 1580, y: 288, label: "n" },
  HEO: { x: 1685, y: 248, label: "n" },
  MOS: { x: 1785, y: 218, label: "n" },
  WKS: { x: 1905, y: 188, label: "n" },

  // South Island
  OCP: { x: 870, y: 1148, label: "e" },
  WCH: { x: 780, y: 1230, label: "w" },
  LET: { x: 650, y: 1270, label: "s" },
  SOH: { x: 520, y: 1270, label: "s" },
};

export const MTR_SCHEMATIC_LINES: Array<{ id: string; path: PathNode[] }> = [
  {
    id: "TWL",
    path: ["TSW", "TWH", "KWH", "KWF", "LAK", "MEF", "LCK", "CSW", "SSP", "PRE", "MOK", "YMT", "JOR", "TST", { x: 780, y: 980 }, "ADM", "CEN"],
  },
  {
    id: "ISL",
    path: ["KET", "HKU", "SYP", "SHW", "CEN", "ADM", "WAC", "CAB", "TIH", "FOH", "NOP", "QUB", "TAK", "SWH", "SKW", "HFC", "CHW"],
  },
  {
    id: "KTL",
    path: ["WHA", "HOM", "YMT", "MOK", "PRE", "SKM", "KOT", "LOF", "WTS", "DIH", "CHT", "LAT", "KOB", "NTW", "YAT", "TIK"],
  },
  {
    id: "TKL",
    path: ["NOP", "QUB", { x: 1460, y: 960 }, { x: 1580, y: 900 }, "YAT", "TIK", "TKO", "HAH", "POA"],
  },
  { id: "TKL2", path: ["TIK", { x: 1935, y: 900 }, "LHP"] },
  {
    id: "TML",
    path: [
      "TUM",
      "SIH",
      { x: 72, y: 210 },
      "TIS",
      "LOP",
      "YUL",
      "KSR",
      "TWW",
      { x: 548, y: 430 },
      "MEF",
      "NAC",
      { x: 548, y: 820 },
      "AUS",
      "ETS",
      { x: 860, y: 920 },
      "HUH",
      "HOM",
      "TKW",
      "SUW",
      "KAT",
      "DIH",
      "HIK",
      "TAW",
      "CKT",
      "STW",
      "CIO",
      "SHM",
      "TSH",
      "HEO",
      "MOS",
      "WKS",
    ],
  },
  {
    id: "TCL",
    path: ["TUC", { x: 138, y: 860 }, "SUN", "TSY", { x: 352, y: 540 }, "LAK", { x: 548, y: 540 }, "NAC", "OLY", "KOW", "HOK"],
  },
  {
    id: "AEL",
    path: ["AWE", "AIR", { x: 48, y: 792 }, { x: 180, y: 792 }, { x: 252, y: 720 }, "TSY", { x: 352, y: 720 }, { x: 500, y: 850 }, "KOW", "HOK"],
  },
  { id: "DRL", path: ["SUN", "DIS"] },
  {
    id: "EAL",
    path: ["LOW", { x: 980, y: 48 }, "SHS", "FAN", "TWO", "TAP", "UNI", "FOT", "SHT", "TAW", "KOT", "MKK", "HUH", { x: 980, y: 960 }, "EXC", "ADM"],
  },
  { id: "EAL2", path: ["SHS", { x: 850, y: 108 }, "LMC"] },
  { id: "EAL3", path: ["UNI", "RAC", "SHT"] },
  {
    id: "SIL",
    path: ["ADM", { x: 780, y: 1100 }, "OCP", "WCH", "LET", "SOH"],
  },
];

export const MTR_WALK_LINKS: Array<[string, string]> = [
  ["HOK", "CEN"],
  ["ETS", "TST"],
  ["AUS", "WEK"],
  ["KOW", "WEK"],
];

export function schematicLineColor(id: string): string {
  if (id.startsWith("TKL")) return MTR_LINE_COLORS.TKL;
  if (id.startsWith("EAL")) return MTR_LINE_COLORS.EAL;
  return MTR_LINE_COLORS[id] ?? "#888";
}

export function resolvePath(path: PathNode[]): string {
  return path
    .map((node) => {
      if (typeof node === "string") {
        const p = MTR_SCHEMATIC[node];
        return p ? `${p.x},${p.y}` : "";
      }
      return `${node.x},${node.y}`;
    })
    .filter(Boolean)
    .join(" ");
}

export const LABEL_OFFSET: Record<LabelDir, { x: number; y: number; anchor: "start" | "middle" | "end" }> = {
  n: { x: 0, y: -20, anchor: "middle" },
  s: { x: 0, y: 22, anchor: "middle" },
  e: { x: 14, y: 3, anchor: "start" },
  w: { x: -14, y: 3, anchor: "end" },
  ne: { x: 12, y: -16, anchor: "start" },
  nw: { x: -12, y: -16, anchor: "end" },
  se: { x: 12, y: 18, anchor: "start" },
  sw: { x: -12, y: 18, anchor: "end" },
};
