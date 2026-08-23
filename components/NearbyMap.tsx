"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

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

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

export function NearbyMap({
  lat,
  lng,
  points,
}: {
  lat: number;
  lng: number;
  points: Point[];
}) {
  return (
    <div className="h-64 overflow-hidden rounded-xl border border-line">
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter lat={lat} lng={lng} />
        <Marker position={[lat, lng]} icon={icon}>
          <Popup>你的位置</Popup>
        </Marker>
        {points.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icon}>
            <Popup>
              <div className="text-sm font-medium">{p.name}</div>
              {p.detail ? <div className="text-xs">{p.detail}</div> : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
