"use client";

import Link from "next/link";
import { useLocationEnabled } from "@/components/LocationPrefProvider";

/** Honest empty-state when「附近」is actually the city default centre. */
export function LocationOffBanner({
  label = "附近",
}: {
  label?: string;
}) {
  const enabled = useLocationEnabled();
  if (enabled) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-amber/35 bg-amber/10 px-3 py-2.5 text-sm text-amber"
    >
      已關閉定位，「{label}」暫以市區預設位置顯示，未必係你附近。
      <Link
        href="/settings"
        className="ml-2 font-medium text-ink underline decoration-amber/50 underline-offset-2 hover:text-teal"
      >
        前往設定開啟
      </Link>
    </div>
  );
}
