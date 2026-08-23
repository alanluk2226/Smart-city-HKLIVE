"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiGet } from "@/lib/client";
import type { WeatherSnapshot } from "@/lib/providers/weather";

export function WeatherApp() {
  const [data, setData] = useState<WeatherSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<WeatherSnapshot>("/api/weather").then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <AppShell>
      {error ? <p className="text-rose">{error}</p> : null}
      {!data ? <p className="text-muted">載入天氣…</p> : (
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-card p-5 flex items-center gap-5">
            {data.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.iconUrl} alt="" className="h-16 w-16" />
            ) : null}
            <div>
              <div className="text-muted text-sm">{data.place}</div>
              <div className="font-mono text-5xl text-teal">
                {data.temperature}°C
              </div>
              <div className="text-muted">濕度 {data.humidity}%</div>
            </div>
          </section>

          {data.warnings.length || data.warningMessage || data.tropicalMessage ? (
            <section className="rounded-2xl border border-amber/40 bg-amber/10 p-4 space-y-2">
              {data.warnings.map((w) => (
                <div key={w.name} className="text-amber">{w.name} {w.type}</div>
              ))}
              {data.warningMessage ? <p>{data.warningMessage}</p> : null}
              {data.tropicalMessage ? <p className="text-sm">{data.tropicalMessage}</p> : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="text-sm text-muted mb-2">本港地區天氣預報</h2>
            <p className="leading-7">{data.forecast}</p>
            {data.outlook ? <p className="text-muted mt-3">展望：{data.outlook}</p> : null}
          </section>

          {data.rainfall.length ? (
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="text-sm text-muted mb-2">過去一小時雨量</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.rainfall.map((r) => (
                  <div key={r.place} className="flex justify-between">
                    <span>{r.place}</span>
                    <span className="font-mono">{r.max} mm</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="text-sm text-muted mb-2">九天天氣預報</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {data.nineDay.map((d) => (
                <div key={d.date} className="rounded-xl border border-line bg-card p-3">
                  <div className="text-sm">{d.week}</div>
                  <div className="font-mono text-teal">
                    {d.forecastMintemp}–{d.forecastMaxtemp}°C
                  </div>
                  <div className="text-sm text-muted mt-1">{d.forecastWeather}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
