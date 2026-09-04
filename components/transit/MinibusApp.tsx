"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FavoriteStarButton } from "@/components/transit/FavoriteStarButton";
import { GmbEtaExtras, GmbRoutePlate } from "@/components/transit/GmbBadges";
import { MinibusRouteKeypad } from "@/components/transit/MinibusRouteKeypad";
import { RouteInfoBanner, etaArriveLabel } from "@/components/transit/RouteInfoBanner";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { useEta } from "@/components/transit/useEta";
import { useRouteInfo } from "@/components/transit/useRouteInfo";
import { apiGet, openWalkingDirections } from "@/lib/client";
import { pickInitialRouteStop } from "@/lib/nearest-stop";
import { useSyncActiveTrip } from "@/components/transit/useSyncActiveTrip";
import { favoriteFromRouteHit } from "@/lib/transit-favorites-store";
import { useFillViewportHeight } from "@/lib/use-fill-viewport-height";
import type { EtaResult, RouteHit, StopHit } from "@/lib/types";

const MINIBUS_ROUTE_MAX_LEN = 4;

function NavigateToStopButton({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openWalkingDirections(lat, lng, name);
      }}
      className="mt-1.5 inline-flex items-center gap-2 rounded-full border border-line bg-elev/80 px-3.5 py-2 text-xs text-ink hover:border-lime/70"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 text-lime"
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

export function MinibusApp() {
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<RouteHit[]>([]);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<RouteHit | null>(null);
  const [stops, setStops] = useState<StopHit[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);
  const [selected, setSelected] = useState<StopHit | null>(null);
  const [error, setError] = useState("");
  const [expandedStopKey, setExpandedStopKey] = useState<string | null>(null);
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const favBoot = useRef(false);
  const { etas, loading, error: etaError } = useEta(selected);
  const { info: routeInfo, loading: routeInfoLoading } = useRouteInfo(
    picked,
    selected,
    stops.length || undefined,
  );

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    if (picked && needle.toUpperCase() === picked.route.toUpperCase() && !open) return;
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const data = await apiGet<{ routes: RouteHit[] }>(
          `/api/search?${new URLSearchParams({ q: needle, mode: "minibus" })}`,
        );
        if (!alive) return;
        setSuggestions(data.routes);
        setActive(0);
        setOpen(true);
        setError("");
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "搜尋失敗");
        setSuggestions([]);
      } finally {
        if (alive) setSearching(false);
      }
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q, picked, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function pickRoute(route: RouteHit) {
    setPicked(route);
    setQ(route.route);
    setOpen(false);
    setSuggestions([]);
    setSelected(null);
    setError("");
    setLoadingStops(true);
    try {
      const params = new URLSearchParams({
        operator: "gmb",
        routeId: route.routeId ?? "",
        bound: route.bound ?? "1",
      });
      const loaded = await apiGet<StopHit[]>(`/api/stops?${params}`);
      if (!loaded.length) {
        setStops([]);
        return;
      }
      const initial = (await pickInitialRouteStop(loaded)) ?? loaded[0];
      setStops(loaded);
      setSelected({
        ...initial,
        route: initial.route ?? route.route,
        routeId: initial.routeId ?? route.routeId,
        bound: initial.bound ?? route.bound,
        serviceType: initial.serviceType ?? route.serviceType,
        region: initial.region ?? route.region,
      });
      setExpandedStopKey(`${initial.stopId}-${initial.seq}`);
    } catch (err) {
      setStops([]);
      setError(err instanceof Error ? err.message : "無法載入車站");
    } finally {
      setLoadingStops(false);
    }
  }

  // Deep link from favorites: /transit/minibus?op=gmb&route=&bound=&rid=&region=
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const routeNo = sp.get("route")?.trim();
    const rid = sp.get("rid")?.trim() || "";
    if (!routeNo) return;
    const bound = sp.get("bound")?.trim() || "1";
    const region = sp.get("region")?.trim() || "";
    let alive = true;
    void (async () => {
      try {
        const params = new URLSearchParams({ q: routeNo, mode: "minibus" });
        if (region) params.set("region", region);
        const data = await apiGet<{ routes: RouteHit[] }>(`/api/search?${params}`);
        if (!alive || favBoot.current) return;
        const match =
          data.routes.find(
            (r) =>
              r.route.toUpperCase() === routeNo.toUpperCase() &&
              (!rid || r.routeId === rid) &&
              (r.bound ?? "1") === bound &&
              (!region || r.region === region),
          ) ?? data.routes.find((r) => r.route.toUpperCase() === routeNo.toUpperCase());
        if (!match) return;
        favBoot.current = true;
        await pickRoute(match);
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter") && suggestions.length) {
      setOpen(true);
    }
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = suggestions[active];
      if (hit) void pickRoute(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const displayEtas: EtaResult[] = useMemo(() => {
    if (!picked) return etas;
    return etas.map((eta) => ({
      ...eta,
      route: picked.route,
      dest: picked.dest,
      region: picked.region,
    }));
  }, [etas, picked]);

  const mappedStops = useMemo(
    () => stops.filter((s) => typeof s.lat === "number" && typeof s.lng === "number"),
    [stops],
  );

  useSyncActiveTrip(picked ? favoriteFromRouteHit("minibus", picked) : null);

  useEffect(() => {
    if (!selected) return;
    document.getElementById(`gmb-stop-${selected.stopId}-${selected.seq}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function backToSearch() {
    setPicked(null);
    setStops([]);
    setSelected(null);
    setExpandedStopKey(null);
    setMapCollapsed(false);
    setOpen(Boolean(q.trim()));
    setError("");
  }

  function stopKey(stop: StopHit) {
    return `${stop.stopId}-${stop.seq}`;
  }

  function selectStop(stop: StopHit) {
    setSelected({
      ...stop,
      route: stop.route ?? picked?.route,
      routeId: stop.routeId ?? picked?.routeId,
      bound: stop.bound ?? picked?.bound,
      serviceType: stop.serviceType ?? picked?.serviceType,
      region: stop.region ?? picked?.region,
    });
  }

  function openStop(stop: StopHit) {
    selectStop(stop);
    setExpandedStopKey(stopKey(stop));
  }

  function toggleStopDetails(stop: StopHit) {
    const key = stopKey(stop);
    if (expandedStopKey === key) {
      setExpandedStopKey(null);
      return;
    }
    selectStop(stop);
    setExpandedStopKey(key);
  }

  function appendMinibusQuery(next: string) {
    setQ((prev) => {
      if (prev.length >= MINIBUS_ROUTE_MAX_LEN) return prev;
      return `${prev}${next}`.toUpperCase();
    });
  }

  const fillRef = useRef<HTMLDivElement | null>(null);
  const fillH = useFillViewportHeight(fillRef);

  const routePickButtons = suggestions.map((route, i) => (
    <button
      key={`${route.region}-${route.route}-${route.routeId}-${route.bound}-${i}`}
      type="button"
      onClick={() => void pickRoute(route)}
      className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-ink/5 active:bg-ink/10"
    >
      <GmbRoutePlate route={route.route} region={route.region} size="sm" />
      <span className="min-w-0 flex-1 pt-0.5 text-sm leading-snug text-ink">
        {route.orig} → {route.dest}
      </span>
    </button>
  ));

  if (picked) {
    return (
      <div className="flex flex-col max-md:-mx-4 max-md:h-[calc(100dvh-11rem)] max-md:min-h-[32rem]">
        <div className="flex shrink-0 items-center gap-2 px-3 py-2 md:px-0">
          <button
            type="button"
            onClick={backToSearch}
            className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-muted hover:border-emerald-400 hover:text-ink"
          >
            ← 改路線
          </button>
          <button
            type="button"
            onClick={() => setMapCollapsed((v) => !v)}
            className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm text-muted hover:border-emerald-400 hover:text-ink"
            aria-pressed={mapCollapsed}
          >
            {mapCollapsed ? "顯示地圖" : "收起地圖"}
          </button>
          {error || etaError ? <p className="truncate text-sm text-rose">{error || etaError}</p> : null}
          {loadingStops ? <p className="text-sm text-muted">載入車站中…</p> : null}
        </div>

        {!mapCollapsed ? (
          <div className="relative shrink-0 max-md:h-[42%] max-md:min-h-[12rem] md:h-[22rem]">
            {mappedStops.length ? (
              <StopStreetMapDynamic
                stops={mappedStops}
                selectedId={selected?.stopId}
                selectedSeq={selected?.seq}
                onSelect={openStop}
                accent="emerald"
                compactMarkers
                labelZoom={16}
                focusZoom={17}
                heightClass="h-full"
                className="h-full max-md:rounded-none max-md:border-x-0"
              />
            ) : (
              <div className="flex h-full items-center justify-center border border-line bg-card text-sm text-muted max-md:rounded-none max-md:border-x-0">
                {loadingStops ? "載入地圖…" : "呢條線暫時冇車站座標。"}
              </div>
            )}
          </div>
        ) : null}

        <div
          className={`relative z-10 min-h-0 flex-1 overflow-y-auto rounded-t-2xl border border-line bg-card shadow-[0_-8px_24px_rgba(0,0,0,.25)] md:mt-0 md:rounded-2xl ${
            mapCollapsed ? "max-md:mt-0" : "max-md:-mt-3"
          }`}
        >
          <div className="sticky top-0 z-10 border-b border-line bg-card/95 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex flex-wrap items-center gap-2">
                <GmbRoutePlate route={picked.route} region={picked.region} />
                <span className="text-sm">
                  {picked.orig} → {picked.dest}
                </span>
              </div>
              <FavoriteStarButton favorite={favoriteFromRouteHit("minibus", picked)} />
            </div>
            {selected ? (
              <div className="mt-1.5">
                <RouteInfoBanner
                  compact
                  info={routeInfo}
                  loading={routeInfoLoading}
                  soonestEtaMinutes={displayEtas[0]?.etaMinutes ?? null}
                />
              </div>
            ) : null}
          </div>

          <ol className="px-3 py-1">
            {stops.map((s, i) => {
              const active = selected?.stopId === s.stopId && selected?.seq === s.seq;
              const expanded = expandedStopKey === stopKey(s);
              const last = i === stops.length - 1;
              return (
                <li key={`${s.stopId}-${s.seq}`} className="relative flex gap-2">
                  <div className="flex w-5 shrink-0 flex-col items-center">
                    <span
                      className={`mt-3 h-3 w-3 rounded-full border-2 ${
                        active ? "border-lime bg-lime" : "border-muted bg-card"
                      }`}
                    />
                    {!last ? <span className="w-0.5 flex-1 bg-line" /> : null}
                  </div>
                  <div className={`min-w-0 flex-1 ${expanded ? "pb-3" : "pb-0.5"}`}>
                    <div
                      className={`flex overflow-hidden rounded-xl ${
                        active ? "bg-lime/10 ring-1 ring-inset ring-lime/55" : "hover:bg-elev/40"
                      }`}
                    >
                      <button
                        id={`gmb-stop-${s.stopId}-${s.seq}`}
                        type="button"
                        onClick={() => openStop(s)}
                        className="min-w-0 flex-1 px-2.5 py-2 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate text-sm">
                            <span className="mr-1.5 font-mono text-[11px] text-muted">{s.seq}</span>
                            {s.name}
                          </div>
                          {active ? (
                            <div className="shrink-0 text-right">
                              {loading ? (
                                <div className="text-[10px] text-muted">…</div>
                              ) : displayEtas[0]?.etaMinutes != null ? (
                                displayEtas[0].etaMinutes <= 0 ? (
                                  <div className="text-xs text-lime">即將到站</div>
                                ) : (
                                  <>
                                    <div className="font-mono text-lg leading-none text-lime">
                                      {displayEtas[0].etaMinutes}
                                    </div>
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
                      <button
                        type="button"
                        onClick={() => toggleStopDetails(s)}
                        aria-expanded={expanded}
                        aria-label={expanded ? `收合 ${s.name} 班次` : `展開 ${s.name} 班次`}
                        className={`flex w-10 shrink-0 items-center justify-center border-l border-line/60 text-muted hover:text-ink ${
                          expanded ? "bg-lime/10 text-lime" : ""
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </div>
                    {expanded ? (
                      <div className="mt-1 space-y-1 px-1">
                        {loading ? <p className="px-2 text-xs text-muted">載入班次中…</p> : null}
                        {!loading && !displayEtas.length ? (
                          <p className="px-2 text-xs text-muted">呢個站暫時冇到站資料。</p>
                        ) : null}
                        {displayEtas.map((eta, ei) => {
                          const soonest = ei === 0;
                          return (
                            <div
                              key={`${eta.etaTime}-${ei}`}
                              className={`rounded-lg px-3 py-2 text-sm ${
                                soonest ? "bg-lime/10" : "bg-elev/40"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 text-xs text-muted">
                                  <div>預計 {etaArriveLabel(eta)}</div>
                                </div>
                                <div className={`shrink-0 text-right ${soonest ? "text-lime" : "text-ink"}`}>
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
                              <GmbEtaExtras eta={eta} />
                            </div>
                          );
                        })}
                        {typeof s.lat === "number" && typeof s.lng === "number" ? (
                          <NavigateToStopButton lat={s.lat} lng={s.lng} name={s.name} />
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

  return (
    <>
      <div
        ref={fillRef}
        className="flex max-lg:-mx-4 max-lg:flex-col max-lg:overflow-hidden lg:hidden"
        style={
          fillH
            ? { height: fillH, maxHeight: fillH }
            : {
                height:
                  "calc(100dvh - var(--app-header-h) - var(--app-bottom-nav-h) - var(--app-safe-bottom) - 5.5rem)",
                maxHeight:
                  "calc(100dvh - var(--app-header-h) - var(--app-bottom-nav-h) - var(--app-safe-bottom) - 5.5rem)",
              }
        }
      >
        <div className="shrink-0 border-b border-line bg-card px-4 py-2 text-center">
          <p className="text-[11px] text-muted">路線編號</p>
          <div className="mt-0.5 min-h-9 font-mono text-2xl tracking-[0.12em] text-ink">
            {q || <span className="text-sm tracking-normal text-muted">輸入路線號碼</span>}
          </div>
        </div>

        <div className="min-h-[30%] flex-1 overflow-y-auto overscroll-contain">
          {error ? <p className="px-4 py-2 text-center text-sm text-rose">{error}</p> : null}
          {searching && q.trim() ? <p className="px-4 py-2 text-center text-sm text-muted">搜尋中…</p> : null}
          {!q.trim() ? (
            <p className="px-4 py-5 text-center text-sm text-muted">用下面鍵盤輸入路線號碼，會即時顯示相關小巴</p>
          ) : !searching && !suggestions.length ? (
            <p className="px-4 py-5 text-center text-sm text-muted">搵唔到呢個編號。試下 10、48M、N27 等。</p>
          ) : (
            <div className="divide-y divide-line">{routePickButtons}</div>
          )}
          <p className="px-4 py-2.5 text-center text-[11px] text-muted">
            專線小巴（綠Van）唔使先揀區域；紅色小巴冇官方到站資料。
          </p>
        </div>

        <MinibusRouteKeypad
          onDigit={appendMinibusQuery}
          onLetter={appendMinibusQuery}
          onReset={() => setQ("")}
          onDelete={() => setQ((prev) => prev.slice(0, -1))}
        />
      </div>

      <div className="hidden space-y-5 lg:block">
      <div className="flex flex-col items-center px-1 pt-2 md:pt-6">
        <p className="mb-1 text-sm text-muted">路線編號</p>
        <h2 className="mb-4 text-center text-xl font-medium tracking-wide md:text-2xl">輸入小巴路線</h2>
        <div ref={boxRef} className="relative w-full max-w-xl">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (suggestions.length || q.trim()) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            placeholder="例如 10、48M、101M"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && suggestions[active] ? `${listId}-${active}` : undefined}
            className="w-full rounded-2xl border border-line bg-card px-5 py-4 text-center font-mono text-2xl tracking-[0.12em] outline-none placeholder:font-sans placeholder:text-base placeholder:tracking-normal placeholder:text-muted focus:border-emerald-400 md:text-3xl"
          />
          {searching ? (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">
              搜尋中…
            </span>
          ) : null}
          {open && q.trim() ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-line bg-card p-1 shadow-2xl"
            >
              {suggestions.length ? (
                suggestions.map((route, i) => (
                  <li key={`${route.region}-${route.route}-${route.routeId}-${route.bound}-${i}`} role="option">
                    <button
                      id={`${listId}-${i}`}
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => void pickRoute(route)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${
                        i === active ? "bg-white/10" : "hover:bg-white/5"
                      }`}
                    >
                      <GmbRoutePlate route={route.route} region={route.region} />
                      <span className="min-w-0 pt-0.5 text-sm">
                        {route.orig} → {route.dest}
                      </span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-3 py-3 text-sm text-muted">
                  {searching ? "搵緊路線…" : "搵唔到呢個編號。試下 1、10M、101M。"}
                </li>
              )}
            </ul>
          ) : null}
        </div>
        <p className="mt-3 text-center text-sm text-muted">打路線號就會顯示可揀方向</p>
        <p className="mt-2 max-w-xl text-center text-xs text-muted">
          專線小巴（綠Van）唔使先揀港島／九龍／新界；紅色小巴冇官方到站資料。
        </p>
      </div>

      {error ? <p className="text-center text-sm text-rose">{error}</p> : null}
      </div>
    </>
  );
}
