"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FareHint } from "@/components/transit/FareHint";
import { FavoriteStarButton } from "@/components/transit/FavoriteStarButton";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import {
  tramEtaForStop,
  tramStopsMainline,
  TRAM_LINE,
  type TramDirection,
  type TramStop,
} from "@/lib/providers/tram";
import { formatTramFareLine, TRAM_FARES } from "@/lib/static/tram-fares";
import { useSyncActiveTrip } from "@/components/transit/useSyncActiveTrip";
import type { TransitFavorite } from "@/lib/transit-favorites-store";
import type { StopHit } from "@/lib/types";

function centerTimelineStop(scroller: HTMLDivElement, key: string, smooth: boolean) {
  const el = scroller.querySelector<HTMLElement>(`[data-tram-key="${CSS.escape(key)}"]`);
  if (!el) return;
  const elRect = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  const left =
    scroller.scrollLeft + (elRect.left - box.left) - box.width / 2 + elRect.width / 2;
  scroller.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
}

export function TramApp() {
  const stops = TRAM_LINE.stops;
  const [direction, setDirection] = useState<TramDirection>(() => {
    if (typeof window === "undefined") return "east";
    const dir = new URLSearchParams(window.location.search).get("dir");
    return dir === "west" ? "west" : "east";
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const stop = new URLSearchParams(window.location.search).get("stop")?.trim();
      if (stop && stops.some((s) => s.key === stop)) return stop;
    }
    const mid = stops.find((s) => s.name.includes("灣仔")) ?? stops[Math.floor(stops.length / 2)];
    return mid?.key ?? null;
  });
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);
  const alignOnceRef = useRef(false);

  const mainline = useMemo(() => tramStopsMainline(), []);
  const branch = useMemo(() => stops.filter((s) => s.branch === "跑馬地"), [stops]);
  const visible = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return mainline;
    return stops.filter((s) => s.name.toLowerCase().includes(n)).slice(0, 24);
  }, [q, mainline, stops]);

  const selected = selectedKey ? stops.find((s) => s.key === selectedKey) : null;
  const etas = useMemo(
    () => (selectedKey ? tramEtaForStop(selectedKey, direction) : []),
    [selectedKey, direction, tick],
  );

  const mapStops: StopHit[] = useMemo(
    () =>
      (q.trim() ? visible : mainline).map((s) => ({
        operator: "tram",
        operatorName: "香港電車",
        stopId: s.key,
        name: s.name,
        seq: s.seq,
        lat: s.lat,
        lng: s.lng,
      })),
    [mainline, visible, q],
  );

  const timeline: TramStop[] = q.trim()
    ? visible
    : [...mainline, ...branch.filter((b) => !mainline.some((m) => m.key === b.key))];

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedKey || !scrollerRef.current) return;
    const scroller = scrollerRef.current;
    const smooth = alignOnceRef.current;
    alignOnceRef.current = true;
    let cancelled = false;
    const run = () => {
      if (!cancelled) centerTimelineStop(scroller, selectedKey, smooth);
    };
    const raf = requestAnimationFrame(() => requestAnimationFrame(run));
    const timer = window.setTimeout(run, 80);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [selectedKey, q, direction, timeline.length]);

  function pick(key: string) {
    setSelectedKey(key);
    setQ("");
  }

  const dirShort = direction === "east" ? "東行" : "西行";
  const selectedDests = selected
    ? direction === "east"
      ? selected.destinationsEast
      : selected.destinationsWest
    : [];

  const tramTrip: TransitFavorite | null = selected
    ? {
        kind: "tram",
        stopKey: selected.key,
        direction,
        stopName: selected.name,
        label: `電車 ${selected.name}（${dirShort}）`,
        savedAt: Date.now(),
      }
    : null;
  useSyncActiveTrip(tramTrip);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div
          className="flex shrink-0 rounded-full border border-line p-0.5 text-sm"
          role="group"
          aria-label="行駛方向"
        >
          <button
            type="button"
            onClick={() => setDirection("east")}
            className={`rounded-full px-3.5 py-1.5 transition ${
              direction === "east" ? "bg-amber/20 text-amber" : "text-muted hover:text-ink"
            }`}
          >
            東行
          </button>
          <button
            type="button"
            onClick={() => setDirection("west")}
            className={`rounded-full px-3.5 py-1.5 transition ${
              direction === "west" ? "bg-amber/20 text-amber" : "text-muted hover:text-ink"
            }`}
          >
            西行
          </button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋車站"
          className="w-full rounded-xl border border-line bg-card px-3.5 py-2 text-sm outline-none focus:border-amber"
        />
      </div>
      <p className="text-[11px] text-muted leading-snug">
        {direction === "east"
          ? "堅尼地城 → 筲箕灣／跑馬地 · 時間軸或地圖揀站"
          : "筲箕灣 → 堅尼地城／石塘咀 · 時間軸或地圖揀站"}
      </p>

      <section className="rounded-2xl border border-line bg-card px-3 py-3">
        <h2 className="mb-2 text-xs font-medium text-muted">電車站時間軸</h2>
        <div
          ref={scrollerRef}
          data-tram-scroller
          className="overflow-x-auto pb-1 snap-x snap-mandatory"
          style={{ scrollbarGutter: "stable" }}
        >
          <div className="relative flex min-w-max gap-1.5 px-1 pt-0.5">
            <div
              className="pointer-events-none absolute left-5 right-5 top-[10px] h-[2px] rounded-full bg-gradient-to-r from-amber/15 via-amber/55 to-amber/15"
              aria-hidden
            />
            {timeline.map((s) => {
              const on = s.key === selectedKey;
              const dests = direction === "east" ? s.destinationsEast : s.destinationsWest;
              return (
                <button
                  key={s.key}
                  type="button"
                  data-tram-key={s.key}
                  onClick={() => pick(s.key)}
                  className={`snap-center relative z-[1] w-28 shrink-0 rounded-xl border px-2.5 pb-2.5 pt-1.5 text-left transition ${
                    on ? "border-amber bg-amber/20" : "border-line bg-elev/60 hover:border-amber/50"
                  }`}
                >
                  <div className="mb-1.5 flex justify-center">
                    <span
                      className={`block h-2.5 w-2.5 rounded-full border-2 shadow-[0_0_0_3px_rgba(7,16,24,.55)] ${
                        on ? "border-amber bg-amber" : "border-muted/80 bg-card"
                      }`}
                      aria-hidden
                    />
                  </div>
                  <div className={`text-xs leading-snug ${on ? "text-amber" : "text-ink"}`}>{s.name}</div>
                  {s.branch === "跑馬地" ? (
                    <div className="mt-0.5 text-[10px] text-muted">支線</div>
                  ) : null}
                  {on && dests.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {dests.slice(0, 2).map((d) => (
                        <span
                          key={d}
                          className="rounded-md bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <StopStreetMapDynamic
        stops={mapStops}
        selectedId={selectedKey ?? undefined}
        onSelect={(s) => pick(s.stopId)}
        accent="emerald"
        compactMarkers
        labelZoom={16}
        minZoom={11}
        heightClass="h-64 sm:h-80"
        className="max-md:-mx-4 max-md:rounded-none max-md:border-x-0"
      />

      {selected ? (
        <section className="rounded-2xl border border-amber/30 bg-amber/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="text-xl text-ink">{selected.name}</h3>
              <span className="text-xs text-muted">{dirShort}</span>
            </div>
            <FavoriteStarButton
              favorite={
                {
                  kind: "tram",
                  stopKey: selected.key,
                  direction,
                  stopName: selected.name,
                  label: `電車 ${selected.name}（${dirShort}）`,
                  savedAt: Date.now(),
                } satisfies TransitFavorite
              }
            />
          </div>
          {selectedDests.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedDests.map((d) => (
                <span
                  key={d}
                  className="rounded-full border border-amber/40 px-2.5 py-0.5 text-[11px] text-amber"
                >
                  開往 {d}
                </span>
              ))}
            </div>
          ) : null}
          <FareHint className="mt-2" label={formatTramFareLine()} note={TRAM_FARES.note} />
          <ul className="mt-3 space-y-2">
            {etas.map((eta, idx) => (
              <li
                key={`${eta.dest}-${idx}`}
                className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3"
              >
                <div>
                  <div className="text-sm text-ink">往 {eta.dest}</div>
                  <div className="mt-0.5 text-xs text-muted">{eta.remark}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl text-amber">
                    {eta.etaMinutes != null ? `約 ${eta.etaMinutes}` : "—"}
                  </div>
                  <div className="text-xs text-muted">分鐘</div>
                </div>
              </li>
            ))}
            {!etas.length ? <li className="text-sm text-muted">此方向暫無班次估算</li> : null}
          </ul>
        </section>
      ) : null}

      <p className="text-xs leading-relaxed text-muted">
        站點資料來自運輸署 GTFS（香港電車）。電車暫無公開實時到站 API，畫面上的倒數為幹線班次頻率估算，僅供參考。
      </p>
    </div>
  );
}
