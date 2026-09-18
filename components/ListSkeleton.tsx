/** Shared pulse placeholders while open-data APIs resolve. */
export function ListSkeleton({
  rows = 5,
  map = false,
  className = "",
}: {
  rows?: number;
  map?: boolean;
  className?: string;
}) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`} aria-hidden>
      {map ? (
        <div className="h-56 rounded-2xl border border-line bg-card sm:h-72" />
      ) : null}
      <div className="space-y-1 rounded-2xl border border-line bg-card p-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="rounded-lg px-3 py-2.5">
            <div className="h-4 w-2/3 rounded bg-line/80" />
            <div className="mt-2 h-3 w-2/5 rounded bg-line/55" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-elev/40 p-4">
          <div className="h-6 w-32 rounded bg-line/80" />
          <div className="mt-2 h-4 w-40 rounded bg-line/60" />
          <div className="mt-3 ml-auto h-10 w-24 rounded bg-line/70" />
        </div>
      ))}
    </div>
  );
}
