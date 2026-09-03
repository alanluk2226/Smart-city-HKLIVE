"use client";

import Link from "next/link";
import { TransitFavoritesSection } from "@/components/transit/TransitFavoritesSection";
import { TransitNearbySection } from "@/components/transit/TransitNearbySection";
import { TRANSIT_MODES } from "@/lib/transit-modes";

const accent = [
  "border-teal/40 hover:border-teal bg-teal/5",
  "border-amber/40 hover:border-amber bg-amber/5",
  "border-rose/40 hover:border-rose bg-rose/5",
  "border-sky/40 hover:border-sky bg-sky/5",
  "border-lime/40 hover:border-lime bg-lime/5",
  "border-violet/40 hover:border-violet bg-violet/5",
  "border-amber/40 hover:border-amber bg-amber/5",
];

export function TransitHub() {
  return (
    <div className="space-y-6">
      <TransitFavoritesSection />
      <TransitNearbySection />
      <section className="grid gap-4 sm:grid-cols-2">
        {TRANSIT_MODES.map((m, i) => (
          <Link key={m.href} href={m.href} className={`rounded-2xl border p-5 transition ${accent[i]}`}>
            <div className="text-2xl">{m.title}</div>
            <p className="text-sm text-muted mt-2">{m.blurb}</p>
            <div className="mt-4 text-sm">進入 →</div>
          </Link>
        ))}
      </section>
    </div>
  );
}
