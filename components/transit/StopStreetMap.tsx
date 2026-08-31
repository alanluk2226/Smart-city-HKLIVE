"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { BasemapLayers, mapMaxZoom } from "@/components/map/BasemapLayers";
import { apiGet, formatDistance, openWalkingDirections, useGeo } from "@/lib/client";
import { haversineMeters } from "@/lib/geo";
import { getLocationEnabled } from "@/lib/location-pref";
import type { WalkRoute } from "@/lib/routing";
import type { Operator, StopHit } from "@/lib/types";

const OPERATOR_PIN: Record<Operator, { idle: string; active: string; glow: string }> = {
  kmb: { idle: "#0f766e", active: "#14b8a6", glow: "20,184,166" },
  ctb: { idle: "#b45309", active: "#f59e0b", glow: "245,158,11" },
  nlb: { idle: "#0369a1", active: "#38bdf8", glow: "56,189,248" },
  mtrb: { idle: "#9f1239", active: "#fb7185", glow: "251,113,133" },
  gmb: { idle: "#3f6212", active: "#84cc16", glow: "132,204,22" },
  mtr: { idle: "#be123c", active: "#fb7185", glow: "251,113,133" },
  lrt: { idle: "#6d28d9", active: "#a78bfa", glow: "167,139,250" },
  tram: { idle: "#b45309", active: "#fbbf24", glow: "251,191,36" },
  ferry: { idle: "#0369a1", active: "#38bdf8", glow: "56,189,248" },
  taxi: { idle: "#a16207", active: "#eab308", glow: "234,179,8" },
};

function pinColors(stop: StopHit | null, accent: "emerald" | "teal", mixedOperators?: boolean) {
  if (mixedOperators && stop) return OPERATOR_PIN[stop.operator];
  return accent === "teal"
    ? { idle: "#0f766e", active: "#14b8a6", glow: "20,184,166" }
    : { idle: "#15803d", active: "#84cc16", glow: "132,204,22" };
}

function pinIcon(
  seq: number | undefined,
  selected: boolean,
  idle: string,
  active: string,
  glow: string,
  compact: boolean,
) {
  // Far zoom: tiny tip so the map stays readable
  if (compact && !selected) {
    const size = 12;
    return L.divIcon({
      className: "stop-map-pin is-dot",
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      html: `<div style="pointer-events:none;width:${size}px;height:${size}px;filter:drop-shadow(0 1px 2px rgba(7,16,24,.45))">
        <svg width="${size}" height="${size}" viewBox="0 0 24 36" aria-hidden="true">
          <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12c0 8.2 10.5 22 10.5 22S22.5 20.2 22.5 12C22.5 6.2 17.8 1.5 12 1.5z" fill="${idle}" stroke="rgba(255,255,255,.85)" stroke-width="2"/>
          <circle cx="12" cy="12" r="3.2" fill="rgba(255,255,255,.9)"/>
        </svg>
      </div>`,
    });
  }

  const w = selected ? 36 : 28;
  const h = selected ? 48 : 38;
  const bg = selected ? active : idle;
  const fg = selected ? "#071018" : "#f8fffb";
  const font = selected ? 13 : 11;
  const label = seq != null ? String(seq) : "";
  const stroke = selected ? "rgba(7,16,24,.75)" : "rgba(255,255,255,.95)";
  // Number sits in the circular head of the teardrop (viewBox y≈12)
  const labelTop = selected ? 9 : 7;

  return L.divIcon({
    className: selected ? "stop-map-pin is-on" : "stop-map-pin",
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    html: `<div class="stop-map-pin-core" style="--pin-glow:${glow};pointer-events:none;position:relative;width:${w}px;height:${h}px;filter:drop-shadow(0 2px 4px rgba(7,16,24,.4))">
      <svg width="${w}" height="${h}" viewBox="0 0 24 36" aria-hidden="true">
        <path d="M12 1.2C5.9 1.2 1 6.1 1 12.2c0 9.2 11 22.6 11 22.6s11-13.4 11-22.6C23 6.1 18.1 1.2 12 1.2z" fill="${bg}" stroke="${stroke}" stroke-width="1.8"/>
      </svg>
      <div style="position:absolute;left:0;right:0;top:${labelTop}px;display:flex;align-items:center;justify-content:center;color:${fg};font:700 ${font}px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:-0.02em;text-shadow:${selected ? "none" : "0 1px 1px rgba(0,0,0,.25)"}">${label}</div>
    </div>`,
  });
}

function MapZoom({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    onZoom(map.getZoom());
    const handler = () => onZoom(map.getZoom());
    map.on("zoomend", handler);
    return () => {
      map.off("zoomend", handler);
    };
  }, [map, onZoom]);
  return null;
}

function FitStops({
  points,
  selected,
  here,
  walkPoints,
}: {
  points: [number, number][];
  selected: [number, number] | null;
  here: [number, number] | null;
  walkPoints: [number, number][] | null;
}) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  const walkKey = walkPoints?.map((p) => p.join(",")).join("|") ?? "";

  useEffect(() => {
    if (walkPoints?.length) {
      const t = window.setTimeout(() => {
        map.fitBounds(L.latLngBounds(walkPoints), { padding: [48, 48], maxZoom: 17 });
      }, 0);
      return () => window.clearTimeout(t);
    }
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    if (here) bounds.extend(here);
    const t = window.setTimeout(() => {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
      map.invalidateSize();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, walkKey]);

  useEffect(() => {
    if (walkPoints?.length) return;
    if (!here) return;
    const t = window.setTimeout(() => {
      const bounds = L.latLngBounds(points.length ? points : [here]);
      bounds.extend(here);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, here?.[0], here?.[1], walkKey]);

  const selKey = selected ? `${selected[0]},${selected[1]}` : "";
  useEffect(() => {
    if (walkPoints?.length) return;
    if (!selected) return;
    const t = window.setTimeout(() => map.panTo(selected), 0);
    return () => window.clearTimeout(t);
  }, [map, selKey, selected, walkKey]);

  return null;
}

function stopMarkerKey(stop: StopHit, index: number) {
  return `${stop.operator}-${stop.stopId}-${stop.seq ?? "x"}-${index}`;
}

function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const sync = () => map.invalidateSize({ animate: false });
    sync();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [map]);
  return null;
}

export function StopStreetMap({
  stops,
  selectedId,
  selectedSeq,
  onSelect,
  accent = "emerald",
  mixedOperators = false,
  showRouteLine = true,
  compactMarkers = false,
  labelZoom = 16,
  minZoom = 10,
  routeLinks = [],
  routeLinkColor = "#3ee0c5",
  heightClass = "h-56 sm:h-72",
  className = "",
  popupWalkButton = true,
}: {
  stops: StopHit[];
  selectedId?: string;
  selectedSeq?: number;
  onSelect: (stop: StopHit) => void;
  accent?: "emerald" | "teal";
  mixedOperators?: boolean;
  /** Draw corridor polyline between stops (disable for scattered points like taxi) */
  showRouteLine?: boolean;
  /** Unselected stops render as small dots until zoomed in / selected */
  compactMarkers?: boolean;
  /** Zoom level at which compact markers expand to numbered pins */
  labelZoom?: number;
  minZoom?: number;
  /** Explicit polylines between stopIds (e.g. ferry hub pairs) */
  routeLinks?: Array<{ fromId: string; toId: string }>;
  routeLinkColor?: string;
  /** Tailwind height classes for the map pane */
  heightClass?: string;
  className?: string;
  /** When false, marker popup points users to the sheet instead of duplicating walk CTA */
  popupWalkButton?: boolean;
}) {
  const defaultPin = pinColors(null, accent, false);
  const idle = defaultPin.idle;
  const active = defaultPin.active;
  const glow = defaultPin.glow;
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [walkRoute, setWalkRoute] = useState<WalkRoute | null>(null);
  const [walkTargetKey, setWalkTargetKey] = useState<string | null>(null);
  const [walkLoading, setWalkLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(15);
  const locate = useGeo((lat, lng) => setHere({ lat, lng }));

  const showLabels = !compactMarkers || zoom >= labelZoom;

  useEffect(() => {
    setMapReady(true);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation || !getLocationEnabled()) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, []);

  const mapped = useMemo(
    () =>
      stops.filter(
        (s): s is StopHit & { lat: number; lng: number } =>
          typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng),
      ),
    [stops],
  );

  const mapKey = useMemo(() => {
    if (!mapped.length) return "empty";
    const first = mapped[0];
    const last = mapped[mapped.length - 1];
    return `${first.operator}-${first.stopId}-${last.stopId}-${mapped.length}`;
  }, [mapped]);

  const line = mapped.map((s) => [s.lat, s.lng] as [number, number]);
  const linkLines = useMemo(() => {
    const byId = new Map(mapped.map((s) => [s.stopId, s] as const));
    const out: [number, number][][] = [];
    for (const link of routeLinks) {
      const a = byId.get(link.fromId);
      const b = byId.get(link.toId);
      if (!a || !b) continue;
      out.push([
        [a.lat, a.lng],
        [b.lat, b.lng],
      ]);
    }
    return out;
  }, [mapped, routeLinks]);
  const selected =
    mapped.find((s) => {
      const idMatch = mixedOperators ? `${s.operator}-${s.stopId}` === selectedId : s.stopId === selectedId;
      return idMatch && (selectedSeq == null || s.seq === selectedSeq);
    }) ?? null;
  const center = selected ?? mapped[0];
  const straightMeters =
    here && selected ? haversineMeters(here.lat, here.lng, selected.lat, selected.lng) : null;

  useEffect(() => {
    setWalkRoute(null);
    setWalkTargetKey(null);
  }, [selectedId, selectedSeq]);

  async function toggleWalkRoute(target = selected) {
    if (!target) return;
    const targetKey = mixedOperators
      ? `${target.operator}-${target.stopId}-${target.seq ?? "x"}`
      : `${target.stopId}-${target.seq ?? "x"}`;
    if (walkRoute && walkTargetKey === targetKey) {
      setWalkRoute(null);
      setWalkTargetKey(null);
      return;
    }
    onSelect(target);
    if (!here) {
      alert("請先允許定位，或按「更新我的位置」");
      locate();
      return;
    }
    setWalkLoading(true);
    try {
      const route = await apiGet<WalkRoute>(
        `/api/route/walk?fromLat=${here.lat}&fromLng=${here.lng}&toLat=${target.lat}&toLng=${target.lng}`,
      );
      setWalkRoute(route);
      setWalkTargetKey(targetKey);
    } catch {
      alert("暫時無法規劃導航路線，請稍後再試");
    } finally {
      setWalkLoading(false);
    }
  }

  const walkLabel = walkRoute
    ? walkRoute.fallback
      ? `直線約 ${formatDistance(walkRoute.distanceMeters)}`
      : `導航約 ${formatDistance(walkRoute.distanceMeters)} · ${walkRoute.durationMinutes} 分鐘`
    : straightMeters != null
      ? `直線約 ${formatDistance(straightMeters)}`
      : null;

  if (!center || !mapReady) {
    return (
      <div
        className={`flex items-center justify-center border border-line bg-card text-sm text-muted ${heightClass} ${className || "rounded-2xl"}`}
      >
        {mapReady ? "呢條線暫時冇車站座標。" : "載入地圖…"}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden border border-line ${className || "rounded-2xl"}`}>
      <div className={heightClass}>
        <MapContainer
          key={mapKey}
          center={[center.lat, center.lng]}
          zoom={15}
          maxZoom={mapMaxZoom()}
          minZoom={minZoom}
          className="h-full w-full"
          scrollWheelZoom
          attributionControl={false}
        >
          <BasemapLayers />
          <MapZoom onZoom={setZoom} />
          <InvalidateOnResize />
          <FitStops
            points={line}
            selected={selected ? [selected.lat, selected.lng] : null}
            here={here ? [here.lat, here.lng] : null}
            walkPoints={walkRoute?.points ?? null}
          />
          {showRouteLine && line.length > 1 ? (
            <Polyline positions={line} pathOptions={{ color: active, weight: 3, opacity: 0.55 }} />
          ) : null}
          {linkLines.map((positions, i) => (
            <Polyline
              key={`link-glow-${i}`}
              positions={positions}
              pathOptions={{ color: routeLinkColor, weight: 10, opacity: 0.22 }}
            />
          ))}
          {linkLines.map((positions, i) => (
            <Polyline
              key={`link-${i}`}
              positions={positions}
              pathOptions={{ color: routeLinkColor, weight: 4, opacity: 0.9 }}
            />
          ))}
          {walkRoute ? (
            <Polyline
              positions={walkRoute.points}
              pathOptions={{
                color: "#38bdf8",
                weight: 5,
                opacity: 0.9,
                dashArray: walkRoute.fallback ? "8 10" : undefined,
              }}
            />
          ) : null}
          {selected ? (
            <CircleMarker
              center={[selected.lat, selected.lng]}
              radius={22}
              pathOptions={{
                color: pinColors(selected, accent, mixedOperators).active,
                fillColor: pinColors(selected, accent, mixedOperators).active,
                fillOpacity: 0.16,
                weight: 2,
                opacity: 0.9,
              }}
            />
          ) : null}
          {mapped.map((stop, i) => {
            const isSel = mixedOperators
              ? `${stop.operator}-${stop.stopId}` === selectedId && (selectedSeq == null || stop.seq === selectedSeq)
              : stop.stopId === selectedId && (selectedSeq == null || stop.seq === selectedSeq);
            const colors = pinColors(stop, accent, mixedOperators);
            const compact = compactMarkers && !showLabels && !isSel;
            return (
              <Marker
                key={stopMarkerKey(stop, i)}
                position={[stop.lat, stop.lng]}
                zIndexOffset={isSel ? 1200 : stop.seq ?? 0}
                icon={pinIcon(stop.seq, isSel, colors.idle, colors.active, colors.glow, compact)}
                eventHandlers={{ click: () => onSelect(stop) }}
              >
                <Popup>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-zinc-900">
                      {stop.seq ? `${stop.seq}. ` : ""}
                      {stop.name}
                    </div>
                    {here ? (
                      <div className="text-xs text-zinc-600">
                        直線約 {formatDistance(haversineMeters(here.lat, here.lng, stop.lat, stop.lng))}
                      </div>
                    ) : null}
                    {popupWalkButton ? (
                      <button
                        type="button"
                        onClick={() => void toggleWalkRoute(stop)}
                        className="rounded-md bg-teal px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                      >
                        顯示導航路線
                      </button>
                    ) : (
                      <p className="text-xs text-zinc-600">班次見下方列表 · 導航用地圖底欄或「前往碼頭」</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
          {here ? (
            <>
              <CircleMarker
                center={[here.lat, here.lng]}
                radius={16}
                pathOptions={{ color: "#6ec3ff", fillColor: "#6ec3ff", fillOpacity: 0.18, weight: 2 }}
              />
              <CircleMarker
                center={[here.lat, here.lng]}
                radius={7}
                pathOptions={{ color: "#ffffff", fillColor: "#6ec3ff", fillOpacity: 1, weight: 3 }}
              >
                <Popup>你的位置</Popup>
              </CircleMarker>
            </>
          ) : null}
        </MapContainer>
      </div>
      <div className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={locate}
          className="rounded-lg border border-line bg-card/90 px-2.5 py-1.5 text-xs text-ink backdrop-blur hover:border-teal"
        >
          {here ? "更新我的位置" : "顯示我的位置"}
        </button>
      </div>
      {selected ? (
        <div className="absolute left-3 right-3 bottom-3 z-[1000] flex flex-wrap items-center gap-2">
          {walkLabel ? (
            <span className="rounded-lg border border-line bg-card/90 px-2.5 py-1.5 text-xs text-ink backdrop-blur">
              {walkLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void toggleWalkRoute()}
            disabled={walkLoading}
            className="rounded-lg bg-teal px-3 py-1.5 text-xs font-medium text-bg backdrop-blur hover:opacity-90 disabled:opacity-60"
          >
            {walkLoading ? "規劃中…" : walkRoute ? "隱藏導航路線" : "顯示導航路線"}
          </button>
          {here ? (
            <button
              type="button"
              onClick={() => openWalkingDirections(selected.lat, selected.lng, selected.name)}
              className="rounded-lg border border-line bg-card/90 px-2.5 py-1.5 text-xs text-muted backdrop-blur hover:text-ink"
            >
              外部地圖
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
