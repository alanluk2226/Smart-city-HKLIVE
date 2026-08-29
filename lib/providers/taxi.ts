import { cached, TTL } from "@/lib/cache";
import { fetchJson, fetchText } from "@/lib/http";
import { haversineMeters } from "@/lib/geo";

const STAND_SERVICE = "td_rcd_1697081907714_17556";
const PICKUP_SERVICE = "td_rcd_1697082382328_14459";
const CALL_CSV =
  "https://www.td.gov.hk/datagovhk_td/taxi-cs/resources/tc/taxi_call_stations_chi.csv";

export type TaxiPointKind = "stand" | "pickup";

export type TaxiPoint = {
  id: string;
  kind: TaxiPointKind;
  name: string;
  region: string;
  district: string;
  status: string;
  lat: number;
  lng: number;
};

export type TaxiCallStation = {
  area: string;
  name: string;
  phone1: string;
  phone2: string;
};

type EsriFeature = {
  attributes?: Record<string, string | number | null>;
  geometry?: { x?: number; y?: number };
};

type EsriQuery = {
  features?: EsriFeature[];
  error?: { message?: string };
};

function layerUrl(serviceId: string) {
  return `https://portal.csdi.gov.hk/server/rest/services/common/${serviceId}/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=json`;
}

function mapFeatures(features: EsriFeature[] | undefined, kind: TaxiPointKind): TaxiPoint[] {
  const rows: TaxiPoint[] = [];
  for (const f of features ?? []) {
    const a = f.attributes ?? {};
    const lat = Number(f.geometry?.y);
    const lng = Number(f.geometry?.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = String(a.OBJECTID ?? `${kind}-${lat}-${lng}`);
    rows.push({
      id: `${kind}-${id}`,
      kind,
      name: String(a.Location_TC || a.Location_EN || id),
      region: String(a.Region_TC || a.Region_EN || ""),
      district: String(a.District_TC || a.District_EN || ""),
      status: String(a.Status_TC || a.Status_EN || (kind === "stand" ? "的士站" : "上落客點")),
      lat,
      lng,
    });
  }
  return rows;
}

async function fetchStands(): Promise<TaxiPoint[]> {
  return cached("taxi:stands", TTL.taxi, async () => {
    const json = await fetchJson<EsriQuery>(layerUrl(STAND_SERVICE), 30_000);
    if (json.error) throw new Error(json.error.message || "無法載入的士站");
    return mapFeatures(json.features, "stand");
  });
}

async function fetchPickups(): Promise<TaxiPoint[]> {
  return cached("taxi:pickups", TTL.taxi, async () => {
    const json = await fetchJson<EsriQuery>(layerUrl(PICKUP_SERVICE), 30_000);
    if (json.error) throw new Error(json.error.message || "無法載入上落客點");
    return mapFeatures(json.features, "pickup");
  });
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const c of line.replace(/\r$/, "")) {
    if (c === '"') {
      q = !q;
      continue;
    }
    if (c === "," && !q) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

async function fetchCallStations(): Promise<TaxiCallStation[]> {
  return cached("taxi:calls", TTL.taxi, async () => {
    const text = await fetchText(CALL_CSV, 20_000);
    const lines = text.split(/\n/).filter((l) => l.trim());
    const rows: TaxiCallStation[] = [];
    for (const line of lines.slice(1)) {
      const cols = parseCsvLine(line);
      const area = cols[0] ?? "";
      const name = cols[1] ?? "";
      const phone1 = cols[2] ?? "";
      const phone2 = cols[3] ?? "";
      if (!name) continue;
      rows.push({ area, name, phone1, phone2 });
    }
    return rows;
  });
}

export async function getTaxiDirectory(opts?: {
  kind?: "all" | TaxiPointKind;
  lat?: number;
  lng?: number;
  q?: string;
  limit?: number;
}) {
  const [stands, pickups, calls] = await Promise.all([
    fetchStands(),
    fetchPickups(),
    fetchCallStations(),
  ]);

  let points =
    opts?.kind === "stand" ? stands : opts?.kind === "pickup" ? pickups : [...stands, ...pickups];

  const needle = opts?.q?.trim().toLowerCase();
  if (needle) {
    points = points.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.district.toLowerCase().includes(needle) ||
        p.region.toLowerCase().includes(needle) ||
        p.status.toLowerCase().includes(needle),
    );
  }

  if (opts?.lat != null && opts?.lng != null) {
    const lat = opts.lat;
    const lng = opts.lng;
    points = points
      .map((p) => ({ ...p, distanceMeters: haversineMeters(lat, lng, p.lat, p.lng) }))
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  } else {
    points = [...points].sort((a, b) => a.region.localeCompare(b.region, "zh-HK") || a.name.localeCompare(b.name, "zh-HK"));
  }

  const limit = opts?.limit;
  if (limit != null && limit > 0) points = points.slice(0, limit);

  const callNeedle = needle;
  const filteredCalls = callNeedle
    ? calls.filter(
        (c) =>
          c.name.toLowerCase().includes(callNeedle) ||
          c.area.toLowerCase().includes(callNeedle) ||
          c.phone1.includes(callNeedle) ||
          c.phone2.includes(callNeedle),
      )
    : calls;

  return {
    points,
    calls: filteredCalls,
    counts: {
      stands: stands.length,
      pickups: pickups.length,
      calls: calls.length,
    },
  };
}
