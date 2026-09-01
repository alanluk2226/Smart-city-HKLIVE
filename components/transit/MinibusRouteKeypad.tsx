"use client";

import { GMB_ROUTE_KEYPAD_LETTERS } from "@/lib/gmb-route-keypad-letters";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function Key({
  label,
  onClick,
  className = "",
  ariaLabel,
  disabled,
}: {
  label: React.ReactNode;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return <div aria-hidden className={`min-h-[2.5rem] ${className}`} />;
  }
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      className={`flex min-h-[2.5rem] items-center justify-center rounded-lg border border-line bg-elev text-base font-medium text-ink active:bg-white/10 ${className}`}
    >
      {label}
    </button>
  );
}

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
  const letterCells: (string | null)[] = [...GMB_ROUTE_KEYPAD_LETTERS];
  while (letterCells.length % 4 !== 0) letterCells.push(null);

  return (
    <div className="z-10 shrink-0 border-t border-line bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto flex max-w-lg gap-4">
        <div className="grid flex-[3] grid-cols-3 gap-1.5">
          {DIGITS.map((d) => (
            <Key key={d} label={d} onClick={() => onDigit(d)} />
          ))}
          <Key label="重設" onClick={onReset} className="text-sm text-muted" ariaLabel="重設" />
          <Key label="0" onClick={() => onDigit("0")} />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onDelete}
            aria-label="刪除"
            className="flex min-h-[2.5rem] items-center justify-center rounded-lg border border-line bg-elev text-muted active:bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 8l-6 6 6 6M21 14H3" />
            </svg>
          </button>
        </div>
        <div className="grid flex-[2] grid-cols-4 gap-1.5 border-l border-line/60 pl-4">
          {letterCells.map((letter, i) =>
            letter ? (
              <Key key={letter} label={letter} onClick={() => onLetter(letter)} />
            ) : (
              <Key key={`pad-${i}`} label="" disabled />
            ),
          )}
        </div>
      </div>
    </div>
  );
}
