export const OFFICIAL_MAP_SIZE = { w: 3100, h: 2200 } as const;

export type LabelDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export type Pt = { x: number; y: number };
export type StationPos = Pt & { label: LabelDir };
export type PathNode = string | Pt;

/** Octolinear schematic coordinates (xpfio/mtr-map official projection + later stations). */
export const MTR_OFFICIAL: Record<string, StationPos> = {
  ADM: { x: 1446.2, y: 1696.7, label: "n" },
  AIR: { x: 385.8, y: 1340.0, label: "w" },
  AUS: { x: 1269.3, y: 1367.0, label: "n" },
  AWE: { x: 471.8, y: 1220.5, label: "w" },
  CAB: { x: 1750.8, y: 1697.5, label: "s" },
  CEN: { x: 1293.3, y: 1690.5, label: "se" },
  CHT: { x: 2337.8, y: 978.5, label: "n" },
  CHW: { x: 2872.5, y: 2070.0, label: "e" },
  CIO: { x: 2130.3, y: 443.0, label: "n" },
  CKT: { x: 2050.8, y: 709.0, label: "e" },
  CSW: { x: 1307.0, y: 978.0, label: "n" },
  DIH: { x: 2209.8, y: 978.5, label: "n" },
  DIS: { x: 742.0, y: 1359.0, label: "e" },
  ETS: { x: 1586.3, y: 1511.5, label: "ne" },
  EXC: { x: 1550.0, y: 1638.0, label: "ne" },
  FAN: { x: 1308.8, y: 445.0, label: "e" },
  FOH: { x: 2055.3, y: 1697.5, label: "s" },
  FOT: { x: 1819.8, y: 593.0, label: "w" },
  HAH: { x: 2869.8, y: 1211.5, label: "e" },
  HEO: { x: 2569.8, y: 443.0, label: "n" },
  HFC: { x: 2872.5, y: 1941.0, label: "e" },
  HIK: { x: 2020.0, y: 880.0, label: "s" },
  HKU: { x: 833.3, y: 1697.0, label: "s" },
  HOK: { x: 1293.3, y: 1644.5, label: "w" },
  HOM: { x: 1875.3, y: 1402.0, label: "n" },
  HUH: { x: 1814.8, y: 1467.0, label: "e" },
  JOR: { x: 1541.0, y: 1367.0, label: "w" },
  KAT: { x: 2210.0, y: 1067.0, label: "n" },
  KET: { x: 678.3, y: 1697.0, label: "s" },
  KOB: { x: 2455.8, y: 1083.5, label: "e" },
  KOT: { x: 1821.3, y: 984.5, label: "e" },
  KOW: { x: 1056.5, y: 1449.5, label: "nw" },
  KSR: { x: 344.0, y: 760.0, label: "e" },
  KWF: { x: 825.8, y: 978.5, label: "n" },
  KWH: { x: 690.8, y: 978.5, label: "n" },
  LAK: { x: 950.0, y: 978.0, label: "n" },
  LAT: { x: 2436.8, y: 998.5, label: "e" },
  LCK: { x: 1190.0, y: 978.0, label: "n" },
  LET: { x: 1126.8, y: 2035.0, label: "s" },
  LHP: { x: 2870.0, y: 1497.0, label: "e" },
  LMC: { x: 931.8, y: 499.0, label: "w" },
  LOF: { x: 1941.3, y: 978.5, label: "n" },
  LOP: { x: 344.0, y: 500.0, label: "e" },
  LOW: { x: 1026.8, y: 445.0, label: "e" },
  MEF: { x: 1075.0, y: 978.0, label: "n" },
  MKK: { x: 1821.3, y: 1167.5, label: "e" },
  MOK: { x: 1553.5, y: 1167.3, label: "w" },
  MOS: { x: 2714.3, y: 443.0, label: "n" },
  NAC: { x: 1075.0, y: 1127.0, label: "nw" },
  NOP: { x: 2207.3, y: 1690.5, label: "n" },
  NTW: { x: 2455.8, y: 1184.5, label: "e" },
  OCP: { x: 1540.8, y: 1857.5, label: "e" },
  OLY: { x: 1063.0, y: 1290.0, label: "e" },
  POA: { x: 2869.8, y: 1082.5, label: "e" },
  PRE: { x: 1553.5, y: 1067.5, label: "w" },
  QUB: { x: 2358.9, y: 1690.8, label: "n" },
  RAC: { x: 1872.8, y: 593.0, label: "e" },
  SHM: { x: 2275.8, y: 443.0, label: "n" },
  SHS: { x: 1168.8, y: 445.0, label: "e" },
  SHT: { x: 1819.8, y: 709.0, label: "e" },
  SHW: { x: 1140.3, y: 1697.0, label: "s" },
  SIH: { x: 234.0, y: 590.0, label: "w" },
  SKM: { x: 1632.0, y: 979.0, label: "n" },
  SKW: { x: 2806.5, y: 1803.0, label: "e" },
  SOH: { x: 924.3, y: 2035.0, label: "s" },
  SSP: { x: 1460.0, y: 978.0, label: "n" },
  STW: { x: 2050.8, y: 593.0, label: "n" },
  SUW: { x: 2098.0, y: 1179.0, label: "n" },
  SUN: { x: 649.3, y: 1249.0, label: "n" },
  SWH: { x: 2664.8, y: 1695.5, label: "s" },
  SYP: { x: 986.3, y: 1697.0, label: "s" },
  TAK: { x: 2511.8, y: 1697.5, label: "s" },
  TAP: { x: 1590.8, y: 445.0, label: "e" },
  TAW: { x: 1827.3, y: 823.0, label: "w" },
  TIH: { x: 1902.8, y: 1697.5, label: "s" },
  TIK: { x: 2664.3, y: 1375.5, label: "n" },
  TIS: { x: 289.0, y: 360.0, label: "n" },
  TKO: { x: 2793.8, y: 1382.5, label: "e" },
  TKW: { x: 1987.0, y: 1290.0, label: "e" },
  TSH: { x: 2422.8, y: 443.0, label: "n" },
  TST: { x: 1541.0, y: 1467.0, label: "nw" },
  TSW: { x: 397.0, y: 978.0, label: "n" },
  TSY: { x: 787.4, y: 1091.5, label: "w" },
  TUC: { x: 449.0, y: 1438.0, label: "s" },
  TUM: { x: 234.0, y: 778.0, label: "w" },
  TWH: { x: 554.0, y: 978.0, label: "n" },
  TWW: { x: 420.0, y: 862.0, label: "n" },
  TWO: { x: 1450.8, y: 445.0, label: "e" },
  UNI: { x: 1753.8, y: 445.0, label: "e" },
  WAC: { x: 1598.3, y: 1697.5, label: "s" },
  WCH: { x: 1358.0, y: 1938.0, label: "ne" },
  WHA: { x: 1937.3, y: 1446.5, label: "e" },
  WKS: { x: 2860.8, y: 443.0, label: "n" },
  WTS: { x: 2073.3, y: 978.5, label: "n" },
  YAT: { x: 2534.3, y: 1375.5, label: "w" },
  YMT: { x: 1553.5, y: 1268.5, label: "w" },
  YUL: { x: 344.0, y: 640.0, label: "e" },
};

export const MTR_OFFICIAL_LINES: Array<{ id: string; path: PathNode[] }> = [
  {
    id: "TWL",
    path: ["TSW", "TWH", "KWH", "KWF", "LAK", "MEF", "LCK", "CSW", "SSP", "PRE", "MOK", "YMT", "JOR", "TST", { x: 1541, y: 1690 }, "ADM", "CEN"],
  },
  {
    id: "ISL",
    path: ["KET", "HKU", "SYP", "SHW", "CEN", "ADM", "WAC", "CAB", "TIH", "FOH", "NOP", "QUB", "TAK", "SWH", "SKW", "HFC", "CHW"],
  },
  {
    id: "KTL",
    path: ["WHA", "HOM", "YMT", "MOK", "PRE", "SKM", "KOT", "LOF", "WTS", "DIH", "CHT", "LAT", "KOB", "NTW", { x: 2456, y: 1376 }, "YAT", "TIK"],
  },
  {
    id: "TKL",
    path: ["NOP", "QUB", { x: 2360, y: 1376 }, "YAT", "TIK", "TKO", "HAH", "POA"],
  },
  { id: "TKL2", path: ["TIK", { x: 2870, y: 1376 }, "LHP"] },
  {
    id: "TML",
    path: [
      "TUM", "SIH", { x: 234, y: 360 }, "TIS", "LOP", "YUL", "KSR", "TWW",
      "MEF", "NAC", "AUS", "ETS", "HUH", "HOM", "TKW",
      "SUW", "KAT", "DIH", "HIK", "TAW", "CKT", "STW", "CIO", "SHM", "TSH",
      "HEO", "MOS", "WKS",
    ],
  },
  {
    id: "TCL",
    path: ["TUC", "SUN", "TSY", "LAK", "NAC", "OLY", "KOW", "HOK"],
  },
  {
    id: "AEL",
    path: ["AWE", "AIR", { x: 480, y: 1340 }, { x: 650, y: 1250 }, "TSY", { x: 950, y: 1127 }, { x: 1056, y: 1449 }, "KOW", "HOK"],
  },
  { id: "DRL", path: ["SUN", "DIS"] },
  {
    id: "EAL",
    path: ["LOW", { x: 1169, y: 445 }, "SHS", "FAN", "TWO", "TAP", "UNI", { x: 1820, y: 445 }, "FOT", "SHT", "TAW", "KOT", "MKK", "HUH", "EXC", "ADM"],
  },
  { id: "EAL2", path: ["SHS", { x: 932, y: 445 }, "LMC"] },
  { id: "EAL3", path: ["FOT", "RAC"] },
  { id: "SIL", path: ["ADM", "OCP", "WCH", "LET", "SOH"] },
];

export const MTR_WALK_LINKS: Array<[string, string]> = [
  ["HOK", "CEN"],
  ["ETS", "TST"],
];

/** Straight octolinear traces (H/V/45°) with parallel offsets so colours do not stack. */
export const MTR_TRACES: Array<{ id: string; d: string }> = [
  {
    id: "TML",
    d: "M234 778 V360 H344 V862 H1075 V1127 L1269 1367 L1586 1512 L1810 1467 L1875 1402 L2210 1067 V1002 H2020 V823 H1827 H2051 V593 H2130 V443 H2861",
  },
  {
    id: "EAL",
    d: "M1027 445 H1820 V1638 H1550 L1446 1697",
  },
  { id: "EAL2", d: "M1169 445 H932 V499" },
  { id: "EAL3", d: "M1820 593 H1873" },
  {
    id: "TCL",
    d: "M449 1438 L644 1243 L782 1087 L950 978 V1127 H1063 V1449 H1293 V1637",
  },
  {
    id: "AEL",
    d: "M472 1221 L386 1340 L650 1265 L796 1101 L964 1005 V1141 H1077 V1463 H1307 V1652",
  },
  { id: "DRL", d: "M644 1243 L742 1341" },
  {
    id: "KTL",
    d: "M1937 1447 L1875 1384 H1566 V978 H2437 L2456 997 V1369 H2664",
  },
  {
    id: "TWL",
    d: "M397 978 H1541 V1684 H1293",
  },
  {
    id: "TKL",
    d: "M2207 1684 H2359 V1383 H2794 V1212 H2870 V1083",
  },
  { id: "TKL2", d: "M2664 1369 H2870 V1497" },
  {
    id: "ISL",
    d: "M678 1697 H2665 L2807 1803 H2873 V2070",
  },
  {
    id: "SIL",
    d: "M1446 1697 V1858 H1541 L1358 1938 L1127 2035 H924",
  },
];

export const MTR_LRT_ZONE = { x: 188, y: 328, w: 196, h: 500 };
export const LAND_SCALE = 2;

export const MTR_LAND: Array<{ id: string; d: string }> = [
  { id: "shenzhen", d: "M65.5 -300.125L198 160.625L283.5 397.125L897.5 398.625L872.5 181.625L1023.5 -300.125Z" },
  {
    id: "nt-kowloon",
    d: "M201.5 161.5L50 162L52.5 457L173 458.5L172.5 509L503 512L505 672L467.5 703L467 738.5L498.5 768.5L957.5 766.5L1108.5 618L1144.5 652L1171 627L1136.5 590.5L1156 573.5L1195.5 573L1198 678.5L1288.5 768.5L1451 761.5L1452.5 495L1372 487L1369.5 363.5L1486.5 357L1485.5 157L1001.5 163.5L1004.5 356.5L944 356L944 253L867.5 179.5L530 184.5L490.5 228.5L466.5 232.5L445.5 258.5L297.5 262.5Z",
  },
  { id: "tsingyi", d: "M376 532L376 568L410 568L410 530Z" },
  { id: "hk-island", d: "M300 836L322 816L1356 814L1456 916L1454 1096L702 1090L610 984L304 980Z" },
  { id: "ap-lei-chau", d: "M440 1085L440 1000L598 1003L682 1083Z" },
  {
    id: "lantau",
    d: "M341 566.625L355 566.625L401.5 611.625L406 619.625L407.5 666.625L406.5 719.125L388 740.625L364 741.125L338 741.125L328 749.625L263 815.625L210.5 867.125L191.5 875.625L25.5 874.625L25.5 724.125L179 724.125L190 718.625Z",
  },
  { id: "airport", d: "M150 634L150 698L184 700L286 588L192 594Z" },
];

export function officialLineColor(id: string, colors: Record<string, string>): string {
  if (id.startsWith("TKL")) return colors.TKL;
  if (id.startsWith("EAL")) return colors.EAL;
  return colors[id] ?? "#888";
}

export function resolveOfficialPath(path: PathNode[]): string {
  return path
    .map((node) => {
      if (typeof node === "string") {
        const p = MTR_OFFICIAL[node];
        return p ? `${p.x},${p.y}` : "";
      }
      return `${node.x},${node.y}`;
    })
    .filter(Boolean)
    .join(" ");
}

export const LABEL_OFFSET: Record<LabelDir, { x: number; y: number; enY: number; anchor: "start" | "middle" | "end" }> = {
  n: { x: 0, y: -58, enY: -40, anchor: "middle" },
  s: { x: 0, y: 36, enY: 54, anchor: "middle" },
  e: { x: 36, y: 0, enY: 18, anchor: "start" },
  w: { x: -36, y: 0, enY: 18, anchor: "end" },
  ne: { x: 40, y: -52, enY: -34, anchor: "start" },
  nw: { x: -40, y: -52, enY: -34, anchor: "end" },
  se: { x: 40, y: 32, enY: 50, anchor: "start" },
  sw: { x: -40, y: 32, enY: 50, anchor: "end" },
};
