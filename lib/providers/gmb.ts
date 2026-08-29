import { inferDistanceToStop } from "@/lib/bus-distance";
import { cached, TTL } from "@/lib/cache";
import { formatEtaClock } from "@/lib/geo";
import { fetchJson } from "@/lib/http";
import { rankNearby } from "@/lib/nearby";
import type { EtaResult, OccupancyLevel, RouteHit, StopHit } from "@/lib/types";

const BASE = "https://data.etagmb.gov.hk";
const OPERATOR_NAME = "專線小巴";
export const REGION_NAME: Record<string, string> = {
  HKI: "港島",
  KLN: "九龍",
  NT: "新界",
};

type GmbRouteList = {
  data: { routes: Record<string, string[]> };
};

type GmbRouteDetail = {
  data: Array<{
    route_id: number;
    region: string;
    route_code: string;
    directions: Array<{
      route_seq: number;
      orig_tc: string;
      dest_tc: string;
    }>;
  }>;
};

type GmbRouteStop = {
  data: {
    route_stops: Array<{
      stop_seq: number;
      stop_id: number;
      name_tc: string;
    }>;
  };
};

type GmbStop = {
  data: { coordinates: { wgs84: { latitude: number; longitude: number } } };
};

type GmbEtaItem = {
  diff: number;
  timestamp: string;
  remarks_tc?: string | null;
  remarks_en?: string | null;
  [key: string]: unknown;
};

type GmbEta = {
  data: Array<{
    route_seq: number;
    enabled: boolean;
    eta: GmbEtaItem[] | null;
  }>;
};

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function formatPlate(raw: string): string {
  const compact = raw.toUpperCase().replace(/[\s-]/g, "");
  const m = compact.match(/^([A-Z]{1,2})(\d{1,4}[A-Z]?)$/);
  return m ? `${m[1]} ${m[2]}` : raw.toUpperCase();
}

function occupancyFromValue(value: unknown): OccupancyLevel | undefined {
  if (typeof value === "number") {
    if (value <= 0) return "full";
    if (value <= 2) return "standing";
    return "seats";
  }
  const t = asText(value)?.toUpperCase();
  if (!t) return undefined;
  if (/(FULL|CRUSH|NOT_ACCEPT|滿座|已滿|滿客)/.test(t)) return "full";
  if (/(STANDING|FEW_SEATS|企位)/.test(t)) return "standing";
  if (/(SEAT|EMPTY|MANY|AVAILABLE|空位|有位)/.test(t)) return "seats";
  return undefined;
}

function extrasFromEta(eta: GmbEtaItem): Pick<EtaResult, "plate" | "occupancy" | "seatsLeft"> {
  const remark = [eta.remarks_tc, eta.remarks_en].filter(Boolean).join(" ");
  const plateRaw =
    asText(eta.plate) ||
    asText(eta.plate_no) ||
    asText(eta.plate_number) ||
    asText(eta.vehicle_plate) ||
    asText(eta.license_plate) ||
    asText(eta.vehicle) ||
    remark.match(/車牌[:：\s]*([A-Z]{1,2}\s?-?\d{1,4}[A-Z]?)/i)?.[1];
  const seatsLeft =
    asNumber(eta.available_seats) ??
    asNumber(eta.seats_available) ??
    asNumber(eta.vacancy) ??
    asNumber(eta.empty_seats) ??
    asNumber(eta.remaining_seats) ??
    (remark.match(/(?:尚餘|剩餘|空位)\s*(\d+)\s*個?/) ? Number(remark.match(/(?:尚餘|剩餘|空位)\s*(\d+)\s*個?/)![1]) : undefined);
  const occupancy =
    occupancyFromValue(eta.occupancy) ||
    occupancyFromValue(eta.occupancy_status) ||
    occupancyFromValue(eta.capacity_status) ||
    (seatsLeft === 0 || /滿座|已滿|滿客/.test(remark) ? "full" : undefined) ||
    (seatsLeft != null && seatsLeft > 0 ? "seats" : undefined) ||
    occupancyFromValue(remark);
  return {
    plate: plateRaw ? formatPlate(plateRaw) : undefined,
    occupancy,
    seatsLeft: seatsLeft != null && seatsLeft >= 0 ? seatsLeft : undefined,
  };
}

export async function gmbRouteIndex() {
  return cached("gmb:routes", TTL.route, async () => {
    const json = await fetchJson<GmbRouteList>(`${BASE}/route`);
    return json.data.routes;
  });
}

export async function searchGmbRoutes(q: string, regionFilter?: string): Promise<RouteHit[]> {
  const needle = q.trim().toUpperCase();
  if (!needle) return [];
  const index = await gmbRouteIndex();
  const scored: { region: string; code: string; rank: number }[] = [];
  for (const [region, codes] of Object.entries(index)) {
    if (regionFilter && region !== regionFilter) continue;
    for (const code of codes) {
      const u = code.toUpperCase();
      const rank = u === needle ? 0 : u.startsWith(needle) ? 1 : u.includes(needle) ? 2 : -1;
      if (rank < 0) continue;
      scored.push({ region, code, rank });
    }
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.code.length - b.code.length ||
      a.code.localeCompare(b.code, "en", { numeric: true }) ||
      a.region.localeCompare(b.region),
  );
  const picked = scored.slice(0, 12);
  const groups = await Promise.all(
    picked.map(async ({ region, code }) => {
      try {
        const detail = await cached(`gmb:route:${region}:${code}`, TTL.route, () =>
          fetchJson<GmbRouteDetail>(`${BASE}/route/${region}/${encodeURIComponent(code)}`),
        );
        const hits: RouteHit[] = [];
        for (const item of detail.data) {
          for (const dir of item.directions) {
            hits.push({
              operator: "gmb",
              operatorName: OPERATOR_NAME,
              route: code,
              orig: dir.orig_tc,
              dest: dir.dest_tc,
              region,
              routeId: String(item.route_id),
              bound: String(dir.route_seq),
              subtitle: `${REGION_NAME[region] ?? region} · ${dir.orig_tc} → ${dir.dest_tc}`,
            });
          }
        }
        return hits;
      } catch {
        return [] as RouteHit[];
      }
    }),
  );
  return groups.flat().slice(0, 24);
}

export async function gmbRouteStops(routeId: string, routeSeq: string): Promise<StopHit[]> {
  const json = await cached(`gmb:rs:${routeId}:${routeSeq}`, TTL.stop, () =>
    fetchJson<GmbRouteStop>(`${BASE}/route-stop/${routeId}/${routeSeq}`),
  );
  const stops = await Promise.all(
    json.data.route_stops.map(async (item) => {
      const geo = await cached(`gmb:stop:${item.stop_id}`, TTL.stop, () =>
        fetchJson<GmbStop>(`${BASE}/stop/${item.stop_id}`),
      );
      return {
        operator: "gmb" as const,
        operatorName: OPERATOR_NAME,
        stopId: String(item.stop_id),
        name: item.name_tc,
        seq: item.stop_seq,
        lat: geo.data.coordinates.wgs84.latitude,
        lng: geo.data.coordinates.wgs84.longitude,
        routeId,
        routeSeq: Number(routeSeq),
      };
    }),
  );
  return stops;
}

export async function gmbStopEta(
  routeId: string,
  stopId: string,
  stopName = "",
): Promise<EtaResult[]> {
  const json = await cached(`gmb:eta:${routeId}:${stopId}`, TTL.eta, () =>
    fetchJson<GmbEta>(`${BASE}/eta/route-stop/${routeId}/${stopId}`),
  );
  const rows: EtaResult[] = [];
  for (const group of json.data) {
    if (!group.enabled) continue;
    for (const eta of group.eta ?? []) {
      const extras = extrasFromEta(eta);
      const dist = inferDistanceToStop([], [], 1, eta.diff);
      rows.push({
        operator: "gmb",
        operatorName: OPERATOR_NAME,
        route: routeId,
        dest: `方向 ${group.route_seq}`,
        stopId,
        stopName,
        etaMinutes: eta.diff,
        etaTime: formatEtaClock(eta.timestamp),
        remark: eta.remarks_tc || undefined,
        ...extras,
        distanceMeters: dist ? Math.round(dist.meters) : null,
        distanceEstimate: true,
      });
    }
  }
  return rows;
}

type GmbStopCatalogRow = {
  stopId: string;
  name: string;
  lat: number;
  lng: number;
};

type GmbLastUpdateStop = {
  stop_id: number;
};

type GmbStopEtaRoute = {
  enabled: boolean;
  route_id: number;
  route_seq: number;
  stop_seq: number;
  description_tc?: string;
  eta?: GmbEtaItem[] | null;
};

type GmbStopEtaResponse = {
  data: GmbStopEtaRoute[];
};

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

async function gmbRouteCodeMap(): Promise<Map<number, string>> {
  return cached("gmb:route-code-map", TTL.route, async () => {
    const index = await gmbRouteIndex();
    const map = new Map<number, string>();
    await mapPool(
      Object.entries(index).flatMap(([region, codes]) => codes.map((code) => ({ region, code }))),
      12,
      async ({ region, code }) => {
        try {
          const detail = await cached(`gmb:route:${region}:${code}`, TTL.route, () =>
            fetchJson<GmbRouteDetail>(`${BASE}/route/${region}/${encodeURIComponent(code)}`),
          );
          for (const item of detail.data) map.set(item.route_id, code);
        } catch {
          /* skip broken route */
        }
      },
    );
    return map;
  });
}

async function gmbStopCatalog(): Promise<GmbStopCatalogRow[]> {
  return cached("gmb:catalog", TTL.stop, async () => {
    const stopIdsJson = await fetchJson<{ data: { data_timestamp: GmbLastUpdateStop[] } }>(
      `${BASE}/last-update/stop`,
      30_000,
    );
    const rows = await mapPool(stopIdsJson.data.data_timestamp, 40, async ({ stop_id }) => {
      try {
        const geo = await cached(`gmb:stop:${stop_id}`, TTL.stop, () =>
          fetchJson<GmbStop>(`${BASE}/stop/${stop_id}`),
        );
        return {
          stopId: String(stop_id),
          name: `小巴站 ${stop_id}`,
          lat: geo.data.coordinates.wgs84.latitude,
          lng: geo.data.coordinates.wgs84.longitude,
        };
      } catch {
        return null;
      }
    });
    return rows.filter((row): row is GmbStopCatalogRow => row != null);
  });
}

export async function nearbyGmbStops(lat: number, lng: number, limit = 8): Promise<StopHit[]> {
  const catalog = await gmbStopCatalog();
  return rankNearby(
    catalog.map((row) => ({
      operator: "gmb" as const,
      operatorName: OPERATOR_NAME,
      stopId: row.stopId,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
    })),
    lat,
    lng,
    limit,
  );
}

export async function gmbStopEtaByStop(stopId: string, stopName = ""): Promise<EtaResult[]> {
  const json = await cached(`gmb:eta-stop:${stopId}`, TTL.eta, () =>
    fetchJson<GmbStopEtaResponse>(`${BASE}/eta/stop/${stopId}`),
  );
  const routeCodes = await gmbRouteCodeMap();
  const rows: EtaResult[] = [];
  for (const group of json.data) {
    if (!group.enabled) {
      if (group.description_tc) {
        rows.push({
          operator: "gmb",
          operatorName: OPERATOR_NAME,
          route: routeCodes.get(group.route_id) ?? String(group.route_id),
          dest: `方向 ${group.route_seq}`,
          stopId,
          stopName,
          etaMinutes: null,
          etaTime: null,
          remark: group.description_tc,
        });
      }
      continue;
    }
    for (const eta of group.eta ?? []) {
      rows.push({
        operator: "gmb",
        operatorName: OPERATOR_NAME,
        route: routeCodes.get(group.route_id) ?? String(group.route_id),
        dest: `方向 ${group.route_seq}`,
        stopId,
        stopName,
        etaMinutes: eta.diff,
        etaTime: formatEtaClock(eta.timestamp),
        remark: eta.remarks_tc || undefined,
        ...extrasFromEta(eta),
        distanceMeters: (() => {
          const dist = inferDistanceToStop([], [], 1, eta.diff);
          return dist ? Math.round(dist.meters) : null;
        })(),
        distanceEstimate: true,
      });
    }
  }
  return rows.sort((a, b) => (a.etaMinutes ?? 99) - (b.etaMinutes ?? 99));
}
