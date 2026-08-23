"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { CctvCamera } from "@/lib/providers/traffic";

export function TrafficApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [cameras, setCameras] = useState<CctvCamera[]>([]);
  const [active, setActive] = useState<CctvCamera | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const locate = useGeo((lat, lng) => setCenter({ lat, lng }));

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    apiGet<CctvCamera[]>(`/api/traffic?lat=${center.lat}&lng=${center.lng}`)
      .then((rows) => {
        setCameras(rows);
        setActive(rows[0] ?? null);
      })
      .catch((e) => setError(e.message));
  }, [center]);

  return (
    <AppShell>
      <div className="flex justify-end mb-4">
        <button onClick={locate} className="rounded-xl border border-line px-4 py-2">
          附近鏡頭
        </button>
      </div>
      {error ? <p className="text-rose mb-3">{error}</p> : null}
      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="space-y-3">
          {active ? (
            <div className="rounded-2xl border border-line bg-card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${active.imageUrl}&t=${tick}`}
                alt={active.description}
                className="w-full aspect-video object-cover bg-black"
              />
              <div className="p-3">
                <div>{active.description}</div>
                <div className="text-xs text-muted">
                  {active.region} · {active.district}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-muted">載入鏡頭…</div>
          )}
          <NearbyMapDynamic
            lat={center.lat}
            lng={center.lng}
            points={cameras.map((c) => ({
              id: c.key,
              name: c.description,
              lat: c.lat,
              lng: c.lng,
            }))}
          />
        </div>
        <div className="rounded-2xl border border-line bg-card p-2 max-h-[70vh] overflow-auto">
          {cameras.map((c) => (
            <button
              key={c.key}
              onClick={() => setActive(c)}
              className={`w-full text-left rounded-lg px-3 py-2 ${
                active?.key === c.key ? "bg-amber/15" : "hover:bg-white/5"
              }`}
            >
              <div className="text-sm">{c.description}</div>
              <div className="text-xs text-muted">
                {c.district} {formatDistance(c.distanceMeters)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
