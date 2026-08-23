"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import { apiGet, formatDistance, useGeo, waitTone } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { HospitalWait } from "@/lib/providers/hospitals";

export function HealthApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [rows, setRows] = useState<HospitalWait[]>([]);
  const [error, setError] = useState("");
  const locate = useGeo((lat, lng) => setCenter({ lat, lng }));

  useEffect(() => {
    apiGet<HospitalWait[]>(`/api/hospitals?lat=${center.lat}&lng=${center.lng}`)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [center]);

  return (
    <AppShell>
      <div className="flex justify-between gap-3 mb-4">
        <p className="text-sm text-muted">顯示第四／五類（半緊急及非緊急）輪候中位數。危急情況請打 999。</p>
        <button onClick={locate} className="rounded-xl border border-line px-4 py-2 shrink-0">
          使用我的位置
        </button>
      </div>
      {error ? <p className="text-rose mb-3">{error}</p> : null}
      <NearbyMapDynamic
        lat={center.lat}
        lng={center.lng}
        points={rows.map((h) => ({
          id: h.name,
          name: h.name,
          lat: h.lat,
          lng: h.lng,
          detail: h.t45,
        }))}
      />
      <div className="grid md:grid-cols-2 gap-3 mt-4">
        {rows.map((h) => (
          <article key={h.name} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex justify-between gap-3">
              <div>
                <h2 className="text-lg">{h.name}</h2>
                <div className="text-xs text-muted">
                  {h.cluster}
                  {h.distanceMeters != null ? ` · ${formatDistance(h.distanceMeters)}` : ""}
                </div>
              </div>
              <div className={`font-mono text-xl ${waitTone(h.waitMinutes)}`}>{h.t45}</div>
            </div>
            <dl className="grid grid-cols-3 gap-2 mt-3 text-sm">
              <div>
                <dt className="text-muted text-xs">危殆</dt>
                <dd>{h.t1}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">危急</dt>
                <dd>{h.t2}</dd>
              </div>
              <div>
                <dt className="text-muted text-xs">緊急</dt>
                <dd>{h.t3}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {rows[0]?.updateTime ? (
        <p className="text-xs text-muted mt-4">醫管局更新：{rows[0].updateTime}</p>
      ) : null}
    </AppShell>
  );
}
