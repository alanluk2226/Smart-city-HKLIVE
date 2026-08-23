import { cached, TTL } from "@/lib/cache";
import { fetchText } from "@/lib/http";
import type { HsrBoard, HsrDestGroup, HsrTrain } from "@/lib/types";

const TIMETABLE_URL = "https://www.highspeed.mtr.com.hk/res/content/app/XRL_content_Timetable.json";
const PLANNER_URL = "https://www.highspeed.mtr.com.hk/res/content/XRL_content_TripPlanning.json";

type TimetableTrain = {
  id: string;
  train_model: string;
  start_station_code: string;
  end_station_code: string;
  start_time: string;
  end_time: string;
};

type PlannerFile = {
  station: Array<{
    station_id: string;
    station_title_en: string;
    station_title_tc: string;
    type_id: string;
  }>;
  fee: Array<{
    route_id: string;
    fee_data: Array<{
      fee_date: string;
      fee_detail: Array<{ class_title: string; adult_hkd: number; child_hkd: number }>;
    }>;
  }>;
};

function unwrapTrain(item: Record<string, TimetableTrain>): TimetableTrain | null {
  const rec = Object.values(item)[0];
  return rec?.id && rec.start_time ? rec : null;
}

function parseClock(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function hongKongNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
}

function cleanName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function secondClassFare(
  fees: PlannerFile["fee"],
  dest: string,
  year: number,
  month: number,
): { adult: number | null; child: number | null } {
  const row = fees.find((f) => f.route_id === `WEK2${dest}`);
  if (!row?.fee_data.length) return { adult: null, child: null };
  const wanted = `${year},${month}`;
  const block =
    row.fee_data.find((d) => d.fee_date === wanted) ?? row.fee_data[row.fee_data.length - 1];
  const second = block.fee_detail.find((d) => d.class_title === "second_class") ?? block.fee_detail[0];
  return {
    adult: second?.adult_hkd ?? null,
    child: second?.child_hkd ?? null,
  };
}

export async function hsrFromWestKowloon(): Promise<HsrBoard> {
  const [ttRaw, planRaw] = await Promise.all([
    cached("hsr:timetable", TTL.hsr, () => fetchText(TIMETABLE_URL, 20_000)),
    cached("hsr:planner", TTL.hsr, () => fetchText(PLANNER_URL, 20_000)),
  ]);
  const tt = JSON.parse(ttRaw.replace(/^\uFEFF/, "")) as {
    effective_from?: string;
    effective_to?: string;
    routes: Array<Record<string, TimetableTrain>>;
  };
  const plan = JSON.parse(planRaw.replace(/^\uFEFF/, "")) as PlannerFile;
  const names = new Map(plan.station.map((s) => [s.station_id, s]));
  const now = hongKongNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const grouped = new Map<string, HsrTrain[]>();

  for (const item of tt.routes ?? []) {
    const rec = unwrapTrain(item);
    if (!rec || rec.start_station_code !== "WEK") continue;
    const departMin = parseClock(rec.start_time);
    const arriveMin = parseClock(rec.end_time);
    if (departMin == null || arriveMin == null) continue;
    let minutesUntil = departMin - nowMin;
    let tomorrow = false;
    if (minutesUntil < -5) {
      minutesUntil += 24 * 60;
      tomorrow = true;
    }
    if (minutesUntil < 0) minutesUntil = 0;
    const durationMin = (arriveMin - departMin + 24 * 60) % (24 * 60);
    const train: HsrTrain = {
      id: rec.id,
      depart: rec.start_time,
      arrive: rec.end_time,
      minutesUntil,
      durationMin,
      vibrant: rec.train_model === "M",
      tomorrow,
    };
    const list = grouped.get(rec.end_station_code) ?? [];
    list.push(train);
    grouped.set(rec.end_station_code, list);
  }

  const groups: HsrDestGroup[] = [...grouped.entries()]
    .map(([dest, trains]) => {
      const meta = names.get(dest);
      const fare = secondClassFare(plan.fee, dest, now.getFullYear(), now.getMonth() + 1);
      const upcoming = trains
        .filter((t) => !t.tomorrow)
        .sort((a, b) => a.minutesUntil - b.minutesUntil);
      const later = trains
        .filter((t) => t.tomorrow)
        .sort((a, b) => a.minutesUntil - b.minutesUntil);
      return {
        dest,
        destName: cleanName(meta?.station_title_tc ?? dest),
        destEn: cleanName(meta?.station_title_en ?? dest),
        shortHaul: meta?.type_id !== "LHT",
        fareAdult: fare.adult,
        fareChild: fare.child,
        trains: [...upcoming, ...later].slice(0, 6),
      };
    })
    .filter((g) => g.trains.length)
    .sort((a, b) => {
      if (a.shortHaul !== b.shortHaul) return a.shortHaul ? -1 : 1;
      return (a.trains[0]?.minutesUntil ?? 9999) - (b.trains[0]?.minutesUntil ?? 9999);
    });

  return {
    fromName: "香港西九龍",
    fromNameEn: "Hong Kong West Kowloon",
    effectiveFrom: tt.effective_from ?? "",
    effectiveTo: tt.effective_to ?? "",
    access: "此站不是港鐵重鐵站。請由柯士甸站（屯馬線）或九龍站（東涌線／機場快線）步行前往，再乘高鐵往內地。",
    groups,
  };
}
