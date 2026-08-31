"use client";

import { useEffect, useId, useState } from "react";
import { apiGet } from "@/lib/client";
import type { WeatherMapLayer, WeatherMapsSnapshot } from "@/lib/providers/weather-maps";

const REFRESH_MS = 6 * 60 * 1000;
const FRAME_MS = 450;

type Tab = "radar" | "wind";

function formatUpdatedAt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("zh-HK", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function useLayerFrames(layer: WeatherMapLayer, playing: boolean) {
  const [frame, setFrame] = useState(layer.frames.length - 1);
  const canPlay = layer.frames.length > 1;

  useEffect(() => {
    setFrame(layer.frames.length - 1);
  }, [layer.frames]);

  useEffect(() => {
    if (!playing || !canPlay) return;
    const id = window.setInterval(() => {
      setFrame((i) => (i + 1) % layer.frames.length);
    }, FRAME_MS);
    return () => clearInterval(id);
  }, [playing, canPlay, layer.frames.length]);

  const src = `${layer.frames[Math.max(0, frame)] ?? layer.imageUrl}`;
  return { src, canPlay };
}

function MapLightbox({
  layer,
  playing,
  onTogglePlay,
  bust,
  onClose,
}: {
  layer: WeatherMapLayer;
  playing: boolean;
  onTogglePlay?: () => void;
  bust: number;
  onClose: () => void;
}) {
  const titleId = useId();
  const { src, canPlay } = useLayerFrames(layer, playing);
  const updated = formatUpdatedAt(layer.updatedAt);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="關閉放大檢視"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl border border-line bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-medium sm:text-lg">
              {layer.title}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted sm:text-xs">
              {layer.subtitle}
              {updated ? ` · 影像時間 ${updated}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canPlay && onTogglePlay ? (
              <button
                type="button"
                onClick={onTogglePlay}
                className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:border-teal/40 hover:text-ink"
              >
                {playing ? "暫停" : "播放"}
              </button>
            ) : null}
            <a
              href={layer.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:border-teal/40 hover:text-teal"
            >
              天文台
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:border-teal hover:text-ink"
            >
              關閉
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="overflow-hidden rounded-xl border border-line bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${src}&t=${bust}`}
              alt={layer.title}
              className="mx-auto max-h-[78vh] w-full object-contain"
            />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted">
            按背景、關閉或 Esc 離開放大檢視
          </p>
        </div>
      </div>
    </div>
  );
}

function MapPanel({
  layer,
  playing,
  onTogglePlay,
  onExpand,
  bust,
}: {
  layer: WeatherMapLayer;
  playing: boolean;
  onTogglePlay?: () => void;
  onExpand: () => void;
  bust: number;
}) {
  const { src, canPlay } = useLayerFrames(layer, playing);
  const updated = formatUpdatedAt(layer.updatedAt);

  return (
    <article className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{layer.title}</h3>
          <p className="text-[11px] text-muted">{layer.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {canPlay && onTogglePlay ? (
            <button
              type="button"
              onClick={onTogglePlay}
              className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted hover:border-teal/40 hover:text-ink"
            >
              {playing ? "暫停" : "播放"}
            </button>
          ) : null}
          <a
            href={layer.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-line px-2.5 py-1 text-[11px] text-muted hover:border-teal/40 hover:text-teal"
          >
            天文台
          </a>
        </div>
      </div>
      <button
        type="button"
        onClick={onExpand}
        className="group relative overflow-hidden rounded-xl border border-line bg-elev/40 text-left transition hover:border-teal/40"
        aria-label={`放大檢視${layer.title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${src}&t=${bust}`}
          alt={layer.title}
          className="mx-auto max-h-[22rem] w-full object-contain lg:max-h-[26rem]"
        />
        <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white opacity-90">
          放大
        </span>
      </button>
      {updated ? (
        <p className="mt-1.5 text-[11px] text-muted">影像時間 {updated}</p>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted">來源：香港天文台</p>
      )}
    </article>
  );
}

export function WeatherSpatialMaps() {
  const [data, setData] = useState<WeatherMapsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("radar");
  /** Default on: rain motion is the point of the radar loop; user can pause. */
  const [playingRadar, setPlayingRadar] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [bust, setBust] = useState(0);
  const [expanded, setExpanded] = useState<Tab | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduceMotion(mq.matches);
      if (mq.matches) setPlayingRadar(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    function load() {
      apiGet<WeatherMapsSnapshot>("/api/weather/maps")
        .then((snap) => {
          if (cancelled) return;
          setData(snap);
          setError("");
          setBust((n) => n + 1);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message || "無法載入天氣圖層");
        });
    }
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const radarPlaying = playingRadar && !reduceMotion;

  if (error && !data) {
    return (
      <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted sm:p-5">
        空間天氣圖層暫未能載入（{error}）
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-line bg-card p-4 text-sm text-muted sm:p-5">
        載入降雨雷達與風力圖…
      </section>
    );
  }

  const active = tab === "radar" ? data.radar : data.wind;
  const expandedLayer =
    expanded === "radar" ? data.radar : expanded === "wind" ? data.wind : null;

  return (
    <section
      aria-label="空間天氣圖層"
      className="rounded-2xl border border-line bg-card p-4 sm:p-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">空間天氣圖層</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            降雨雷達預設自動播放；可暫停。約每 6 分鐘自動更新。
          </p>
        </div>
      </div>

      {/* Mobile / tablet: single card with tabs */}
      <div className="lg:hidden">
        <div
          role="tablist"
          aria-label="天氣圖層切換"
          className="mb-3 grid grid-cols-2 gap-1 rounded-xl border border-line bg-elev/40 p-1"
        >
          {(
            [
              ["radar", "降雨雷達"],
              ["wind", "風力風向"],
            ] as const
          ).map(([id, label]) => {
            const selected = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(id)}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  selected
                    ? "bg-teal/15 font-medium text-teal"
                    : "text-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <MapPanel
          layer={active}
          playing={tab === "radar" && radarPlaying}
          onTogglePlay={
            tab === "radar" && !reduceMotion
              ? () => setPlayingRadar((v) => !v)
              : undefined
          }
          onExpand={() => setExpanded(tab)}
          bust={bust}
        />
      </div>

      {/* Desktop: side by side */}
      <div className="hidden gap-5 lg:grid lg:grid-cols-2">
        <MapPanel
          layer={data.radar}
          playing={radarPlaying}
          onTogglePlay={
            reduceMotion ? undefined : () => setPlayingRadar((v) => !v)
          }
          onExpand={() => setExpanded("radar")}
          bust={bust}
        />
        <MapPanel
          layer={data.wind}
          playing={false}
          onExpand={() => setExpanded("wind")}
          bust={bust}
        />
      </div>

      {expandedLayer ? (
        <MapLightbox
          layer={expandedLayer}
          playing={expanded === "radar" && radarPlaying}
          onTogglePlay={
            expanded === "radar" && !reduceMotion
              ? () => setPlayingRadar((v) => !v)
              : undefined
          }
          bust={bust}
          onClose={() => setExpanded(null)}
        />
      ) : null}
    </section>
  );
}
