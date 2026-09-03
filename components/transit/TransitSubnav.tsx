"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition, type MouseEvent } from "react";
import { TRANSIT_MODES } from "@/lib/transit-modes";

export function TransitSubnav({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  /** Serialize soft navigations so rapid taps don't race RSC/chunks + map teardown. */
  function go(href: string, e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (href === pathname) return;
    startTransition(() => {
      router.push(href);
    });
  }

  const tabClass = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border px-3 text-sm whitespace-nowrap ${
      compact ? "py-1.5" : "px-4 py-2"
    } ${
      active ? "border-teal bg-teal/15 text-teal" : "border-line text-muted hover:border-teal/40 hover:text-ink"
    }${isPending ? " opacity-80" : ""}`;

  return (
    <nav
      className={`${compact ? "mb-3" : "mb-5"} flex gap-2 overflow-x-auto pb-0.5`}
      aria-label="交通工具模式"
      aria-busy={isPending || undefined}
    >
      <Link
        href="/transit"
        prefetch={false}
        onClick={(e) => go("/transit", e)}
        className={tabClass(pathname === "/transit")}
      >
        總覽
      </Link>
      {TRANSIT_MODES.map((m) => {
        const active = pathname === m.href;
        return (
          <Link
            key={m.href}
            href={m.href}
            prefetch={false}
            onClick={(e) => go(m.href, e)}
            className={tabClass(active)}
          >
            {m.title}
          </Link>
        );
      })}
    </nav>
  );
}
