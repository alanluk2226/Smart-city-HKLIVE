"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsNavButton() {
  const pathname = usePathname();
  const active = pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <Link
      href="/settings"
      aria-label="設定"
      title="設定"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
        active
          ? "border-teal/50 bg-teal/15 text-teal"
          : "border-line bg-card text-ink hover:border-teal/40 hover:text-teal"
      }`}
    >
      <GearIcon />
    </Link>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13.1a1.4 1.4 0 0 0 .3 1.5l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-1.5-.3 1.4 1.4 0 0 0-.8 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.1a1.4 1.4 0 0 0-.9-1.3 1.4 1.4 0 0 0-1.5.3l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0 .3-1.5 1.4 1.4 0 0 0-1.2-.8h-.2a1.7 1.7 0 1 1 0-3.4h.1a1.4 1.4 0 0 0 1.3-.9 1.4 1.4 0 0 0-.3-1.5l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 1.5.3h.1a1.4 1.4 0 0 0 .8-1.2v-.2a1.7 1.7 0 1 1 3.4 0v.1a1.4 1.4 0 0 0 .8 1.2 1.4 1.4 0 0 0 1.5-.3l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0-.3 1.5v.1a1.4 1.4 0 0 0 1.2.8h.2a1.7 1.7 0 1 1 0 3.4h-.1a1.4 1.4 0 0 0-1.2.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
