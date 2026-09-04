/**
 * Fetch all GMB route directions → lib/static/gmb-routes.json
 * Usage: node scripts/emit-gmb-routes.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://data.etagmb.gov.hk";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "lib", "static", "gmb-routes.json");
const CONCURRENCY = 24;

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
  console.log("Fetching route code index…");
  const listRes = await fetch(`${BASE}/route`, {
    headers: { Accept: "application/json", "User-Agent": "hk-city-live/emit-gmb-routes" },
  });
  if (!listRes.ok) throw new Error(`list HTTP ${listRes.status}`);
  const listJson = await listRes.json();
  const index = listJson.data.routes;
  const jobs = Object.entries(index).flatMap(([region, codes]) =>
    codes.map((code) => ({ region, code })),
  );
  console.log(`Codes: ${jobs.length}`);

  let ok = 0;
  let fail = 0;
  const routes = [];

  await mapPool(jobs, CONCURRENCY, async ({ region, code }, idx) => {
    try {
      const res = await fetch(`${BASE}/route/${region}/${encodeURIComponent(code)}`, {
        headers: { Accept: "application/json", "User-Agent": "hk-city-live/emit-gmb-routes" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      for (const item of json.data ?? []) {
        for (const dir of item.directions ?? []) {
          routes.push({
            region,
            code,
            routeId: String(item.route_id),
            bound: String(dir.route_seq),
            orig: dir.orig_tc,
            dest: dir.dest_tc,
          });
        }
      }
      ok++;
    } catch {
      fail++;
    }
    if ((idx + 1) % 50 === 0 || idx + 1 === jobs.length) {
      console.log(`… ${idx + 1}/${jobs.length} (ok=${ok} fail=${fail} hits=${routes.length})`);
    }
  });

  routes.sort(
    (a, b) =>
      a.code.localeCompare(b.code, "en", { numeric: true }) ||
      a.region.localeCompare(b.region) ||
      Number(a.bound) - Number(b.bound),
  );

  mkdirSync(dirname(OUT), { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    count: routes.length,
    routes,
  };
  writeFileSync(OUT, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`Wrote ${OUT} (${routes.length} directions, fail=${fail})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
