import type { MtrStation } from "@/lib/types";

export const MTR_LINE_NAMES: Record<string, string> = {
  TWL: "荃灣線",
  ISL: "港島線",
  KTL: "觀塘線",
  TKL: "將軍澳線",
  EAL: "東鐵線",
  TML: "屯馬線",
  TCL: "東涌線",
  AEL: "機場快線",
  SIL: "南港島線",
  DRL: "迪士尼線",
  HSR: "高速鐵路",
};

const RAW_STATIONS: Omit<MtrStation, "nameEn">[] = [
  { code: "HOK", name: "香港", lines: ["AEL", "TCL"], lat: 22.2847, lng: 114.1582 },
  { code: "KOW", name: "九龍", lines: ["AEL", "TCL"], lat: 22.3044, lng: 114.1612 },
  { code: "WEK", name: "香港西九龍", lines: ["HSR"], lat: 22.3039, lng: 114.1652 },
  { code: "OLY", name: "奧運", lines: ["TCL"], lat: 22.3178, lng: 114.1602 },
  { code: "NAC", name: "南昌", lines: ["TCL", "TML"], lat: 22.3268, lng: 114.1536 },
  { code: "LAK", name: "荔景", lines: ["TCL", "TWL"], lat: 22.3483, lng: 114.1262 },
  { code: "TSY", name: "青衣", lines: ["AEL", "TCL"], lat: 22.3584, lng: 114.1077 },
  { code: "SUN", name: "欣澳", lines: ["TCL", "DRL"], lat: 22.3318, lng: 114.029 },
  { code: "TUC", name: "東涌", lines: ["TCL"], lat: 22.2893, lng: 113.9414 },
  { code: "AIR", name: "機場", lines: ["AEL"], lat: 22.3159, lng: 113.9366 },
  { code: "AWE", name: "博覽館", lines: ["AEL"], lat: 22.3215, lng: 113.9436 },
  { code: "DIS", name: "迪士尼", lines: ["DRL"], lat: 22.3152, lng: 114.0453 },
  { code: "CEN", name: "中環", lines: ["TWL", "ISL"], lat: 22.2819, lng: 114.1582 },
  { code: "ADM", name: "金鐘", lines: ["TWL", "ISL", "EAL", "SIL"], lat: 22.2789, lng: 114.1646 },
  { code: "TST", name: "尖沙咀", lines: ["TWL"], lat: 22.2976, lng: 114.1722 },
  { code: "JOR", name: "佐敦", lines: ["TWL"], lat: 22.3049, lng: 114.1717 },
  { code: "YMT", name: "油麻地", lines: ["TWL", "KTL"], lat: 22.3129, lng: 114.1706 },
  { code: "MOK", name: "旺角", lines: ["TWL", "KTL"], lat: 22.3193, lng: 114.1694 },
  { code: "PRE", name: "太子", lines: ["TWL", "KTL"], lat: 22.3246, lng: 114.1683 },
  { code: "SSP", name: "深水埗", lines: ["TWL"], lat: 22.3307, lng: 114.1628 },
  { code: "CSW", name: "長沙灣", lines: ["TWL"], lat: 22.3361, lng: 114.1566 },
  { code: "LCK", name: "荔枝角", lines: ["TWL"], lat: 22.3376, lng: 114.1461 },
  { code: "MEF", name: "美孚", lines: ["TWL", "TML"], lat: 22.3376, lng: 114.1366 },
  { code: "KWF", name: "葵芳", lines: ["TWL"], lat: 22.3568, lng: 114.1278 },
  { code: "KWH", name: "葵興", lines: ["TWL"], lat: 22.3632, lng: 114.1311 },
  { code: "TWH", name: "大窩口", lines: ["TWL"], lat: 22.3708, lng: 114.1251 },
  { code: "TSW", name: "荃灣", lines: ["TWL"], lat: 22.3736, lng: 114.1178 },
  { code: "KET", name: "堅尼地城", lines: ["ISL"], lat: 22.2813, lng: 114.1288 },
  { code: "HKU", name: "香港大學", lines: ["ISL"], lat: 22.2841, lng: 114.1355 },
  { code: "SYP", name: "西營盤", lines: ["ISL"], lat: 22.2853, lng: 114.1426 },
  { code: "SHW", name: "上環", lines: ["ISL"], lat: 22.2868, lng: 114.1517 },
  { code: "WAC", name: "灣仔", lines: ["ISL"], lat: 22.2776, lng: 114.1731 },
  { code: "CAB", name: "銅鑼灣", lines: ["ISL"], lat: 22.2804, lng: 114.185 },
  { code: "TIH", name: "天后", lines: ["ISL"], lat: 22.2828, lng: 114.1919 },
  { code: "FOH", name: "炮台山", lines: ["ISL"], lat: 22.2878, lng: 114.1937 },
  { code: "NOP", name: "北角", lines: ["ISL", "TKL"], lat: 22.2912, lng: 114.2006 },
  { code: "QUB", name: "鰂魚涌", lines: ["ISL", "TKL"], lat: 22.2875, lng: 114.2098 },
  { code: "TAK", name: "太古", lines: ["ISL"], lat: 22.2846, lng: 114.2165 },
  { code: "SWH", name: "西灣河", lines: ["ISL"], lat: 22.2818, lng: 114.2228 },
  { code: "SKW", name: "筲箕灣", lines: ["ISL"], lat: 22.2792, lng: 114.2289 },
  { code: "HFC", name: "杏花邨", lines: ["ISL"], lat: 22.2772, lng: 114.2406 },
  { code: "CHW", name: "柴灣", lines: ["ISL"], lat: 22.2647, lng: 114.2372 },
  { code: "WHA", name: "黃埔", lines: ["KTL"], lat: 22.3053, lng: 114.1895 },
  { code: "HOM", name: "何文田", lines: ["KTL", "TML"], lat: 22.3101, lng: 114.1828 },
  { code: "SKM", name: "石硤尾", lines: ["KTL"], lat: 22.333, lng: 114.1688 },
  { code: "KOT", name: "九龍塘", lines: ["KTL", "EAL"], lat: 22.337, lng: 114.176 },
  { code: "LOF", name: "樂富", lines: ["KTL"], lat: 22.3383, lng: 114.1872 },
  { code: "WTS", name: "黃大仙", lines: ["KTL"], lat: 22.3416, lng: 114.194 },
  { code: "DIH", name: "鑽石山", lines: ["KTL", "TML"], lat: 22.3401, lng: 114.2017 },
  { code: "CHT", name: "彩虹", lines: ["KTL"], lat: 22.3351, lng: 114.209 },
  { code: "LAT", name: "九龍灣", lines: ["KTL"], lat: 22.3238, lng: 114.2138 },
  { code: "KOB", name: "牛頭角", lines: ["KTL"], lat: 22.3156, lng: 114.219 },
  { code: "NTW", name: "觀塘", lines: ["KTL"], lat: 22.3124, lng: 114.2264 },
  { code: "TIK", name: "調景嶺", lines: ["KTL", "TKL"], lat: 22.303, lng: 114.2526 },
  { code: "YAT", name: "油塘", lines: ["KTL", "TKL"], lat: 22.2978, lng: 114.239 },
  { code: "TKO", name: "將軍澳", lines: ["TKL"], lat: 22.3075, lng: 114.2601 },
  { code: "HAH", name: "坑口", lines: ["TKL"], lat: 22.3156, lng: 114.2646 },
  { code: "POA", name: "寶琳", lines: ["TKL"], lat: 22.3226, lng: 114.2579 },
  { code: "LHP", name: "康城", lines: ["TKL"], lat: 22.2947, lng: 114.2686 },
  { code: "EXC", name: "會展", lines: ["EAL"], lat: 22.282, lng: 114.1755 },
  { code: "HUH", name: "紅磡", lines: ["EAL", "TML"], lat: 22.303, lng: 114.1816 },
  { code: "MKK", name: "旺角東", lines: ["EAL"], lat: 22.3221, lng: 114.1725 },
  { code: "TAW", name: "大圍", lines: ["EAL", "TML"], lat: 22.373, lng: 114.1785 },
  { code: "SHT", name: "沙田", lines: ["EAL"], lat: 22.3828, lng: 114.1877 },
  { code: "FOT", name: "火炭", lines: ["EAL"], lat: 22.3952, lng: 114.1982 },
  { code: "RAC", name: "馬場", lines: ["EAL"], lat: 22.4006, lng: 114.203 },
  { code: "UNI", name: "大學", lines: ["EAL"], lat: 22.413, lng: 114.2103 },
  { code: "TAP", name: "大埔墟", lines: ["EAL"], lat: 22.4446, lng: 114.1706 },
  { code: "TWO", name: "太和", lines: ["EAL"], lat: 22.4508, lng: 114.1644 },
  { code: "FAN", name: "粉嶺", lines: ["EAL"], lat: 22.492, lng: 114.1386 },
  { code: "SHS", name: "上水", lines: ["EAL"], lat: 22.5012, lng: 114.1282 },
  { code: "LOW", name: "羅湖", lines: ["EAL"], lat: 22.5282, lng: 114.1133 },
  { code: "LMC", name: "落馬洲", lines: ["EAL"], lat: 22.5148, lng: 114.0658 },
  { code: "OCP", name: "海洋公園", lines: ["SIL"], lat: 22.2486, lng: 114.1744 },
  { code: "WCH", name: "黃竹坑", lines: ["SIL"], lat: 22.248, lng: 114.1678 },
  { code: "LET", name: "利東", lines: ["SIL"], lat: 22.2421, lng: 114.156 },
  { code: "SOH", name: "海怡半島", lines: ["SIL"], lat: 22.2428, lng: 114.1489 },
  { code: "TUM", name: "屯門", lines: ["TML"], lat: 22.3948, lng: 113.9731 },
  { code: "SIH", name: "兆康", lines: ["TML"], lat: 22.4113, lng: 113.9788 },
  { code: "TIS", name: "天水圍", lines: ["TML"], lat: 22.4481, lng: 114.0048 },
  { code: "LOP", name: "朗屏", lines: ["TML"], lat: 22.4476, lng: 114.0255 },
  { code: "YUL", name: "元朗", lines: ["TML"], lat: 22.446, lng: 114.0353 },
  { code: "KSR", name: "錦上路", lines: ["TML"], lat: 22.4345, lng: 114.0636 },
  { code: "TWW", name: "荃灣西", lines: ["TML"], lat: 22.3686, lng: 114.1078 },
  { code: "AUS", name: "柯士甸", lines: ["TML"], lat: 22.3043, lng: 114.1664 },
  { code: "ETS", name: "尖東", lines: ["TML"], lat: 22.2951, lng: 114.1748 },
  { code: "TKW", name: "土瓜灣", lines: ["TML"], lat: 22.3172, lng: 114.1876 },
  { code: "SUW", name: "宋皇臺", lines: ["TML"], lat: 22.3236, lng: 114.1915 },
  { code: "KAT", name: "啟德", lines: ["TML"], lat: 22.3306, lng: 114.1996 },
  { code: "HIK", name: "顯徑", lines: ["TML"], lat: 22.365, lng: 114.1738 },
  { code: "CKT", name: "車公廟", lines: ["TML"], lat: 22.3746, lng: 114.1864 },
  { code: "STW", name: "沙田圍", lines: ["TML"], lat: 22.3795, lng: 114.195 },
  { code: "CIO", name: "第一城", lines: ["TML"], lat: 22.3828, lng: 114.2037 },
  { code: "SHM", name: "石門", lines: ["TML"], lat: 22.388, lng: 114.2085 },
  { code: "TSH", name: "大水坑", lines: ["TML"], lat: 22.4068, lng: 114.2228 },
  { code: "HEO", name: "恆安", lines: ["TML"], lat: 22.4175, lng: 114.226 },
  { code: "MOS", name: "馬鞍山", lines: ["TML"], lat: 22.4249, lng: 114.2316 },
  { code: "WKS", name: "烏溪沙", lines: ["TML"], lat: 22.4292, lng: 114.2438 },
];

export const MTR_STATION_EN: Record<string, string> = {
  HOK: "Hong Kong",
  KOW: "Kowloon",
  WEK: "Hong Kong West Kowloon",
  OLY: "Olympic",
  NAC: "Nam Cheong",
  LAK: "Lai King",
  TSY: "Tsing Yi",
  SUN: "Sunny Bay",
  TUC: "Tung Chung",
  AIR: "Airport",
  AWE: "AsiaWorld-Expo",
  DIS: "Disneyland Resort",
  CEN: "Central",
  ADM: "Admiralty",
  TST: "Tsim Sha Tsui",
  JOR: "Jordan",
  YMT: "Yau Ma Tei",
  MOK: "Mong Kok",
  PRE: "Prince Edward",
  SSP: "Sham Shui Po",
  CSW: "Cheung Sha Wan",
  LCK: "Lai Chi Kok",
  MEF: "Mei Foo",
  KWF: "Kwai Fong",
  KWH: "Kwai Hing",
  TWH: "Tai Wo Hau",
  TSW: "Tsuen Wan",
  KET: "Kennedy Town",
  HKU: "HKU",
  SYP: "Sai Ying Pun",
  SHW: "Sheung Wan",
  WAC: "Wan Chai",
  CAB: "Causeway Bay",
  TIH: "Tin Hau",
  FOH: "Fortress Hill",
  NOP: "North Point",
  QUB: "Quarry Bay",
  TAK: "Tai Koo",
  SWH: "Sai Wan Ho",
  SKW: "Shau Kei Wan",
  HFC: "Heng Fa Chuen",
  CHW: "Chai Wan",
  WHA: "Whampoa",
  HOM: "Ho Man Tin",
  SKM: "Shek Kip Mei",
  KOT: "Kowloon Tong",
  LOF: "Lok Fu",
  WTS: "Wong Tai Sin",
  DIH: "Diamond Hill",
  CHT: "Choi Hung",
  LAT: "Kowloon Bay",
  KOB: "Ngau Tau Kok",
  NTW: "Kwun Tong",
  TIK: "Tiu Keng Leng",
  YAT: "Yau Tong",
  TKO: "Tseung Kwan O",
  HAH: "Hang Hau",
  POA: "Po Lam",
  LHP: "LOHAS Park",
  EXC: "Exhibition Centre",
  HUH: "Hung Hom",
  MKK: "Mong Kok East",
  TAW: "Tai Wai",
  SHT: "Sha Tin",
  FOT: "Fo Tan",
  RAC: "Racecourse",
  UNI: "University",
  TAP: "Tai Po Market",
  TWO: "Tai Wo",
  FAN: "Fanling",
  SHS: "Sheung Shui",
  LOW: "Lo Wu",
  LMC: "Lok Ma Chau",
  OCP: "Ocean Park",
  WCH: "Wong Chuk Hang",
  LET: "Lei Tung",
  SOH: "South Horizons",
  TUM: "Tuen Mun",
  SIH: "Siu Hong",
  TIS: "Tin Shui Wai",
  LOP: "Long Ping",
  YUL: "Yuen Long",
  KSR: "Kam Sheung Road",
  TWW: "Tsuen Wan West",
  AUS: "Austin",
  ETS: "East Tsim Sha Tsui",
  TKW: "To Kwa Wan",
  SUW: "Sung Wong Toi",
  KAT: "Kai Tak",
  HIK: "Hin Keng",
  CKT: "Che Kung Temple",
  STW: "Sha Tin Wai",
  CIO: "City One",
  SHM: "Shek Mun",
  TSH: "Tai Shui Hang",
  HEO: "Heng On",
  MOS: "Ma On Shan",
  WKS: "Wu Kai Sha",
};

export const MTR_STATIONS: MtrStation[] = RAW_STATIONS.map((s) => ({
  ...s,
  nameEn: MTR_STATION_EN[s.code] ?? s.name,
}));

export function mtrStation(code: string): MtrStation | undefined {
  return MTR_STATIONS.find((s) => s.code === code);
}

export function mtrName(code: string): string {
  return mtrStation(code)?.name ?? code;
}

export const HSR_STATION_CODE = "WEK";

export function isHsrStation(code: string) {
  return code === HSR_STATION_CODE;
}

export const RACECOURSE_STATION_CODE = "RAC";

export function isRacecourseStation(code: string) {
  return code === RACECOURSE_STATION_CODE;
}

export const MTR_LINE_ORDER = [
  "TWL",
  "ISL",
  "KTL",
  "TKL",
  "EAL",
  "TML",
  "TCL",
  "AEL",
  "SIL",
  "DRL",
] as const;

export function searchMtrStations(q: string): MtrStation[] {
  const n = q.trim().toLowerCase();
  if (!n) return [];
  return MTR_STATIONS.filter(
    (s) =>
      s.name.includes(q.trim()) ||
      s.nameEn.toLowerCase().includes(n) ||
      s.code.toLowerCase() === n ||
      s.lines.some((line) => (MTR_LINE_NAMES[line] ?? line).includes(q.trim())),
  ).slice(0, 12);
}

export function mtrStationsOnLine(line?: string, q = ""): MtrStation[] {
  const n = q.trim();
  return MTR_STATIONS.filter((s) => {
    if (line && !s.lines.includes(line)) return false;
    if (!n) return true;
    return (
      s.name.includes(n) ||
      s.nameEn.toLowerCase().includes(n.toLowerCase()) ||
      s.code.toLowerCase() === n.toLowerCase()
    );
  });
}
