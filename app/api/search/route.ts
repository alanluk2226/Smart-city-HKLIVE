import { jsonError, jsonOk } from "@/lib/api";
import { searchCtbRoutes } from "@/lib/providers/ctb";
import { searchGmbRoutes } from "@/lib/providers/gmb";
import { searchKmbRoutes } from "@/lib/providers/kmb";
import { searchNlbRoutes } from "@/lib/providers/nlb";
import { MTR_LINE_NAMES, searchMtrStations } from "@/lib/static/mtr-stations";

export const dynamic = "force-dynamic";

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
      const [kmb, ctb, nlb] = await Promise.all([
        wantKmb ? searchKmbRoutes(q).catch(() => []) : Promise.resolve([]),
        wantCtb ? searchCtbRoutes(q).catch(() => []) : Promise.resolve([]),
        wantNlb ? searchNlbRoutes(q).catch(() => []) : Promise.resolve([]),
      ]);
      if (mode === "bus") return jsonOk({ routes: [...kmb, ...ctb, ...nlb], stations: [] });
      const gmb = await searchGmbRoutes(q, region).catch(() => []);
      const mtr = searchMtrStations(q).map((s) => ({
        operator: "mtr" as const,
        operatorName: "港鐵",
        route: s.lines.map((l) => MTR_LINE_NAMES[l] ?? l).join("／"),
        orig: s.name,
        dest: s.lines.join(","),
        subtitle: s.lines.map((l) => MTR_LINE_NAMES[l] ?? l).join("／"),
        stopId: s.code,
      }));
      return jsonOk({ routes: [...kmb, ...ctb, ...nlb, ...gmb], stations: mtr });
    }
    if (mode === "minibus") {
      return jsonOk({
        routes: await searchGmbRoutes(q, region).catch(() => []),
        stations: [],
      });
    }
    return jsonOk({ routes: [], stations: [] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "搜尋失敗", 502);
  }
}
