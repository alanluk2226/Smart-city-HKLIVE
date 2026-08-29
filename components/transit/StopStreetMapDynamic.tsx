"use client";

import dynamic from "next/dynamic";

export const StopStreetMapDynamic = dynamic(
  () => import("@/components/transit/StopStreetMap").then((m) => m.StopStreetMap),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-56 animate-pulse border border-line bg-card" />,
  },
);
