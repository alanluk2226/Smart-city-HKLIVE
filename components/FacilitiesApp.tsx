"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { FacilityPlace } from "@/lib/providers/facilities";

export function FacilitiesApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [type, setType] = useState("");
  const [rows, setRows] = useState<FacilityPlace[]>([]);
  const [error, setError] = useState("");
  const locate = useGeo((lat, lng) => setCenter({ lat, lng }));

  useEffect(() => {
    const qs = new URLSearchParams({
      lat: String(center.lat),
      lng: String(center.lng),
    });
    if (type) qs.set("type", type);
    apiGet<FacilityPlace[]>(`/api/facilities?${qs}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [center, type]);

  return (
    <AppShell>
      <div className="flex flex-wrap gap-2 mb-4">
        {["", "羽毛球場", "籃球場"].map((t) => (
          <button
            key={t || "all"}
            onClick={() => setType(t)}
            className={`rounded-full px-4 py-2 border ${
              type === t ? "border-lime bg-lime/15 text-lime" : "border-line"
            }`}
          >
            {t || "全部"}
          </button>
        ))}
        <button onClick={locate} className="rounded-full px-4 py-2 border border-line ml-auto">
          附近場地
        </button>
      </div>
      {error ? <p className="text-rose mb-3">{error}</p> : null}
      <NearbyMapDynamic
        lat={center.lat}
        lng={center.lng}
        points={rows.map((f) => ({
          id: f.id,
          name: f.name,
          lat: f.lat,
          lng: f.lng,
          detail: f.type,
        }))}
      />
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {rows.map((f) => (
          <article key={f.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="text-xs text-lime">{f.type}</div>
            <h2 className="text-lg">{f.name}</h2>
            <p className="text-sm text-muted">{f.address}</p>
            <p className="text-sm mt-2">開放：{f.hours || "—"}</p>
            <p className="text-xs text-muted mt-1">
              {f.district} · {formatDistance(f.distanceMeters)}
              {f.phone ? ` · ${f.phone}` : ""}
            </p>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
