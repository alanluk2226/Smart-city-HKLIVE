"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import { getLocationEnabled } from "@/lib/location-pref";
import { EtaPanel } from "@/components/transit/EtaPanel";
import { StopStreetMapDynamic } from "@/components/transit/StopStreetMapDynamic";
import { useEta } from "@/components/transit/useEta";
import type { Operator, StopHit } from "@/lib/types";

type NearbyPayload = {
  all: StopHit[];
  kmb: StopHit[];
  ctb: StopHit[];
  nlb: StopHit[];
  mtrb: StopHit[];
  gmb: StopHit[];
  mtr: StopHit[];
  lrt: StopHit[];
};

type NearbyFilter = keyof NearbyPayload;

const FILTERS: { key: NearbyFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "kmb", label: "九巴" },
  { key: "ctb", label: "城巴" },
  { key: "nlb", label: "嶼巴" },
  { key: "mtrb", label: "港鐵巴士" },
  { key: "gmb", label: "小巴" },
  { key: "mtr", label: "港鐵" },
  { key: "lrt", label: "輕鐵" },
];

const OPERATOR_BADGE: Record<Operator, string> = {
  kmb: "bg-teal/15 text-teal",
  ctb: "bg-amber/15 text-amber",
  nlb: "bg-sky/15 text-sky",
  mtrb: "bg-rose/20 text-rose",
  gmb: "bg-lime/15 text-lime",
  mtr: "bg-rose/15 text-rose",
  lrt: "bg-violet/15 text-violet",
  tram: "bg-amber/15 text-amber",
  ferry: "bg-sky/15 text-sky",
  taxi: "bg-amber/15 text-amber",
};

function stopKey(stop: StopHit) {
  return `${stop.operator}-${stop.stopId}-${stop.seq ?? 0}`;
}

export function TransitNearbySection() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [payload, setPayload] = useState<NearbyPayload | null>(null);
  const [filter, setFilter] = useState<NearbyFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [error, setError] = useState("");
  const locate = useGeo((lat, lng) => setCenter({ lat, lng }));

  const stops = useMemo(() => {
    if (!payload) return [];
    const source = filter === "all" ? payload.all : payload[filter];
    return source.map((s, i) => ({ ...s, seq: i + 1 }));
  }, [filter, payload]);

  const selected = useMemo(
    () => stops.find((s) => stopKey(s) === selectedKey) ?? stops[0] ?? null,
    [selectedKey, stops],
  );

  const { etas, loading, error: etaError } = useEta(selected);

  useEffect(() => {
    if (!navigator.geolocation || !getLocationEnabled()) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingStops(true);
    setError("");
    apiGet<NearbyPayload>(`/api/nearby?lat=${center.lat}&lng=${center.lng}`)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        const ranked = data.all.map((s, i) => ({ ...s, seq: i + 1 }));
        setSelectedKey(ranked[0] ? stopKey(ranked[0]) : null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "無法載入附近車站");
      })
      .finally(() => {
        if (!cancelled) setLoadingStops(false);
      });
    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!stops.length) {
      setSelectedKey(null);
      return;
    }
    if (!selectedKey || !stops.some((s) => stopKey(s) === selectedKey)) {
      setSelectedKey(stopKey(stops[0]));
    }
  }, [selectedKey, stops]);

  const mappedStops = useMemo(
    () => stops.filter((s) => typeof s.lat === "number" && typeof s.lng === "number"),
    [stops],
  );

  const etaHint =
    selected?.operator === "ctb"
      ? "城巴站請到「巴士」頁搜尋路線查看班次。"
      : selected
        ? "此站暫無班次資料。"
        : "選擇左邊車站查看班次。";

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">附近交通</h2>
          <p className="text-sm text-muted mt-1">
            只顯示約 400m 內的巴士站、小巴站、港鐵及輕鐵站，點選查看班次或導航。
          </p>
        </div>
        <button
          type="button"
          onClick={locate}
          className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm hover:border-teal"
        >
          更新我的位置
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === item.key ? "border-teal bg-teal/15 text-teal" : "border-line text-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error || etaError ? <p className="text-rose text-sm">{error || etaError}</p> : null}
      {loadingStops && !mappedStops.length ? (
        <p className="text-sm text-muted">載入附近車站…</p>
      ) : mappedStops.length ? (
        <StopStreetMapDynamic
          stops={mappedStops}
          selectedId={selected ? `${selected.operator}-${selected.stopId}` : undefined}
          selectedSeq={selected?.seq}
          onSelect={(stop) => setSelectedKey(stopKey(stop))}
          accent="teal"
          mixedOperators
        />
      ) : (
        <p className="text-sm text-muted">約 400m 內暫時搵唔到車站，可再更新位置或到各交通頁搜尋。</p>
      )}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        {stops.length ? (
          <div className="max-h-72 overflow-auto space-y-1 rounded-xl border border-line p-2">
            {stops.map((s) => {
              const key = stopKey(s);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${
                    selectedKey === key ? "bg-teal/15" : "hover:bg-white/5"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${OPERATOR_BADGE[s.operator]}`}
                    >
                      {s.operatorName}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted font-mono">
                    {s.distanceMeters != null ? formatDistance(s.distanceMeters) : ""}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        <EtaPanel
          title={selected ? `${selected.operatorName} · ${selected.name}` : "到達時間"}
          etas={selected?.operator === "ctb" ? [] : etas}
          loading={selected?.operator === "ctb" ? false : loading}
          emptyHint={etaHint}
          framed={false}
        />
      </div>
    </section>
  );
}
