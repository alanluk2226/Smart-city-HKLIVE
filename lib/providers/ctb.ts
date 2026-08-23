import { cached, TTL } from "@/lib/cache";
import { etaMinutesFromIso, formatEtaClock } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import type { EtaResult, RouteHit, StopHit } from "@/lib/types";

const BASE = "https://rt.data.gov.hk/v2/transport/citybus";
const OPERATOR_NAME = "城巴";

type CtbList<T> = { data: T[] };
type CtbOne<T> = { data: T };

type CtbRoute = {
  route: string;
  orig_tc: string;
  dest_tc: string;
};

type CtbRouteStop = {
  route: string;
  dir: string;
  seq: number;
  stop: string;
};

type CtbStop = {
  stop: string;
  name_tc: string;
  lat: string;
  long: string;
};

type CtbEta = {
  route: string;
  dest_tc: string;
  eta: string | null;
  rmk_tc: string;
  dir: string;
};

export async function ctbRoutes(): Promise<CtbRoute[]> {
  return cached("ctb:routes", TTL.route, async () => {
    const json = await fetchJson<CtbList<CtbRoute>>(`${BASE}/route/ctb`);
    return json.data;
  });
}

export async function searchCtbRoutes(q: string): Promise<RouteHit[]> {
  const needle = q.trim().toUpperCase();
  if (!needle) return [];
  const routes = await ctbRoutes();
  const matched = routes.filter(
    (r) => r.route.toUpperCase() === needle || r.route.toUpperCase().startsWith(needle),
  );
  const hits: RouteHit[] = [];
  for (const r of matched.slice(0, 10)) {
    hits.push({
      operator: "ctb",
      operatorName: OPERATOR_NAME,
      route: r.route,
      orig: r.orig_tc,
      dest: r.dest_tc,
      bound: "O",
      subtitle: `${r.orig_tc} → ${r.dest_tc}`,
    });
    hits.push({
      operator: "ctb",
      operatorName: OPERATOR_NAME,
      route: r.route,
      orig: r.dest_tc,
      dest: r.orig_tc,
      bound: "I",
      subtitle: `${r.dest_tc} → ${r.orig_tc}`,
    });
  }
  return hits;
}

export async function ctbRouteStops(route: string, bound: string): Promise<StopHit[]> {
  const dir = bound === "I" ? "inbound" : "outbound";
  const json = await cached(`ctb:rs:${route}:${dir}`, TTL.stop, () =>
    fetchJson<CtbList<CtbRouteStop>>(
      `${BASE}/route-stop/ctb/${encodeURIComponent(route)}/${dir}`,
    ),
  );
  const stops = await Promise.all(
    json.data.map(async (item) => {
      const stop = await cached(`ctb:stop:${item.stop}`, TTL.stop, () =>
        fetchJson<CtbOne<CtbStop>>(`${BASE}/stop/${item.stop}`),
      );
      return {
        operator: "ctb" as const,
        operatorName: OPERATOR_NAME,
        stopId: item.stop,
        name: stop.data.name_tc,
        seq: Number(item.seq),
        lat: Number(stop.data.lat),
        lng: Number(stop.data.long),
        route,
        bound,
      };
    }),
  );
  return stops;
}

export async function ctbStopEta(
  stopId: string,
  route: string,
  stopName = "",
): Promise<EtaResult[]> {
  const json = await cached(`ctb:eta:${stopId}:${route}`, TTL.eta, () =>
    fetchJson<CtbList<CtbEta>>(`${BASE}/eta/ctb/${stopId}/${encodeURIComponent(route)}`),
  );
  return json.data.map((row) => ({
    operator: "ctb",
    operatorName: OPERATOR_NAME,
    route: row.route,
    dest: row.dest_tc,
    stopId,
    stopName,
    etaMinutes: etaMinutesFromIso(row.eta),
    etaTime: formatEtaClock(row.eta),
    remark: row.rmk_tc || undefined,
  }));
}
