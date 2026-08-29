import { inferDistanceToStop } from "@/lib/bus-distance";
import { cached, TTL } from "@/lib/cache";
import { formatEtaClock, haversineMeters } from "@/lib/geo";
import { fetchText } from "@/lib/http";
import { rankNearby } from "@/lib/nearby";
import type { EtaResult, RouteHit, StopHit } from "@/lib/types";

const ROUTES_URL = "https://opendata.mtr.com.hk/data/mtr_bus_routes.csv";
const STOPS_URL = "https://opendata.mtr.com.hk/data/mtr_bus_stops.csv";
const SCHEDULE_URL = "https://rt.data.gov.hk/v1/transport/mtr/bus/getSchedule";
const OPERATOR_NAME = "港鐵巴士";

type MtrBusRouteRow = {
  route: string;
  nameZh: string;
  nameEn: string;
  circular: boolean;
  lineUp: string;
  lineDown: string;
  referenceId: string;
};

type MtrBusStopRow = {
  route: string;
  bound: "O" | "I";
  seq: number;
  stopId: string;
  lat: number;
  lng: number;
  name: string;
  nameEn: string;
  referenceId: string;
};

type ScheduleBus = {
  arrivalTimeInSecond?: string;
  arrivalTimeText?: string;
  departureTimeInSecond?: string;
  departureTimeText?: string;
  isScheduled?: string;
  lineRef?: string;
  busLocation?: { latitude?: number; longitude?: number };
};

type ScheduleStop = {
  busStopId: string;
  bus?: ScheduleBus[] | null;
  isSuspended?: string;
  busStopStatusRemarkContent?: string | null;
};

type ScheduleResponse = {
  status?: string | number;
  routeName?: string;
  busStop?: ScheduleStop[];
  routeStatusRemarkContent?: string | null;
};

function parseCsv(text: string): string[][] {
  return text
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(","))
    .filter((row) => row[0]?.trim());
}

async function mtrBusRoutes(): Promise<MtrBusRouteRow[]> {
  return cached("mtrb:routes", TTL.route, async () => {
    const text = await fetchText(ROUTES_URL, 20_000);
    return parseCsv(text)
      .filter((row) => row.length >= 7)
      .map((row) => ({
        route: row[0].trim(),
        nameZh: row[1].trim(),
        nameEn: row[2].trim(),
        circular: row[3].trim() === "1",
        lineUp: row[4].trim(),
        lineDown: row[5].trim(),
        referenceId: row[6].trim(),
      }))
      .filter((row) => row.route && row.referenceId);
  });
}

async function mtrBusStopRows(): Promise<MtrBusStopRow[]> {
  return cached("mtrb:stop-rows", TTL.stop, async () => {
    const text = await fetchText(STOPS_URL, 20_000);
    return parseCsv(text)
      .filter((row) => row.length >= 9)
      .map((row) => ({
        route: row[0].trim(),
        bound: (row[1].trim() === "I" ? "I" : "O") as "O" | "I",
        seq: Number(row[2]),
        stopId: row[3].trim(),
        lat: Number(row[4]),
        lng: Number(row[5]),
        name: row[6].trim(),
        nameEn: row[7].trim(),
        referenceId: row[8].trim(),
      }))
      .filter(
        (row) =>
          row.stopId &&
          Number.isFinite(row.lat) &&
          Number.isFinite(row.lng) &&
          Number.isFinite(row.seq),
      );
  });
}

function splitRouteName(nameZh: string): { orig: string; dest: string } {
  const parts = nameZh.split("至").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return { orig: parts[0], dest: parts[parts.length - 1] };
  return { orig: nameZh, dest: nameZh };
}

export async function searchMtrBusRoutes(q: string): Promise<RouteHit[]> {
  const needle = q.trim().toUpperCase();
  if (!needle) return [];
  const routes = await mtrBusRoutes();
  const stops = await mtrBusStopRows();
  const matched = routes
    .filter(
      (r) =>
        r.route.toUpperCase() === needle ||
        r.route.toUpperCase().startsWith(needle) ||
        r.referenceId.toUpperCase() === needle,
    )
    .sort((a, b) => {
      const ae = a.route.toUpperCase() === needle ? 0 : 1;
      const be = b.route.toUpperCase() === needle ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.route.localeCompare(b.route, "en", { numeric: true });
    })
    .slice(0, 12);

  const hits: RouteHit[] = [];
  for (const r of matched) {
    const bounds = [...new Set(stops.filter((s) => s.referenceId === r.referenceId).map((s) => s.bound))];
    for (const bound of bounds.length ? bounds : (["O"] as const)) {
      const { orig, dest } = splitRouteName(r.nameZh);
      const from = bound === "O" ? orig : dest;
      const to = bound === "O" ? dest : orig;
      hits.push({
        operator: "mtrb",
        operatorName: OPERATOR_NAME,
        route: r.route,
        orig: from,
        dest: to,
        bound,
        routeId: r.referenceId,
        serviceType: r.referenceId.includes("-") ? String(Number(r.referenceId.split("-")[1] ?? 0) + 1) : "1",
        subtitle: `${from} → ${to}${r.circular ? "（循環）" : ""}`,
      });
    }
  }
  return hits.slice(0, 24);
}

export async function mtrBusRouteStops(route: string, bound: string, routeId?: string): Promise<StopHit[]> {
  const rows = await mtrBusStopRows();
  const dir = bound === "I" ? "I" : "O";
  const filtered = rows.filter((row) => {
    if (row.bound !== dir) return false;
    if (routeId) return row.referenceId === routeId;
    return row.route === route;
  });
  return filtered
    .sort((a, b) => a.seq - b.seq)
    .map((row) => ({
      operator: "mtrb" as const,
      operatorName: OPERATOR_NAME,
      stopId: row.stopId,
      name: row.name,
      seq: row.seq,
      lat: row.lat,
      lng: row.lng,
      route: row.route,
      bound: row.bound,
      routeId: row.referenceId,
    }));
}

export async function nearbyMtrBusStops(lat: number, lng: number, limit = 5): Promise<StopHit[]> {
  const rows = await mtrBusStopRows();
  const byId = new Map<string, StopHit & { _routes: Set<string> }>();
  for (const row of rows) {
    const existing = byId.get(row.stopId);
    if (existing) {
      existing._routes.add(row.route);
      continue;
    }
    byId.set(row.stopId, {
      operator: "mtrb",
      operatorName: OPERATOR_NAME,
      stopId: row.stopId,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      route: row.route,
      routeId: row.referenceId,
      bound: row.bound,
      _routes: new Set([row.route]),
    });
  }
  const unique = [...byId.values()].map(({ _routes, ...stop }) => ({
    ...stop,
    routeIds: [..._routes],
  }));
  return rankNearby(unique, lat, lng, limit);
}

async function fetchSchedule(routeName: string): Promise<ScheduleResponse> {
  return cached(`mtrb:eta:${routeName}`, TTL.eta, async () => {
    const res = await fetch(SCHEDULE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "hk-city-live/0.1 (Hong Kong open data dashboard)",
      },
      body: JSON.stringify({ language: "zh", routeName }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for MTR bus schedule`);
    return (await res.json()) as ScheduleResponse;
  });
}

function minutesFromSeconds(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n >= 100_000) return null;
  return Math.max(0, Math.round(n / 60));
}

function clockFromSeconds(raw: string | undefined): string | null {
  const mins = minutesFromSeconds(raw);
  if (mins == null) return null;
  const d = new Date(Date.now() + mins * 60_000);
  return formatEtaClock(d.toISOString());
}

function etaFromBus(bus: ScheduleBus, isFirstStop: boolean): { minutes: number | null; time: string | null; remark?: string } {
  const arrivalMins = minutesFromSeconds(bus.arrivalTimeInSecond);
  const departMins = minutesFromSeconds(bus.departureTimeInSecond);
  const minutes = isFirstStop ? (departMins ?? arrivalMins) : (arrivalMins ?? departMins);
  const time = isFirstStop
    ? clockFromSeconds(bus.departureTimeInSecond) ?? clockFromSeconds(bus.arrivalTimeInSecond)
    : clockFromSeconds(bus.arrivalTimeInSecond) ?? clockFromSeconds(bus.departureTimeInSecond);
  const text = isFirstStop ? bus.departureTimeText : bus.arrivalTimeText;
  const remark =
    bus.isScheduled === "1"
      ? "預定班次"
      : text && /即將|離開|開出/.test(text)
        ? text
        : undefined;
  return { minutes, time, remark };
}

export async function mtrBusStopEta(
  stopId: string,
  stopName = "",
  route?: string,
): Promise<EtaResult[]> {
  const [rows, routes] = await Promise.all([mtrBusStopRows(), mtrBusRoutes()]);
  const serving = rows.filter((row) => row.stopId === stopId);
  const routeNames = [
    ...new Set(
      (route ? serving.filter((row) => row.route === route) : serving).map((row) => row.route),
    ),
  ];
  if (!routeNames.length && route) routeNames.push(route);
  if (!routeNames.length) return [];

  const batches = await Promise.all(
    routeNames.map(async (routeName) => {
      try {
        const schedule = await fetchSchedule(routeName);
        const stop = schedule.busStop?.find((s) => s.busStopId === stopId);
        if (!stop) return [] as EtaResult[];
        const stopMeta = serving.find((row) => row.route === routeName) ?? serving[0];
        const routeMeta = routes.find((r) => r.route === routeName && (!stopMeta?.referenceId || r.referenceId === stopMeta.referenceId))
          ?? routes.find((r) => r.route === routeName);
        const { orig, dest: routeDest } = splitRouteName(routeMeta?.nameZh ?? routeName);
        const dest = stopMeta?.bound === "I" ? orig : routeDest;
        if (stop.isSuspended === "1") {
          return [
            {
              operator: "mtrb" as const,
              operatorName: OPERATOR_NAME,
              route: routeName,
              dest,
              stopId,
              stopName,
              etaMinutes: null,
              etaTime: null,
              remark: stop.busStopStatusRemarkContent || "暫停服務",
            },
          ];
        }
        const isFirst = schedule.busStop?.[0]?.busStopId === stopId;
        const stopLat = stopMeta?.lat;
        const stopLng = stopMeta?.lng;
        return (stop.bus ?? []).map((bus) => {
          const eta = etaFromBus(bus, isFirst);
          const lat = Number(bus.busLocation?.latitude);
          const lng = Number(bus.busLocation?.longitude);
          let distanceMeters: number | null = null;
          let distanceEstimate = true;
          if (
            stopLat != null &&
            stopLng != null &&
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            (lat !== 0 || lng !== 0)
          ) {
            distanceMeters = Math.round(haversineMeters(lat, lng, stopLat, stopLng));
            distanceEstimate = false;
          } else {
            const dist = inferDistanceToStop([], [], 1, eta.minutes);
            distanceMeters = dist ? Math.round(dist.meters) : null;
          }
          return {
            operator: "mtrb" as const,
            operatorName: OPERATOR_NAME,
            route: routeName,
            dest,
            stopId,
            stopName,
            etaMinutes: eta.minutes,
            etaTime: eta.time,
            remark: eta.remark,
            distanceMeters,
            distanceEstimate,
          };
        });
      } catch {
        return [] as EtaResult[];
      }
    }),
  );

  return batches
    .flat()
    .sort((a, b) => (a.etaMinutes ?? 99) - (b.etaMinutes ?? 99));
}
