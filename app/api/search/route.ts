import { jsonError, jsonOk } from "@/lib/api";
import { searchCtbRoutes } from "@/lib/providers/ctb";
import { searchGmbRoutes } from "@/lib/providers/gmb";
import { searchKmbRoutes } from "@/lib/providers/kmb";
import { searchMtrBusRoutes } from "@/lib/providers/mtr-bus";
import { searchNlbRoutes } from "@/lib/providers/nlb";
import { MTR_LINE_NAMES, searchMtrStations } from "@/lib/static/mtr-stations";
import type { RouteHit } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type OpSearch = { routes: RouteHit[]; warning?: string };

async function collect(label: string, fn: () => Promise<RouteHit[]>): Promise<OpSearch> {
  try {
    return { routes: await fn() };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "未知錯誤";
    console.error(`[search] ${label} failed:`, detail);
    return { routes: [], warning: `${label}資料暫時無法載入，請再試` };
  }
}

function emptyOp(): OpSearch {
  return { routes: [] };
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const q = p.get("q")?.trim() ?? "";
  const mode = p.get("mode") ?? "all";
  const operator = p.get("operator");
  const region = p.get("region") ?? undefined;
  if (q.length < 1) return jsonError("請輸入路線或站名");
  try {
    if (mode === "bus" || mode === "all") {
      const wantKmb = !operator || operator === "all" || operator === "kmb";
      const wantCtb = !operator || operator === "all" || operator === "ctb";
      const wantNlb = !operator || operator === "all" || operator === "nlb";
      const wantMtrb = !operator || operator === "all" || operator === "mtrb";
      const [kmb, ctb, nlb, mtrb] = await Promise.all([
        wantKmb ? collect("九巴／龍運", () => searchKmbRoutes(q)) : Promise.resolve(emptyOp()),
        wantCtb ? collect("城巴", () => searchCtbRoutes(q)) : Promise.resolve(emptyOp()),
        wantNlb ? collect("嶼巴", () => searchNlbRoutes(q)) : Promise.resolve(emptyOp()),
        wantMtrb ? collect("港鐵巴士", () => searchMtrBusRoutes(q)) : Promise.resolve(emptyOp()),
      ]);
      const warnings = [kmb.warning, ctb.warning, nlb.warning, mtrb.warning].filter(
        (w): w is string => Boolean(w),
      );
      const needle = q.toUpperCase();
      const busRoutes = [...kmb.routes, ...ctb.routes, ...nlb.routes, ...mtrb.routes].sort(
        (a, b) => {
          const au = a.route.toUpperCase();
          const bu = b.route.toUpperCase();
          const ae = au === needle ? 0 : 1;
          const be = bu === needle ? 0 : 1;
          if (ae !== be) return ae - be;
          const byRoute = au.localeCompare(bu, "en", { numeric: true });
          if (byRoute !== 0) return byRoute;
          return a.operatorName.localeCompare(b.operatorName, "zh-Hant");
        },
      );
      if (mode === "bus") {
        return jsonOk({ routes: busRoutes, stations: [], warnings });
      }
      const gmb = await collect("專線小巴", () => searchGmbRoutes(q, region));
      if (gmb.warning) warnings.push(gmb.warning);
      const mtr = searchMtrStations(q).map((s) => ({
        operator: "mtr" as const,
        operatorName: "港鐵",
        route: s.lines.map((l) => MTR_LINE_NAMES[l] ?? l).join("／"),
        orig: s.name,
        dest: s.lines.join(","),
        subtitle: s.lines.map((l) => MTR_LINE_NAMES[l] ?? l).join("／"),
        stopId: s.code,
      }));
      return jsonOk({
        routes: [...busRoutes, ...gmb.routes],
        stations: mtr,
        warnings,
      });
    }
    if (mode === "minibus") {
      const gmb = await collect("專線小巴", () => searchGmbRoutes(q, region));
      return jsonOk({
        routes: gmb.routes,
        stations: [],
        warnings: gmb.warning ? [gmb.warning] : [],
      });
    }
    return jsonOk({ routes: [], stations: [], warnings: [] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "搜尋失敗", 502);
  }
}
