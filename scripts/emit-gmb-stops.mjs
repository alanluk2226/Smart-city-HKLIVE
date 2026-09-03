/**
 * Fetch all GMB stop coordinates → lib/static/gmb-stops.json
 * Usage: node scripts/emit-gmb-stops.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://data.etagmb.gov.hk";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "lib", "static", "gmb-stops.json");
const CONCURRENCY = 48;

async function mapPool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, () => worker()));
  return out;
}

async function main() {
  console.log("Fetching stop id list…");
  const listRes = await fetch(`${BASE}/last-update/stop`, {
    headers: { Accept: "application/json", "User-Agent": "hk-city-live/emit-gmb-stops" },
  });
  if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`);
  const listJson = await listRes.json();
  const rows = Array.isArray(listJson.data)
    ? listJson.data
    : Array.isArray(listJson.data?.data_timestamp)
      ? listJson.data.data_timestamp
      : [];
  const stopIds = [...new Set(rows.map((r) => r.stop_id).filter((id) => id != null))];
  console.log(`Stops: ${stopIds.length}`);

  let ok = 0;
  let fail = 0;
  const stops = [];

  await mapPool(stopIds, CONCURRENCY, async (stopId, idx) => {
    try {
      const res = await fetch(`${BASE}/stop/${stopId}`, {
        headers: { Accept: "application/json", "User-Agent": "hk-city-live/emit-gmb-stops" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const lat = json?.data?.coordinates?.wgs84?.latitude;
      const lng = json?.data?.coordinates?.wgs84?.longitude;
      if (typeof lat === "number" && typeof lng === "number") {
        stops.push([String(stopId), Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6]);
        ok++;
      } else {
        fail++;
      }
    } catch {
      fail++;
    }
    if ((idx + 1) % 250 === 0 || idx + 1 === stopIds.length) {
      console.log(`… ${idx + 1}/${stopIds.length} (ok=${ok} fail=${fail})`);
    }
  });

  stops.sort((a, b) => Number(a[0]) - Number(b[0]));
  mkdirSync(dirname(OUT), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    count: stops.length,
    stops,
  };
  writeFileSync(OUT, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Wrote ${OUT} (${stops.length} stops, fail=${fail})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
