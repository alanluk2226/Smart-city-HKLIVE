"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AiTripAdvisor } from "@/components/AiTripAdvisor";
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

function aqhiTone(risk: string | undefined) {
  if (!risk) return "text-muted";
  if (risk === "Low") return "text-teal";
  if (risk === "Moderate") return "text-sky";
  if (risk === "High") return "text-amber";
  return "text-rose";
}

export function DashboardHome() {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [hospitals, setHospitals] = useState<HospitalWait[]>([]);

  useEffect(() => {
    apiGet<WeatherSnapshot>("/api/weather").then(setWeather).catch(() => {});
    apiGet<HospitalWait[]>("/api/hospitals").then(setHospitals).catch(() => {});
  }, []);

  const busiest = [...hospitals].sort((a, b) => (b.waitMinutes ?? 0) - (a.waitMinutes ?? 0))[0];
  const aqhi = weather?.aqhi;

  return (
    <AppShell>
      <div className="mb-5">
        <div className="font-mono text-[11px] tracking-[0.28em] text-teal">主控台</div>
        <h1 className="text-3xl mt-1">HK LIVE</h1>
        <p className="text-muted mt-2 max-w-2xl">
          以公開資料組成的主控台。出行助手支援港鐵站、屋邨同行政區，並跟天氣比較方案；再進入交通工具、天氣、醫療、路況、停車場、康文署場地與公共廁所。
        </p>
      </div>

      <div className="space-y-6">
        <AiTripAdvisor />

        <section aria-label="全港即時關鍵數據">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted">全港即時摘要</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link
              href="/weather"
              className="flex h-full min-h-[7.5rem] flex-col rounded-2xl border border-line bg-card p-4 transition hover:border-sky/50"
            >
              <div className="text-xs text-muted">天氣現況</div>
              <div className="mt-2 flex flex-1 items-end gap-3">
                {weather?.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={weather.iconUrl} alt="" className="mb-0.5 h-9 w-9 shrink-0" />
                ) : null}
                <div className="min-w-0">
                  <div className="font-mono text-3xl leading-none text-sky">
                    {weather?.temperature ?? "—"}
                    <span className="text-base">°C</span>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted">
                    濕度 {weather?.humidity ?? "—"}%
                    {" · "}
                    {weather?.warnings[0]?.name || "無特別警報"}
                  </div>
                </div>
              </div>
            </Link>

            <Link
              href="/health"
              className="flex h-full min-h-[7.5rem] flex-col rounded-2xl border border-line bg-card p-4 transition hover:border-rose/50"
            >
              <div className="text-xs text-muted">急症室最長輪候</div>
              <div className="mt-2 flex flex-1 flex-col justify-end">
                <div className="truncate text-sm text-ink">{busiest ? busiest.name : "載入中…"}</div>
                <div className="mt-1 font-mono text-3xl leading-none text-rose">
                  {busiest?.t45 ?? "—"}
                </div>
                <div className="mt-1 text-xs text-muted">第四／五類中位數</div>
              </div>
            </Link>

            <Link
              href="/weather"
              className="flex h-full min-h-[7.5rem] flex-col rounded-2xl border border-line bg-card p-4 transition hover:border-lime/50"
            >
              <div className="text-xs text-muted">空氣質素 AQHI</div>
              <div className="mt-2 flex flex-1 flex-col justify-end">
                <div className={`font-mono text-3xl leading-none ${aqhiTone(aqhi?.risk)}`}>
                  {aqhi?.value ?? "—"}
                </div>
                <div className="mt-1 text-sm text-ink">
                  健康風險 {aqhi?.riskTc ?? "—"}
                </div>
                <div className="mt-1 truncate text-xs text-muted">
                  {aqhi?.scopeLabel ?? "一般監測站"}
                </div>
              </div>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`rounded-2xl border p-5 transition ${accent[m.accent]}`}
            >
              <div className="text-[11px] tracking-wide text-muted">{m.chip}</div>
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
