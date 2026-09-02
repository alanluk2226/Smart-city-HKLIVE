"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertsBar } from "@/components/AlertsBar";
import { SettingsNavButton } from "@/components/SettingsNavButton";
import { WeatherNavChip } from "@/components/WeatherNavChip";
import { MODULES } from "@/lib/modules";

export function AppShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  const pathname = usePathname();
  const current = MODULES.find(
    (m) => pathname === m.href || pathname.startsWith(`${m.href}/`),
  );

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-line bg-elev/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
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
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {MODULES.map((m) => {
                  const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
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
          <div className="flex shrink-0 items-center gap-2">
            <SettingsNavButton />
            <WeatherNavChip />
          </div>
        </div>
        <AlertsBar />
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {(title || current) && (
          <div className="mb-5">
            <h1 className="text-2xl font-medium">{title ?? current?.title}</h1>
            <p className="text-muted text-sm mt-1">{subtitle ?? current?.blurb}</p>
          </div>
        )}
        {children}
      </main>
      <footer className="border-t border-line text-muted text-xs px-4 py-4">
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
    </div>
  );
}
