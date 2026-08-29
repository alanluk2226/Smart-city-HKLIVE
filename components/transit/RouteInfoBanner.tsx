"use client";

import type { RouteInfo } from "@/lib/types";
import type { EtaResult } from "@/lib/types";

function formatFareHkd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(1)}`;
}

function predictClock(minutesFromNow: number | null): string | null {
  if (minutesFromNow == null || !Number.isFinite(minutesFromNow)) return null;
  const d = new Date(Date.now() + Math.max(0, minutesFromNow) * 60_000);
  return d.toLocaleTimeString("zh-HK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Hong_Kong",
  });
}

export function RouteInfoBanner({
  info,
  loading,
  soonestEtaMinutes,
  compact = false,
}: {
  info: RouteInfo | null;
  loading?: boolean;
  soonestEtaMinutes?: number | null;
  /** Denser one-line summary for map split layouts */
  compact?: boolean;
}) {
  if (!info && !loading) return null;

  const arriveStop = predictClock(soonestEtaMinutes ?? null);
  const arriveDest =
    soonestEtaMinutes != null && info?.remainingMinutes != null
      ? predictClock(soonestEtaMinutes + info.remainingMinutes)
      : info?.remainingMinutes != null
        ? predictClock(info.remainingMinutes)
        : null;

  if (compact) {
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
        {loading && !info ? (
          <span>載入車費與車程…</span>
        ) : (
          <>
            <span>
              車費 <span className="font-mono text-amber">{formatFareHkd(info?.fareAdult)}</span>
            </span>
            {info?.journeyMinutes != null ? (
              <span>
                全程 <span className="font-mono text-ink">{info.journeyMinutes}</span> 分
              </span>
            ) : null}
            {arriveStop ? (
              <span>
                到站 <span className="font-mono text-teal">{arriveStop}</span>
              </span>
            ) : null}
            {arriveDest && info?.destName ? (
              <span>
                抵{info.destName} <span className="font-mono text-teal">{arriveDest}</span>
              </span>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-card/80 px-3 py-2.5 text-sm">
      {loading && !info ? (
        <p className="text-muted text-xs">載入車費與車程…</p>
      ) : (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <span>
            <span className="text-muted text-xs mr-1">車費</span>
            <span className="font-mono text-amber">{formatFareHkd(info?.fareAdult)}</span>
            <span className="text-muted text-xs ml-1">成人</span>
          </span>
          {info?.journeyMinutes != null ? (
            <span>
              <span className="text-muted text-xs mr-1">全程約</span>
              <span className="font-mono">{info.journeyMinutes}</span>
              <span className="text-muted text-xs ml-1">分鐘</span>
            </span>
          ) : null}
          {info?.remainingMinutes != null && info.destName ? (
            <span>
              <span className="text-muted text-xs mr-1">至此站往{info.destName}約</span>
              <span className="font-mono">{info.remainingMinutes}</span>
              <span className="text-muted text-xs ml-1">分鐘</span>
            </span>
          ) : null}
          {arriveStop ? (
            <span>
              <span className="text-muted text-xs mr-1">預計到站</span>
              <span className="font-mono text-teal">{arriveStop}</span>
            </span>
          ) : null}
          {arriveDest && info?.destName ? (
            <span>
              <span className="text-muted text-xs mr-1">預計抵{info.destName}</span>
              <span className="font-mono text-teal">{arriveDest}</span>
            </span>
          ) : null}
        </div>
      )}
      {info?.note ? <p className="mt-1 text-[11px] text-muted">{info.note}</p> : null}
    </div>
  );
}

export function etaArriveLabel(eta: EtaResult): string {
  if (eta.etaTime) return eta.etaTime;
  return predictClock(eta.etaMinutes) ?? "—";
}
