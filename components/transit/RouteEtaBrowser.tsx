"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BusOperatorIcon } from "@/components/transit/BusOperatorIcon";
import { BusRouteKeypad } from "@/components/transit/BusRouteKeypad";
import { apiGet, openWalkingDirections } from "@/lib/client";
import { formatBusDistance } from "@/lib/bus-distance";
import { RouteInfoBanner, etaArriveLabel } from "@/components/transit/RouteInfoBanner";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { useEta } from "@/components/transit/useEta";
import { useRouteInfo } from "@/components/transit/useRouteInfo";
import type { RouteHit, StopHit } from "@/lib/types";

const BUS_ROUTE_MAX_LEN = 5;

function NavigateToStopButton({
  lat,
  lng,
  name,
  accent = "teal",
}: {
  lat: number;
  lng: number;
  name: string;
  accent?: "teal" | "lime";
}) {
  const ring = accent === "lime" ? "hover:border-lime/70" : "hover:border-teal";
  const icon = accent === "lime" ? "text-lime" : "text-teal";
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openWalkingDirections(lat, lng, name);
      }}
      className={`mt-1.5 inline-flex items-center gap-2 rounded-full border border-line bg-elev/80 px-3.5 py-2 text-xs text-ink ${ring}`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${icon}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 3 4.5 10.5 12 21l7.5-10.5L12 3Z" />
        <path d="M9.5 11h5" />
        <path d="M12 8.5V15" />
        <path d="M12 15h3.5" />
      </svg>
      前往車站
    </button>
  );
}

export function RouteEtaBrowser({
  mode,
  operator,
  region,
  placeholder,
  presetQuery = "",
  belowSearch,
}: {
  mode: "bus" | "minibus";
  operator?: "kmb" | "ctb" | "nlb" | "mtrb";
  region?: string;
  placeholder: string;
  presetQuery?: string;
  belowSearch?: ReactNode;
}) {
  const [q, setQ] = useState(presetQuery);
  const [searching, setSearching] = useState(false);
  const [loadingStops, setLoadingStops] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [routes, setRoutes] = useState<RouteHit[]>([]);
  const [pickedRoute, setPickedRoute] = useState<RouteHit | null>(null);
  const [stops, setStops] = useState<StopHit[]>([]);
  const [selected, setSelected] = useState<StopHit | null>(null);
  const [error, setError] = useState("");
  /** false = hide expanded ETA cards; only show soonest time on the stop row */
  const [showEtaDetails, setShowEtaDetails] = useState(true);
  const { etas, loading, error: etaError } = useEta(selected);
  const { info: routeInfo, loading: routeInfoLoading } = useRouteInfo(
    pickedRoute,
    selected,
    stops.length || undefined,
  );
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
    setSelected(null);
    setPickedRoute(null);
    setStops([]);
    try {
      const params = new URLSearchParams({ q: needle, mode });
      if (operator) params.set("operator", operator);
      if (region) params.set("region", region);
      const data = await apiGet<{ routes: RouteHit[] }>(`/api/search?${params}`);
      setRoutes(data.routes);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜尋失敗");
      setHasSearched(true);
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

  useEffect(() => {
    if (mode !== "bus") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const runLive = () => {
      if (!mq.matches) return;
      const needle = q.trim();
      if (!needle) {
        setRoutes([]);
        setHasSearched(false);
        setSearching(false);
        setError("");
        return;
      }
      void search(needle);
    };
    const timer = window.setTimeout(runLive, 220);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode, operator, region]);

  function appendBusQuery(next: string) {
    setQ((prev) => {
      if (prev.length >= BUS_ROUTE_MAX_LEN) return prev;
      return `${prev}${next}`.toUpperCase();
    });
  }

  async function pickRoute(route: RouteHit) {
    setError("");
    setSelected(null);
    setPickedRoute(route);
    setLoadingStops(true);
    try {
      const params = new URLSearchParams({
        operator: route.operator,
        route: route.route,
        bound: route.bound ?? "O",
        serviceType: route.serviceType ?? "1",
      });
      if (route.routeId) params.set("routeId", route.routeId);
      const loaded = await apiGet<StopHit[]>(`/api/stops?${params}`);
      setStops(loaded);
      if (loaded.length) pickStop(loaded[0], route);
      else setStops([]);
    } catch (err) {
      setStops([]);
      setError(err instanceof Error ? err.message : "無法載入車站");
    } finally {
      setLoadingStops(false);
    }
  }

  function pickStop(stop: StopHit, route = pickedRoute) {
    setSelected({
      ...stop,
      route: stop.route ?? route?.route,
      routeId: stop.routeId ?? route?.routeId,
      bound: stop.bound ?? route?.bound,
      serviceType: stop.serviceType ?? route?.serviceType,
      region: stop.region ?? route?.region,
    });
  }

  function backToRoutes() {
    setPickedRoute(null);
    setStops([]);
    setSelected(null);
    setError("");
  }

  const showRouteList = hasSearched && !pickedRoute;
  const inStopsView = Boolean(pickedRoute);

  if (inStopsView && pickedRoute) {
    return (
      <div className="flex flex-col max-md:-mx-4 max-md:h-[calc(100dvh-11rem)] max-md:min-h-[32rem]">
        <div className="flex shrink-0 items-center gap-2 px-3 py-2 md:px-0">
          <button
            type="button"
            onClick={backToRoutes}
            className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-muted hover:border-teal hover:text-ink"
          >
            ← 改路線
          </button>
          {error || etaError ? <p className="truncate text-sm text-rose">{error || etaError}</p> : null}
          {loadingStops ? <p className="text-sm text-muted">載入車站中…</p> : null}
        </div>

        <div className="relative shrink-0 max-md:h-[48%] max-md:min-h-[15rem] md:h-[22rem]">
          {mappedStops.length ? (
            <StopStreetMapDynamic
              stops={mappedStops}
              selectedId={selected?.stopId}
              selectedSeq={selected?.seq}
              onSelect={pickStop}
              accent="teal"
              heightClass="h-full"
              className="h-full max-md:rounded-none max-md:border-x-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center border border-line bg-card text-sm text-muted max-md:rounded-none max-md:border-x-0">
              {loadingStops ? "載入地圖…" : "呢條線暫時冇車站座標。"}
            </div>
          )}
        </div>

        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto rounded-t-2xl border border-line bg-card shadow-[0_-8px_24px_rgba(0,0,0,.25)] max-md:-mt-3 md:mt-0 md:rounded-2xl">
          <div className="sticky top-0 z-10 border-b border-line bg-card/95 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs text-amber">{pickedRoute.operatorName}</span>
                <span className="font-mono text-xl text-teal">{pickedRoute.route}</span>
                <span className="text-sm text-ink">{pickedRoute.subtitle}</span>
              </div>
              <div
                className="flex shrink-0 rounded-full border border-line p-0.5 text-[11px]"
                role="group"
                aria-label="班次顯示方式"
              >
                <button
                  type="button"
                  onClick={() => setShowEtaDetails(true)}
                  className={`rounded-full px-2.5 py-1 ${
                    showEtaDetails ? "bg-teal/20 text-teal" : "text-muted hover:text-ink"
                  }`}
                >
                  詳細
                </button>
                <button
                  type="button"
                  onClick={() => setShowEtaDetails(false)}
                  className={`rounded-full px-2.5 py-1 ${
                    !showEtaDetails ? "bg-teal/20 text-teal" : "text-muted hover:text-ink"
                  }`}
                >
                  精簡
                </button>
              </div>
            </div>
            {selected && showEtaDetails ? (
              <div className="mt-1.5">
                <RouteInfoBanner
                  compact
                  info={routeInfo}
                  loading={routeInfoLoading}
                  soonestEtaMinutes={etas[0]?.etaMinutes ?? null}
                />
              </div>
            ) : null}
          </div>

          <ol className={`px-3 ${showEtaDetails ? "py-2" : "py-1"}`}>
            {stops.map((s, i) => {
              const active = selected?.stopId === s.stopId && selected?.seq === s.seq;
              const last = i === stops.length - 1;
              return (
                <li key={`${s.stopId}-${s.seq}`} className="relative flex gap-3">
                  <div className="flex w-5 shrink-0 flex-col items-center">
                    <span
                      className={`${showEtaDetails ? "mt-3" : "mt-2.5"} h-3 w-3 rounded-full border-2 ${
                        active ? "border-teal bg-teal" : "border-muted bg-card"
                      }`}
                    />
                    {!last ? <span className="w-0.5 flex-1 bg-line" /> : null}
                  </div>
                  <div className={`min-w-0 flex-1 ${showEtaDetails ? "pb-3" : "pb-0.5"}`}>
                    <button
                      id={`bus-stop-${s.stopId}-${s.seq}`}
                      type="button"
                      onClick={() => pickStop(s)}
                      className={`w-full rounded-xl text-left ${
                        showEtaDetails ? "px-3 py-2.5" : "px-2.5 py-2"
                      } ${active ? "bg-teal/10 ring-1 ring-teal/40" : "hover:bg-white/5"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {showEtaDetails ? (
                            <div className="text-[11px] font-mono text-muted">{s.seq}</div>
                          ) : null}
                          <div className={`truncate text-sm ${active ? "text-ink" : ""}`}>
                            {!showEtaDetails ? (
                              <span className="mr-1.5 font-mono text-[11px] text-muted">{s.seq}</span>
                            ) : null}
                            {s.name}
                          </div>
                        </div>
                        {active ? (
                          <div className="shrink-0 text-right">
                            {loading ? (
                              <div className="text-[10px] text-muted">…</div>
                            ) : etas[0]?.etaMinutes != null ? (
                              etas[0].etaMinutes <= 0 ? (
                                <div className="text-xs text-teal">即將到站</div>
                              ) : (
                                <>
                                  <div className="font-mono text-lg leading-none text-teal">{etas[0].etaMinutes}</div>
                                  <div className="text-[10px] text-muted">分鐘</div>
                                </>
                              )
                            ) : (
                              <div className="text-[10px] text-muted">—</div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </button>
                    {active && showEtaDetails ? (
                      <div className="mt-1 space-y-1 px-1">
                        {loading ? <p className="px-2 text-xs text-muted">載入班次中…</p> : null}
                        {!loading && !etas.length ? (
                          <p className="px-2 text-xs text-muted">此站暫無 {pickedRoute.route} 班次。</p>
                        ) : null}
                        {etas.map((eta, ei) => {
                          const soonest = ei === 0;
                          return (
                            <div
                              key={`${eta.etaTime}-${ei}`}
                              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                                soonest ? "bg-teal/10" : "bg-white/[0.03]"
                              }`}
                            >
                              <div className="min-w-0 text-xs text-muted">
                                <div>預計 {etaArriveLabel(eta)}</div>
                                {eta.remark ? <div className="text-amber">{eta.remark}</div> : null}
                                {eta.distanceMeters != null ? (
                                  <div>
                                    {formatBusDistance(eta.distanceMeters)}
                                    {eta.distanceEstimate ? "（估算）" : ""}
                                  </div>
                                ) : null}
                              </div>
                              <div className={`shrink-0 text-right ${soonest ? "text-teal" : "text-ink"}`}>
                                {eta.etaMinutes == null ? (
                                  <span className="font-mono">—</span>
                                ) : eta.etaMinutes <= 0 ? (
                                  <span className="text-xs">即將到站</span>
                                ) : (
                                  <span className="font-mono">
                                    {eta.etaMinutes}
                                    <span className="ml-0.5 text-[10px] text-muted">分鐘</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {typeof s.lat === "number" && typeof s.lng === "number" ? (
                          <NavigateToStopButton lat={s.lat} lng={s.lng} name={s.name} accent="teal" />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {!stops.length && !loadingStops ? (
              <li className="px-3 py-4 text-sm text-muted">呢條路線暫時冇車站資料。</li>
            ) : null}
          </ol>
        </div>
      </div>
    );
  }

  const routePickButtons = routes.map((r, i) => (
    <button
      key={`${r.operator}-${r.route}-${r.bound}-${r.routeId}-${i}`}
      type="button"
      onClick={() => void pickRoute(r)}
      className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-white/5 active:bg-white/10"
    >
      {mode === "bus" ? (
        <div className="flex items-start gap-3">
          <BusOperatorIcon operator={r.operator} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-xl leading-tight text-ink">{r.route}</div>
            <div className="truncate text-sm text-ink">往 {r.dest}</div>
            <div className="text-xs text-muted">{r.operatorName}</div>
          </div>
        </div>
      ) : (
        <>
          <span className="mr-2 text-xs text-amber">{r.operatorName}</span>
          <span className="mr-2 font-mono">{r.route}</span>
          {r.subtitle}
        </>
      )}
    </button>
  ));

  return (
    <div className={mode === "bus" ? "" : "space-y-5"}>
      {mode === "bus" ? (
        <div className="flex max-lg:-mx-4 max-lg:h-[calc(100dvh-11rem)] max-lg:max-h-[calc(100dvh-11rem)] max-lg:flex-col max-lg:overflow-hidden lg:hidden">
          <div className="shrink-0 border-b border-line bg-card px-4 py-3 text-center">
            <p className="text-xs text-muted">路線編號</p>
            <div className="mt-1 min-h-[2.5rem] font-mono text-3xl tracking-[0.12em] text-ink">
              {q || <span className="text-base tracking-normal text-muted">輸入路線號碼</span>}
            </div>
          </div>

          {belowSearch ? <div className="shrink-0 border-b border-line px-3 py-2">{belowSearch}</div> : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {error ? <p className="px-4 py-2 text-center text-sm text-rose">{error}</p> : null}
            {searching && q.trim() ? <p className="px-4 py-2 text-center text-sm text-muted">搜尋中…</p> : null}
            {!q.trim() ? (
              <p className="px-4 py-6 text-center text-sm text-muted">用下面鍵盤輸入路線號碼，會即時顯示相關巴士</p>
            ) : hasSearched && !routes.length && !searching ? (
              <p className="px-4 py-6 text-center text-sm text-muted">搵唔到呢條路線，試下其他編號或營運商篩選。</p>
            ) : (
              <div className="divide-y divide-line">{routePickButtons}</div>
            )}
          </div>

          <BusRouteKeypad
            onDigit={appendBusQuery}
            onLetter={appendBusQuery}
            onReset={() => setQ("")}
            onDelete={() => setQ((prev) => prev.slice(0, -1))}
          />
        </div>
      ) : null}

      <div className={mode === "bus" ? "hidden space-y-5 lg:block" : "space-y-5"}>
        <div className="flex flex-col items-center px-1 pt-2 md:pt-6">
          <p className="mb-1 text-sm text-muted">路線編號</p>
          <h2 className="mb-4 text-center text-xl font-medium tracking-wide md:text-2xl">
            {mode === "minibus" ? "輸入小巴路線" : "輸入巴士路線"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search(q);
            }}
            className="flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-2xl border border-line bg-card px-5 py-4 text-center font-mono text-2xl tracking-[0.12em] outline-none placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-muted focus:border-teal md:text-3xl"
            />
            <button
              type="submit"
              className="shrink-0 rounded-2xl bg-teal px-6 py-4 text-base font-medium text-bg hover:opacity-90 sm:min-w-28"
            >
              {searching ? "搜尋中…" : "搜尋"}
            </button>
          </form>
          {!showRouteList ? (
            <p className="mt-3 text-center text-sm text-muted">打路線號就會顯示可揀方向</p>
          ) : null}
        </div>

        {belowSearch ? <div className="flex justify-center">{belowSearch}</div> : null}

        {error ? <p className="text-center text-sm text-rose">{error}</p> : null}

        {showRouteList ? (
          <section className="mx-auto w-full max-w-xl rounded-2xl border border-line bg-card p-3">
            <h2 className="mb-2 px-1 text-sm text-muted">揀路線方向</h2>
            <div className="max-h-[min(60vh,28rem)] space-y-1 overflow-auto">{routePickButtons}</div>
            {!routes.length && !searching ? (
              <div className="px-3 py-2 text-sm text-muted">搵唔到呢條路線，試下其他編號或營運商篩選。</div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
