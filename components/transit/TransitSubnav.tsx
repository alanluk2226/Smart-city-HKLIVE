"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TRANSIT_MODES } from "@/lib/transit-modes";

export function TransitSubnav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-2 overflow-x-auto mb-5">
      <Link
        href="/transit"
        className={`rounded-full px-4 py-2 text-sm whitespace-nowrap border ${
          pathname === "/transit" ? "border-teal bg-teal/15 text-teal" : "border-line text-muted"
        }`}
      >
        總覽
      </Link>
      {TRANSIT_MODES.map((m) => {
        const active = pathname === m.href;
        return (
          <Link
            key={m.href}
            href={m.href}
            className={`rounded-full px-4 py-2 text-sm whitespace-nowrap border ${
              active ? "border-teal bg-teal/15 text-teal" : "border-line text-muted"
            }`}
          >
            {m.title}
          </Link>
        );
      })}
    </nav>
  );
}
