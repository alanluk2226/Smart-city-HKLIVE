export const TRANSIT_MODES = [
  {
    href: "/transit/bus",
    key: "bus",
    title: "巴士",
    blurb: "九巴、龍運、城巴、嶼巴路線與到站時間",
  },
  {
    href: "/transit/minibus",
    key: "minibus",
    title: "小巴",
    blurb: "專線小巴（綠van）港島、九龍、新界",
  },
  {
    href: "/transit/tram",
    key: "tram",
    title: "電車",
    blurb: "港島叮叮：東西行時間軸與班次估算",
  },
  {
    href: "/transit/ferry",
    key: "ferry",
    title: "渡輪",
    blurb: "碼頭樞紐、開船倒數與惡劣天氣提示",
  },
  {
    href: "/transit/taxi",
    key: "taxi",
    title: "的士",
    blurb: "全港的士站、上落客點與電召電話",
  },
  {
    href: "/transit/lrt",
    key: "lrt",
    title: "輕鐵",
    blurb: "屯門、天水圍、元朗路綫圖與到達時間",
  },
  {
    href: "/transit/mtr",
    key: "mtr",
    title: "港鐵",
    blurb: "市區線、東鐵、屯馬、東涌及機場快線",
  },
] as const;

export type TransitModeKey = (typeof TRANSIT_MODES)[number]["key"];
