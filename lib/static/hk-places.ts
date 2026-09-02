import { haversineMeters } from "@/lib/geo";
import { HOSPITALS } from "@/lib/static/hospitals";
import { mtrStation, resolveMtrPlace, MTR_STATIONS } from "@/lib/static/mtr-stations";
import type { MtrStation } from "@/lib/types";

export type TripPlaceKind = "mtr" | "estate" | "district" | "landmark";

export type PlaceFeeder = {
  route: string;
  /** 下車轉車點（例如東涌纜車站） */
  alight: string;
  minutes: number;
  fareHkd: number;
};

type RawPlace = {
  id: string;
  kind: Exclude<TripPlaceKind, "mtr">;
  name: string;
  nameEn: string;
  aliases?: string[];
  lat: number;
  lng: number;
  district: string;
  /** Nearest useful MTR for rail legs */
  anchorMtr: string;
  tags?: string[];
  /** Local feeder toward Tung Chung / E-line boarding */
  feeder?: PlaceFeeder;
};

/**
 * Curated districts, estates and landmarks for trip advisor.
 * Coords are approximate centroids / estate centres for walk / distance estimates.
 */
const RAW_PLACES: RawPlace[] = [
  // —— 18 區（行政區中心，錨定就近港鐵）——
  { id: "dist-cw", kind: "district", name: "中西區", nameEn: "Central and Western", lat: 22.2819, lng: 114.1582, district: "中西區", anchorMtr: "CEN", aliases: ["中環區"] },
  { id: "dist-wc", kind: "district", name: "灣仔區", nameEn: "Wan Chai District", lat: 22.277, lng: 114.1733, district: "灣仔區", anchorMtr: "WAC" },
  { id: "dist-east", kind: "district", name: "東區", nameEn: "Eastern District", lat: 22.2842, lng: 114.2241, district: "東區", anchorMtr: "TAK", aliases: ["港島東"] },
  { id: "dist-south", kind: "district", name: "南區", nameEn: "Southern District", lat: 22.2479, lng: 114.1588, district: "南區", anchorMtr: "OCP", aliases: ["香港仔"] },
  { id: "dist-ytm", kind: "district", name: "油尖旺區", nameEn: "Yau Tsim Mong", lat: 22.3119, lng: 114.1694, district: "油尖旺區", anchorMtr: "MOK", aliases: ["油尖旺"] },
  { id: "dist-ssp", kind: "district", name: "深水埗區", nameEn: "Sham Shui Po District", lat: 22.3307, lng: 114.1622, district: "深水埗區", anchorMtr: "SSP" },
  { id: "dist-kc", kind: "district", name: "九龍城區", nameEn: "Kowloon City District", lat: 22.3302, lng: 114.1913, district: "九龍城區", anchorMtr: "KOT", aliases: ["九龍城"] },
  { id: "dist-wts", kind: "district", name: "黃大仙區", nameEn: "Wong Tai Sin District", lat: 22.342, lng: 114.193, district: "黃大仙區", anchorMtr: "WTS" },
  { id: "dist-kt", kind: "district", name: "觀塘區", nameEn: "Kwun Tong District", lat: 22.312, lng: 114.2265, district: "觀塘區", anchorMtr: "NTW" },
  { id: "dist-tw", kind: "district", name: "荃灣區", nameEn: "Tsuen Wan District", lat: 22.3707, lng: 114.1146, district: "荃灣區", anchorMtr: "TSW" },
  { id: "dist-tuen", kind: "district", name: "屯門區", nameEn: "Tuen Mun District", lat: 22.391, lng: 113.977, district: "屯門區", anchorMtr: "TUM" },
  { id: "dist-yl", kind: "district", name: "元朗區", nameEn: "Yuen Long District", lat: 22.4445, lng: 114.0225, district: "元朗區", anchorMtr: "YUL" },
  { id: "dist-north", kind: "district", name: "北區", nameEn: "North District", lat: 22.494, lng: 114.138, district: "北區", anchorMtr: "SHS", aliases: ["上水粉嶺"] },
  { id: "dist-tp", kind: "district", name: "大埔區", nameEn: "Tai Po District", lat: 22.4507, lng: 114.1646, district: "大埔區", anchorMtr: "TAP" },
  { id: "dist-st", kind: "district", name: "沙田區", nameEn: "Sha Tin District", lat: 22.382, lng: 114.19, district: "沙田區", anchorMtr: "SHT" },
  { id: "dist-sk", kind: "district", name: "西貢區", nameEn: "Sai Kung District", lat: 22.3193, lng: 114.268, district: "西貢區", anchorMtr: "TKO", aliases: ["西貢"] },
  { id: "dist-kwt", kind: "district", name: "葵青區", nameEn: "Kwai Tsing District", lat: 22.3549, lng: 114.126, district: "葵青區", anchorMtr: "KWF", aliases: ["葵涌"] },
  { id: "dist-islands", kind: "district", name: "離島區", nameEn: "Islands District", lat: 22.288, lng: 113.94, district: "離島區", anchorMtr: "TUC", aliases: ["離島", "大嶼山"] },

  // —— 東涌／大嶼山屋邨（含接駁 E41）——
  {
    id: "estate-yat-tung",
    kind: "estate",
    name: "逸東邨",
    nameEn: "Yat Tung Estate",
    aliases: ["逸東", "yat tung", "yattung", "Yat Tung"],
    lat: 22.2815,
    lng: 113.9382,
    district: "離島區",
    anchorMtr: "TUC",
    tags: ["yat-tung", "tung-chung"],
    feeder: { route: "38", alight: "東涌纜車站", minutes: 10, fareHkd: 3.8 },
  },
  {
    id: "estate-ying-tung",
    kind: "estate",
    name: "迎東邨",
    nameEn: "Ying Tung Estate",
    aliases: ["迎東", "ying tung"],
    lat: 22.2952,
    lng: 113.9428,
    district: "離島區",
    anchorMtr: "TUC",
    tags: ["tung-chung"],
    feeder: { route: "37M", alight: "東涌站", minutes: 12, fareHkd: 3.8 },
  },
  {
    id: "estate-mun-tung",
    kind: "estate",
    name: "滿東邨",
    nameEn: "Mun Tung Estate",
    aliases: ["滿東", "mun tung"],
    lat: 22.2788,
    lng: 113.9345,
    district: "離島區",
    anchorMtr: "TUC",
    tags: ["tung-chung"],
    feeder: { route: "39M", alight: "東涌站", minutes: 14, fareHkd: 3.8 },
  },
  {
    id: "estate-fu-tung",
    kind: "estate",
    name: "富東邨",
    nameEn: "Fu Tung Estate",
    aliases: ["富東", "fu tung"],
    lat: 22.2886,
    lng: 113.9425,
    district: "離島區",
    anchorMtr: "TUC",
    tags: ["tung-chung"],
  },
  {
    id: "estate-yu-tung",
    kind: "estate",
    name: "裕東苑",
    nameEn: "Yu Tung Court",
    aliases: ["裕東"],
    lat: 22.2868,
    lng: 113.9405,
    district: "離島區",
    anchorMtr: "TUC",
    tags: ["tung-chung"],
  },
  {
    id: "landmark-tung-chung-cable",
    kind: "landmark",
    name: "東涌纜車站",
    nameEn: "Tung Chung Cable Car Terminal",
    aliases: ["纜車站", "昂坪纜車東涌站", "cable car", "Ngong Ping 360"],
    lat: 22.2896,
    lng: 113.9415,
    district: "離島區",
    anchorMtr: "TUC",
    tags: ["tung-chung", "cable-car"],
  },
  {
    id: "landmark-tung-chung-town",
    kind: "landmark",
    name: "東涌市中心",
    nameEn: "Tung Chung Town Centre",
    aliases: ["東涌市中心", "Tung Chung Town"],
    lat: 22.2893,
    lng: 113.9414,
    district: "離島區",
    anchorMtr: "TUC",
    tags: ["tung-chung"],
  },

  // —— 新界主要屋邨／市鎮 ——
  { id: "estate-tin-yiu", kind: "estate", name: "天耀邨", nameEn: "Tin Yiu Estate", aliases: ["天耀"], lat: 22.4505, lng: 114.002, district: "元朗區", anchorMtr: "TIS" },
  { id: "estate-tin-shui", kind: "estate", name: "天瑞邨", nameEn: "Tin Shui Estate", aliases: ["天瑞"], lat: 22.4568, lng: 113.9985, district: "元朗區", anchorMtr: "TIS" },
  { id: "estate-tin-chung", kind: "estate", name: "天頌苑", nameEn: "Tin Chung Court", aliases: ["天頌"], lat: 22.461, lng: 113.996, district: "元朗區", anchorMtr: "TIS" },
  { id: "estate-tin-heng", kind: "estate", name: "天恆邨", nameEn: "Tin Heng Estate", aliases: ["天恆"], lat: 22.4685, lng: 113.9995, district: "元朗區", anchorMtr: "TIS" },
  { id: "estate-tin-yat", kind: "estate", name: "天逸邨", nameEn: "Tin Yat Estate", aliases: ["天逸"], lat: 22.465, lng: 114.002, district: "元朗區", anchorMtr: "TIS" },
  { id: "landmark-tin-shui-wai", kind: "landmark", name: "天水圍", nameEn: "Tin Shui Wai", aliases: ["天水圍市中心", "TSW"], lat: 22.458, lng: 114.002, district: "元朗區", anchorMtr: "TIS" },
  { id: "estate-long-ping", kind: "estate", name: "朗屏邨", nameEn: "Long Ping Estate", aliases: ["朗屏"], lat: 22.4475, lng: 114.024, district: "元朗區", anchorMtr: "LOP" },
  { id: "estate-shui-pin-wai", kind: "estate", name: "水邊圍邨", nameEn: "Shui Pin Wai Estate", aliases: ["水邊圍"], lat: 22.444, lng: 114.018, district: "元朗區", anchorMtr: "YUL" },

  { id: "estate-shan-king", kind: "estate", name: "山景邨", nameEn: "Shan King Estate", aliases: ["山景"], lat: 22.398, lng: 113.968, district: "屯門區", anchorMtr: "TUM" },
  { id: "estate-on-ting", kind: "estate", name: "安定邨", nameEn: "On Ting Estate", aliases: ["安定"], lat: 22.388, lng: 113.976, district: "屯門區", anchorMtr: "TUM" },
  { id: "estate-sam-shui", kind: "estate", name: "三聖邨", nameEn: "Sam Shing Estate", aliases: ["三聖"], lat: 22.378, lng: 113.98, district: "屯門區", anchorMtr: "TUM" },
  { id: "estate-leung-king", kind: "estate", name: "良景邨", nameEn: "Leung King Estate", aliases: ["良景"], lat: 22.406, lng: 113.964, district: "屯門區", anchorMtr: "TUM" },
  { id: "estate-tin-king", kind: "estate", name: "田景邨", nameEn: "Tin King Estate", aliases: ["田景"], lat: 22.408, lng: 113.962, district: "屯門區", anchorMtr: "TUM" },
  { id: "landmark-tuen-mun", kind: "landmark", name: "屯門市中心", nameEn: "Tuen Mun Town Centre", aliases: ["屯門市中心"], lat: 22.391, lng: 113.977, district: "屯門區", anchorMtr: "TUM" },

  { id: "estate-shek-wai-kok", kind: "estate", name: "石圍角邨", nameEn: "Shek Wai Kok Estate", aliases: ["石圍角"], lat: 22.375, lng: 114.122, district: "荃灣區", anchorMtr: "TSW" },
  { id: "estate-cheung-shan", kind: "estate", name: "象山邨", nameEn: "Cheung Shan Estate", aliases: ["象山"], lat: 22.372, lng: 114.13, district: "荃灣區", anchorMtr: "TSW" },
  { id: "estate-lei-muk-shue", kind: "estate", name: "梨木樹邨", nameEn: "Lei Muk Shue Estate", aliases: ["梨木樹"], lat: 22.378, lng: 114.135, district: "荃灣區", anchorMtr: "TSW" },

  { id: "estate-kwai-chung", kind: "estate", name: "葵涌邨", nameEn: "Kwai Chung Estate", aliases: ["葵涌邨"], lat: 22.368, lng: 114.128, district: "葵青區", anchorMtr: "KWF" },
  { id: "estate-shek-lei", kind: "estate", name: "石籬邨", nameEn: "Shek Lei Estate", aliases: ["石籬"], lat: 22.365, lng: 114.14, district: "葵青區", anchorMtr: "KWF" },
  { id: "estate-cheung-on", kind: "estate", name: "長安邨", nameEn: "Cheung On Estate", aliases: ["長安"], lat: 22.356, lng: 114.106, district: "葵青區", anchorMtr: "TSY" },
  { id: "estate-cheung-wang", kind: "estate", name: "長宏邨", nameEn: "Cheung Wang Estate", aliases: ["長宏"], lat: 22.358, lng: 114.102, district: "葵青區", anchorMtr: "TSY" },

  { id: "estate-lek-yuen", kind: "estate", name: "瀝源邨", nameEn: "Lek Yuen Estate", aliases: ["瀝源"], lat: 22.385, lng: 114.192, district: "沙田區", anchorMtr: "SHT" },
  { id: "estate-wo-che", kind: "estate", name: "禾輋邨", nameEn: "Wo Che Estate", aliases: ["禾輋"], lat: 22.388, lng: 114.195, district: "沙田區", anchorMtr: "SHT" },
  { id: "estate-city-one", kind: "estate", name: "沙田第一城", nameEn: "City One Shatin", aliases: ["第一城", "City One"], lat: 22.386, lng: 114.204, district: "沙田區", anchorMtr: "CIO" },
  { id: "estate-mei-lam", kind: "estate", name: "美林邨", nameEn: "Mei Lam Estate", aliases: ["美林"], lat: 22.375, lng: 114.178, district: "沙田區", anchorMtr: "TAW" },
  { id: "estate-lee-on", kind: "estate", name: "利安邨", nameEn: "Lee On Estate", aliases: ["利安"], lat: 22.424, lng: 114.232, district: "沙田區", anchorMtr: "WKS" },

  { id: "estate-tai-wo", kind: "estate", name: "太和邨", nameEn: "Tai Wo Estate", aliases: ["太和"], lat: 22.451, lng: 114.161, district: "大埔區", anchorMtr: "TWO" },
  { id: "estate-tai-yuen", kind: "estate", name: "大元邨", nameEn: "Tai Yuen Estate", aliases: ["大元"], lat: 22.454, lng: 114.168, district: "大埔區", anchorMtr: "TAP" },
  { id: "estate-kwong-fuk", kind: "estate", name: "廣福邨", nameEn: "Kwong Fuk Estate", aliases: ["廣福"], lat: 22.446, lng: 114.175, district: "大埔區", anchorMtr: "TAP" },
  { id: "estate-fu-heng", kind: "estate", name: "富亨邨", nameEn: "Fu Heng Estate", aliases: ["富亨"], lat: 22.46, lng: 114.172, district: "大埔區", anchorMtr: "TAP" },

  { id: "estate-choi-yuen", kind: "estate", name: "彩園邨", nameEn: "Choi Yuen Estate", aliases: ["彩園"], lat: 22.501, lng: 114.128, district: "北區", anchorMtr: "SHS" },
  { id: "estate-tin-ping", kind: "estate", name: "天平邨", nameEn: "Tin Ping Estate", aliases: ["天平"], lat: 22.505, lng: 114.132, district: "北區", anchorMtr: "SHS" },
  { id: "estate-wah-ming", kind: "estate", name: "華明邨", nameEn: "Wah Ming Estate", aliases: ["華明"], lat: 22.49, lng: 114.142, district: "北區", anchorMtr: "FAN" },
  { id: "estate-ka-fuk", kind: "estate", name: "嘉福邨", nameEn: "Ka Fuk Estate", aliases: ["嘉福"], lat: 22.492, lng: 114.145, district: "北區", anchorMtr: "FAN" },
  { id: "estate-ching-ho", kind: "estate", name: "清河邨", nameEn: "Ching Ho Estate", aliases: ["清河"], lat: 22.498, lng: 114.135, district: "北區", anchorMtr: "SHS" },

  { id: "estate-po-lam", kind: "estate", name: "寶林邨", nameEn: "Po Lam Estate", aliases: ["寶林"], lat: 22.323, lng: 114.257, district: "西貢區", anchorMtr: "POA" },
  { id: "estate-tsui-lam", kind: "estate", name: "翠林邨", nameEn: "Tsui Lam Estate", aliases: ["翠林"], lat: 22.328, lng: 114.252, district: "西貢區", anchorMtr: "POA" },
  { id: "estate-hau-tak", kind: "estate", name: "厚德邨", nameEn: "Hau Tak Estate", aliases: ["厚德"], lat: 22.317, lng: 114.265, district: "西貢區", anchorMtr: "HAH" },
  { id: "estate-kin-ming", kind: "estate", name: "健明邨", nameEn: "Kin Ming Estate", aliases: ["健明"], lat: 22.308, lng: 114.252, district: "西貢區", anchorMtr: "TKO" },

  // —— 九龍／港島常見屋邨／院校 ——
  { id: "estate-oi-man", kind: "estate", name: "愛民邨", nameEn: "Oi Man Estate", aliases: ["愛民"], lat: 22.315, lng: 114.178, district: "九龍城區", anchorMtr: "HOM" },
  { id: "estate-ho-man-tin", kind: "estate", name: "何文田邨", nameEn: "Ho Man Tin Estate", aliases: ["何文田邨"], lat: 22.31, lng: 114.182, district: "九龍城區", anchorMtr: "HOM" },
  {
    id: "landmark-hkmu",
    kind: "landmark",
    name: "香港都會大學",
    nameEn: "Hong Kong Metropolitan University",
    aliases: [
      "都會大學",
      "都大",
      "HKMU",
      "hkmu",
      "Hong Kong Metropolitan University",
      "Metropolitan University",
      "公開大學",
      "港公開大",
    ],
    lat: 22.3162,
    lng: 114.1795,
    district: "九龍城區",
    anchorMtr: "HOM",
    tags: ["university", "e21a"],
  },
  { id: "estate-lok-fu", kind: "estate", name: "樂富邨", nameEn: "Lok Fu Estate", aliases: ["樂富邨"], lat: 22.338, lng: 114.187, district: "黃大仙區", anchorMtr: "LOF" },
  { id: "estate-wong-tai-sin", kind: "estate", name: "黃大仙下邨", nameEn: "Lower Wong Tai Sin Estate", aliases: ["黃大仙邨"], lat: 22.342, lng: 114.194, district: "黃大仙區", anchorMtr: "WTS" },
  { id: "estate-tszp", kind: "estate", name: "彩雲邨", nameEn: "Choi Wan Estate", aliases: ["彩雲"], lat: 22.334, lng: 114.214, district: "黃大仙區", anchorMtr: "DIH" },
  { id: "estate-sau-mau-ping", kind: "estate", name: "秀茂坪邨", nameEn: "Sau Mau Ping Estate", aliases: ["秀茂坪"], lat: 22.32, lng: 114.232, district: "觀塘區", anchorMtr: "NTW" },
  { id: "estate-shun-lee", kind: "estate", name: "順利邨", nameEn: "Shun Lee Estate", aliases: ["順利"], lat: 22.332, lng: 114.228, district: "觀塘區", anchorMtr: "NTW" },
  { id: "estate-lam-tin", kind: "estate", name: "藍田邨", nameEn: "Lam Tin Estate", aliases: ["藍田邨"], lat: 22.307, lng: 114.235, district: "觀塘區", anchorMtr: "YAT" },
  { id: "estate-ping-shek", kind: "estate", name: "坪石邨", nameEn: "Ping Shek Estate", aliases: ["坪石"], lat: 22.333, lng: 114.209, district: "觀塘區", anchorMtr: "DIH" },
  { id: "estate-so-uk", kind: "estate", name: "蘇屋邨", nameEn: "So Uk Estate", aliases: ["蘇屋"], lat: 22.34, lng: 114.158, district: "深水埗區", anchorMtr: "CSW" },
  { id: "estate-lei-cheng-uk", kind: "estate", name: "李鄭屋邨", nameEn: "Lei Cheng Uk Estate", aliases: ["李鄭屋"], lat: 22.338, lng: 114.16, district: "深水埗區", anchorMtr: "CSW" },
  { id: "estate-pak-tin", kind: "estate", name: "白田邨", nameEn: "Pak Tin Estate", aliases: ["白田"], lat: 22.336, lng: 114.168, district: "深水埗區", anchorMtr: "SSP" },
  { id: "estate-mei-foo", kind: "estate", name: "美孚", nameEn: "Mei Foo", aliases: ["美孚新邨", "Mei Foo Sun Chuen"], lat: 22.3375, lng: 114.138, district: "深水埗區", anchorMtr: "MEF" },
  { id: "estate-tai-koo", kind: "estate", name: "太古城", nameEn: "Taikoo Shing", aliases: ["太古"], lat: 22.2865, lng: 114.217, district: "東區", anchorMtr: "TAK" },
  { id: "estate-heng-fa", kind: "estate", name: "杏花邨", nameEn: "Heng Fa Chuen", aliases: ["杏花"], lat: 22.277, lng: 114.24, district: "東區", anchorMtr: "HFC" },
  { id: "estate-wah-fu", kind: "estate", name: "華富邨", nameEn: "Wah Fu Estate", aliases: ["華富"], lat: 22.252, lng: 114.136, district: "南區", anchorMtr: "OCP" },
  { id: "estate-ap-lei-chau", kind: "estate", name: "鴨脷洲邨", nameEn: "Ap Lei Chau Estate", aliases: ["鴨脷洲邨"], lat: 22.243, lng: 114.152, district: "南區", anchorMtr: "OCP" },
];

export type HkPlace = Omit<RawPlace, "aliases" | "tags"> & {
  aliases: string[];
  tags: string[];
  anchor: MtrStation;
};

function buildPlace(raw: RawPlace): HkPlace | null {
  const anchor = mtrStation(raw.anchorMtr);
  if (!anchor) return null;
  return { ...raw, aliases: raw.aliases ?? [], tags: raw.tags ?? [], anchor };
}

export const HK_PLACES: HkPlace[] = RAW_PLACES.map(buildPlace).filter((p): p is HkPlace => p != null);

export type ResolvedTripPlace = {
  id: string;
  kind: TripPlaceKind;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
  district?: string;
  tags: string[];
  feeder?: PlaceFeeder;
  anchor: MtrStation;
};

export type TripPlaceSuggestion = {
  id: string;
  kind: TripPlaceKind;
  name: string;
  nameEn: string;
  subtitle: string;
};

function kindLabel(kind: TripPlaceKind) {
  switch (kind) {
    case "mtr":
      return "港鐵";
    case "estate":
      return "屋邨";
    case "district":
      return "行政區";
    case "landmark":
      return "地點";
  }
}

function norm(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function placeMatches(p: HkPlace, raw: string, n: string) {
  if (p.name === raw || p.nameEn.toLowerCase() === n) return 0;
  if (p.aliases.some((a) => a === raw || a.toLowerCase() === n)) return 1;
  if (p.name.startsWith(raw) || p.nameEn.toLowerCase().startsWith(n)) return 2;
  if (p.aliases.some((a) => a.startsWith(raw) || a.toLowerCase().startsWith(n))) return 3;
  if (p.name.includes(raw) || p.nameEn.toLowerCase().includes(n)) return 4;
  if (p.aliases.some((a) => a.includes(raw) || a.toLowerCase().includes(n))) return 5;
  return 99;
}

function asResolvedFromMtr(s: MtrStation): ResolvedTripPlace {
  const tags = s.code === "TUC" ? ["tung-chung"] : NORTH_EAL_CODES.has(s.code) ? ["north-eal"] : [];
  return {
    id: `mtr:${s.code}`,
    kind: "mtr",
    name: s.name,
    nameEn: s.nameEn,
    lat: s.lat,
    lng: s.lng,
    tags,
    anchor: s,
  };
}

function asResolvedFromPlace(p: HkPlace): ResolvedTripPlace {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    nameEn: p.nameEn,
    lat: p.lat,
    lng: p.lng,
    district: p.district,
    tags: p.tags ?? [],
    feeder: p.feeder,
    anchor: p.anchor,
  };
}

const NORTH_EAL_CODES = new Set(["TAP", "FAN", "SHS", "LOW"]);

/** English / short aliases → canonical HA hospital name */
const HOSPITAL_ALIASES: Record<string, string> = {
  瑪嘉烈: "瑪嘉烈醫院",
  "princess margaret hospital": "瑪嘉烈醫院",
  "princess margaret": "瑪嘉烈醫院",
  pmh: "瑪嘉烈醫院",
  瑪麗: "瑪麗醫院",
  qmh: "瑪麗醫院",
  伊利沙伯: "伊利沙伯醫院",
  qeh: "伊利沙伯醫院",
  威爾斯: "威爾斯親王醫院",
  威院: "威爾斯親王醫院",
  pwh: "威爾斯親王醫院",
  廣華: "廣華醫院",
  屯門醫院: "屯門醫院",
  北大嶼山: "北大嶼山醫院",
  北大嶼山醫院: "北大嶼山醫院",
};

function nearestMtrStation(lat: number, lng: number): MtrStation {
  let best = MTR_STATIONS[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of MTR_STATIONS) {
    const d = haversineMeters(lat, lng, s.lat, s.lng);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function resolveHospitalPlace(raw: string, n: string): ResolvedTripPlace | undefined {
  const aliased = HOSPITAL_ALIASES[n] || HOSPITAL_ALIASES[raw];
  const want = aliased ?? raw;
  const hit =
    HOSPITALS.find((h) => h.name === want) ||
    HOSPITALS.find((h) => h.name.includes(want) || want.includes(h.name.replace(/醫院$/, ""))) ||
    HOSPITALS.find((h) => h.name.toLowerCase().includes(n));
  if (!hit) return undefined;
  const anchor = nearestMtrStation(hit.lat, hit.lng);
  return {
    id: `hospital:${hit.name}`,
    kind: "landmark",
    name: hit.name,
    nameEn: hit.name,
    lat: hit.lat,
    lng: hit.lng,
    district: hit.cluster,
    tags: ["hospital"],
    anchor,
  };
}

/** Resolve MTR station, estate, district, hospital or landmark. Exact MTR name wins over district aliases. */
export function resolveTripPlace(q: string): ResolvedTripPlace | undefined {
  const raw = q.trim();
  if (!raw) return undefined;
  const n = norm(raw);

  const mtrExact = MTR_STATIONS.find(
    (s) => s.name === raw || s.nameEn.toLowerCase() === n || s.code.toLowerCase() === n,
  );
  if (mtrExact) return asResolvedFromMtr(mtrExact);

  const hospital = resolveHospitalPlace(raw, n);
  if (hospital) return hospital;

  const exactPlace = HK_PLACES.find(
    (p) =>
      p.name === raw ||
      p.nameEn.toLowerCase() === n ||
      (p.aliases ?? []).some((a) => a === raw || a.toLowerCase() === n),
  );
  if (exactPlace) return asResolvedFromPlace(exactPlace);

  const scored = HK_PLACES.map((p) => ({ p, score: placeMatches(p, raw, n) }))
    .filter((x) => x.score < 99)
    .sort((a, b) => a.score - b.score || a.p.name.length - b.p.name.length);
  const bestPlace = scored[0];
  const mtrFuzzy = resolveMtrPlace(raw);

  if (bestPlace && bestPlace.score <= 3 && !mtrFuzzy) return asResolvedFromPlace(bestPlace.p);
  if (bestPlace && bestPlace.score <= 2) return asResolvedFromPlace(bestPlace.p);
  if (mtrFuzzy) return asResolvedFromMtr(mtrFuzzy);
  if (bestPlace) return asResolvedFromPlace(bestPlace.p);
  return undefined;
}

/** Autocomplete suggestions: MTR + places. */
export function matchTripPlaces(q: string, limit = 8): TripPlaceSuggestion[] {
  const raw = q.trim();
  const n = norm(raw);
  if (!n) return [];

  const out: TripPlaceSuggestion[] = [];
  const seen = new Set<string>();

  for (const s of MTR_STATIONS) {
    if (
      s.name.includes(raw) ||
      s.nameEn.toLowerCase().includes(n) ||
      s.code.toLowerCase() === n
    ) {
      const id = `mtr:${s.code}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        kind: "mtr",
        name: s.name,
        nameEn: s.nameEn,
        subtitle: `${kindLabel("mtr")} · ${s.nameEn}`,
      });
    }
  }

  const places = HK_PLACES.map((p) => ({ p, score: placeMatches(p, raw, n) }))
    .filter((x) => x.score < 99)
    .sort((a, b) => a.score - b.score || a.p.name.length - b.p.name.length);

  for (const { p } of places) {
    if (seen.has(p.id)) continue;
    // Avoid duplicating a place that shares the same display name as its MTR anchor
    if (seen.has(`mtr:${p.anchorMtr}`) && p.name === p.anchor.name) {
      continue;
    }
    seen.add(p.id);
    out.push({
      id: p.id,
      kind: p.kind,
      name: p.name,
      nameEn: p.nameEn,
      subtitle: `${kindLabel(p.kind)} · ${p.district}`,
    });
  }

  return out
    .sort((a, b) => {
      const rank = (k: TripPlaceKind) => (k === "mtr" ? 0 : k === "estate" ? 1 : k === "landmark" ? 2 : 3);
      const aHit = a.name === raw || a.nameEn.toLowerCase() === n ? 0 : a.name.startsWith(raw) ? 1 : 2;
      const bHit = b.name === raw || b.nameEn.toLowerCase() === n ? 0 : b.name.startsWith(raw) ? 1 : 2;
      return aHit - bHit || rank(a.kind) - rank(b.kind) || a.name.length - b.name.length;
    })
    .slice(0, limit);
}

export function isNorthEalAnchor(code: string) {
  return NORTH_EAL_CODES.has(code);
}

export function isTungChungArea(place: ResolvedTripPlace) {
  return place.tags.includes("tung-chung") || place.anchor.code === "TUC";
}

export function isYatTung(place: ResolvedTripPlace) {
  return place.tags.includes("yat-tung") || place.id === "estate-yat-tung";
}
