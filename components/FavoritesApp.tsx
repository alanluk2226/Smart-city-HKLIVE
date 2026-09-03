"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  AI_STARS_CHANGED_EVENT,
  STAR_LIMIT,
  loadTripStars,
  toggleTripStar,
  tripPairKey,
  type SavedTrip,
} from "@/lib/ai-trip-store";
import {
  TRANSIT_FAVORITE_LIMIT,
  TRANSIT_FAVORITES_CHANGED,
  type TransitFavorite,
  favoriteHref,
  favoriteKey,
  loadTransitFavorites,
  modeBadge,
  removeTransitFavorite,
} from "@/lib/transit-favorites-store";

function formatSavedAt(ts: number) {
  try {
    return new Intl.DateTimeFormat("zh-HK", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(ts);
  } catch {
    return "";
  }
}

function transitTitle(fav: TransitFavorite) {
  if (fav.kind === "route") return `${fav.route} ${fav.orig}→${fav.dest}`;
  if (fav.kind === "trip") return `${fav.fromName}→${fav.toName}`;
  if (fav.kind === "tram") {
    return `${fav.stopName}（${fav.direction === "east" ? "東行" : "西行"}）`;
  }
  return fav.dest ? `${fav.hubName}→${fav.dest}` : fav.hubName;
}

export function FavoritesApp() {
  const [aiStars, setAiStars] = useState<SavedTrip[]>([]);
  const [transit, setTransit] = useState<TransitFavorite[]>([]);
  const [ready, setReady] = useState(false);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setAiStars(loadTripStars());
      setTransit(loadTransitFavorites());
    };
    sync();
    setReady(true);
    window.addEventListener(TRANSIT_FAVORITES_CHANGED, sync);
    window.addEventListener(AI_STARS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TRANSIT_FAVORITES_CHANGED, sync);
      window.removeEventListener(AI_STARS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const total = transit.length + aiStars.length;
  const empty = ready && total === 0;

  return (
    <AppShell title="收藏" subtitle="交通工具與出行AI方案，保存在本機瀏覽器">
      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted">
          <p>
            {ready
              ? `共 ${total} 項 · 交通最多 ${TRANSIT_FAVORITE_LIMIT} · AI 最多 ${STAR_LIMIT}`
              : "載入中…"}
          </p>
          <Link href="/transit" className="text-teal hover:underline">
            去交通工具加星 →
          </Link>
        </div>

        {empty ? (
          <section className="rounded-2xl border border-line bg-card p-6 text-center">
            <p className="text-ink">未有收藏</p>
            <p className="mt-2 text-sm text-muted">
              喺巴士／港鐵等頁撳星，或喺主頁出行AI收藏方案，之後喺呢度一鍵開啟。
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/transit"
                className="inline-flex min-h-11 items-center rounded-xl bg-teal/20 px-4 text-sm text-teal"
              >
                交通工具
              </Link>
              <Link
                href="/#ai-trip"
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-muted hover:text-ink"
              >
                出行AI
              </Link>
            </div>
          </section>
        ) : null}

        {transit.length > 0 ? (
          <section aria-labelledby="fav-transit-heading">
            <h2 id="fav-transit-heading" className="mb-2 text-sm font-medium text-ink">
              交通工具
              <span className="ml-2 font-mono text-[11px] text-muted">{transit.length}</span>
            </h2>
            <ul className="space-y-2">
              {transit.map((fav) => {
                const key = favoriteKey(fav);
                return (
                  <li
                    key={key}
                    className="flex items-stretch overflow-hidden rounded-2xl border border-amber/35 bg-card"
                  >
                    <Link
                      href={favoriteHref(fav)}
                      className="min-w-0 flex-1 px-4 py-3 hover:bg-amber/10"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-amber/15 px-2 py-0.5 text-[11px] text-amber">
                          {modeBadge(fav)}
                        </span>
                        <span className="text-[11px] text-muted">{formatSavedAt(fav.savedAt)}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-ink">{transitTitle(fav)}</p>
                      <p className="mt-0.5 text-[11px] text-teal">開啟 →</p>
                    </Link>
                    <button
                      type="button"
                      aria-label={`取消收藏 ${fav.label}`}
                      className="min-h-11 shrink-0 border-l border-amber/25 px-3 text-muted hover:bg-rose/10 hover:text-rose"
                      onClick={() => setTransit(removeTransitFavorite(key))}
                    >
                      移除
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {aiStars.length > 0 ? (
          <section aria-labelledby="fav-ai-heading">
            <h2 id="fav-ai-heading" className="mb-2 text-sm font-medium text-ink">
              出行AI
              <span className="ml-2 font-mono text-[11px] text-muted">{aiStars.length}</span>
            </h2>
            <ul className="space-y-2">
              {aiStars.map((trip) => {
                const key = tripPairKey(trip.from, trip.to);
                const open = openAiKey === key;
                const reply =
                  trip.reply?.trim() ||
                  `呢個收藏暫時未有保存方案內容。可返主頁再問「${trip.from}去${trip.to}」。`;
                return (
                  <li key={key} className="rounded-2xl border border-teal/35 bg-card">
                    <div className="flex items-stretch">
                      <button
                        type="button"
                        className="min-w-0 flex-1 px-4 py-3 text-left hover:bg-teal/10"
                        aria-expanded={open}
                        onClick={() => setOpenAiKey(open ? null : key)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[11px] text-teal">
                            AI
                          </span>
                          <span className="text-[11px] text-muted">{formatSavedAt(trip.savedAt)}</span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-ink">
                          {trip.from}→{trip.to}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {open ? "收起方案" : "查看方案"}
                        </p>
                      </button>
                      <button
                        type="button"
                        aria-label={`取消收藏 ${trip.from} 至 ${trip.to}`}
                        className="min-h-11 shrink-0 border-l border-teal/25 px-3 text-muted hover:bg-rose/10 hover:text-rose"
                        onClick={() => setAiStars(toggleTripStar(trip).stars)}
                      >
                        移除
                      </button>
                    </div>
                    {open ? (
                      <div className="space-y-3 border-t border-line px-4 py-3">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{reply}</p>
                        <Link
                          href={`/?aiFrom=${encodeURIComponent(trip.from)}&aiTo=${encodeURIComponent(trip.to)}`}
                          className="inline-flex min-h-11 items-center text-sm text-teal hover:underline"
                        >
                          喺主頁出行AI開啟 →
                        </Link>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
