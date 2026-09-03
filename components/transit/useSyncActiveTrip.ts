"use client";

import { useEffect } from "react";
import { setActiveTrip } from "@/lib/transit-active-trip-store";
import { favoriteKey, type TransitFavorite } from "@/lib/transit-favorites-store";

/** Push current mode selection into the global sticky trip bar (replaces previous). */
export function useSyncActiveTrip(trip: TransitFavorite | null) {
  const key = trip ? favoriteKey(trip) : "";
  useEffect(() => {
    if (!trip) return;
    setActiveTrip(trip);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when identity key changes
  }, [key]);
}
