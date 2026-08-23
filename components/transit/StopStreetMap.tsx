"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useGeo } from "@/lib/client";
import type { StopHit } from "@/lib/types";

function pinIcon(seq: number | undefined, selected: boolean, idle: string, active: string, glow: string) {
  const core = selected ? 42 : 24;
  const size = selected ? 64 : 24;
  const bg = selected ? active : idle;
  const fg = selected ? "#071018" : "#f8fffb";
  const font = selected ? 13 : 11;
  const ring = selected ? "2px solid rgba(7,16,24,.85)" : "2px solid rgba(255,255,255,.4)";
  return L.divIcon({
    className: selected ? "stop-map-pin is-on" : "stop-map-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="pointer-events:none;width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center"><div class="stop-map-pin-core" style="--pin-glow:${glow};width:${core}px;height:${core}px;border-radius:999px;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font:700 ${font}px/1 ui-monospace,monospace;border:${ring}">${seq ?? ""}</div></div>`,
  });
}

function FitStops({
  points,
  selected,
  here,
}: {
  points: [number, number][];
  selected: [number, number] | null;
  here: [number, number] | null;
}) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");

  useEffect(() => {
    if (!points.length) return;
    const bounds = L.latLngBounds(points);
    if (here) bounds.extend(here);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    const t = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);

  useEffect(() => {
    if (here) {
      const bounds = L.latLngBounds(points.length ? points : [here]);
      bounds.extend(here);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, here?.[0], here?.[1]]);

  const selKey = selected ? `${selected[0]},${selected[1]}` : "";
  useEffect(() => {
    if (!selected) return;
    map.panTo(selected);
  }, [map, selKey, selected]);

  return null;
}

function stopMarkerKey(stop: StopHit, index: number) {
  return `${stop.stopId}-${stop.seq ?? "x"}-${index}`;
}

export function StopStreetMap({
  stops,
  selectedId,
  selectedSeq,
  onSelect,
  accent = "emerald",
}: {
  stops: StopHit[];
  selectedId?: string;
  selectedSeq?: number;
  onSelect: (stop: StopHit) => void;
  accent?: "emerald" | "teal";
}) {
  const idle = accent === "teal" ? "#134e4a" : "#14532d";
  const active = accent === "teal" ? "#5ef5d4" : "#d4ff00";
  const glow = accent === "teal" ? "94,245,212" : "212,255,0";
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const locate = useGeo((lat, lng) => setHere({ lat, lng }));

  const mapped = useMemo(
    () =>
      stops.filter(
        (s): s is StopHit & { lat: number; lng: number } =>
          typeof s.lat === "number" && typeof s.lng === "number" && Number.isFinite(s.lat) && Number.isFinite(s.lng),
      ),
    [stops],
  );

  const line = mapped.map((s) => [s.lat, s.lng] as [number, number]);
  const selected =
    mapped.find(
      (s) => s.stopId === selectedId && (selectedSeq == null || s.seq === selectedSeq),
    ) ?? null;
  const center = selected ?? mapped[0];

  if (!center) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-card text-sm text-muted">
        呢條線暫時冇車站座標。
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line">
      <div className="h-56 sm:h-72">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={15}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; OpenStreetMap &copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <FitStops
            points={line}
            selected={selected ? [selected.lat, selected.lng] : null}
            here={here ? [here.lat, here.lng] : null}
          />
          {line.length > 1 ? (
            <Polyline positions={line} pathOptions={{ color: active, weight: 3, opacity: 0.55 }} />
          ) : null}
          {selected ? (
            <CircleMarker
              center={[selected.lat, selected.lng]}
              radius={22}
              pathOptions={{
                color: active,
                fillColor: active,
                fillOpacity: 0.16,
                weight: 2,
                opacity: 0.9,
              }}
            />
          ) : null}
          {mapped.map((stop, i) => {
            const isSel = stop.stopId === selectedId && (selectedSeq == null || stop.seq === selectedSeq);
            return (
              <Marker
                key={stopMarkerKey(stop, i)}
                position={[stop.lat, stop.lng]}
                zIndexOffset={isSel ? 1200 : stop.seq ?? 0}
                icon={pinIcon(stop.seq, isSel, idle, active, glow)}
                eventHandlers={{ click: () => onSelect(stop) }}
              >
                <Popup>
                  <div className="text-sm font-medium text-zinc-900">
                    {stop.seq ? `${stop.seq}. ` : ""}
                    {stop.name}
                  </div>
                </Popup>
              </Marker>
            );
          })}
          {here ? (
            <CircleMarker
              center={[here.lat, here.lng]}
              radius={9}
              pathOptions={{ color: "#6ec3ff", fillColor: "#6ec3ff", fillOpacity: 0.85, weight: 2 }}
            >
              <Popup>你的位置</Popup>
            </CircleMarker>
          ) : null}
        </MapContainer>
      </div>
      <button
        type="button"
        onClick={locate}
        className="absolute right-3 top-3 z-[1000] rounded-lg border border-line bg-card/90 px-2.5 py-1.5 text-xs text-ink backdrop-blur hover:border-teal"
      >
        {here ? "已標示我的位置" : "顯示我的位置"}
      </button>
    </div>
  );
}
