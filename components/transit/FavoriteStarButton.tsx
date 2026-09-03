"use client";

import { useEffect, useState } from "react";
import {
  TRANSIT_FAVORITE_LIMIT,
  TRANSIT_FAVORITES_CHANGED,
  type TransitFavorite,
  favoriteKey,
  isFavorited,
  loadTransitFavorites,
  toggleTransitFavorite,
} from "@/lib/transit-favorites-store";

function useFavoritesTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((v) => v + 1);
    window.addEventListener(TRANSIT_FAVORITES_CHANGED, bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(TRANSIT_FAVORITES_CHANGED, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return tick;
}

export function FavoriteStarButton({
  favorite,
  className = "",
}: {
  favorite: TransitFavorite | null;
  className?: string;
}) {
  const tick = useFavoritesTick();
  if (!favorite) return null;
  void tick;
  const key = favoriteKey(favorite);
  const stars = loadTransitFavorites();
  const starred = isFavorited(key, stars);

  return (
    <button
      type="button"
      onClick={() => toggleTransitFavorite(favorite)}
      className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-xs ${
        starred
          ? "border-amber/50 bg-amber/15 text-amber"
          : "border-line text-muted hover:border-amber hover:text-amber"
      } ${className}`}
      title={
        starred
          ? "取消收藏"
          : stars.length >= TRANSIT_FAVORITE_LIMIT
            ? `收藏（滿 ${TRANSIT_FAVORITE_LIMIT} 個時會取代最舊）`
            : "收藏"
      }
      aria-pressed={starred}
    >
      {starred ? "★ 已收藏" : "☆ 收藏"}
    </button>
  );
}
