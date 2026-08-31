export const MODULES = [
  {
    href: "/transit",
    key: "transit",
    title: "交通到達",
    blurb: "巴士、小巴、輕鐵、港鐵到達時間",
    accent: "teal",
  },
  {
    href: "/weather",
    key: "weather",
    title: "天氣",
    blurb: "天文台現況、警報與九天天氣預報",
    accent: "sky",
  },
  {
    href: "/health",
    key: "health",
    title: "醫療",
    blurb: "急症室輪候、導航與專科門診新症預約時間",
    accent: "rose",
  },
  {
    href: "/traffic",
    key: "traffic",
    title: "CCTV / 路況",
    blurb: "全港運輸署道路 CCTV，按港島／九龍／新界同行政區瀏覽",
    accent: "amber",
  },
  {
    href: "/parking",
    key: "parking",
    title: "停車場空位",
    blurb: "全港停車場即時私家車空位，按港島／九龍／新界同行政區瀏覽",
    accent: "violet",
  },
  {
    href: "/facilities",
    key: "facilities",
    title: "康文署場地",
    blurb: "全港體育館、球場、泳池、泳灘等，按行政區同類型瀏覽",
    accent: "lime",
  },
] as const;

export type ModuleKey = (typeof MODULES)[number]["key"];
