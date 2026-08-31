"use client";

import { useEffect, useRef } from "react";

export function StationActionDialog({
  title,
  subtitle,
  infoLabel,
  infoHint,
  tripHint,
  onInfo,
  onTrip,
  onClose,
}: {
  title: string;
  subtitle?: string;
  infoLabel?: string;
  infoHint?: string;
  tripHint?: string;
  onInfo: () => void;
  onTrip: () => void;
  onClose: () => void;
}) {
  const openedAt = useRef(Date.now());

  useEffect(() => {
    openedAt.current = Date.now();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function closeFromBackdrop() {
    // Ignore the synthetic click / leftover pointer that opened this sheet on iOS.
    if (Date.now() - openedAt.current < 450) return;
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="關閉車站選單"
        onClick={closeFromBackdrop}
        onPointerUp={(e) => e.stopPropagation()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="station-action-title"
        className="relative z-10 w-full rounded-t-2xl border border-line bg-card p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl pb-[max(1rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="station-action-title" className="text-lg leading-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-teal hover:text-ink"
          >
            關閉
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onInfo}
            className="rounded-2xl border border-line bg-elev px-3 py-5 text-left hover:border-teal"
          >
            <div className="text-base">{infoLabel ?? "資訊"}</div>
            <div className="mt-1 text-xs text-muted">{infoHint ?? "查看此站到達時間"}</div>
          </button>
          <button
            type="button"
            onClick={onTrip}
            className="rounded-2xl border border-line bg-elev px-3 py-5 text-left hover:border-teal"
          >
            <div className="text-base">起點／終點</div>
            <div className="mt-1 text-xs text-muted">{tripHint ?? "規劃行程、車費與空位"}</div>
          </button>
        </div>
      </div>
    </div>
  );
}
