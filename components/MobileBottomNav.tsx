"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", id: "home", label: "主頁", icon: HomeIcon },
  { href: "/transit", id: "transit", label: "交通", icon: TransitIcon },
  { href: "/weather", id: "weather", label: "天氣", icon: WeatherIcon },
  { href: "/favorites", id: "favorites", label: "收藏", icon: StarIcon },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-elev/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "var(--app-safe-bottom, 0px)" }}
      aria-label="主要導航"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-4">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          let active = false;
          if (item.id === "home") active = pathname === "/";
          else if (item.id === "transit") {
            active = pathname === "/transit" || pathname.startsWith("/transit/");
          } else if (item.id === "weather") {
            active = pathname === "/weather" || pathname.startsWith("/weather/");
          } else if (item.id === "favorites") {
            active = pathname === "/favorites" || pathname.startsWith("/favorites/");
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 px-1 text-[11px] ${
                active ? "text-teal" : "text-muted hover:text-ink"
              }`}
            >
              <Icon active={active} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.7}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TransitIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="5"
        y="3"
        width="14"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.7}
      />
      <path
        d="M8 17v2M16 17v2M5 12h14"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.7}
        strokeLinecap="round"
      />
    </svg>
  );
}

function WeatherIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="11" r="3.5" stroke="currentColor" strokeWidth={active ? 2 : 1.7} />
      <path
        d="M12 3.5v1.5M12 17v1.5M4.5 11H6M18 11h1.5M6.5 5.5l1.1 1.1M16.4 15.4l1.1 1.1M17.5 5.5l-1.1 1.1M7.6 15.4l-1.1 1.1"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.7}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m12 3.8 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.2 7.2 18.7l.9-5.4-3.9-3.8 5.4-.8L12 3.8Z"
        stroke="currentColor"
        strokeWidth={active ? 2 : 1.7}
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.2 : 0}
      />
    </svg>
  );
}
