"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-4">
          <Link href="/" className="shrink-0">
            <div className="font-mono text-[11px] tracking-[0.28em] text-teal">HK LIVE</div>
            <div className="text-sm font-medium">香港城市實況</div>
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {MODULES.map((m) => {
                  const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap ${
                    active
                      ? "bg-teal/15 text-teal"
                      : "text-muted hover:text-ink hover:bg-white/5"
                  }`}
                >
                  {m.title}
                </Link>
              );
            })}
          </nav>
        </div>
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
        <div className="mx-auto max-w-6xl">
          資料來自 DATA.GOV.HK、天文台、醫管局、運輸署、康文署及各公共交通營運商。僅供參考，以官方公布為準。
        </div>
      </footer>
    </div>
  );
}
