"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { ParkingPlace } from "@/lib/providers/parking";

export function ParkingApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [rows, setRows] = useState<ParkingPlace[]>([]);
  const [error, setError] = useState("");
  const locate = useGeo((lat, lng) => setCenter({ lat, lng }));

  useEffect(() => {
    apiGet<ParkingPlace[]>(`/api/parking?lat=${center.lat}&lng=${center.lng}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [center]);

  return (
    <AppShell>
      <div className="flex justify-end mb-4">
        <button onClick={locate} className="rounded-xl border border-line px-4 py-2">
          附近停車場
        </button>
      </div>
      {error ? <p className="text-rose mb-3">{error}</p> : null}
      <NearbyMapDynamic
        lat={center.lat}
        lng={center.lng}
        points={rows.map((p) => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          detail: `空位 ${p.vacancyLabel}`,
        }))}
      />
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {rows.map((p) => (
          <article key={p.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex justify-between gap-3">
              <div>
                <h2>{p.name}</h2>
                <p className="text-xs text-muted">{p.address}</p>
              </div>
              <div className="text-right">
                <div className="font-mono text-2xl text-violet">{p.vacancyLabel}</div>
                <div className="text-xs text-muted">{formatDistance(p.distanceMeters)}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
