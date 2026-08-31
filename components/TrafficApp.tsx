"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LocationOffBanner } from "@/components/LocationOffBanner";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { CctvCamera, CctvRegionFacet, TrafficSnapshot } from "@/lib/providers/traffic";

type BrowseMode = "nearby" | "district";

export function TrafficApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [hasLocated, setHasLocated] = useState(false);
  const [mode, setMode] = useState<BrowseMode>("nearby");
  const [region, setRegion] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [facets, setFacets] = useState<CctvRegionFacet[]>([]);
  const [cameras, setCameras] = useState<CctvCamera[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);

  const locate = useGeo(
    (lat, lng) => {
      setCenter({ lat, lng });
      setHasLocated(true);
      setMode("nearby");
      setRegion(null);
      setDistrict(null);
      setError("");
    },
    (message) => setError(message),
  );

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setCameras([]);

    const params = new URLSearchParams();
    params.set("lat", String(center.lat));
    params.set("lng", String(center.lng));
    if (mode === "district" && region && district) {
      params.set("region", region);
      params.set("district", district);
    } else {
      params.set("limit", "40");
    }

    apiGet<TrafficSnapshot>(`/api/traffic?${params}`)
      .then((snap) => {
        if (cancelled) return;
        setFacets(snap.facets);
        setCameras(snap.cameras);
        setActiveKey(snap.cameras[0]?.key ?? null);
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
  }, [center.lat, center.lng, mode, region, district]);

  const active = useMemo(
    () => cameras.find((c) => c.key === activeKey) ?? null,
    [cameras, activeKey],
  );

  const regionFacet = facets.find((f) => f.region === region) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter(
      (c) =>
        c.description.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q) ||
        c.district.includes(query.trim()),
    );
  }, [cameras, query]);

  const mapCenter = active
    ? { lat: active.lat, lng: active.lng }
    : cameras[0]
      ? { lat: cameras[0].lat, lng: cameras[0].lng }
      : center;

  const pickRegion = (next: string) => {
    setMode("district");
    setRegion(next);
    const facet = facets.find((f) => f.region === next);
    const firstDistrict = facet?.districts[0]?.district ?? null;
    setDistrict(firstDistrict);
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
        {mode === "nearby" ? <LocationOffBanner label="附近鏡頭" /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pickNearby}
            className={`rounded-full px-3 py-1.5 text-sm ${
              mode === "nearby"
                ? "bg-amber/20 text-amber"
                : "border border-line text-muted hover:text-ink"
            }`}
          >
            附近鏡頭
          </button>
          {facets.map((f) => (
            <button
              key={f.region}
              type="button"
              onClick={() => pickRegion(f.region)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                mode === "district" && region === f.region
                  ? "bg-amber/20 text-amber"
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
                    ? "border-amber/50 bg-amber/15 text-ink"
                    : "border-line text-muted hover:border-amber/30 hover:text-ink"
                }`}
              >
                {d.district}
                <span className="ml-1 font-mono opacity-70">{d.count}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">
            顯示距離你較近嘅運輸署快拍。想睇全港：先揀港島／九龍／新界，再揀行政區。
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋鏡頭名稱或編號…"
            className="min-w-[12rem] flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-amber/50"
          />
          <p className="text-xs text-muted">
            {loading
              ? "載入中…"
              : mode === "district" && district
                ? `${district} · ${filtered.length} 個鏡頭`
                : `附近 ${filtered.length} 個鏡頭`}
          </p>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          {active ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={`${active.key}-${tick}`}
                src={`${active.imageUrl}&t=${tick}`}
                alt={active.description}
                className="aspect-video w-full bg-black object-cover"
              />
              <div className="p-3">
                <div className="text-sm leading-snug">{active.description}</div>
                <div className="mt-1 text-xs text-muted">
                  {active.region} · {active.district}
                  {active.distanceMeters != null ? ` · ${formatDistance(active.distanceMeters)}` : ""}
                  <span className="ml-2 font-mono opacity-70">{active.key}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-card p-6 text-sm text-muted">
              {loading ? "載入鏡頭…" : "呢個範圍暫時冇鏡頭。"}
            </div>
          )}

          <NearbyMapDynamic
            lat={mapCenter.lat}
            lng={mapCenter.lng}
            zoom={mode === "district" ? 12 : 13}
            fitAllPoints={cameras.length > 1}
            selectedId={active?.key}
            onSelect={(p) => setActiveKey(p.id)}
            heightClass="h-64 sm:h-80"
            points={cameras.map((c) => ({
              id: c.key,
              name: c.description,
              lat: c.lat,
              lng: c.lng,
              detail: `${c.district}${c.distanceMeters != null ? ` · ${formatDistance(c.distanceMeters)}` : ""}`,
            }))}
          />
        </div>

        <div className="max-h-[70vh] overflow-auto rounded-2xl border border-line bg-card p-2">
          {filtered.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted">冇符合嘅鏡頭</p>
          ) : null}
          {filtered.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveKey(c.key)}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                active?.key === c.key ? "bg-amber/15" : "hover:bg-ink/5"
              }`}
            >
              <div className="text-sm leading-snug">{c.description}</div>
              <div className="mt-0.5 text-xs text-muted">
                {c.district}
                {c.distanceMeters != null ? ` · ${formatDistance(c.distanceMeters)}` : ""}
                <span className="ml-2 font-mono opacity-60">{c.key}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
