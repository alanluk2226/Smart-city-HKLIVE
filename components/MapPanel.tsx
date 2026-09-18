"use client";

import { useState, type ReactNode } from "react";

/**
 * On small screens the map often pushes the list below the fold.
 * Desktop always shows the map; mobile gets an explicit collapse control.
 */
export function MapPanel({
  children,
  label = "地圖",
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={className}>
      <div className="mb-2 flex justify-end md:hidden">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded-xl border border-line px-3 py-2 text-sm text-muted hover:border-teal hover:text-ink"
          aria-pressed={collapsed}
        >
          {collapsed ? `顯示${label}` : `收起${label}`}
        </button>
      </div>
      {collapsed ? <div className="hidden md:block">{children}</div> : children}
    </div>
  );
}
