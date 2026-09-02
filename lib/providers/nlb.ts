import { inferDistanceToStop } from "@/lib/bus-distance";
import { cached, TTL } from "@/lib/cache";
import { etaMinutesFromIso, formatEtaClock } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { rankNearby } from "@/lib/nearby";
import type { EtaResult, RouteHit, StopHit } from "@/lib/types";

const BASE = "https://rt.data.gov.hk/v2/transport/nlb";
const OPERATOR_NAME = "嶼巴";

type NlbRoute = {
  routeId: string;
  routeNo: string;
  routeName_c: string;
  specialRoute?: string;
};

type NlbStop = {
  stopId: string;
  stopName_c: string;
  latitude: string;
  longitude: string;
};

type NlbEta = {
  estimatedArrivalTime?: string;
  routeVariantName?: string;
  departed?: number | string;
  noGPS?: number | string;
};

function flag(value: number | string | undefined): boolean {
  return value === 1 || value === "1";
}

function splitRouteName(name: string): { orig: string; dest: string } {
  const parts = name.split(/\s*>\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { orig: parts[0], dest: parts[parts.length - 1] };
  }
  return { orig: name, dest: name };
}

function nlbEtaIso(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("T")) return trimmed;
  return `${trimmed.replace(" ", "T")}+08:00`;
}

export async function nlbRoutes(): Promise<NlbRoute[]> {
  return cached("nlb:routes", TTL.route, async () => {
    const json = await fetchJson<{ routes: NlbRoute[] }>(`${BASE}/route.php?action=list`, 20_000);
    const rows = json.routes ?? [];
    if (!Array.isArray(rows) || rows.length < 10) {
      throw new Error("嶼巴路線名單無效或空白");
    }
    return rows;
  });
}

export async function searchNlbRoutes(q: string): Promise<RouteHit[]> {
  const needle = q.trim().toUpperCase();
  if (!needle) return [];
  const routes = await nlbRoutes();
  return routes
    .filter(
      (r) =>
        r.routeNo.toUpperCase() === needle || r.routeNo.toUpperCase().startsWith(needle),
    )
    .sort((a, b) => {
      const ae = a.routeNo.toUpperCase() === needle ? 0 : 1;
      const be = b.routeNo.toUpperCase() === needle ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.routeNo.localeCompare(b.routeNo, "en", { numeric: true });
    })
    .slice(0, needle.length <= 1 ? 48 : needle.length <= 2 ? 36 : 24)
    .map((r) => {
      const { orig, dest } = splitRouteName(r.routeName_c);
      const extra = r.specialRoute ? ` · ${r.specialRoute}` : "";
      return {
        operator: "nlb" as const,
        operatorName: OPERATOR_NAME,
        route: r.routeNo,
        orig,
        dest,
        routeId: String(r.routeId),
        subtitle: `${orig} → ${dest}${extra}`,
      };
    });
}

export async function nlbRouteStops(routeId: string): Promise<StopHit[]> {
  const json = await cached(`nlb:rs:${routeId}`, TTL.stop, () =>
    fetchJson<{ stops: NlbStop[] }>(
      `${BASE}/stop.php?action=list&routeId=${encodeURIComponent(routeId)}`,
    ),
  );
  const route = (await nlbRoutes()).find((r) => String(r.routeId) === String(routeId));
  return (json.stops ?? []).map((stop, i) => ({
    operator: "nlb" as const,
    operatorName: OPERATOR_NAME,
    stopId: String(stop.stopId),
    name: stop.stopName_c,
    seq: i + 1,
    lat: Number(stop.latitude),
    lng: Number(stop.longitude),
    route: route?.routeNo,
    routeId: String(routeId),
  }));
}

export async function nlbStopEta(
  routeId: string,
  stopId: string,
  stopName = "",
): Promise<EtaResult[]> {
  const route = (await nlbRoutes()).find((r) => String(r.routeId) === String(routeId));
  const dest = route ? splitRouteName(route.routeName_c).dest : "";
  const json = await cached(`nlb:eta:${routeId}:${stopId}`, TTL.eta, () =>
    fetchJson<{ estimatedArrivals?: NlbEta[]; message?: string }>(
      `${BASE}/stop.php?action=estimatedArrivals&routeId=${encodeURIComponent(routeId)}&stopId=${encodeURIComponent(stopId)}&language=zh`,
    ),
  );
  const rows = (json.estimatedArrivals ?? [])
    .filter((row) => row.estimatedArrivalTime)
    .map((row) => {
      const iso = nlbEtaIso(row.estimatedArrivalTime!);
      const remarks: string[] = [];
      if (!flag(row.departed) || flag(row.noGPS)) remarks.push("預定班次");
      if (row.routeVariantName?.trim()) remarks.push(row.routeVariantName.trim());
      const etaMinutes = etaMinutesFromIso(iso);
      const dist = inferDistanceToStop([], [], 1, etaMinutes);
      return {
        operator: "nlb" as const,
        operatorName: OPERATOR_NAME,
        route: route?.routeNo ?? "",
        dest,
        stopId,
        stopName,
        etaMinutes,
        etaTime: formatEtaClock(iso),
        remark: remarks.join(" · ") || undefined,
        distanceMeters: dist ? Math.round(dist.meters) : null,
        distanceEstimate: true,
      };
    });
  if (rows.length) return rows;
  if (json.message?.trim()) {
    return [
      {
        operator: "nlb",
        operatorName: OPERATOR_NAME,
        route: route?.routeNo ?? "",
        dest,
        stopId,
        stopName,
        etaMinutes: null,
        etaTime: null,
        remark: json.message.trim(),
      },
    ];
  }
  return [];
}

export async function nlbAllStops(): Promise<StopHit[]> {
  return cached("nlb:all-stops", TTL.stop, async () => {
    const routes = await nlbRoutes();
    const groups = await Promise.all(
      routes.map((route) => nlbRouteStops(String(route.routeId)).catch(() => [] as StopHit[])),
    );
    const byId = new Map<string, StopHit & { _routeIds: Set<string> }>();
    for (const group of groups) {
      for (const stop of group) {
        const existing = byId.get(stop.stopId);
        if (existing) {
          if (stop.routeId) existing._routeIds.add(stop.routeId);
        } else {
          byId.set(stop.stopId, {
            ...stop,
            _routeIds: new Set(stop.routeId ? [stop.routeId] : []),
          });
        }
      }
    }
    return [...byId.values()].map(({ _routeIds, ...stop }) => ({
      ...stop,
      routeId: stop.routeId ?? [..._routeIds][0],
      routeIds: [..._routeIds],
    }));
  });
}

export async function nearbyNlbStops(lat: number, lng: number, limit = 6): Promise<StopHit[]> {
  const stops = await nlbAllStops();
  return rankNearby(stops, lat, lng, limit);
}

export async function nlbStopAllEta(stop: StopHit): Promise<EtaResult[]> {
  const routeIds = stop.routeIds?.length ? stop.routeIds : stop.routeId ? [stop.routeId] : [];
  if (!routeIds.length) return [];
  const batches = await Promise.all(
    routeIds.map((routeId) => nlbStopEta(routeId, stop.stopId, stop.name).catch(() => [] as EtaResult[])),
  );
  return batches
    .flat()
    .sort((a, b) => (a.etaMinutes ?? 99) - (b.etaMinutes ?? 99));
}
