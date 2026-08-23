"use client";

import dynamic from "next/dynamic";

export const NearbyMapDynamic = dynamic(
  () => import("@/components/NearbyMap").then((m) => m.NearbyMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 rounded-xl border border-line bg-card animate-pulse" />
    ),
  },
);
