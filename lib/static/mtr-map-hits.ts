/** Click targets on `public/mtr-system-map.svg` (viewBox matches the file). */
export const MTR_MAP_SIZE = { w: 4110.24, h: 2769.45 } as const;

/** Station-dot centres parsed from the SVG (not percent-scaled from another map). */
export const MTR_MAP_HITS: Record<string, { x: number; y: number }> = {
  // East Rail (north → south)
  LMC: { x: 1319.0, y: 586.5 },
  LOW: { x: 1619.1, y: 542.8 },
  SHS: { x: 1439.7, y: 518.7 },
  FAN: { x: 1798.6, y: 518.7 },
  TWO: { x: 1978.0, y: 518.7 },
  TAP: { x: 2157.5, y: 518.7 },
  UNI: { x: 2364.3, y: 518.7 },
  RAC: { x: 2515.4, y: 707.9 },
  FOT: { x: 2449.5, y: 707.9 },
  SHT: { x: 2449.5, y: 853.7 },
  TAW: { x: 2457.6, y: 998.5 },
  KOT: { x: 2449.5, y: 1221.3 },
  MKK: { x: 2449.5, y: 1437.2 },
  HUH: { x: 2356.0, y: 1793.3 },
  EXC: { x: 2162.6, y: 2028.4 },

  // Tuen Ma west (Tuen Mun U → Tsuen Wan West)
  TIS: { x: 505.8, y: 502.3 },
  LOP: { x: 572.7, y: 625.5 },
  SIH: { x: 430.7, y: 749.0 },
  YUL: { x: 564.6, y: 748.9 },
  TUM: { x: 430.7, y: 944.0 },
  KSR: { x: 572.7, y: 889.4 },
  TWW: { x: 640.5, y: 1048.8 },
  MEF: { x: 1501.1, y: 1221.3 },
  NAC: { x: 1493.2, y: 1363.0 },
  AUS: { x: 1870.2, y: 1774.9 },
  ETS: { x: 2162.6, y: 1874.3 },
  HOM: { x: 2539.8, y: 1670.7 },
  TKW: { x: 2798.2, y: 1587.9 },
  SUW: { x: 2903.1, y: 1483.0 },
  KAT: { x: 2977.5, y: 1332.9 },
  DIH: { x: 2977.5, y: 1221.3 },
  HIK: { x: 2681.1, y: 1065.0 },
  CKT: { x: 2742.4, y: 853.7 },
  STW: { x: 2742.4, y: 707.9 },

  // Tuen Ma / MOS (east)
  CIO: { x: 2843.3, y: 518.8 },
  SHM: { x: 3028.9, y: 518.8 },
  TSH: { x: 3214.6, y: 518.8 },
  HEO: { x: 3400.3, y: 518.8 },
  MOS: { x: 3586.0, y: 518.8 },
  WKS: { x: 3771.7, y: 518.8 },

  // Tsuen Wan Line
  TSW: { x: 640.5, y: 1197.3 },
  TWH: { x: 840.3, y: 1197.3 },
  KWH: { x: 1012.2, y: 1197.3 },
  KWF: { x: 1184.0, y: 1197.3 },
  LAK: { x: 1342.4, y: 1221.3 },
  LCK: { x: 1656.8, y: 1197.3 },
  CSW: { x: 1824.3, y: 1197.3 },
  SSP: { x: 1991.8, y: 1197.3 },
  PRE: { x: 2101.7, y: 1310.3 },
  MOK: { x: 2101.7, y: 1427.4 },
  YMT: { x: 2101.7, y: 1544.4 },
  JOR: { x: 2093.5, y: 1661.4 },
  TST: { x: 2093.5, y: 1801.9 },
  ADM: { x: 1973.1, y: 2110.2 },
  CEN: { x: 1779.7, y: 2118.1 },

  // Kwun Tong Line
  WHA: { x: 2700.1, y: 1717.4 },
  SKM: { x: 2211.1, y: 1197.2 },
  LOF: { x: 2572.6, y: 1197.2 },
  WTS: { x: 2707.1, y: 1197.2 },
  CHT: { x: 3111.1, y: 1197.3 },
  LAT: { x: 3230.7, y: 1222.8 },
  KOB: { x: 3256.5, y: 1330.1 },
  NTW: { x: 3256.5, y: 1459.0 },
  YAT: { x: 3354.2, y: 1718.7 },
  TIK: { x: 3519.8, y: 1718.7 },

  // Tseung Kwan O Line
  NOP: { x: 2939.7, y: 2102.0 },
  QUB: { x: 3133.0, y: 2102.0 },
  TKO: { x: 3685.5, y: 1734.8 },
  HAH: { x: 3782.9, y: 1492.1 },
  POA: { x: 3782.9, y: 1330.1 },
  LHP: { x: 3782.9, y: 1853.8 },

  // Island Line
  KET: { x: 998.4, y: 2110.2 },
  HKU: { x: 1193.7, y: 2110.2 },
  SYP: { x: 1389.0, y: 2110.2 },
  SHW: { x: 1584.4, y: 2110.2 },
  WAC: { x: 2162.6, y: 2110.2 },
  CAB: { x: 2359.7, y: 2110.2 },
  TIH: { x: 2553.0, y: 2110.2 },
  FOH: { x: 2746.3, y: 2110.2 },
  TAK: { x: 3326.3, y: 2110.2 },
  SWH: { x: 3519.7, y: 2110.2 },
  SKW: { x: 3700.6, y: 2246.2 },
  HFC: { x: 3782.4, y: 2421.3 },
  CHW: { x: 3782.4, y: 2586.3 },

  // South Island Line
  OCP: { x: 2093.5, y: 2313.5 },
  WCH: { x: 1860.3, y: 2417.7 },
  LET: { x: 1565.9, y: 2538.5 },
  SOH: { x: 1309.6, y: 2538.5 },

  // Tung Chung / Airport / Disney
  HOK: { x: 1779.7, y: 2059.2 },
  KOW: { x: 1476.9, y: 1774.9 },
  WEK: { x: 1692.4, y: 1774.9 },
  OLY: { x: 1485.0, y: 1589.8 },
  TSY: { x: 1135.9, y: 1339.9 },
  SUN: { x: 959.5, y: 1539.3 },
  TUC: { x: 706.5, y: 1780.7 },
  AIR: { x: 625.7, y: 1657.0 },
  AWE: { x: 733.9, y: 1504.4 },
  DIS: { x: 1078.3, y: 1680.0 },
};

/** Extra tap points that share a station code (none currently). */
export const MTR_MAP_EXTRA_HITS: { code: string; x: number; y: number }[] = [];
