"use client";

/** Letters that appear in HK bus route numbers — keypad only exposes these to avoid bad searches. */
export const BUS_ROUTE_KEYPAD_LETTERS = [
  "A",
  "B",
  "C",
  "E",
  "H",
  "K",
  "M",
  "N",
  "P",
  "R",
  "S",
  "X",
] as const;

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
      className={`flex min-h-9 items-center justify-center rounded-md border border-line bg-elev text-base font-medium text-ink active:bg-white/10 ${className}`}
    >
      {label}
    </button>
  );
}

function DeleteGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8l-6 6 6 6M21 14H3" />
    </svg>
  );
}

export function BusRouteKeypad({
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
    <div className="z-10 max-h-[42%] shrink-0 overflow-y-auto border-t border-line bg-card px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5">
      <div className="mx-auto flex max-w-lg gap-3">
        <div className="grid flex-[3] grid-cols-3 gap-1">
          {DIGITS.map((d) => (
            <Key key={d} label={d} onClick={() => onDigit(d)} />
          ))}
          <Key label="重設" onClick={onReset} className="text-xs text-muted" ariaLabel="重設" />
          <Key label="0" onClick={() => onDigit("0")} />
          <Key label={<DeleteGlyph />} onClick={onDelete} ariaLabel="刪除" className="text-muted" />
        </div>
        <div className="grid flex-[2] grid-cols-4 gap-1 border-l border-line/60 pl-3">
          {BUS_ROUTE_KEYPAD_LETTERS.map((letter) => (
            <Key key={letter} label={letter} onClick={() => onLetter(letter)} />
          ))}
        </div>
      </div>
    </div>
  );
}
