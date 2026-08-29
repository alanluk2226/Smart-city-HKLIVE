"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { MODULES } from "@/lib/modules";
import { apiGet } from "@/lib/client";
import type { HospitalWait } from "@/lib/providers/hospitals";
import type { WeatherSnapshot } from "@/lib/providers/weather";

const accent: Record<string, string> = {
  teal: "border-teal/40 hover:border-teal bg-teal/5",
  sky: "border-sky/40 hover:border-sky bg-sky/5",
  rose: "border-rose/40 hover:border-rose bg-rose/5",
  amber: "border-amber/40 hover:border-amber bg-amber/5",
  violet: "border-violet/40 hover:border-violet bg-violet/5",
  lime: "border-lime/40 hover:border-lime bg-lime/5",
};

export function DashboardHome() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [hospitals, setHospitals] = useState<HospitalWait[]>([]);

  useEffect(() => {
    apiGet<WeatherSnapshot>("/api/weather").then(setWeather).catch(() => {});
    apiGet<HospitalWait[]>("/api/hospitals").then(setHospitals).catch(() => {});
  }, []);

  const busiest = [...hospitals].sort((a, b) => (b.waitMinutes ?? 0) - (a.waitMinutes ?? 0))[0];

  return (
    <AppShell>
      <div className="mb-5">
        <div className="font-mono text-[11px] tracking-[0.28em] text-teal">COMMAND CONSOLE</div>
        <h1 className="text-3xl mt-1">香港城市實況</h1>
        <p className="text-muted mt-2 max-w-2xl">
          以公開資料組成的主控台。先看通勤到達時間，再進入天氣、醫療、路況、停車場與康文署場地。頂欄可隨時睇天氣摘要。
        </p>
      </div>

      <div className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/weather"
            className="rounded-2xl border border-line bg-card p-4 transition hover:border-sky/50"
          >
            <div className="text-xs text-muted">天文台現況 · 撳入詳細</div>
            <div className="mt-1 flex items-end gap-3">
              {weather?.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={weather.iconUrl} alt="" className="mb-1 h-10 w-10" />
              ) : null}
              <div className="font-mono text-4xl text-teal">
                {weather?.temperature ?? "—"}
                <span className="text-lg">°C</span>
              </div>
              <div className="text-sm text-muted pb-1">
                濕度 {weather?.humidity ?? "—"}%
                <div>{weather?.warnings[0]?.name || "現時沒有特別天氣警報"}</div>
              </div>
            </div>
          </Link>
          <div className="rounded-2xl border border-line bg-card p-4">
            <div className="text-xs text-muted">急症室輪候（第四／五類中位數）</div>
            <div className="mt-1 text-xl">{busiest ? busiest.name : "載入中…"}</div>
            <div className="text-rose font-mono text-2xl">{busiest?.t45 ?? "—"}</div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`rounded-2xl border p-5 transition ${accent[m.accent]}`}
            >
              <div className="font-mono text-[11px] tracking-widest text-muted uppercase">
                {m.key}
              </div>
              <div className="text-xl mt-2">{m.title}</div>
              <p className="text-sm text-muted mt-2">{m.blurb}</p>
              <div className="mt-4 text-sm">進入模組 →</div>
            </Link>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
