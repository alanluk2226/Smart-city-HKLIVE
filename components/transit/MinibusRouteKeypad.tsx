"use client";

import { GMB_ROUTE_KEYPAD_LETTERS } from "@/lib/gmb-route-keypad-letters";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function Key({
  label,
  onClick,
  className = "",
  ariaLabel,
}: {
  label: React.ReactNode;
  onClick: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      className={`flex min-h-[2.75rem] items-center justify-center rounded-lg border border-line bg-elev text-lg font-medium text-ink active:bg-ink/10 ${className}`}
    >
      {label}
    </button>
  );
}

/**
 * Same layout language as BusRouteKeypad: digits left, letters right.
 * GMB has more letters (17 vs 12) so the letter pane uses 3 columns.
 */
export function MinibusRouteKeypad({
  onDigit,
  onLetter,
  onReset,
  onDelete,
}: {
  onDigit: (digit: string) => void;
  onLetter: (letter: string) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="z-10 shrink-0 border-t border-line bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto flex max-w-lg gap-3">
        <div className="grid flex-[3] grid-cols-3 gap-1.5">
          {DIGITS.map((d) => (
            <Key key={d} label={d} onClick={() => onDigit(d)} />
          ))}
          <Key label="重設" onClick={onReset} className="text-sm text-muted" ariaLabel="重設" />
          <Key label="0" onClick={() => onDigit("0")} />
          <div aria-hidden className="min-h-[2.75rem]" />
        </div>
        <div
          className="grid flex-[2] grid-cols-3 gap-1.5 border-l border-line/60 pl-3"
          aria-label="路線字母"
        >
          {GMB_ROUTE_KEYPAD_LETTERS.map((letter) => (
            <Key key={letter} label={letter} onClick={() => onLetter(letter)} />
          ))}
        </div>
      </div>
      <div className="mx-auto mt-1.5 flex max-w-lg justify-center">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDelete}
          aria-label="刪除"
          className="flex h-10 w-24 items-center justify-center rounded-lg border border-line bg-elev text-muted active:bg-ink/10"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 8l-6 6 6 6M21 14H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
