"use client";

import dynamic from "next/dynamic";

export const MtrSchematicMapDynamic = dynamic(
  () => import("@/components/transit/MtrSchematicMap").then((m) => m.MtrSchematicMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[18rem] items-center justify-center rounded-2xl border border-line bg-card text-sm text-muted">
        載入港鐵路綫圖…
      </div>
    ),
  },
);
