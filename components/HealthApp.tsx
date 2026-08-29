"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, useGeo, waitTone } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { HospitalWait } from "@/lib/providers/hospitals";

type SortMode = "nearest" | "wait";

export function HealthApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [hasLocated, setHasLocated] = useState(false);
  const [sort, setSort] = useState<SortMode>("wait");
  const [rows, setRows] = useState<HospitalWait[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const locatedOnce = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const applyLocation = (lat: number, lng: number) => {
    setCenter({ lat, lng });
    setHasLocated(true);
    setSort("nearest");
  };

  const locate = useGeo(applyLocation);

  useEffect(() => {
    if (locatedOnce.current || !navigator.geolocation) return;
    locatedOnce.current = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => applyLocation(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120_000 },
    );
  }, []);

  useEffect(() => {
    apiGet<HospitalWait[]>(`/api/hospitals?lat=${center.lat}&lng=${center.lng}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [center]);

  const sorted = useMemo(() => {
    const list = [...rows];
    if (sort === "nearest" && list.some((h) => h.distanceMeters != null)) {
      list.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
    } else {
      list.sort((a, b) => (a.waitMinutes ?? 9999) - (b.waitMinutes ?? 9999));
    }
    return list;
  }, [rows, sort]);

  function pickHospital(name: string) {
    setSelected(name);
    const el = listRef.current?.querySelector(`[data-hospital="${CSS.escape(name)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <AppShell>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted leading-snug sm:text-sm">
          第四／五類（半緊急及非緊急）輪候中位數。危急請打 999。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-full border border-line p-0.5 text-xs"
            role="group"
            aria-label="排序方式"
          >
            <button
              type="button"
              onClick={() => setSort("nearest")}
              disabled={!hasLocated}
              className={`rounded-full px-3 py-1.5 transition disabled:opacity-40 ${
                sort === "nearest" ? "bg-teal/20 text-teal" : "text-muted hover:text-ink"
              }`}
            >
              最近
            </button>
            <button
              type="button"
              onClick={() => setSort("wait")}
              className={`rounded-full px-3 py-1.5 transition ${
                sort === "wait" ? "bg-teal/20 text-teal" : "text-muted hover:text-ink"
              }`}
            >
              最短等候
            </button>
          </div>
          <button
            type="button"
            onClick={locate}
            className="shrink-0 rounded-xl border border-line px-3 py-1.5 text-xs sm:text-sm hover:border-teal"
          >
            {hasLocated ? "更新位置" : "使用我的位置"}
          </button>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose">{error}</p> : null}

      <NearbyMapDynamic
        lat={center.lat}
        lng={center.lng}
        zoom={12}
        selectedId={selected ?? undefined}
        onSelect={(p) => pickHospital(p.id)}
        heightClass="h-72 sm:h-80"
        className="max-md:-mx-4 max-md:rounded-none max-md:border-x-0 md:rounded-xl"
        points={sorted.map((h) => ({
          id: h.name,
          name: h.name,
          lat: h.lat,
          lng: h.lng,
          detail: h.t45,
        }))}
      />

      <div ref={listRef} className="mt-4 grid gap-3 md:grid-cols-2">
        {sorted.map((h) => {
          const on = selected === h.name;
          return (
            <article
              key={h.name}
              data-hospital={h.name}
              onClick={() => setSelected(h.name)}
              className={`cursor-pointer rounded-2xl border bg-card p-4 transition ${
                on ? "border-teal/50 ring-1 ring-teal/40" : "border-line hover:border-teal/30"
              }`}
            >
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg leading-snug">{h.name}</h2>
                  <div className="mt-0.5 text-xs text-muted">
                    {h.cluster}
                    {hasLocated && h.distanceMeters != null
                      ? ` · ${formatDistance(h.distanceMeters)}`
                      : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-xl leading-none ${waitTone(h.waitMinutes)}`}>
                    {h.t45}
                  </div>
                  <div className="mt-1 text-[10px] text-muted">半緊急／非緊急</div>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-snug text-muted">
                其他分流 · 危殆 {h.t1} · 危急 {h.t2} · 緊急 {h.t3}
              </p>
            </article>
          );
        })}
      </div>

      {sorted[0]?.updateTime ? (
        <p className="mt-4 text-xs text-muted">醫管局更新：{sorted[0].updateTime}</p>
      ) : null}
    </AppShell>
  );
}
