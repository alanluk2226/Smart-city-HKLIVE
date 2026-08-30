import { cached, TTL } from "@/lib/cache";
import { fetchJson } from "@/lib/http";

export type SopSpecialtyWait = {
  specialty: string;
  urgentMedian: string;
  semiUrgentMedian: string;
  stableMedian: string;
  stableLong: string;
};

export type SopClusterSnapshot = {
  cluster: string;
  clusterKey: string;
  periodFrom: string | null;
  periodTo: string | null;
  nextUpdate: string | null;
  specialties: SopSpecialtyWait[];
};

type SopRow = {
  date_id_from?: number;
  date_id_to?: number;
  cluster?: string;
  specialty?: string;
  Category?: string;
  Description?: string;
  Value?: string;
};

/** App stores short labels like「港島東」; SOP JSON uses「港島東醫院聯網」. */
export function sopClusterName(clusterShort: string) {
  if (clusterShort.includes("醫院聯網")) return clusterShort;
  return `${clusterShort}醫院聯網`;
}

function ymdLabel(n: number | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  const s = String(n);
  if (!/^\d{8}$/.test(s)) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

async function sopRaw() {
  return cached("ha:sop:tc", TTL.hospital * 12, () =>
    fetchJson<SopRow[]>("https://www.ha.org.hk/opendata/sop/sop-waiting-time-tc.json", 30_000),
  );
}

export async function getSopWaitsForCluster(clusterShort: string): Promise<SopClusterSnapshot | null> {
  const key = sopClusterName(clusterShort);
  const rows = await sopRaw();
  const mine = rows.filter((r) => r.cluster === key && r.specialty && r.specialty !== "—");
  if (!mine.length) return null;

  const bySpec = new Map<string, SopSpecialtyWait>();
  let nextUpdate: string | null = null;
  let periodFrom: string | null = null;
  let periodTo: string | null = null;

  for (const r of mine) {
    const spec = r.specialty!;
    if (!bySpec.has(spec)) {
      bySpec.set(spec, {
        specialty: spec,
        urgentMedian: "—",
        semiUrgentMedian: "—",
        stableMedian: "—",
        stableLong: "—",
      });
    }
    const row = bySpec.get(spec)!;
    const cat = r.Category ?? "";
    const val = r.Value?.trim() || "—";
    if (cat === "緊急新症 - 中位數") row.urgentMedian = val;
    else if (cat === "半緊急新症 - 中位數") row.semiUrgentMedian = val;
    else if (cat === "穩定新症 - 中位數") row.stableMedian = val;
    else if (cat === "穩定新症 - 最長") row.stableLong = val;
    else if (cat === "下次更新日期" && !nextUpdate) nextUpdate = val;

    if (!periodFrom) periodFrom = ymdLabel(r.date_id_from);
    if (!periodTo) periodTo = ymdLabel(r.date_id_to);
  }

  const specialties = [...bySpec.values()].sort((a, b) =>
    a.specialty.localeCompare(b.specialty, "zh-Hant"),
  );

  return {
    cluster: key,
    clusterKey: clusterShort,
    periodFrom,
    periodTo,
    nextUpdate,
    specialties,
  };
}
