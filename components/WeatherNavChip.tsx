"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet } from "@/lib/client";
import type { WeatherSnapshot } from "@/lib/providers/weather";

export function WeatherNavChip() {
  const pathname = usePathname();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const active = pathname === "/weather" || pathname.startsWith("/weather/");

  useEffect(() => {
    let cancelled = false;
    function load() {
      apiGet<WeatherSnapshot>("/api/weather")
        .then((data) => {
          if (!cancelled) setWeather(data);
        })
        .catch(() => {});
    }
    load();
    const id = window.setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const warning = weather?.warnings[0]?.name;
  const hasAlert = Boolean(warning || weather?.warningMessage || weather?.tropicalMessage);

  return (
    <Link
      href="/weather"
      aria-label={
        weather?.temperature != null
          ? warning
            ? `天氣 ${weather.temperature}°，${warning}，查看詳情`
            : `天氣 ${weather.temperature}°，查看詳情`
          : "查看天氣詳情"
      }
      title={warning ? `${warning} · 查看天氣詳情` : "查看天氣詳情"}
      className={`shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition ${
        active
          ? "border-sky/50 bg-sky/15"
          : hasAlert
            ? "border-amber/50 bg-amber/10 hover:border-amber"
            : "border-line bg-card/80 hover:border-sky/40"
      }`}
    >
      {weather?.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={weather.iconUrl} alt="" className="h-5 w-5" />
      ) : (
        <span className="text-xs text-muted">天氣</span>
      )}
      <span className={`font-mono text-sm leading-none ${hasAlert ? "text-amber" : "text-sky"}`}>
        {weather?.temperature != null ? `${weather.temperature}°` : "—°"}
      </span>
      {warning ? (
        <>
          <span className="hidden max-w-[7.5rem] truncate text-[11px] text-amber sm:inline">{warning}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-amber sm:hidden" aria-hidden />
        </>
      ) : null}
    </Link>
  );
}
