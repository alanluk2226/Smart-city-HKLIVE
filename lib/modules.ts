export const MODULES = [
  {
    href: "/transit",
    key: "transit",
    chip: "出行",
    title: "交通工具",
    blurb: "巴士、小巴、輕鐵、港鐵到達時間",
    accent: "teal",
  },
  {
    href: "/weather",
    key: "weather",
    chip: "天氣",
    title: "天氣",
    blurb: "天文台現況、警報與九天天氣預報",
    accent: "sky",
  },
  {
    href: "/health",
    key: "health",
    chip: "醫療",
    title: "醫療",
    blurb: "急症室輪候、導航與專科門診新症預約時間",
    accent: "rose",
  },
  {
    href: "/traffic",
    key: "traffic",
    chip: "路況",
    title: "CCTV / 路況",
    blurb: "全港運輸署道路 CCTV，按港島／九龍／新界同行政區瀏覽",
    accent: "amber",
  },
  {
    href: "/parking",
    key: "parking",
    chip: "停車",
    title: "停車場空位",
    blurb: "全港停車場即時私家車空位，按港島／九龍／新界同行政區瀏覽",
    accent: "violet",
  },
  {
    href: "/facilities",
    key: "facilities",
    chip: "場地",
    title: "場地／廁所",
    blurb: "康文署場地，以及食環署公廁與地政總署商場（通常有洗手間），按行政區同類型瀏覽",
    accent: "lime",
  },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
