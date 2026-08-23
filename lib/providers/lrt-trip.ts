import { cached, TTL } from "@/lib/cache";
import { fetchText } from "@/lib/http";
import { planLrtRoute } from "@/lib/static/lrt-graph";
import { lrtName } from "@/lib/static/lrt-stations";
import type { MtrCarLoad, MtrTripPlan } from "@/lib/types";

const FARES_CSV = "https://opendata.mtr.com.hk/data/light_rail_fares.csv";

type FareRow = {
  adult: number | null;
  student: number | null;
  elderly: number | null;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

function num(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fares(): Promise<Map<string, FareRow>> {
  return cached("lrt:fares", TTL.route, async () => {
    const rows = parseCsv(await fetchText(FARES_CSV, 20_000));
    const header = (rows[0] ?? []).map((h) => h.replace(/"/g, "").trim());
    const fromI = header.findIndex((h) => h.includes("from_station"));
    const toI = header.findIndex((h) => h.includes("to_station"));
    const adultI = header.findIndex((h) => h === "fare_octo_adult");
    const studentI = header.findIndex((h) => h === "fare_octo_student");
    const elderlyI = header.findIndex((h) => h === "fare_octo_elderly");
    const map = new Map<string, FareRow>();
    for (const row of rows.slice(1)) {
      const from = row[fromI]?.replace(/"/g, "").trim();
      const to = row[toI]?.replace(/"/g, "").trim();
      if (!from || !to) continue;
      map.set(`${from}-${to}`, {
        adult: num(row[adultI]?.replace(/"/g, "")),
        student: num(row[studentI]?.replace(/"/g, "")),
        elderly: num(row[elderlyI]?.replace(/"/g, "")),
      });
    }
    return map;
  });
}

function crowding(): MtrTripPlan["crowding"] {
  const cars: MtrCarLoad[] = [
    { car: 1, level: 2 },
    { car: 2, level: 1 },
  ];
  return {
    line: "LRT",
    lineName: "輕鐵",
    peak: false,
    cars,
    emptier: [2],
    note: "輕鐵列車通常 1 至 2 卡。港鐵未公開即時車廂感應數據，以上為參考。",
  };
}

export async function lrtTrip(from: string, to: string): Promise<MtrTripPlan> {
  const route = planLrtRoute(from, to);
  if (!route) throw new Error("未能規劃此行程，請另選車站");
  const table = await fares();
  const fare = table.get(`${from}-${to}`) ?? table.get(`${to}-${from}`) ?? null;

  return {
    from,
    to,
    fromName: lrtName(from),
    toName: lrtName(to),
    minutes: route.minutes,
    interchangeCount: route.interchangeCount,
    legs: route.legs,
    fares: {
      adult: fare?.adult ?? null,
      student: fare?.student ?? null,
      elderly: fare?.elderly ?? null,
      studentLabel: "學生／小童",
      elderlyLabel: "長者",
      note: "輕鐵八達通車費；同一輕鐵車程內轉路線通常不另收費。",
    },
    crowding: crowding(),
  };
}
