"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeather } from "@/components/WeatherProvider";

export function WeatherNavChip() {
  const pathname = usePathname();
  const { weather } = useWeather();
  const active = pathname === "/weather" || pathname.startsWith("/weather/");

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
      className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition ${
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
