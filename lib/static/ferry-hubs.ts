export type FerryOperator = "sunferry" | "hkkf" | "starferry" | "dbtsl";

export type FerryLeg = {
  id: string;
  operator: FerryOperator;
  operatorName: string;
  /** Sun Ferry route query code, or HKKF route id */
  routeCode: string;
  direction?: "outbound" | "inbound";
  title: string;
  from: string;
  to: string;
  pier?: string;
  /** Prefer vessel type when API does not mark H suffix */
  vesselHint?: "fast" | "ordinary";
};

export type FerryHub = {
  id: string;
  name: string;
  nameEn: string;
  lat: number;
  lng: number;
  legs: FerryLeg[];
};

/**
 * Fixed pier hubs + known open-data legs.
 * Live ETA: Sun Ferry + HKKF. Star Ferry / DBTSL use TD timetable estimates
 * (DBTSL has fare/timetable CSV on data.gov.hk, no public live ETA API).
 */
export const FERRY_HUBS: FerryHub[] = [
  {
    id: "central",
    name: "中環碼頭",
    nameEn: "Central",
    lat: 22.2875,
    lng: 114.1615,
    legs: [
      {
        id: "star-central-tst",
        operator: "starferry",
        operatorName: "天星小輪",
        routeCode: "STAR-CE-TST",
        title: "中環 ⇆ 尖沙咀",
        from: "中環",
        to: "尖沙咀",
        pier: "中環天星碼頭",
      },
      {
        id: "dbtsl-ce-db",
        operator: "dbtsl",
        operatorName: "愉景灣航運",
        routeCode: "DB-CE",
        title: "中環 → 愉景灣",
        from: "中環",
        to: "愉景灣",
        pier: "中環 3 號碼頭",
        vesselHint: "fast",
      },
      {
        id: "sun-cecc",
        operator: "sunferry",
        operatorName: "新渡輪",
        routeCode: "CECC",
        title: "中環 → 長洲",
        from: "中環",
        to: "長洲",
        pier: "中環 5 號碼頭",
      },
      {
        id: "sun-cemw",
        operator: "sunferry",
        operatorName: "新渡輪",
        routeCode: "CEMW",
        title: "中環 → 梅窩",
        from: "中環",
        to: "梅窩",
        pier: "中環 6 號碼頭",
      },
      {
        id: "hkkf-ysk-out",
        operator: "hkkf",
        operatorName: "港九小輪",
        routeCode: "2",
        direction: "outbound",
        title: "中環 → 榕樹灣",
        from: "中環",
        to: "榕樹灣",
        pier: "中環 4 號碼頭",
      },
      {
        id: "hkkf-skw-out",
        operator: "hkkf",
        operatorName: "港九小輪",
        routeCode: "1",
        direction: "outbound",
        title: "中環 → 索罟灣",
        from: "中環",
        to: "索罟灣",
        pier: "中環 4 號碼頭",
      },
      {
        id: "hkkf-pc-out",
        operator: "hkkf",
        operatorName: "港九小輪",
        routeCode: "3",
        direction: "outbound",
        title: "中環 → 坪洲",
        from: "中環",
        to: "坪洲",
        pier: "中環 4 號碼頭",
      },
    ],
  },
  {
    id: "tst",
    name: "尖沙咀碼頭",
    nameEn: "Tsim Sha Tsui",
    lat: 22.2938,
    lng: 114.1682,
    legs: [
      {
        id: "star-tst-central",
        operator: "starferry",
        operatorName: "天星小輪",
        routeCode: "STAR-TST-CE",
        title: "尖沙咀 ⇆ 中環",
        from: "尖沙咀",
        to: "中環",
        pier: "尖沙咀天星碼頭",
      },
      {
        id: "star-tst-wanchai",
        operator: "starferry",
        operatorName: "天星小輪",
        routeCode: "STAR-TST-WC",
        title: "尖沙咀 ⇆ 灣仔",
        from: "尖沙咀",
        to: "灣仔",
        pier: "尖沙咀天星碼頭",
      },
    ],
  },
  {
    id: "wanchai",
    name: "灣仔碼頭",
    nameEn: "Wan Chai",
    lat: 22.2822,
    lng: 114.1735,
    legs: [
      {
        id: "star-wc-tst",
        operator: "starferry",
        operatorName: "天星小輪",
        routeCode: "STAR-WC-TST",
        title: "灣仔 ⇆ 尖沙咀",
        from: "灣仔",
        to: "尖沙咀",
        pier: "灣仔碼頭",
      },
    ],
  },
  {
    id: "northpoint",
    name: "北角碼頭",
    nameEn: "North Point",
    lat: 22.2936,
    lng: 114.2002,
    legs: [
      {
        id: "sun-nphh",
        operator: "sunferry",
        operatorName: "新渡輪",
        routeCode: "NPHH",
        title: "北角 → 紅磡",
        from: "北角",
        to: "紅磡",
        pier: "北角碼頭",
      },
    ],
  },
  {
    id: "hunghom",
    name: "紅磡碼頭",
    nameEn: "Hung Hom",
    lat: 22.3012,
    lng: 114.1895,
    legs: [
      {
        id: "sun-hhnp",
        operator: "sunferry",
        operatorName: "新渡輪",
        routeCode: "HHNP",
        title: "紅磡 → 北角",
        from: "紅磡",
        to: "北角",
        pier: "紅磡碼頭",
      },
    ],
  },
  {
    id: "cheungchau",
    name: "長洲碼頭",
    nameEn: "Cheung Chau",
    lat: 22.2082,
    lng: 114.0286,
    legs: [
      {
        id: "sun-ccce",
        operator: "sunferry",
        operatorName: "新渡輪",
        routeCode: "CCCE",
        title: "長洲 → 中環",
        from: "長洲",
        to: "中環",
        pier: "長洲碼頭",
      },
    ],
  },
  {
    id: "muiwo",
    name: "梅窩碼頭",
    nameEn: "Mui Wo",
    lat: 22.2645,
    lng: 114.0012,
    legs: [
      {
        id: "sun-mwce",
        operator: "sunferry",
        operatorName: "新渡輪",
        routeCode: "MWCE",
        title: "梅窩 → 中環",
        from: "梅窩",
        to: "中環",
        pier: "梅窩碼頭",
      },
      {
        id: "dbtsl-mw-db",
        operator: "dbtsl",
        operatorName: "愉景灣航運",
        routeCode: "DB-MW",
        title: "梅窩 → 愉景灣",
        from: "梅窩",
        to: "愉景灣",
        pier: "梅窩碼頭",
        vesselHint: "ordinary",
      },
    ],
  },
  {
    id: "discoverybay",
    name: "愉景灣碼頭",
    nameEn: "Discovery Bay",
    lat: 22.2972,
    lng: 114.0168,
    legs: [
      {
        id: "dbtsl-db-ce",
        operator: "dbtsl",
        operatorName: "愉景灣航運",
        routeCode: "DB-CE",
        title: "愉景灣 → 中環",
        from: "愉景灣",
        to: "中環",
        pier: "愉景灣碼頭",
        vesselHint: "fast",
      },
      {
        id: "dbtsl-db-mw",
        operator: "dbtsl",
        operatorName: "愉景灣航運",
        routeCode: "DB-MW",
        title: "愉景灣 → 梅窩",
        from: "愉景灣",
        to: "梅窩",
        pier: "愉景灣碼頭",
        vesselHint: "ordinary",
      },
      {
        id: "dbtsl-db-pc",
        operator: "dbtsl",
        operatorName: "愉景灣航運",
        routeCode: "DB-PC",
        title: "愉景灣 → 坪洲",
        from: "愉景灣",
        to: "坪洲",
        pier: "愉景灣碼頭",
        vesselHint: "ordinary",
      },
    ],
  },
  {
    id: "yungshuewan",
    name: "榕樹灣碼頭",
    nameEn: "Yung Shue Wan",
    lat: 22.2265,
    lng: 114.1098,
    legs: [
      {
        id: "hkkf-ysk-in",
        operator: "hkkf",
        operatorName: "港九小輪",
        routeCode: "2",
        direction: "inbound",
        title: "榕樹灣 → 中環",
        from: "榕樹灣",
        to: "中環",
        pier: "榕樹灣碼頭",
      },
    ],
  },
  {
    id: "sokkwuwan",
    name: "索罟灣碼頭",
    nameEn: "Sok Kwu Wan",
    lat: 22.2068,
    lng: 114.1385,
    legs: [
      {
        id: "hkkf-skw-in",
        operator: "hkkf",
        operatorName: "港九小輪",
        routeCode: "1",
        direction: "inbound",
        title: "索罟灣 → 中環",
        from: "索罟灣",
        to: "中環",
        pier: "索罟灣碼頭",
      },
    ],
  },
  {
    id: "pengchau",
    name: "坪洲碼頭",
    nameEn: "Peng Chau",
    lat: 22.2858,
    lng: 114.0385,
    legs: [
      {
        id: "hkkf-pc-in",
        operator: "hkkf",
        operatorName: "港九小輪",
        routeCode: "3",
        direction: "inbound",
        title: "坪洲 → 中環",
        from: "坪洲",
        to: "中環",
        pier: "坪洲碼頭",
      },
      {
        id: "dbtsl-pc-db",
        operator: "dbtsl",
        operatorName: "愉景灣航運",
        routeCode: "DB-PC",
        title: "坪洲 → 愉景灣",
        from: "坪洲",
        to: "愉景灣",
        pier: "坪洲碼頭",
        vesselHint: "ordinary",
      },
    ],
  },
];

export function ferryHub(id: string): FerryHub | undefined {
  return FERRY_HUBS.find((h) => h.id === id);
}
