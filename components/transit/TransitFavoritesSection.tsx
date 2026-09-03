"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  TRANSIT_FAVORITES_CHANGED,
  type TransitFavorite,
  favoriteHref,
  favoriteKey,
  loadTransitFavorites,
  modeBadge,
  removeTransitFavorite,
} from "@/lib/transit-favorites-store";

export function TransitFavoritesSection() {
  const [favorites, setFavorites] = useState<TransitFavorite[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setFavorites(loadTransitFavorites());
    sync();
    setReady(true);
    window.addEventListener(TRANSIT_FAVORITES_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TRANSIT_FAVORITES_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!ready || !favorites.length) return null;

  return (
    <section className="rounded-2xl border border-amber/30 bg-amber/5 p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">我的收藏</h2>
        <Link href="/favorites" className="text-[11px] text-teal hover:underline">
          全部收藏 →
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {favorites.map((fav) => {
          const key = favoriteKey(fav);
          return (
            <div
              key={key}
              className="inline-flex max-w-full items-stretch overflow-hidden rounded-full border border-amber/40 bg-card/80 text-xs"
            >
              <Link
                href={favoriteHref(fav)}
                className="min-w-0 truncate px-3 py-1.5 text-ink hover:bg-amber/10"
                title={fav.label}
              >
                <span className="mr-1.5 text-amber">★</span>
                <span className="mr-1 text-muted">{modeBadge(fav)}</span>
                {fav.kind === "route"
                  ? `${fav.route} ${fav.orig}→${fav.dest}`
                  : fav.kind === "trip"
                    ? `${fav.fromName}→${fav.toName}`
                    : fav.kind === "tram"
                      ? `${fav.stopName}（${fav.direction === "east" ? "東行" : "西行"}）`
                      : fav.dest
                        ? `${fav.hubName}→${fav.dest}`
                        : fav.hubName}
              </Link>
              <button
                type="button"
                aria-label={`取消收藏 ${fav.label}`}
                className="border-l border-amber/30 px-2 text-muted hover:text-ink"
                onClick={() => setFavorites(removeTransitFavorite(key))}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
