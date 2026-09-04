"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiGet, formatDistance, openWalkingDirections } from "@/lib/client";
import { haversineMeters } from "@/lib/geo";
import { BasemapLayers, mapMaxZoom } from "@/components/map/BasemapLayers";
import type { WalkRoute } from "@/lib/routing";

export type MapBadgeLevel = "good" | "warn" | "bad" | "unknown";

type Point = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  detail?: string;
  /** Short badge on the pin (e.g. hospital wait "1.5h") */
  badge?: string;
  /** Heat color for badge — short wait = good, long = bad */
  badgeLevel?: MapBadgeLevel;
};

const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const selectedPinIcon = L.divIcon({
  className: "nearby-map-pin-selected",
  html: `<div style="
      width: 22px; height: 22px; margin-left: -11px; margin-top: -11px;
      border-radius: 999px; border: 3px solid #fff;
      background: #b4e645;
      box-shadow: 0 0 0 3px rgba(180,230,69,.45), 0 4px 14px rgba(0,0,0,.35);
    "></div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Capsule heat colors aligned with waitTone thresholds (≤1h / ≤3h / >3h). */
function badgePalette(level: MapBadgeLevel, selected: boolean) {
  const palettes: Record<
    MapBadgeLevel,
    { bg: string; border: string; color: string; selectedBg: string; selectedColor: string }
  > = {
    good: {
      bg: "rgba(15, 118, 110, 0.92)",
      border: "#3ee0c5",
      color: "#ecfdf5",
      selectedBg: "#2dd4bf",
      selectedColor: "#042f2e",
    },
    warn: {
      bg: "rgba(146, 64, 14, 0.94)",
      border: "#f0b429",
      color: "#fffbeb",
      selectedBg: "#f0b429",
      selectedColor: "#422006",
    },
    bad: {
      bg: "rgba(159, 18, 57, 0.94)",
      border: "#ff6b7d",
      color: "#fff1f2",
      selectedBg: "#ff6b7d",
      selectedColor: "#4c0519",
    },
    unknown: {
      bg: "rgba(15, 28, 36, 0.94)",
      border: "#5b6b7c",
      color: "#e8eef5",
      selectedBg: "#94a3b8",
      selectedColor: "#0f172a",
    },
  };
  const p = palettes[level];
  return selected
    ? { bg: p.selectedBg, border: "#ffffff", color: p.selectedColor, ring: true }
    : { bg: p.bg, border: p.border, color: p.color, ring: false };
}

function badgeIcon(badge: string, selected: boolean, level: MapBadgeLevel = "unknown") {
  const { bg, border, color, ring } = badgePalette(level, selected);
  return L.divIcon({
    className: "nearby-badge-pin",
    html: `<div style="transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center;">
      <div style="
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 2.35rem;
        white-space: nowrap;
        border-radius: 0.45rem;
        border: 1.5px solid ${border};
        background: ${bg};
        color: ${color};
        font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: 0.01em;
        padding: 5px 8px;
        box-shadow: 0 4px 14px rgba(0,0,0,.4)${ring ? ", 0 0 0 2px rgba(255,255,255,.35)" : ""};
      ">${escapeHtml(badge)}</div>
      <div style="
        width: 0; height: 0; margin-top: -1px;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 6px solid ${border};
        filter: drop-shadow(0 2px 2px rgba(0,0,0,.35));
      "></div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 8],
  });
}

function FitAllOnce({
  walkPoints,
  fitPoints,
}: {
  walkPoints: [number, number][] | null;
  fitPoints?: Array<{ lat: number; lng: number }>;
}) {
  const map = useMap();
  const lastFitKey = useRef("");

  useEffect(() => {
    if (walkPoints?.length) {
      map.fitBounds(L.latLngBounds(walkPoints), { padding: [40, 40], maxZoom: 16 });
      return;
    }
    if (!fitPoints || fitPoints.length < 2) return;
    const key = fitPoints.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
    if (key === lastFitKey.current) return;
    lastFitKey.current = key;
    const bounds = L.latLngBounds(fitPoints.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 12 });
  }, [map, walkPoints, fitPoints]);

  return null;
}

/** Fly to the selected pin and zoom in so it is obvious among many markers. */
function FocusSelected({
  selectedId,
  selectedPoint,
  focusZoom,
  /** Shift pin downward in the map so popups above the marker stay visible. */
  focusAnchorY = 0.5,
}: {
  selectedId?: string;
  selectedPoint?: { lat: number; lng: number } | null;
  focusZoom: number;
  focusAnchorY?: number;
}) {
  const map = useMap();
  const lastId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!selectedId || !selectedPoint) return;
    if (selectedId === lastId.current) return;
    lastId.current = selectedId;
    const targetZoom = Math.max(map.getZoom(), focusZoom);
    map.flyTo([selectedPoint.lat, selectedPoint.lng], targetZoom, { duration: 0.45 });
    const onEnd = () => {
      map.off("moveend", onEnd);
      const size = map.getSize();
      const anchorY = Math.min(0.85, Math.max(0.35, focusAnchorY));
      // Positive y pans the map up, so the pin sits lower and the popup has room.
      const dy = size.y * (anchorY - 0.5);
      if (Math.abs(dy) > 1) map.panBy([0, dy], { animate: true, duration: 0.2 });
    };
    map.once("moveend", onEnd);
    return () => {
      map.off("moveend", onEnd);
    };
  }, [selectedId, selectedPoint, map, focusZoom, focusAnchorY]);

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
  fitAllPoints = false,
  focusZoom = 16,
  focusAnchorY = 0.5,
}: {
  lat: number;
  lng: number;
  points: Point[];
  selectedId?: string;
  onSelect?: (point: Point) => void;
  heightClass?: string;
  className?: string;
  zoom?: number;
  /** When true, zoom to show all points (e.g. territory hospitals) */
  fitAllPoints?: boolean;
  /** Minimum zoom when focusing a selected list/map item */
  focusZoom?: number;
  /** Vertical anchor for focused pin (0=top, 1=bottom). >0.5 leaves room for popups above. */
  focusAnchorY?: number;
}) {
  const [walkRoute, setWalkRoute] = useState<WalkRoute | null>(null);
  const [walkTargetId, setWalkTargetId] = useState<string | null>(null);
  const [walkLoading, setWalkLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const markerRefs = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    setMapReady(true);
  }, []);

  const fitKey = useMemo(
    () => (fitAllPoints ? points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|") : ""),
    [fitAllPoints, points],
  );
  const fitPoints = useMemo(() => {
    if (!fitAllPoints || !fitKey) return undefined;
    return points.map((p) => ({ lat: p.lat, lng: p.lng }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable when coordinates unchanged
  }, [fitAllPoints, fitKey]);

  const selectedPoint = useMemo(() => {
    if (!selectedId) return null;
    return points.find((p) => p.id === selectedId) ?? null;
  }, [points, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const marker = markerRefs.current.get(selectedId);
    if (!marker) return;
    const t = window.setTimeout(() => {
      marker.openPopup();
    }, 480);
    return () => window.clearTimeout(t);
  }, [selectedId, selectedPoint?.lat, selectedPoint?.lng]);

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

  const mapKey = fitAllPoints ? `fit-${fitKey.length}-${points.length}` : `view-${zoom}`;

  return (
    <div className={`overflow-hidden border border-line ${heightClass} ${className || "rounded-xl"}`}>
      <MapContainer
        key={mapKey}
        center={[lat, lng]}
        zoom={zoom}
        maxZoom={mapMaxZoom()}
        className="h-full w-full"
        scrollWheelZoom={false}
        attributionControl={false}
      >
        <BasemapLayers />
        <FitAllOnce walkPoints={walkRoute?.points ?? null} fitPoints={fitPoints} />
        <FocusSelected
          selectedId={selectedId}
          selectedPoint={selectedPoint}
          focusZoom={focusZoom}
          focusAnchorY={focusAnchorY}
        />
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
          const pin = p.badge
            ? badgeIcon(p.badge, on, p.badgeLevel ?? "unknown")
            : on
              ? selectedPinIcon
              : icon;
          return (
            <Marker
              key={p.id}
              position={[p.lat, p.lng]}
              icon={pin}
              zIndexOffset={on ? 1000 : 0}
              ref={(m) => {
                if (m) markerRefs.current.set(p.id, m);
                else markerRefs.current.delete(p.id);
              }}
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
