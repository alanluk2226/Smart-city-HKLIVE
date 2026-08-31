import { cached, TTL } from "@/lib/cache";
import { fetchText } from "@/lib/http";
import { racecourseStatus } from "@/lib/providers/racecourse";
import { planMtrRoute } from "@/lib/static/mtr-graph";
import { MTR_LINE_NAMES, mtrName } from "@/lib/static/mtr-stations";
import type { MtrCarLoad, MtrTripLeg, MtrTripPlan } from "@/lib/types";

const STATIONS_CSV = "https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv";
const FARES_CSV = "https://opendata.mtr.com.hk/data/mtr_lines_fares.csv";
const AEL_FARES_CSV = "https://opendata.mtr.com.hk/data/airport_express_fares.csv";

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

function col(header: string[], name: string) {
  return header.findIndex((h) => h.replace(/"/g, "").trim() === name);
}

async function stationIds(): Promise<Map<string, number>> {
  return cached("mtr:station-ids", TTL.route, async () => {
    const rows = parseCsv(await fetchText(STATIONS_CSV, 20_000));
    const header = rows[0] ?? [];
    const codeI = col(header, "Station Code");
    const idI = col(header, "Station ID");
    const map = new Map<string, number>();
    for (const row of rows.slice(1)) {
      const code = row[codeI]?.trim();
      const id = num(row[idI]);
      if (code && id != null) map.set(code, id);
    }
    return map;
  });
}

async function heavyFares(): Promise<Map<string, FareRow>> {
  return cached("mtr:fares", TTL.route, async () => {
    const rows = parseCsv(await fetchText(FARES_CSV, 20_000));
    const header = rows[0] ?? [];
    const src = col(header, "SRC_STATION_ID");
    const dest = col(header, "DEST_STATION_ID");
    const adult = col(header, "OCT_ADT_FARE");
    const student = col(header, "OCT_STD_FARE");
    const elderly = col(header, "OCT_CON_ELDERLY_FARE");
    const map = new Map<string, FareRow>();
    for (const row of rows.slice(1)) {
      const a = num(row[src]);
      const b = num(row[dest]);
      if (a == null || b == null) continue;
      map.set(`${a}-${b}`, {
        adult: num(row[adult]),
        student: num(row[student]),
        elderly: num(row[elderly]),
      });
    }
    return map;
  });
}

async function aelFares(): Promise<Map<string, FareRow>> {
  return cached("mtr:ael-fares", TTL.route, async () => {
    const rows = parseCsv(await fetchText(AEL_FARES_CSV, 20_000));
    const header = rows[0] ?? [];
    const src = col(header, "ST_FROM_ID");
    const dest = col(header, "ST_TO_ID");
    const adult = col(header, "OCT_ADT_FARE");
    const child = col(header, "OCT_CHD_FARE");
    const map = new Map<string, FareRow>();
    for (const row of rows.slice(1)) {
      const a = num(row[src]);
      const b = num(row[dest]);
      if (a == null || b == null) continue;
      map.set(`${a}-${b}`, {
        adult: num(row[adult]),
        student: num(row[child]),
        elderly: null,
      });
    }
    return map;
  });
}

function addFares(a: FareRow | null, b: FareRow | null): FareRow | null {
  if (!a && !b) return null;
  const sum = (x: number | null, y: number | null) =>
    x == null && y == null ? null : (x ?? 0) + (y ?? 0);
  return {
    adult: sum(a?.adult ?? null, b?.adult ?? null),
    student: sum(a?.student ?? null, b?.student ?? null),
    elderly: sum(a?.elderly ?? null, b?.elderly ?? null),
  };
}

function lookup(table: Map<string, FareRow>, ids: Map<string, number>, from: string, to: string) {
  const a = ids.get(from);
  const b = ids.get(to);
  if (a == null || b == null) return null;
  return table.get(`${a}-${b}`) ?? null;
}

function hongKongNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
}

function isPeakHour(now = hongKongNow()) {
  const day = now.getDay();
  const hour = now.getHours() + now.getMinutes() / 60;
  if (day === 0) return false;
  if (day === 6) return hour >= 17 && hour < 20;
  return (hour >= 7.5 && hour < 9.5) || (hour >= 17.5 && hour < 19.5);
}

function carCount(line: string) {
  if (line === "SIL") return 3;
  if (line === "DRL") return 4;
  if (line === "EAL") return 9;
  return 8;
}

function crowdingFor(line: string, peak: boolean) {
  const n = carCount(line);
  const cars: MtrCarLoad[] = Array.from({ length: n }, (_, i) => {
    const t = n <= 1 ? 0.5 : i / (n - 1);
    const mid = Math.abs(t - 0.5);
    let level: MtrCarLoad["level"] = 1;
    if (peak) {
      if (mid < 0.18) level = 4;
      else if (mid < 0.32) level = 3;
      else if (mid < 0.42) level = 2;
      else level = 1;
    } else {
      level = mid < 0.22 ? 2 : 1;
    }
    return { car: i + 1, level };
  });
  const min = Math.min(...cars.map((c) => c.level));
  const emptier = cars.filter((c) => c.level === min).map((c) => c.car);
  const note = peak
    ? "繁忙時段月台中間對應的中卡較擠，頭尾卡通常較多空位。"
    : "非繁忙時段各卡相差不大，仍可優先選頭尾卡。";
  return {
    line,
    lineName: MTR_LINE_NAMES[line] ?? line,
    peak,
    cars,
    emptier,
    note: `${note}港鐵未公開即時車廂感應數據，以上為按時段的參考。`,
  };
}

function walkMate(legs: MtrTripLeg[], end: "from" | "to") {
  if (end === "from") {
    return legs.find((l) => l.line === "WALK" && l.from === "WEK")?.to ?? "AUS";
  }
  return [...legs].reverse().find((l) => l.line === "WALK" && l.to === "WEK")?.from ?? "AUS";
}

export async function mtrTrip(from: string, to: string): Promise<MtrTripPlan> {
  const route = planMtrRoute(from, to);
  if (!route) throw new Error("未能規劃此行程，請另選車站");

  const racTrip = from === "RAC" || to === "RAC";
  const [ids, heavy, ael, rac] = await Promise.all([
    stationIds(),
    heavyFares(),
    aelFares(),
    racTrip ? racecourseStatus().catch(() => null) : Promise.resolve(null),
  ]);
  const aelLegs = route.legs.filter((l) => l.line === "AEL");
  const heavyLegs = route.legs.filter((l) => l.line !== "AEL" && l.line !== "WALK");

  let fares: FareRow | null = null;
  let studentLabel = "學生";
  let elderlyLabel = "長者";
  let fareNote: string | undefined;

  if (aelLegs.length && heavyLegs.length) {
    const aelSeg = aelLegs[0];
    const heavyFrom = heavyLegs[0].from;
    const heavyTo = heavyLegs[heavyLegs.length - 1].to;
    fares = addFares(
      lookup(ael, ids, aelSeg.from, aelSeg.to),
      lookup(heavy, ids, heavyFrom, heavyTo),
    );
    studentLabel = "學生／小童";
    fareNote = "機場快線以小童票顯示；長者優惠只適用於本地綫路段。";
  } else if (aelLegs.length) {
    fares = lookup(ael, ids, from, to) ?? lookup(ael, ids, aelLegs[0].from, aelLegs[0].to);
    studentLabel = "小童";
    elderlyLabel = "長者";
    fareNote = "機場快線公開資料沒有長者八達通票價，請以閘機為準。";
  } else {
    const fareFrom = from === "WEK" ? walkMate(route.legs, "from") : from;
    const fareTo = to === "WEK" ? walkMate(route.legs, "to") : to;
    fares = lookup(heavy, ids, fareFrom, fareTo);
    if (from === "WEK" || to === "WEK") {
      fareNote = "港鐵車費計至柯士甸或九龍；高鐵車票另計，須步行進出香港西九龍站。";
    }
  }

  if (racTrip) {
    const racNote =
      rac && !rac.open
        ? "馬場站現時未開放，東鐵線列車 100% 經火炭站，不停馬場。請改選火炭，或待賽馬日再開。"
        : "馬場站僅賽馬日停靠；非賽馬時段列車全部經火炭站。";
    fareNote = fareNote ? `${fareNote} ${racNote}` : racNote;
  }

  const peak = isPeakHour();
  const legs = route.legs.map((leg) =>
    leg.line === "WALK"
      ? leg
      : {
          ...leg,
          minutes: Math.max(1, Math.round(leg.minutes)),
          interchangeBeforeMin:
            leg.interchangeBeforeMin != null
              ? Math.max(1, Math.round(leg.interchangeBeforeMin))
              : undefined,
          crowding: crowdingFor(leg.line, peak),
        },
  );
  const board = legs.find((l) => l.line !== "WALK") ?? legs[0];

  return {
    from,
    to,
    fromName: mtrName(from),
    toName: mtrName(to),
    minutes: route.minutes,
    rideMinutes: route.rideMinutes,
    transferMinutes: route.transferMinutes,
    waitMinutes: Math.round(route.waitMinutes),
    interchangeCount: route.interchangeCount,
    legs,
    fares: {
      adult: fares?.adult ?? null,
      student: fares?.student ?? null,
      elderly: fares?.elderly ?? null,
      studentLabel,
      elderlyLabel,
      note: fareNote,
    },
    crowding: board.crowding ?? crowdingFor(board.line === "WALK" ? "TML" : board.line, peak),
  };
}
