import { cached, TTL } from "@/lib/cache";
import { inferDistanceToStop } from "@/lib/bus-distance";
import { etaMinutesFromIso, formatEtaClock, haversineMeters } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import type { EtaResult, RouteHit, StopHit } from "@/lib/types";

const BASE = "https://data.etabus.gov.hk/v1/transport/kmb";

type KmbList<T> = { data: T[] };

type KmbRoute = {
  route: string;
  bound: "O" | "I";
  service_type: string;
  orig_tc: string;
  dest_tc: string;
};

type KmbStop = {
  stop: string;
  name_tc: string;
  lat: string;
  long: string;
};

type KmbRouteStop = {
  route: string;
  bound: string;
  service_type: string;
  seq: string;
  stop: string;
};

type KmbEta = {
  co: string;
  route: string;
  dir: string;
  service_type: number | string;
  seq: number | string;
  eta_seq: number | string;
  dest_tc: string;
  eta: string | null;
  rmk_tc: string;
};

const OPERATOR_NAME = "九巴／龍運";

function boundLabel(bound: string) {
  return bound === "I" ? "inbound" : "outbound";
}

export async function kmbRoutes(): Promise<KmbRoute[]> {
  return cached("kmb:routes", TTL.route, async () => {
    const json = await fetchJson<KmbList<KmbRoute>>(`${BASE}/route`);
    return json.data;
  });
}

export async function kmbStops(): Promise<KmbStop[]> {
  return cached("kmb:stops", TTL.stop, async () => {
    const json = await fetchJson<KmbList<KmbStop>>(`${BASE}/stop`, 20_000);
    return json.data;
  });
}

export async function searchKmbRoutes(q: string): Promise<RouteHit[]> {
  const needle = q.trim().toUpperCase();
  if (!needle) return [];
  const routes = await kmbRoutes();
  return routes
    .filter((r) => r.route.toUpperCase() === needle || r.route.toUpperCase().startsWith(needle))
    .slice(0, 20)
    .map((r) => ({
      operator: "kmb" as const,
      operatorName: OPERATOR_NAME,
      route: r.route,
      orig: r.orig_tc,
      dest: r.dest_tc,
      bound: r.bound,
      serviceType: r.service_type,
      subtitle: `${r.orig_tc} → ${r.dest_tc}${r.service_type !== "1" ? ` · 特別班 ${r.service_type}` : ""}`,
    }));
}

export async function kmbRouteStops(
  route: string,
  bound: string,
  serviceType: string,
): Promise<StopHit[]> {
  const dir = boundLabel(bound);
  const json = await cached(
    `kmb:rs:${route}:${dir}:${serviceType}`,
    TTL.stop,
    () =>
      fetchJson<KmbList<KmbRouteStop>>(
        `${BASE}/route-stop/${encodeURIComponent(route)}/${dir}/${serviceType}`,
      ),
  );
  const stops = await kmbStops().catch(() => [] as KmbStop[]);
  const byId = new Map(stops.map((s) => [s.stop, s]));
  const rows = await Promise.all(
    json.data.map(async (item) => {
      let stop = byId.get(item.stop);
      if (!stop) {
        const one = await cached(`kmb:stop:${item.stop}`, TTL.stop, () =>
          fetchJson<{ data: KmbStop }>(`${BASE}/stop/${item.stop}`),
        );
        stop = one.data;
      }
      return {
        operator: "kmb" as const,
        operatorName: OPERATOR_NAME,
        stopId: item.stop,
        name: stop?.name_tc ?? item.stop,
        seq: Number(item.seq),
        lat: stop ? Number(stop.lat) : undefined,
        lng: stop ? Number(stop.long) : undefined,
        route,
        bound,
        serviceType,
      };
    }),
  );
  return rows;
}

export async function kmbStopEta(
  stopId: string,
  stopName = "",
  route?: string,
  opts?: { bound?: string; serviceType?: string; seq?: number },
): Promise<EtaResult[]> {
  const json = await cached(`kmb:eta:${stopId}`, TTL.eta, () =>
    fetchJson<KmbList<KmbEta>>(`${BASE}/stop-eta/${stopId}`),
  );
  const needle = route?.trim().toUpperCase();
  let rows = needle ? json.data.filter((row) => row.route.toUpperCase() === needle) : json.data;
  if (opts?.bound) {
    const dir = opts.bound.toUpperCase() === "I" ? "I" : "O";
    const matched = rows.filter((row) => String(row.dir).toUpperCase() === dir);
    if (matched.length) rows = matched;
  }
  if (opts?.serviceType) {
    const matched = rows.filter((row) => String(row.service_type) === String(opts.serviceType));
    if (matched.length) rows = matched;
  }

  const base = rows.map((row) => ({
    operator: "kmb" as const,
    operatorName: OPERATOR_NAME,
    route: row.route,
    dest: row.dest_tc,
    stopId,
    stopName,
    etaMinutes: etaMinutesFromIso(row.eta),
    etaTime: formatEtaClock(row.eta),
    remark: row.rmk_tc || undefined,
    _dir: String(row.dir),
    _serviceType: String(row.service_type),
    _etaSeq: Number(row.eta_seq),
    _seq: Number(row.seq),
  }));

  if (!needle || !opts?.bound || !opts?.serviceType) {
    return base.map(({ _dir, _serviceType, _etaSeq, _seq, ...row }) => row);
  }

  try {
    const [routeStops, routeEta] = await Promise.all([
      kmbRouteStops(needle, opts.bound, opts.serviceType),
      cached(`kmb:route-eta:${needle}:${opts.serviceType}`, TTL.eta, () =>
        fetchJson<KmbList<KmbEta>>(`${BASE}/route-eta/${encodeURIComponent(needle)}/${opts.serviceType}`),
      ),
    ]);
    const points = routeStops
      .filter((s): s is StopHit & { seq: number; lat: number; lng: number } =>
        typeof s.seq === "number" && typeof s.lat === "number" && typeof s.lng === "number",
      )
      .map((s) => ({ seq: s.seq, lat: s.lat, lng: s.lng }));
    const targetSeq = opts.seq ?? base[0]?._seq;
    const dir = opts.bound.toUpperCase() === "I" ? "I" : "O";

    return base.map(({ _dir, _serviceType, _etaSeq, _seq, ...row }) => {
      if (!targetSeq || !Number.isFinite(_etaSeq)) return row;
      const vehicleEtas = routeEta.data
        .filter(
          (e) =>
            String(e.dir).toUpperCase() === dir &&
            Number(e.eta_seq) === _etaSeq &&
            String(e.service_type) === String(opts.serviceType),
        )
        .map((e) => ({
          seq: Number(e.seq),
          etaMinutes: etaMinutesFromIso(e.eta),
        }));
      const dist = inferDistanceToStop(points, vehicleEtas, targetSeq, row.etaMinutes);
      if (!dist) return row;
      return {
        ...row,
        distanceMeters: Math.round(dist.meters),
        distanceEstimate: dist.estimate,
      };
    });
  } catch {
    return base.map(({ _dir, _serviceType, _etaSeq, _seq, ...row }) => {
      const dist = inferDistanceToStop([], [], opts.seq ?? 1, row.etaMinutes);
      if (!dist) return row;
      return {
        ...row,
        distanceMeters: Math.round(dist.meters),
        distanceEstimate: true,
      };
    });
  }
}

export async function nearbyKmbStops(lat: number, lng: number, limit = 12): Promise<StopHit[]> {
  const stops = await kmbStops();
  return stops
    .map((s) => {
      const slat = Number(s.lat);
      const slng = Number(s.long);
      return {
        operator: "kmb" as const,
        operatorName: OPERATOR_NAME,
        stopId: s.stop,
        name: s.name_tc,
        lat: slat,
        lng: slng,
        distanceMeters: haversineMeters(lat, lng, slat, slng),
      };
    })
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))
    .slice(0, limit);
}
