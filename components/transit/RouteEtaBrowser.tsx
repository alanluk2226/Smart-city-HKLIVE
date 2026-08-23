"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/client";
import { EtaPanel } from "@/components/transit/EtaPanel";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { useEta } from "@/components/transit/useEta";
import type { RouteHit, StopHit } from "@/lib/types";

export function RouteEtaBrowser({
  mode,
  operator,
  region,
  placeholder,
  presetQuery = "",
}: {
  mode: "bus" | "minibus";
  operator?: "kmb" | "ctb" | "nlb";
  region?: string;
  placeholder: string;
  presetQuery?: string;
}) {
  const [q, setQ] = useState(presetQuery);
  const [searching, setSearching] = useState(false);
  const [routes, setRoutes] = useState<RouteHit[]>([]);
  const [stops, setStops] = useState<StopHit[]>([]);
  const [selected, setSelected] = useState<StopHit | null>(null);
  const [error, setError] = useState("");
  const { etas, loading, error: etaError } = useEta(selected);
  const mappedStops = useMemo(
    () => stops.filter((s) => typeof s.lat === "number" && typeof s.lng === "number"),
    [stops],
  );

  useEffect(() => {
    if (!selected) return;
    document.getElementById(`bus-stop-${selected.stopId}-${selected.seq}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  async function search(query: string) {
    const needle = query.trim();
    if (!needle) return;
    setSearching(true);
    setError("");
    setStops([]);
    setSelected(null);
    try {
      const params = new URLSearchParams({ q: needle, mode });
      if (operator) params.set("operator", operator);
      if (region) params.set("region", region);
      const data = await apiGet<{ routes: RouteHit[] }>(`/api/search?${params}`);
      setRoutes(data.routes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜尋失敗");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!presetQuery) return;
    setQ(presetQuery);
    void search(presetQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetQuery, operator, region]);

  async function pickRoute(route: RouteHit) {
    setError("");
    setSelected(null);
    setStops([]);
    try {
      const params = new URLSearchParams({
        operator: route.operator,
        route: route.route,
        bound: route.bound ?? "O",
        serviceType: route.serviceType ?? "1",
      });
      if (route.routeId) params.set("routeId", route.routeId);
      setStops(await apiGet<StopHit[]>(`/api/stops?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入車站");
    }
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search(q);
        }}
        className="flex flex-col sm:flex-row gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-teal"
        />
        <button className="rounded-xl bg-teal text-bg px-5 py-3 font-medium">
          {searching ? "搜尋中…" : "搜尋路線"}
        </button>
      </form>
      {error || etaError ? <p className="text-rose text-sm">{error || etaError}</p> : null}

      {mappedStops.length ? (
        <StopStreetMapDynamic
          stops={mappedStops}
          selectedId={selected?.stopId}
          selectedSeq={selected?.seq}
          onSelect={setSelected}
          accent="teal"
        />
      ) : null}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-card p-3">
            <h2 className="text-sm text-muted px-1 mb-2">路線</h2>
            <div className="max-h-72 overflow-auto space-y-1">
              {routes.map((r, i) => (
                <button
                  key={`${r.operator}-${r.route}-${r.bound}-${r.routeId}-${i}`}
                  onClick={() => pickRoute(r)}
                  className="w-full text-left rounded-lg px-3 py-2 hover:bg-white/5"
                >
                  <span className="text-amber text-xs mr-2">{r.operatorName}</span>
                  <span className="font-mono mr-2">{r.route}</span>
                  {r.subtitle}
                </button>
              ))}
              {!routes.length ? (
                <div className="text-muted text-sm px-3 py-2">輸入路線編號後搜尋</div>
              ) : null}
            </div>
          </section>

          {stops.length ? (
            <section className="rounded-2xl border border-line bg-card p-3">
              <h2 className="text-sm text-muted px-1 mb-2">選擇車站</h2>
              <div className="max-h-80 overflow-auto space-y-1">
                {stops.map((s) => (
                  <button
                    id={`bus-stop-${s.stopId}-${s.seq}`}
                    key={`${s.stopId}-${s.seq}`}
                    onClick={() => setSelected(s)}
                    className={`w-full text-left rounded-lg px-3 py-2 ${
                      selected?.stopId === s.stopId && selected?.seq === s.seq ? "bg-teal/15" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="text-muted font-mono text-xs mr-2">{s.seq}</span>
                    {s.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <EtaPanel
          title={selected ? selected.name : "到達時間"}
          etas={etas}
          loading={loading}
          emptyHint="先搜路線，再選車站查看班次。"
        />
      </div>
    </div>
  );
}
