import { cached } from "@/lib/cache";
import { mtrEta } from "@/lib/providers/mtr";
import type { RacecourseStatus } from "@/lib/types";

type Meeting = {
  year: number;
  month: number;
  day: number;
  venue: "ST" | "HV";
  session: "day" | "night" | "twilight";
};

const FIXTURE = "https://racing.hkjc.com/racing/information/English/Racing/Fixture.aspx";
const HOURS = {
  day: { start: 12 * 60, end: 19 * 60, label: "12:00 – 19:00" },
  twilight: { start: 15 * 60, end: 21 * 60, label: "15:00 – 21:00" },
  night: { start: 17 * 60, end: 23 * 60, label: "17:00 – 23:00" },
} as const;

function hongKongNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Hong_Kong" }));
}

function minutesOf(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function parseCalendar(html: string, year: number, month: number): Meeting[] {
  const meetings: Meeting[] = [];
  const cells = html.matchAll(/<td class="calendar">([\s\S]*?)<\/td>/gi);
  for (const cell of cells) {
    const block = cell[1];
    const day = Number(block.match(/f_fs14[^>]*>\s*(\d+)/)?.[1]);
    if (!day) continue;
    const venue = /alt="ST"/i.test(block) ? "ST" : /alt="HV"/i.test(block) ? "HV" : null;
    if (!venue) continue;
    const session: Meeting["session"] = /alt="N"|night\.gif/i.test(block)
      ? "night"
      : /dusk\.gif|alt="T"|twilight/i.test(block)
        ? "twilight"
        : "day";
    meetings.push({ year, month, day, venue, session });
  }
  return meetings;
}

async function fetchFixture(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-HK,en;q=0.9,zh-HK;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function nearbyMeetings(now: Date) {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return cached(`hkjc:fixture:current:v3:${y}-${m}`, 6 * 60 * 60 * 1000, async () => {
    // CalYear/CalMonth query strings return an empty page; the default URL is the current month.
    const html = await fetchFixture(FIXTURE);
    const parsed = parseCalendar(html, y, m);
    if (parsed.length) return parsed;
    throw new Error("HKJC fixture calendar empty");
  }).catch(() => [] as Meeting[]);
}

function meetingAt(list: Meeting[], d: Date) {
  return list.find((x) => x.year === d.getFullYear() && x.month === d.getMonth() + 1 && x.day === d.getDate()) ?? null;
}

function formatMeeting(m: Meeting) {
  const venue = m.venue === "ST" ? "沙田" : "跑馬地";
  const session = m.session === "night" ? "夜賽" : m.session === "twilight" ? "黄昏賽" : "日賽";
  return `${m.month}月${m.day}日${venue}${session}（${HOURS[m.session].label}）`;
}

function nextShaTin(list: Meeting[], now: Date) {
  const todayMin = minutesOf(now);
  const upcoming = list
    .filter((m) => m.venue === "ST")
    .filter((m) => {
      const t = new Date(m.year, m.month - 1, m.day);
      if (t.toDateString() === now.toDateString()) return todayMin < HOURS[m.session].end;
      return t.getTime() > now.getTime();
    })
    .sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
  return upcoming[0] ?? null;
}

export async function racecourseStatus(): Promise<RacecourseStatus> {
  const now = hongKongNow();
  const [meetings, trains] = await Promise.all([
    nearbyMeetings(now),
    mtrEta("EAL", "RAC").catch(() => []),
  ]);
  const today = meetingAt(meetings, now);
  const trainsRunning = trains.length > 0;
  const hours = today?.venue === "ST" ? HOURS[today.session] : null;
  const inHours = hours ? minutesOf(now) >= hours.start && minutesOf(now) <= hours.end : false;
  const open = trainsRunning || (today?.venue === "ST" && inHours);
  const next = nextShaTin(meetings, now);

  let headline = "未開放";
  let detail = "非賽馬時段馬場站全天關閉。東鐵線列車離開大學站後全部經火炭站，不停馬場，再在沙田站匯合。";

  if (open) {
    headline = "現正開放";
    detail = `今日沙田${today?.session === "night" ? "夜賽" : today?.session === "twilight" ? "黄昏賽" : "日賽"}，馬場站有東鐵線列車停靠。營運時間約 ${hours?.label ?? "賽事期間"}。`;
  } else if (today?.venue === "ST" && hours && minutesOf(now) < hours.start) {
    headline = "稍後開放";
    detail = `今日沙田有賽事，馬場站預計約 ${hours.label} 營運。現時列車仍全部經火炭站。`;
  } else if (today?.venue === "HV") {
    headline = "未開放（跑馬地賽事）";
    detail =
      "今日賽事在跑馬地馬場舉行，沙田馬場站不開放。東鐵線列車離開大學站後 100% 經火炭站，不停馬場。";
  }

  return {
    open,
    trainsRunning,
    venue: today?.venue ?? null,
    session: today?.session ?? null,
    hours: hours?.label ?? null,
    headline,
    detail,
    nextOpen: !open
      ? next
        ? `下次預計開放：${formatMeeting(next)}`
        : "下次預計開放：通常為下一個沙田日賽（星期日或少數星期六 12:00 – 19:00），請以賽馬會賽期表為準"
      : null,
  };
}
