"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { FacilityPlace, FacilitySnapshot } from "@/lib/providers/facilities";
import type { RegionFacet } from "@/lib/static/hk-districts";

type BrowseMode = "nearby" | "district";

export function FacilitiesApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [hasLocated, setHasLocated] = useState(false);
  const [mode, setMode] = useState<BrowseMode>("nearby");
  const [region, setRegion] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [type, setType] = useState("");
  const [facets, setFacets] = useState<RegionFacet[]>([]);
  const [types, setTypes] = useState<Array<{ type: string; count: number }>>([]);
  const [places, setPlaces] = useState<FacilityPlace[]>([]);
  const [total, setTotal] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const locate = useGeo((lat, lng) => {
    setCenter({ lat, lng });
    setHasLocated(true);
    setMode("nearby");
    setRegion(null);
    setDistrict(null);
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    const params = new URLSearchParams();
    params.set("lat", String(center.lat));
    params.set("lng", String(center.lng));
    if (type) params.set("type", type);
    if (mode === "district" && region && district) {
      params.set("region", region);
      params.set("district", district);
    } else {
      params.set("limit", "40");
    }

    apiGet<FacilitySnapshot>(`/api/facilities?${params}`)
      .then((snap) => {
        if (cancelled) return;
        setFacets(snap.facets);
        setTypes(snap.types);
        setPlaces(snap.places);
        setTotal(snap.total);
        setActiveId(snap.places[0]?.id ?? null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "載入失敗");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng, mode, region, district, type]);

  const active = useMemo(
    () => places.find((p) => p.id === activeId) ?? null,
    [places, activeId],
  );

  const regionFacet = facets.find((f) => f.region === region) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return places;
    return places.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q) ||
        p.type.includes(query.trim()) ||
        p.district.includes(query.trim()),
    );
  }, [places, query]);

  const mapCenter = active
    ? { lat: active.lat, lng: active.lng }
    : places[0]
      ? { lat: places[0].lat, lng: places[0].lng }
      : center;

  const pickRegion = (next: string) => {
    setMode("district");
    setRegion(next);
    const facet = facets.find((f) => f.region === next);
    setDistrict(facet?.districts[0]?.district ?? null);
    setQuery("");
  };

  const pickNearby = () => {
    setMode("nearby");
    setRegion(null);
    setDistrict(null);
    setQuery("");
  };

  return (
    <AppShell>
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pickNearby}
            className={`rounded-full px-3 py-1.5 text-sm ${
              mode === "nearby"
                ? "bg-lime/20 text-lime"
                : "border border-line text-muted hover:text-ink"
            }`}
          >
            附近場地
          </button>
          {facets.map((f) => (
            <button
              key={f.region}
              type="button"
              onClick={() => pickRegion(f.region)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                mode === "district" && region === f.region
                  ? "bg-lime/20 text-lime"
                  : "border border-line text-muted hover:text-ink"
              }`}
            >
              {f.region}
              <span className="ml-1 font-mono text-[11px] opacity-70">{f.count}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={locate}
            className="ml-auto rounded-xl border border-line px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            {hasLocated ? "更新位置" : "使用我的位置"}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setType("")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
              !type ? "bg-lime/20 text-lime" : "border border-line text-muted"
            }`}
          >
            全部類型
          </button>
          {types.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setType(t.type)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                type === t.type
                  ? "bg-lime/20 text-lime"
                  : "border border-line text-muted hover:text-ink"
              }`}
            >
              {t.type}
              <span className="ml-1 font-mono opacity-70">{t.count}</span>
            </button>
          ))}
        </div>

        {mode === "district" && regionFacet ? (
          <div className="flex flex-wrap gap-2">
            {regionFacet.districts.map((d) => (
              <button
                key={d.district}
                type="button"
                onClick={() => {
                  setDistrict(d.district);
                  setQuery("");
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs ${
                  district === d.district
                    ? "border-lime/50 bg-lime/15 text-ink"
                    : "border-line text-muted hover:border-lime/30 hover:text-ink"
                }`}
              >
                {d.district}
                <span className="ml-1 font-mono opacity-70">{d.count}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">
            顯示距離你較近嘅康文署場地（全港資料庫共 {total || "—"} 個）。想睇全港：先揀港島／九龍／新界，再揀行政區。
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋場地名稱或地址…"
            className="min-w-[12rem] flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-lime/50"
          />
          <p className="text-xs text-muted">
            {loading
              ? "載入中…"
              : mode === "district" && district
                ? `${district} · ${filtered.length} 個場地`
                : `附近 ${filtered.length} 個場地`}
          </p>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          {active ? (
            <article className="rounded-2xl border border-line bg-card p-4">
              <div className="text-xs text-lime">{active.type}</div>
              <h2 className="mt-0.5 text-lg leading-snug">{active.name}</h2>
              <p className="mt-1 text-sm text-muted">{active.address || "—"}</p>
              <p className="mt-2 text-sm">開放：{active.hours || "—"}</p>
              <p className="mt-1 text-xs text-muted">
                {active.district}
                {active.distanceMeters != null ? ` · ${formatDistance(active.distanceMeters)}` : ""}
                {active.phone ? ` · ${active.phone}` : ""}
                {active.courts ? ` · ${active.courts}` : ""}
              </p>
            </article>
          ) : (
            <div className="rounded-2xl border border-line bg-card p-6 text-sm text-muted">
              {loading ? "載入場地…" : "呢個範圍暫時冇場地。"}
            </div>
          )}

          <NearbyMapDynamic
            lat={mapCenter.lat}
            lng={mapCenter.lng}
            zoom={mode === "district" ? 12 : 14}
            fitAllPoints={places.length > 1}
            selectedId={active?.id}
            onSelect={(p) => setActiveId(p.id)}
            heightClass="h-64 sm:h-80"
            points={places.map((p) => ({
              id: p.id,
              name: p.name,
              lat: p.lat,
              lng: p.lng,
              detail: `${p.type}${p.distanceMeters != null ? ` · ${formatDistance(p.distanceMeters)}` : ""}`,
            }))}
          />
        </div>

        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-card p-2">
          {filtered.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted">冇符合嘅場地</p>
          ) : null}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveId(p.id)}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                active?.id === p.id ? "bg-lime/15" : "hover:bg-ink/5"
              }`}
            >
              <div className="text-[11px] text-lime">{p.type}</div>
              <div className="text-sm leading-snug">{p.name}</div>
              <div className="mt-0.5 text-xs text-muted">
                {p.district}
                {p.distanceMeters != null ? ` · ${formatDistance(p.distanceMeters)}` : ""}
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
