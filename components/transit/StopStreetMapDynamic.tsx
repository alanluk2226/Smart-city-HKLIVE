"use client";

import dynamic from "next/dynamic";

export const StopStreetMapDynamic = dynamic(
  () => import("@/components/transit/StopStreetMap").then((m) => m.StopStreetMap),
  {
    ssr: false,
    loading: () => <div className="h-56 animate-pulse rounded-2xl border border-line bg-card sm:h-72" />,
  },
);
