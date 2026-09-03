"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/client";
import type { AlertSeverity, AlertsSnapshot, CityAlert } from "@/lib/providers/alerts";

const HIDE_KEY = "hk-live-alerts-hide";
const ROTATE_MS = 8_000;
const POLL_MS = 60_000;

function tone(severity: AlertSeverity) {
  if (severity === "critical") {
    return {
      bar: "border-rose/40 bg-rose/12 text-ink",
      chip: "bg-rose/20 text-rose",
      progress: "bg-rose/70",
    };
  }
  if (severity === "high") {
    return {
      bar: "border-amber/40 bg-amber/12 text-ink",
      chip: "bg-amber/20 text-amber",
      progress: "bg-amber/70",
    };
  }
  return {
    bar: "border-sky/35 bg-sky/10 text-ink",
    chip: "bg-sky/20 text-sky",
    progress: "bg-sky/70",
  };
}

function signature(alerts: CityAlert[]) {
  return alerts.map((a) => a.id).join("|");
}

function readHidden(sig: string) {
  try {
    return sessionStorage.getItem(HIDE_KEY) === sig;
  } catch {
    return false;
  }
}

function writeHidden(sig: string | null) {
  try {
    if (sig) sessionStorage.setItem(HIDE_KEY, sig);
    else sessionStorage.removeItem(HIDE_KEY);
  } catch {
    /* ignore */
  }
}

export function AlertsBar() {
  const [snap, setSnap] = useState<AlertsSnapshot | null>(null);
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    function load() {
      apiGet<AlertsSnapshot>("/api/alerts")
        .then((data) => {
          if (cancelled) return;
          setSnap(data);
          const sig = signature(data.alerts);
          setHidden(readHidden(sig));
          setIndex(0);
          setTick((t) => t + 1);
        })
        .catch(() => {});
    }
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const alerts = snap?.alerts ?? [];
  const current = alerts[index] ?? alerts[0] ?? null;
  const canRotate = alerts.length > 1 && !hidden && !expanded && !paused && !reduceMotion;

  useEffect(() => {
    if (!canRotate) return;
    setTick((t) => t + 1);
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % alerts.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [alerts.length, canRotate, index]);

  if (!current) return null;

  const sig = signature(alerts);
  const styles = tone(current.severity);
  const countLabel = alerts.length > 1 ? `${index + 1}/${alerts.length}` : null;
  const showProgress = alerts.length > 1 && !hidden && !expanded && !reduceMotion;

  function goPrev() {
    setIndex((i) => (i - 1 + alerts.length) % alerts.length);
  }

  function goNext() {
    setIndex((i) => (i + 1) % alerts.length);
  }

  if (hidden) {
    return (
      <div className="border-t border-line/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-1">
          <button
            type="button"
            onClick={() => {
              writeHidden(null);
              setHidden(false);
            }}
            className="min-h-9 px-1 text-[11px] text-muted hover:text-ink"
          >
            {alerts.length} 則突發提示 · {alerts.map((a) => a.label).slice(0, 2).join("／")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-t ${styles.bar}`}
      role="region"
      aria-label="突發提示"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div className="mx-auto max-w-6xl px-4 pt-1.5 pb-1">
        <div className="flex items-start gap-2">
          <span
            className={`mt-1 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${styles.chip}`}
          >
            {current.kind === "weather" ? "天氣" : current.kind === "transit" ? "港鐵" : "交通"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-snug">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="min-w-0 text-left font-medium hover:underline"
              >
                {current.headline}
              </button>
              {countLabel ? (
                <span className="font-mono text-[10px] text-muted">{countLabel}</span>
              ) : null}
            </p>
            {expanded ? (
              <div className="mt-1 space-y-1">
                <p className="text-xs leading-relaxed text-muted">{current.detail}</p>
                <Link href={current.href} className="inline-block text-[11px] text-teal hover:underline">
                  {current.kind === "weather"
                    ? "前往天氣"
                    : current.kind === "transit"
                      ? "前往港鐵"
                      : "前往路況 CCTV"}
                </Link>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {alerts.length > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="上一則提示"
                  onClick={goPrev}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-ink/5 hover:text-ink"
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  aria-label="下一則提示"
                  onClick={goNext}
                  className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-ink/5 hover:text-ink"
                >
                  <span className="hidden sm:inline">下一則</span>
                  <ChevronRightIcon />
                </button>
              </>
            ) : null}
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex h-11 items-center justify-center rounded-lg px-2.5 text-xs text-muted hover:bg-ink/5 hover:text-ink"
            >
              {expanded ? "收起" : "詳情"}
            </button>
            <button
              type="button"
              aria-label="暫時隱藏提示"
              onClick={() => {
                writeHidden(sig);
                setHidden(true);
                setExpanded(false);
              }}
              className="inline-flex h-11 items-center justify-center rounded-lg px-2.5 text-xs text-muted hover:bg-ink/5 hover:text-ink"
            >
              隱藏
            </button>
          </div>
        </div>
        {showProgress ? (
          <div
            className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-ink/10"
            aria-hidden
            title="自動輪播進度"
          >
            <div
              key={tick}
              className={`h-full origin-left rounded-full ${styles.progress} ${
                paused ? "alerts-progress-bar is-paused" : "alerts-progress-bar"
              }`}
            />
          </div>
        ) : null}
        <span className="sr-only" aria-live="polite">
          {current.source}：{current.headline}
        </span>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6 9 12l6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
