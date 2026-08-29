"use client";

import { useState } from "react";
import { RouteEtaBrowser } from "@/components/transit/RouteEtaBrowser";

type BusFilter = "all" | "kmb" | "ctb" | "nlb" | "mtrb";

const FILTERS: { id: BusFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "kmb", label: "九巴／龍運" },
  { id: "ctb", label: "城巴" },
  { id: "nlb", label: "嶼巴" },
  { id: "mtrb", label: "港鐵巴士" },
];

const PLACEHOLDERS: Record<BusFilter, string> = {
  all: "例如 S64、B2P、K51",
  kmb: "例如 1A、58X、S64",
  ctb: "例如 5B、962",
  nlb: "例如 B2P、1、3M",
  mtrb: "例如 K51、K75P、506",
};

export function BusApp() {
  const [filter, setFilter] = useState<BusFilter>("all");
  return (
    <RouteEtaBrowser
      key={filter}
      mode="bus"
      operator={filter === "all" ? undefined : filter}
      placeholder={PLACEHOLDERS[filter]}
      belowSearch={
        <div className="flex w-full max-w-xl flex-wrap justify-center gap-2">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-full px-4 py-2 text-sm border ${
                filter === id ? "border-teal bg-teal/15 text-teal" : "border-line text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    />
  );
}
