"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EtaPanel } from "@/components/transit/EtaPanel";
import { GmbRoutePlate } from "@/components/transit/GmbBadges";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { useEta } from "@/components/transit/useEta";
import { apiGet } from "@/lib/client";
import type { EtaResult, RouteHit, StopHit } from "@/lib/types";

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
  const { etas, loading, error: etaError } = useEta(selected);

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
    setStops([]);
    setError("");
    setLoadingStops(true);
    try {
      const params = new URLSearchParams({
        operator: "gmb",
        routeId: route.routeId ?? "",
        bound: route.bound ?? "1",
      });
      setStops(await apiGet<StopHit[]>(`/api/stops?${params}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "無法載入車站");
    } finally {
      setLoadingStops(false);
    }
  }

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

  useEffect(() => {
    if (!selected) return;
    document.getElementById(`gmb-stop-${selected.stopId}-${selected.seq}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <div className="space-y-4">
      <div ref={boxRef} className="relative">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            if (picked && e.target.value.trim().toUpperCase() !== picked.route.toUpperCase()) {
              setPicked(null);
              setStops([]);
              setSelected(null);
            }
          }}
          onFocus={() => {
            if (suggestions.length || q.trim()) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="輸入路線編號，例如 10、48M、101M"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && suggestions[active] ? `${listId}-${active}` : undefined}
          className="w-full rounded-2xl border border-line bg-card px-4 py-4 text-lg outline-none focus:border-emerald-400"
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
      <p className="text-sm text-muted">
        專線小巴（綠Van）唔使先揀港島／九龍／新界，打編號就會出起點同終點。紅色小巴冇官方到站資料。
      </p>
      {error || etaError ? <p className="text-sm text-rose">{error || etaError}</p> : null}

      {picked ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-900/60 bg-emerald-950/30 px-4 py-3">
          <GmbRoutePlate route={picked.route} region={picked.region} />
          <span>
            {picked.orig} → {picked.dest}
          </span>
        </div>
      ) : null}

      {mappedStops.length ? (
        <StopStreetMapDynamic
          stops={mappedStops}
          selectedId={selected?.stopId}
          selectedSeq={selected?.seq}
          onSelect={setSelected}
          accent="emerald"
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-3">
          <h2 className="mb-2 px-1 text-sm text-muted">選擇車站</h2>
          <div className="max-h-80 space-y-1 overflow-auto">
            {loadingStops ? <p className="px-3 py-2 text-sm text-muted">載入車站中…</p> : null}
            {stops.map((s) => (
              <button
                id={`gmb-stop-${s.stopId}-${s.seq}`}
                key={`${s.stopId}-${s.seq}`}
                type="button"
                onClick={() => setSelected(s)}
                className={`w-full rounded-lg px-3 py-2 text-left ${
                  selected?.stopId === s.stopId && selected?.seq === s.seq
                    ? "bg-lime/15 ring-1 ring-inset ring-lime/55"
                    : "hover:bg-white/5"
                }`}
              >
                <span
                  className={`mr-2 font-mono text-xs ${
                    selected?.stopId === s.stopId && selected?.seq === s.seq ? "text-lime" : "text-muted"
                  }`}
                >
                  {s.seq}
                </span>
                {s.name}
              </button>
            ))}
            {!stops.length && !loadingStops ? (
              <p className="px-3 py-2 text-sm text-muted">喺上面打路線編號，再揀方向。</p>
            ) : null}
          </div>
        </section>
        <EtaPanel
          title={selected ? selected.name : "到達時間"}
          etas={displayEtas}
          loading={loading}
          emptyHint={
            selected
              ? "呢個站暫時冇到站資料。有車牌／空位嘅話會一齊顯示。"
              : "揀路線同車站之後，會顯示班次、車牌同空位（若官方有提供）。"
          }
        />
      </div>
    </div>
  );
}
