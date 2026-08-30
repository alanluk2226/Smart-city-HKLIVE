"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiGet } from "@/lib/client";
import type {
  AqhiSummary,
  NineDayForecast,
  UvIndex,
  WeatherSnapshot,
  WeatherWarning,
} from "@/lib/providers/weather";

function warningTone(name: string) {
  if (/黑雨|十號|九號|八號/.test(name)) return "border-rose/50 bg-rose/15 text-rose";
  if (/紅雨|黃雨|暴雨|雷暴|酷熱|寒冷|三號|強烈季候風|火災危險/.test(name)) {
    return "border-amber/50 bg-amber/15 text-amber";
  }
  return "border-amber/40 bg-amber/10 text-amber";
}

function WarningBanner({
  warnings,
  warningMessage,
  tropicalMessage,
}: {
  warnings: WeatherWarning[];
  warningMessage: string;
  tropicalMessage: string;
}) {
  const hasAlert = warnings.length > 0 || Boolean(warningMessage || tropicalMessage);
  if (!hasAlert) {
    return (
      <section
        role="status"
        className="rounded-2xl border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-teal"
      >
        目前無生效天氣警告
      </section>
    );
  }
  return (
    <section
      role="alert"
      className="space-y-2 rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3"
    >
      <p className="text-xs font-medium text-amber">生效中天氣警告</p>
      <div className="flex flex-wrap gap-2">
        {warnings.map((w) => (
          <span
            key={`${w.name}-${w.type}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${warningTone(w.name)}`}
          >
            {w.name}
            {w.type ? ` · ${w.type}` : ""}
          </span>
        ))}
      </div>
      {warningMessage ? <p className="text-sm text-ink">{warningMessage}</p> : null}
      {tropicalMessage ? <p className="text-sm text-muted">{tropicalMessage}</p> : null}
    </section>
  );
}

function MetricChip({
  label,
  value,
  sub,
  tone = "default",
  compact = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "bad";
  compact?: boolean;
}) {
  const valueCls =
    tone === "ok"
      ? "text-teal"
      : tone === "warn"
        ? "text-amber"
        : tone === "bad"
          ? "text-rose"
          : "text-ink";
  return (
    <div className="min-w-0 rounded-xl border border-line bg-elev/50 px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p
        className={`mt-0.5 font-medium leading-snug ${valueCls} ${
          compact ? "line-clamp-2 text-sm text-ink" : "truncate font-mono text-lg"
        }`}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 truncate text-[11px] text-muted">{sub}</p> : null}
    </div>
  );
}

function aqhiTone(risk: string): "ok" | "warn" | "bad" | "default" {
  if (/低|Low/i.test(risk)) return "ok";
  if (/中|Moderate/i.test(risk)) return "warn";
  if (/高|High|甚高|嚴重|Serious/i.test(risk)) return "bad";
  return "default";
}

function uvTone(desc: string): "ok" | "warn" | "bad" | "default" {
  if (/低|Low/i.test(desc)) return "ok";
  if (/中|Moderate/i.test(desc)) return "warn";
  if (/高|High|極高|Extreme/i.test(desc)) return "bad";
  return "default";
}

function MetricsRow({
  humidity,
  uv,
  aqhi,
  todayWind,
}: {
  humidity: number | null;
  uv: UvIndex | null;
  aqhi: AqhiSummary | null;
  todayWind: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <MetricChip
        label="濕度"
        value={humidity != null ? `${humidity}%` : "—"}
      />
      <MetricChip
        label="紫外線 UV"
        value={uv ? String(uv.value) : "—"}
        sub={uv ? `${uv.desc}${uv.recordDesc ? ` · ${uv.recordDesc}` : ""}` : "夜間或暫無數據"}
        tone={uv ? uvTone(uv.desc) : "default"}
      />
      <MetricChip
        label="空氣質素 AQHI"
        value={aqhi ? String(aqhi.value) : "—"}
        sub={aqhi ? `${aqhi.riskTc} · ${aqhi.scopeLabel}` : "暫未能載入"}
        tone={aqhi ? aqhiTone(aqhi.risk) : "default"}
      />
      <MetricChip
        label="今日風力"
        value={todayWind ? todayWind.replace(/。$/, "") : "—"}
        sub={todayWind ? "來自九天預報" : undefined}
        compact
      />
    </div>
  );
}

function ForecastSections({
  forecast,
  outlook,
  todayWind,
}: {
  forecast: string;
  outlook: string;
  todayWind: string;
}) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
      <h2 className="text-sm text-muted">本港地區天氣預報</h2>
      {forecast ? (
        <div>
          <h3 className="text-xs font-medium text-teal">今日預報</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink">{forecast}</p>
        </div>
      ) : null}
      {todayWind ? (
        <div>
          <h3 className="text-xs font-medium text-teal">風向／風力</h3>
          <p className="mt-1 text-sm leading-relaxed text-ink">{todayWind}</p>
        </div>
      ) : null}
      {outlook ? (
        <div>
          <h3 className="text-xs font-medium text-teal">未來展望</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{outlook}</p>
        </div>
      ) : null}
    </section>
  );
}

function TempRangeBar({
  min,
  max,
  rangeMin,
  rangeMax,
}: {
  min: number;
  max: number;
  rangeMin: number;
  rangeMax: number;
}) {
  const span = Math.max(rangeMax - rangeMin, 1);
  const left = ((min - rangeMin) / span) * 100;
  const width = Math.max(((max - min) / span) * 100, 8);
  return (
    <div className="relative h-2 w-full rounded-full bg-line/70">
      <div
        className="absolute top-0 h-2 rounded-full bg-gradient-to-r from-sky via-teal to-amber"
        style={{ left: `${left}%`, width: `${width}%` }}
      />
    </div>
  );
}

function psrTone(psr: string) {
  if (/高|High/i.test(psr) && !/中|Medium/i.test(psr)) return "text-rose";
  if (/中高|Medium High/i.test(psr)) return "text-amber";
  if (/中|Medium/i.test(psr)) return "text-sky";
  return "text-muted";
}

function NineDayCard({
  day,
  rangeMin,
  rangeMax,
}: {
  day: NineDayForecast;
  rangeMin: number;
  rangeMax: number;
}) {
  return (
    <article className="rounded-xl border border-line bg-card p-3">
      <div className="flex items-start gap-2.5">
        {day.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={day.iconUrl} alt="" className="h-10 w-10 shrink-0" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-lg bg-line/60" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm text-ink">
              {day.week}{" "}
              <span className="text-muted">({day.dateLabel})</span>
            </h3>
            {day.PSR ? (
              <span className={`shrink-0 text-[11px] ${psrTone(day.PSR)}`}>
                降雨 {day.PSR}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="w-7 shrink-0 font-mono text-xs text-muted">
              {day.forecastMintemp}°
            </span>
            <TempRangeBar
              min={day.forecastMintemp}
              max={day.forecastMaxtemp}
              rangeMin={rangeMin}
              rangeMax={rangeMax}
            />
            <span className="w-7 shrink-0 text-right font-mono text-xs text-teal">
              {day.forecastMaxtemp}°
            </span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted">
            {day.forecastWeather}
          </p>
        </div>
      </div>
    </article>
  );
}

export function WeatherApp() {
  const [data, setData] = useState<WeatherSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiGet<WeatherSnapshot>("/api/weather").then(setData).catch((e) => setError(e.message));
  }, []);

  const tempRange = useMemo(() => {
    if (!data?.nineDay.length) return { min: 0, max: 1 };
    const mins = data.nineDay.map((d) => d.forecastMintemp);
    const maxs = data.nineDay.map((d) => d.forecastMaxtemp);
    return {
      min: Math.min(...mins),
      max: Math.max(...maxs),
    };
  }, [data]);

  return (
    <AppShell>
      {error ? <p className="text-rose">{error}</p> : null}
      {!data ? (
        <p className="text-muted">載入天氣…</p>
      ) : (
        <div className="space-y-4">
          <WarningBanner
            warnings={data.warnings}
            warningMessage={data.warningMessage}
            tropicalMessage={data.tropicalMessage}
          />

          <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
            <div className="flex items-center gap-5">
              {data.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.iconUrl} alt="" className="h-16 w-16" />
              ) : null}
              <div>
                <div className="text-sm text-muted">{data.place}</div>
                <div className="font-mono text-5xl text-teal">{data.temperature}°C</div>
                {data.updateTime ? (
                  <div className="mt-1 text-[11px] text-muted">
                    更新{" "}
                    {new Date(data.updateTime).toLocaleString("zh-HK", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                ) : null}
              </div>
            </div>
            <MetricsRow
              humidity={data.humidity}
              uv={data.uv}
              aqhi={data.aqhi}
              todayWind={data.todayWind}
            />
          </section>

          <ForecastSections
            forecast={data.forecast}
            outlook={data.outlook}
            todayWind={data.todayWind}
          />

          {data.rainfall.length ? (
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="mb-2 text-sm text-muted">過去一小時雨量</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.rainfall.map((r) => (
                  <div key={r.place} className="flex justify-between gap-3">
                    <span>{r.place}</span>
                    <span className="font-mono">{r.max} mm</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-sm text-muted">九天天氣預報</h2>
              <p className="text-[11px] text-muted">色條＝當日最低至最高溫</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.nineDay.map((d) => (
                <NineDayCard
                  key={d.date}
                  day={d}
                  rangeMin={tempRange.min}
                  rangeMax={tempRange.max}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
