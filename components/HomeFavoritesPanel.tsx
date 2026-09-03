"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AI_STARS_CHANGED_EVENT,
  loadTripStars,
  tripPairKey,
  type SavedTrip,
} from "@/lib/ai-trip-store";
import {
  TRANSIT_FAVORITES_CHANGED,
  type TransitFavorite,
  favoriteHref,
  favoriteKey,
  loadTransitFavorites,
  modeBadge,
} from "@/lib/transit-favorites-store";

const PREVIEW = 4;

function transitLabel(fav: TransitFavorite) {
  if (fav.kind === "route") return `${fav.route} ${fav.orig}→${fav.dest}`;
  if (fav.kind === "trip") return `${fav.fromName}→${fav.toName}`;
  if (fav.kind === "tram") {
    return `${fav.stopName}（${fav.direction === "east" ? "東行" : "西行"}）`;
  }
  return fav.dest ? `${fav.hubName}→${fav.dest}` : fav.hubName;
}

export function HomeFavoritesPanel() {
  const [aiStars, setAiStars] = useState<SavedTrip[]>([]);
  const [transit, setTransit] = useState<TransitFavorite[]>([]);
  const [ready, setReady] = useState(false);

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

  const previewTransit = transit.slice(0, PREVIEW);
  const previewAi = aiStars.slice(0, Math.max(0, PREVIEW - previewTransit.length));
  const total = transit.length + aiStars.length;
  const more = Math.max(0, total - previewTransit.length - previewAi.length);

  return (
    <section
      id="favorites"
      aria-label="我的收藏"
      className="scroll-mt-28 rounded-2xl border border-amber/30 bg-amber/5 p-4"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">我的收藏</h2>
        <Link href="/favorites" className="text-[11px] text-teal hover:underline">
          {ready && total > 0 ? `全部 ${total} 項 →` : "收藏頁 →"}
        </Link>
      </div>

      {!ready ? (
        <p className="text-xs text-muted">載入收藏…</p>
      ) : total === 0 ? (
        <p className="text-xs text-muted">
          未有收藏。可在巴士／港鐵撳星，或喺出行AI收藏；完整列表喺{" "}
          <Link href="/favorites" className="text-teal hover:underline">
            收藏頁
          </Link>
          。
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {previewTransit.map((fav) => (
            <Link
              key={`t:${favoriteKey(fav)}`}
              href={favoriteHref(fav)}
              className="inline-flex min-h-9 max-w-full items-center truncate rounded-full border border-amber/40 bg-card/80 px-3 py-2 text-xs text-ink hover:bg-amber/10"
              title={fav.label}
            >
              <span className="mr-1.5 text-amber" aria-hidden>
                ★
              </span>
              <span className="mr-1 text-muted">{modeBadge(fav)}</span>
              {transitLabel(fav)}
            </Link>
          ))}
          {previewAi.map((trip) => (
            <Link
              key={`ai:${tripPairKey(trip.from, trip.to)}`}
              href={`/?aiFrom=${encodeURIComponent(trip.from)}&aiTo=${encodeURIComponent(trip.to)}`}
              className="inline-flex min-h-9 max-w-full items-center truncate rounded-full border border-teal/40 bg-card/80 px-3 py-2 text-xs text-ink hover:bg-teal/10"
              title={`${trip.from}→${trip.to}`}
            >
              <span className="mr-1.5 text-teal" aria-hidden>
                ★
              </span>
              <span className="mr-1 text-muted">AI</span>
              {trip.from}→{trip.to}
            </Link>
          ))}
          {more > 0 ? (
            <Link
              href="/favorites"
              className="inline-flex min-h-9 items-center rounded-full border border-line px-3 py-2 text-xs text-muted hover:text-ink"
            >
              +{more} 更多
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
