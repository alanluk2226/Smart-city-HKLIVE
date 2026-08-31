"use client";

import { useEffect, useMemo, useState } from "react";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import { getLocationEnabled } from "@/lib/location-pref";
import type { TaxiCallStation, TaxiPoint, TaxiPointKind } from "@/lib/providers/taxi";
import type { StopHit } from "@/lib/types";

type TaxiPayload = {
  points: Array<TaxiPoint & { distanceMeters?: number }>;
  calls: TaxiCallStation[];
  counts: { stands: number; pickups: number; calls: number };
};

type KindFilter = "all" | TaxiPointKind;
type Panel = "map" | "calls";

function telHref(phone: string) {
  const n = phone.replace(/[^\d+]/g, "");
  return n ? `tel:${n}` : undefined;
}

export function TaxiApp() {
  const [panel, setPanel] = useState<Panel>("map");
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [data, setData] = useState<TaxiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const locate = useGeo((lat, lng) => setCenter({ lat, lng }));

  useEffect(() => {
    if (!navigator.geolocation || !getLocationEnabled()) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          kind,
          lat: String(center.lat),
          lng: String(center.lng),
        });
        if (q.trim()) params.set("q", q.trim());
        const snap = await apiGet<TaxiPayload>(`/api/taxi?${params}`);
        if (!alive) return;
        setData(snap);
        setSelectedId((prev) => {
          if (prev && snap.points.some((p) => p.id === prev)) return prev;
          return snap.points[0]?.id ?? null;
        });
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "無法載入的士資料");
      } finally {
        if (alive) setLoading(false);
      }
    }
    const t = window.setTimeout(load, q.trim() ? 250 : 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [kind, center.lat, center.lng, q]);

  const selected = data?.points.find((p) => p.id === selectedId) ?? null;

  const mapStops: StopHit[] = useMemo(
    () =>
      (data?.points ?? []).map((p, i) => ({
        operator: "taxi",
        operatorName: p.kind === "stand" ? "的士站" : "上落客點",
        stopId: p.id,
        name: p.name,
        seq: i < 40 ? i + 1 : undefined,
        lat: p.lat,
        lng: p.lng,
        distanceMeters: p.distanceMeters,
        route: p.kind,
      })),
    [data?.points],
  );

  const list = useMemo(() => (data?.points ?? []).slice(0, 80), [data?.points]);

  const callsByArea = useMemo(() => {
    const map = new Map<string, TaxiCallStation[]>();
    for (const c of data?.calls ?? []) {
      const key = c.area || "其他";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [data?.calls]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl text-ink">的士</h1>
          <p className="text-xs text-muted mt-1">
            運輸署開放數據：的士站 {data?.counts.stands ?? "—"} · 上落客點 {data?.counts.pickups ?? "—"} · 電召台{" "}
            {data?.counts.calls ?? "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPanel("map")}
            className={`rounded-full border px-4 py-2 text-sm ${
              panel === "map" ? "border-amber bg-amber/15 text-amber" : "border-line text-muted"
            }`}
          >
            地圖／站點
          </button>
          <button
            type="button"
            onClick={() => setPanel("calls")}
            className={`rounded-full border px-4 py-2 text-sm ${
              panel === "calls" ? "border-amber bg-amber/15 text-amber" : "border-line text-muted"
            }`}
          >
            電召電話
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={panel === "calls" ? "搜尋電召台名稱／電話" : "搜尋地區、站名、上落客點"}
          className="flex-1 rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-amber"
        />
        {panel === "map" ? (
          <button
            type="button"
            onClick={locate}
            className="rounded-xl border border-line px-4 py-3 text-sm text-muted hover:border-amber hover:text-amber"
          >
            附近優先
          </button>
        ) : null}
      </div>

      {panel === "map" ? (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(
              [
                { key: "all", label: "全部" },
                { key: "stand", label: "的士站" },
                { key: "pickup", label: "上落客點" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setKind(f.key)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                  kind === f.key ? "border-amber bg-amber/15 text-amber" : "border-line text-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-rose">{error}</p> : null}
          {loading && !data ? <p className="text-sm text-muted">載入的士站與上落客點…</p> : null}

          <StopStreetMapDynamic
            stops={mapStops}
            selectedId={selectedId ?? undefined}
            onSelect={(s) => setSelectedId(s.stopId)}
            accent="emerald"
            showRouteLine={false}
            compactMarkers
            labelZoom={15}
            minZoom={10}
          />

          {selected ? (
            <section className="rounded-2xl border border-amber/30 bg-amber/5 p-4">
              <div className="text-xs text-amber mb-1">
                {selected.kind === "stand" ? "的士站" : "上落客點"} · {selected.status}
              </div>
              <h2 className="text-xl text-ink">{selected.name}</h2>
              <p className="text-sm text-muted mt-1">
                {selected.region}
                {selected.district ? ` · ${selected.district}` : ""}
                {selected.distanceMeters != null ? ` · ${formatDistance(selected.distanceMeters)}` : ""}
              </p>
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-card divide-y divide-line max-h-80 overflow-y-auto">
            {list.map((p, i) => {
              const on = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-white/5 ${on ? "bg-amber/10" : ""}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm text-ink">
                        <span className="font-mono text-xs text-muted mr-2">{i + 1}</span>
                        {p.name}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        {p.kind === "stand" ? "的士站" : "上落客點"} · {p.district || p.region}
                      </div>
                    </div>
                    {p.distanceMeters != null ? (
                      <div className="text-xs text-muted shrink-0">{formatDistance(p.distanceMeters)}</div>
                    ) : null}
                  </div>
                </button>
              );
            })}
            {!loading && !list.length ? (
              <p className="px-4 py-6 text-sm text-muted">沒有符合的站點</p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="space-y-4">
          {error ? <p className="text-sm text-rose">{error}</p> : null}
          {loading && !data ? <p className="text-sm text-muted">載入電召電話表…</p> : null}
          {callsByArea.map(([area, rows]) => (
            <div key={area} className="rounded-2xl border border-line bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-line text-sm text-amber">{area}</div>
              <ul className="divide-y divide-line">
                {rows.map((c) => (
                  <li key={`${c.area}-${c.name}-${c.phone1}`} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-ink">{c.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {c.phone1 ? (
                        <a
                          href={telHref(c.phone1)}
                          className="rounded-lg border border-amber/40 px-3 py-1.5 font-mono text-sm text-amber hover:bg-amber/10"
                        >
                          {c.phone1}
                        </a>
                      ) : null}
                      {c.phone2 ? (
                        <a
                          href={telHref(c.phone2)}
                          className="rounded-lg border border-line px-3 py-1.5 font-mono text-sm text-muted hover:border-amber hover:text-amber"
                        >
                          {c.phone2}
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {!loading && !callsByArea.length ? (
            <p className="text-sm text-muted">沒有符合的電召台</p>
          ) : null}
          <p className="text-xs text-muted leading-relaxed">
            電召電話表來自運輸署開放數據，或會不時更新；實際服務請以各電召台為準。
          </p>
        </section>
      )}
    </div>
  );
}
