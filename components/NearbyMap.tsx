"use client";

import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { apiGet, formatDistance, openWalkingDirections } from "@/lib/client";
import { haversineMeters } from "@/lib/geo";
import type { WalkRoute } from "@/lib/routing";

type Point = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  detail?: string;
};

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const selectedIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [30, 49],
  iconAnchor: [15, 49],
  className: "nearby-map-pin-selected",
});

function Recenter({ lat, lng, walkPoints }: { lat: number; lng: number; walkPoints: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (walkPoints?.length) {
      map.fitBounds(L.latLngBounds(walkPoints), { padding: [40, 40], maxZoom: 16 });
      return;
    }
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map, walkPoints]);
  return null;
}

export function NearbyMap({
  lat,
  lng,
  points,
  selectedId,
  onSelect,
  heightClass = "h-64",
  className = "",
  zoom = 15,
}: {
  lat: number;
  lng: number;
  points: Point[];
  selectedId?: string;
  onSelect?: (point: Point) => void;
  heightClass?: string;
  className?: string;
  zoom?: number;
}) {
  const [walkRoute, setWalkRoute] = useState<WalkRoute | null>(null);
  const [walkTargetId, setWalkTargetId] = useState<string | null>(null);
  const [walkLoading, setWalkLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    setMapReady(true);
  }, []);

  async function showWalkRoute(point: Point) {
    if (walkTargetId === point.id && walkRoute) {
      setWalkRoute(null);
      setWalkTargetId(null);
      return;
    }
    setWalkLoading(true);
    try {
      const route = await apiGet<WalkRoute>(
        `/api/route/walk?fromLat=${lat}&fromLng=${lng}&toLat=${point.lat}&toLng=${point.lng}`,
      );
      setWalkRoute(route);
      setWalkTargetId(point.id);
    } catch {
      alert("暫時無法規劃導航路線，請稍後再試");
    } finally {
      setWalkLoading(false);
    }
  }

  if (!mapReady) {
    return (
      <div
        className={`animate-pulse border border-line bg-card ${heightClass} ${className || "rounded-xl"}`}
      />
    );
  }

  return (
    <div className={`overflow-hidden border border-line ${heightClass} ${className || "rounded-xl"}`}>
      <MapContainer
        key={`${lat.toFixed(4)}-${lng.toFixed(4)}`}
        center={[lat, lng]}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={20}
          maxNativeZoom={20}
        />
        <Recenter lat={lat} lng={lng} walkPoints={walkRoute?.points ?? null} />
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
        <Marker position={[lat, lng]} icon={icon}>
          <Popup>你的位置</Popup>
        </Marker>
        {points.map((p) => {
          const on = p.id === selectedId;
          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={on ? selectedIcon : icon}
              zIndexOffset={on ? 800 : 0}
              eventHandlers={{
                click: () => onSelect?.(p),
              }}
            >
              <Popup>
                <div className="space-y-2">
                  <div className="text-sm font-medium">{p.name}</div>
                  {p.detail ? <div className="text-xs text-zinc-600">{p.detail}</div> : null}
                  <div className="text-xs text-zinc-600">
                    直線約 {formatDistance(haversineMeters(lat, lng, p.lat, p.lng))}
                  </div>
                  <button
                    type="button"
                    disabled={walkLoading}
                    onClick={() => void showWalkRoute(p)}
                    className="rounded-md bg-teal px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {walkLoading && walkTargetId === p.id
                      ? "規劃中…"
                      : walkTargetId === p.id && walkRoute
                        ? "隱藏導航路線"
                        : "顯示導航路線"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openWalkingDirections(p.lat, p.lng, p.name)}
                    className="block text-xs text-zinc-500 underline hover:text-zinc-800"
                  >
                    外部地圖
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
