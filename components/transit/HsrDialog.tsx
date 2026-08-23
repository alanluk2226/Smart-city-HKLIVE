"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/client";
import { mtrLineColor } from "@/lib/static/mtr-schematic";
import type { HsrBoard, HsrDestGroup } from "@/lib/types";

const HSR_COLOR = mtrLineColor("HSR") ?? "#A7A9AC";

function formatFare(n: number | null) {
  if (n == null) return "—";
  return `$${n.toFixed(0)}`;
}

export function HsrDialog({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<HsrBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"SHT" | "LHT">("SHT");
  const [dest, setDest] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    apiGet<HsrBoard>("/api/mtr/hsr")
      .then((data) => {
        if (cancelled) return;
        setBoard(data);
        const first = data.groups.find((g) => g.shortHaul) ?? data.groups[0];
        setDest(first?.dest ?? null);
        setTab(first && !first.shortHaul ? "LHT" : "SHT");
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "無法載入高鐵班次");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (!board) return [];
    return board.groups.filter((g) => (tab === "SHT" ? g.shortHaul : !g.shortHaul));
  }, [board, tab]);

  const active = shown.find((g) => g.dest === dest) ?? shown[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/55" aria-label="關閉高鐵資訊" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hsr-dialog-title"
        className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-line bg-card shadow-2xl sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h2 id="hsr-dialog-title" className="text-lg leading-tight">
              香港西九龍
            </h2>
            <p className="mt-0.5 text-xs text-muted">Hong Kong West Kowloon · 高速鐵路往內地</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-teal hover:text-ink"
          >
            關閉
          </button>
        </div>
        {board ? <p className="px-4 pb-2 text-[11px] text-muted">{board.access}</p> : null}
        <div className="flex gap-2 px-4 pb-2" role="tablist" aria-label="列車類別">
          {(
            [
              ["SHT", "短途"],
              ["LHT", "長途"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                const next = board?.groups.find((g) => (id === "SHT" ? g.shortHaul : !g.shortHaul));
                setDest(next?.dest ?? null);
              }}
              className={`rounded-full px-3 py-1.5 text-sm ${
                tab === id ? "bg-[#A7A9AC] text-bg" : "border border-line text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {shown.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto px-4 pb-2" role="tablist" aria-label="目的地">
            {shown.map((g) => {
              const on = (active?.dest ?? dest) === g.dest;
              return (
                <button
                  key={g.dest}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setDest(g.dest)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                    on ? "text-bg" : "text-muted"
                  }`}
                  style={
                    on
                      ? { backgroundColor: HSR_COLOR }
                      : { boxShadow: `inset 0 0 0 1px ${HSR_COLOR}` }
                  }
                >
                  {g.destName}
                </button>
              );
            })}
          </div>
        ) : null}
        {error ? <p className="px-4 text-sm text-rose">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          {loading ? <p className="mt-2 text-sm text-muted">載入高鐵班次中…</p> : null}
          {active ? <DestCard group={active} /> : !loading && !error ? (
            <p className="mt-2 text-sm text-muted">暫時沒有班次資料。</p>
          ) : null}
          {board?.effectiveFrom ? (
            <p className="mt-3 text-[11px] text-muted">
              時間表有效期 {board.effectiveFrom}
              {board.effectiveTo ? ` 至 ${board.effectiveTo}` : ""} · 資料來源：港鐵高鐵
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DestCard({ group }: { group: HsrDestGroup }) {
  const [hero, next, ...later] = group.trains;
  return (
    <article className="overflow-hidden rounded-xl border bg-[#070d12]" style={{ borderColor: `${HSR_COLOR}66` }}>
      <header className="flex bg-black">
        <span className="w-1.5 shrink-0" style={{ backgroundColor: HSR_COLOR }} aria-hidden />
        <div className="min-w-0 flex-1 px-3 py-2">
          <div className="text-[11px] tracking-wide text-white/55">高速鐵路 · 香港西九龍開出</div>
          <div className="mt-0.5 text-base leading-tight">
            往 {group.destName}
            <span className="ml-1 text-white/70">➔</span>
          </div>
          <div className="text-[11px] text-white/45">{group.destEn}</div>
        </div>
      </header>
      {hero ? (
        <div className="px-3 py-3">
          <div className={`text-xs ${hero.minutesUntil <= 5 ? "eta-arriving text-lime" : "text-muted"}`}>
            {hero.tomorrow ? "明日" : hero.minutesUntil <= 5 ? "即將開出" : "下一班"}
            {hero.vibrant ? " · 港鐵動感號" : ""}
            <span className="ml-2 font-mono">{hero.id}</span>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div className={hero.minutesUntil <= 5 && !hero.tomorrow ? "eta-arriving text-lime" : ""}>
              <span className="font-mono text-5xl leading-none">{hero.depart}</span>
              <span className="ml-1 text-sm text-muted">開出</span>
            </div>
            <div className="pb-1 text-right text-xs text-muted">
              {hero.tomorrow ? "明日" : `${hero.minutesUntil} 分鐘後`}
              <div>抵達 {hero.arrive} · {hero.durationMin} 分</div>
            </div>
          </div>
        </div>
      ) : null}
      {next ? (
        <div className="flex items-baseline justify-between border-t border-white/10 px-3 py-2">
          <span className="text-xs text-muted">下一班 {next.vibrant ? "動感號" : next.id}</span>
          <span className="font-mono text-lg">
            {next.depart}
            <span className="ml-2 text-xs text-muted">
              {next.tomorrow ? "明日" : `${next.minutesUntil} 分`} · 抵 {next.arrive}
            </span>
          </span>
        </div>
      ) : null}
      {later.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 px-3 py-2">
          <span className="text-[11px] text-muted">之後</span>
          {later.map((t) => (
            <span key={`${t.id}-${t.depart}`} className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-muted">
              {t.depart}
              {t.tomorrow ? " 明日" : ""} {t.id}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex justify-between border-t border-white/10 px-3 py-2 text-xs text-muted">
        <span>二等座參考車費</span>
        <span>
          成人 {formatFare(group.fareAdult)} · 小童 {formatFare(group.fareChild)}
        </span>
      </div>
    </article>
  );
}
