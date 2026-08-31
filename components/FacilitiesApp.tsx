"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LocationOffBanner } from "@/components/LocationOffBanner";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, openWalkingDirections, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { FacilityPlace, FacilitySnapshot } from "@/lib/providers/facilities";
import type { RegionFacet } from "@/lib/static/hk-districts";

type BrowseMode = "nearby" | "district";
type Section = "venues" | "toilets";

export function FacilitiesApp() {
  const [section, setSection] = useState<Section>("venues");
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

  const isToilets = section === "toilets";
  const noun = isToilets ? "廁所" : "場地";

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

    const path = isToilets ? `/api/toilets?${params}` : `/api/facilities?${params}`;

    apiGet<FacilitySnapshot>(path)
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
  }, [center.lat, center.lng, mode, region, district, type, isToilets]);

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

  const pickSection = (next: Section) => {
    if (next === section) return;
    setSection(next);
    setType("");
    setQuery("");
    setActiveId(null);
    setPlaces([]);
    setTypes([]);
    setFacets([]);
    setTotal(0);
    setError("");
  };

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
        <div className="flex gap-1 rounded-2xl border border-line bg-card p-1">
          <button
            type="button"
            onClick={() => pickSection("venues")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm ${
              !isToilets ? "bg-lime/20 text-lime" : "text-muted hover:text-ink"
            }`}
          >
            康文署場地
          </button>
          <button
            type="button"
            onClick={() => pickSection("toilets")}
            className={`flex-1 rounded-xl px-3 py-2 text-sm ${
              isToilets ? "bg-lime/20 text-lime" : "text-muted hover:text-ink"
            }`}
          >
            公共廁所
          </button>
        </div>

        {mode === "nearby" ? <LocationOffBanner label={`附近${noun}`} /> : null}
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
            附近{noun}
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
            {isToilets
              ? `顯示距離你較近嘅如廁點（全港資料庫共 ${total || "—"} 個）：食環署公廁／洗手間／浴室，以及地政總署 iGeoCom 商場（通常有洗手間，唔標樓層）。港鐵站內部廁所未納入。想睇全港：先揀港島／九龍／新界，再揀行政區。`
              : `顯示距離你較近嘅康文署場地（全港資料庫共 ${total || "—"} 個）。想睇全港：先揀港島／九龍／新界，再揀行政區。`}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isToilets ? "搜尋廁所名稱或地址…" : "搜尋場地名稱或地址…"}
            className="min-w-[12rem] flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-lime/50"
          />
          <p className="text-xs text-muted">
            {loading
              ? "載入中…"
              : mode === "district" && district
                ? `${district} · ${filtered.length} 個${noun}`
                : `附近 ${filtered.length} 個${noun}`}
          </p>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          {active ? (
            <article
              id="facility-detail"
              className="rounded-2xl border border-line bg-card p-4 scroll-mt-28"
            >
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
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openWalkingDirections(active.lat, active.lng, active.name)}
                  className="inline-flex items-center rounded-full bg-teal px-3.5 py-2 text-xs font-medium text-bg hover:opacity-90"
                >
                  前往{noun}
                </button>
              </div>
            </article>
          ) : (
            <div className="rounded-2xl border border-line bg-card p-6 text-sm text-muted">
              {loading ? `載入${noun}…` : `呢個範圍暫時冇${noun}。`}
            </div>
          )}

          <NearbyMapDynamic
            lat={center.lat}
            lng={center.lng}
            zoom={mode === "district" ? 12 : 14}
            fitAllPoints={places.length > 1}
            focusZoom={16}
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
            <p className="px-3 py-6 text-center text-sm text-muted">冇符合嘅{noun}</p>
          ) : null}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActiveId(p.id);
                document.getElementById("facility-detail")?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                });
              }}
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
