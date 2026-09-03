"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FavoriteStarButton } from "@/components/transit/FavoriteStarButton";
import {
  TRANSIT_ACTIVE_CHANGED,
  activeTripHref,
  clearActiveTrip,
  loadActiveTrip,
} from "@/lib/transit-active-trip-store";
import { modeBadge, type TransitFavorite } from "@/lib/transit-favorites-store";

function tripSummary(fav: TransitFavorite): string {
  if (fav.kind === "route") return `${fav.route} ${fav.orig}→${fav.dest}`;
  if (fav.kind === "trip") return `${fav.fromName}→${fav.toName}`;
  if (fav.kind === "tram") {
    return `${fav.stopName}（${fav.direction === "east" ? "東行" : "西行"}）`;
  }
  return fav.dest ? `${fav.hubName}→${fav.dest}` : fav.hubName;
}

export function ActiveTripBar() {
  const router = useRouter();
  const [trip, setTrip] = useState<TransitFavorite | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setTrip(loadActiveTrip());
    sync();
    setReady(true);
    window.addEventListener(TRANSIT_ACTIVE_CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(TRANSIT_ACTIVE_CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!ready || !trip) return null;

  const href = activeTripHref(trip);

  return (
    <div className="border-t border-amber/25 bg-amber/10">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
        <button
          type="button"
          onClick={() => router.push(href)}
          className="min-w-0 flex-1 truncate rounded-lg px-1 py-0.5 text-left text-sm text-ink hover:bg-amber/15"
          title="返回此行程"
        >
          <span className="text-muted">行程 </span>
          <span className="mr-1.5 text-[11px] text-amber">{modeBadge(trip)}</span>
          {tripSummary(trip)}
        </button>
        <FavoriteStarButton favorite={trip} />
        <button
          type="button"
          onClick={clearActiveTrip}
          className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:border-amber hover:text-ink"
          title="清除進行中行程"
          aria-label="清除進行中行程"
        >
          清除
        </button>
      </div>
    </div>
  );
}
