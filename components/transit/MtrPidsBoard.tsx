"use client";

import { useState } from "react";
import { lrtRouteColor } from "@/lib/static/lrt-routes";
import { mtrLineColor } from "@/lib/static/mtr-schematic";
import type { EtaResult } from "@/lib/types";

type PlatformBoard = {
  platform: string;
  dest: string;
  route: string;
  trains: EtaResult[];
};

function platformGroups(etas: EtaResult[]): PlatformBoard[] {
  const map = new Map<string, EtaResult[]>();
  const sorted = [...etas].sort(
    (a, b) => (a.etaMinutes ?? 999) - (b.etaMinutes ?? 999) || (a.etaTime ?? "").localeCompare(b.etaTime ?? ""),
  );
  for (const eta of sorted) {
    const key = `${eta.platform ?? "—"}|${eta.dest}|${eta.route}`;
    const list = map.get(key) ?? [];
    list.push(eta);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([, trains]) => ({
      platform: trains[0].platform ?? "—",
      dest: trains[0].dest,
      route: trains[0].route,
      trains: trains.slice(0, 4),
    }))
    .sort((a, b) => {
      const pa = Number(a.platform);
      const pb = Number(b.platform);
      if (Number.isFinite(pa) && Number.isFinite(pb) && pa !== pb) return pa - pb;
      return a.platform.localeCompare(b.platform, "zh-Hant") || a.dest.localeCompare(b.dest, "zh-Hant");
    });
}

function isArriving(minutes: number | null) {
  return minutes != null && minutes <= 0;
}

function isSoon(minutes: number | null) {
  return minutes != null && minutes <= 1;
}

export function MtrPidsBoard({
  etas,
  loading,
  emptyHint,
}: {
  etas: EtaResult[];
  loading: boolean;
  emptyHint: string;
}) {
  if (etas.length === 0 && !loading) {
    return <p className="mt-2 text-muted">{emptyHint}</p>;
  }
  if (etas.length === 0) {
    return <p className="mt-2 text-muted">載入班次中…</p>;
  }

  const groups = platformGroups(etas);

  return (
    <div className={`mt-1 grid gap-3 ${groups.length > 1 ? "sm:grid-cols-2" : ""}`}>
      {groups.map((group) => {
        const color = lrtRouteColor(group.route) ?? mtrLineColor(group.route) ?? "#3ee0c5";
        const [hero, next, ...later] = group.trains;
        return (
          <article
            key={`${group.route}-${group.platform}-${group.dest}`}
            className="overflow-hidden rounded-xl border border-line bg-[#070d12]"
            style={{ borderColor: `${color}66` }}
          >
            <header className="flex bg-black">
              <span className="w-1.5 shrink-0" style={{ backgroundColor: color }} aria-hidden />
              <div className="min-w-0 flex-1 px-3 py-2.5">
                <div className="text-[11px] font-medium tracking-wide text-white/50">{group.route}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xl font-semibold leading-tight">
                    {group.platform === "—" ? "月台" : `${group.platform}號月台`}
                  </span>
                  <span className="text-white/30" aria-hidden>
                    ·
                  </span>
                  <span className="text-xl font-semibold leading-tight">
                    往 {group.dest}
                    <span className="ml-1 font-normal text-white/55">➔</span>
                  </span>
                </div>
              </div>
            </header>

            {hero ? <HeroTrain eta={hero} color={color} /> : null}

            <div className="flex min-h-11 items-baseline justify-between border-t border-white/10 px-3 py-2">
              <span className="text-xs text-muted">下一班</span>
              {next ? (
                <span className="font-mono text-lg leading-none">
                  {isArriving(next.etaMinutes) ? "即將到站" : `${next.etaMinutes ?? "—"} 分`}
                  {next.etaTime ? <span className="ml-2 font-sans text-xs text-muted">{next.etaTime}</span> : null}
                </span>
              ) : (
                <span className="text-sm text-white/30">暫無</span>
              )}
            </div>

            {later.length ? <LaterTrains trains={later} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function HeroTrain({ eta, color }: { eta: EtaResult; color: string }) {
  const arriving = isArriving(eta.etaMinutes);
  const soon = isSoon(eta.etaMinutes);
  const accent = arriving || soon ? "#b4e645" : color;

  return (
    <div className="px-3 py-3">
      <div
        className={`text-xs ${arriving || soon ? "eta-arriving text-lime" : "text-muted"}`}
      >
        {arriving || soon ? "即將到站" : "最快班次"}
        {eta.remark ? ` · ${eta.remark}` : ""}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div
          className={`font-mono leading-none ${arriving || soon ? "eta-arriving text-lime" : ""}`}
          style={{ color: arriving || soon ? undefined : accent }}
        >
          {arriving ? (
            <span className="text-4xl sm:text-5xl">到站</span>
          ) : (
            <>
              <span className="text-5xl sm:text-6xl">{eta.etaMinutes ?? "—"}</span>
              <span className="ml-1 text-base text-muted">分鐘</span>
            </>
          )}
        </div>
        {eta.etaTime ? <div className="pb-1 font-mono text-sm text-muted">{eta.etaTime}</div> : null}
      </div>
    </div>
  );
}

function LaterTrains({ trains }: { trains: EtaResult[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-white/10">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-muted hover:text-ink"
      >
        <span>之後 {trains.length} 班</span>
        <span aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open ? (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
          {trains.map((eta, i) => (
            <span
              key={`${eta.etaTime}-${i}`}
              className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-muted"
            >
              {eta.etaMinutes ?? "—"} 分{eta.etaTime ? ` · ${eta.etaTime}` : ""}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
