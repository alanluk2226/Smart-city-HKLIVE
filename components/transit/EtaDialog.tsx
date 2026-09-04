"use client";

import { useEffect, useMemo, useState } from "react";
import { FareHint } from "@/components/transit/FareHint";
import { MtrPidsBoard } from "@/components/transit/MtrPidsBoard";
import { LRT_ROUTE_ORDER, lrtRouteColor, lrtRouteInk } from "@/lib/static/lrt-routes";
import { mtrLineColor, mtrLineInk } from "@/lib/static/mtr-schematic";
import { MTR_LINE_NAMES, MTR_LINE_ORDER } from "@/lib/static/mtr-stations";
import type { EtaResult } from "@/lib/types";

function lineOrderIndex(route: string) {
  const lrtI = LRT_ROUTE_ORDER.indexOf(route as (typeof LRT_ROUTE_ORDER)[number]);
  if (lrtI >= 0) return lrtI;
  const code = Object.entries(MTR_LINE_NAMES).find(([, name]) => name === route)?.[0];
  if (!code) return 99;
  const i = MTR_LINE_ORDER.indexOf(code as (typeof MTR_LINE_ORDER)[number]);
  return i < 0 ? 99 : i;
}

function routeColor(name: string) {
  return lrtRouteColor(name) ?? mtrLineColor(name) ?? "#3ee0c5";
}

function routeInk(name: string) {
  const color = routeColor(name);
  return lrtRouteColor(name) ? lrtRouteInk(color) : mtrLineInk(color);
}

export function EtaDialog({
  title,
  subtitle,
  etas,
  loading,
  error,
  showAllRoutes,
  fareHint,
  onClose,
}: {
  title: string;
  subtitle?: string;
  etas: EtaResult[];
  loading: boolean;
  error?: string;
  showAllRoutes?: boolean;
  /** Optional light fare line (e.g. LRT OD-dependent note) */
  fareHint?: string;
  onClose: () => void;
}) {
  const lines = useMemo(() => {
    const names = new Set(etas.filter((eta) => eta.route).map((eta) => eta.route));
    return [...names].sort((a, b) => lineOrderIndex(a) - lineOrderIndex(b));
  }, [etas]);

  const showTabs = !showAllRoutes && lines.length > 1;
  const showFilter = Boolean(showAllRoutes && lines.length > 1);
  const lineKey = lines.join("|");
  const [line, setLine] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!showTabs) {
      setLine(null);
      return;
    }
    setLine((prev) => (prev && lines.includes(prev) ? prev : lines[0]));
  }, [title, lineKey, showTabs, lines]);

  useEffect(() => {
    setFilter((prev) => (prev && lines.includes(prev) ? prev : null));
  }, [title, lineKey, lines]);

  const visible =
    showTabs && line
      ? etas.filter((eta) => eta.route === line)
      : showFilter && filter
        ? etas.filter((eta) => eta.route === filter)
        : etas;

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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="關閉班次視窗"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="eta-dialog-title"
        className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-line bg-card shadow-2xl sm:max-w-3xl sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h2 id="eta-dialog-title" className="text-lg leading-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
            {fareHint ? <FareHint className="mt-1.5" label={fareHint} /> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {loading ? <span className="text-xs text-muted">更新中</span> : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-teal hover:text-ink"
            >
              關閉
            </button>
          </div>
        </div>
        {showFilter ? (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="篩選此站路綫">
              <button
                type="button"
                aria-pressed={filter === null}
                onClick={() => setFilter(null)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  filter === null
                    ? "bg-elev text-ink ring-1 ring-line"
                    : "text-muted ring-1 ring-inset ring-line hover:text-ink"
                }`}
              >
                全部
              </button>
              {lines.map((name) => {
                const color = routeColor(name);
                const selected = filter === name;
                return (
                  <button
                    type="button"
                    key={name}
                    aria-pressed={selected}
                    onClick={() => setFilter(selected ? null : name)}
                    className="rounded-full px-2.5 py-1 text-xs"
                    style={
                      selected
                        ? { backgroundColor: color, color: routeInk(name) }
                        : {
                            backgroundColor: "transparent",
                            color,
                            boxShadow: `inset 0 0 0 1px ${color}99`,
                            opacity: 0.72,
                          }
                    }
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              {filter ? `已篩選 ${filter}，再點一次可睇全部。` : "點路綫可篩選此站班次。"}
            </p>
          </div>
        ) : null}
        {showTabs ? (
          <div className="flex gap-2 overflow-x-auto px-4 pb-2" role="tablist" aria-label="路綫">
            {lines.map((name) => {
              const color = routeColor(name);
              const active = line === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setLine(name)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-sm"
                  style={
                    active
                      ? { backgroundColor: color, color: routeInk(name) }
                      : { backgroundColor: "transparent", color: color, boxShadow: `inset 0 0 0 1px ${color}` }
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : null}
        {error ? <p className="px-4 text-sm text-rose">{error}</p> : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          <MtrPidsBoard
            etas={visible}
            loading={loading}
            emptyHint="暫時沒有班次資料。"
          />
        </div>
      </div>
    </div>
  );
}
