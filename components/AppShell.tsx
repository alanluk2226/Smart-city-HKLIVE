"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { AlertsBar } from "@/components/AlertsBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { SettingsNavButton } from "@/components/SettingsNavButton";
import { WeatherNavChip } from "@/components/WeatherNavChip";
import { ActiveTripBar } from "@/components/transit/ActiveTripBar";
import { MODULES } from "@/lib/modules";

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  /** Pass `""` to hide the module blurb under the page title. */
  subtitle?: string;
}) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement | null>(null);
  const current = MODULES.find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
  );
  const desc = subtitle !== undefined ? subtitle : current?.blurb;

  useEffect(() => {
    const root = document.documentElement;

    function syncBottom() {
      const mobile = window.matchMedia("(max-width: 767px)").matches;
      // Pixel strings so layout math (parseFloat) and calc() stay consistent
      const navPx = mobile ? 56 : 0;
      root.style.setProperty("--app-bottom-nav-h", `${navPx}px`);
      root.style.setProperty("--app-safe-bottom", "0px");
    }

    function syncHeader() {
      const h = headerRef.current?.offsetHeight ?? 0;
      root.style.setProperty("--app-header-h", `${h}px`);
    }

    syncBottom();
    syncHeader();
    const ro = headerRef.current ? new ResizeObserver(syncHeader) : null;
    if (headerRef.current && ro) ro.observe(headerRef.current);
    window.addEventListener("resize", syncBottom);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncBottom);
    };
  }, [pathname]);

  return (
    <div className="flex min-h-full flex-col">
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:m-0 focus:block focus:h-auto focus:w-auto focus:overflow-visible focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-ink focus:whitespace-normal"
      >
        跳到主要內容
      </a>
      <header
        ref={headerRef}
        className="sticky top-0 z-20 border-b border-line bg-elev/80 backdrop-blur"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="HK LIVE">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-square.jpeg"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl object-cover ring-1 ring-teal/30"
            />
            <span className="font-mono text-[11px] tracking-[0.28em] text-teal">HK LIVE</span>
          </Link>
          <nav
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto md:flex"
            aria-label="模組"
          >
            {MODULES.map((m) => {
              const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm whitespace-nowrap ${
                    active
                      ? "bg-teal/15 text-teal"
                      : "text-muted hover:bg-ink/5 hover:text-ink"
                  }`}
                >
                  {m.title}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            <SettingsNavButton />
            <WeatherNavChip />
          </div>
        </div>
        <AlertsBar />
        <ActiveTripBar />
      </header>
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-[calc(1.5rem+var(--app-bottom-nav-h)+var(--app-safe-bottom))] md:pb-6"
      >
        {(title || current) && (
          <div className="mb-5">
            <h1 className="text-2xl font-medium">{title ?? current?.title}</h1>
            {desc ? <p className="mt-1 text-sm text-muted">{desc}</p> : null}
          </div>
        )}
        {children}
      </main>
      <footer className="hidden border-t border-line px-4 py-4 text-xs text-muted md:block">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1">
          <span>由 Alan Luk 建立與維護</span>
          <span className="opacity-40" aria-hidden>
            ·
          </span>
          <Link href="/settings#sources" className="hover:text-ink hover:underline">
            資料來源
          </Link>
          <span className="opacity-40" aria-hidden>
            ·
          </span>
          <Link href="/settings#privacy" className="hover:text-ink hover:underline">
            私隱說明
          </Link>
        </div>
      </footer>
      <MobileBottomNav />
    </div>
  );
}
