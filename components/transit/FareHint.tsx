/** Compact fare line used across tram / ferry / LRT surfaces. */
export function FareHint({
  label,
  note,
  className = "",
}: {
  label: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={`text-xs leading-snug ${className}`}>
      <p>
        <span className="text-muted">車費 </span>
        <span className="font-mono text-amber">{label}</span>
      </p>
      {note ? <p className="mt-0.5 text-[11px] text-muted">{note}</p> : null}
    </div>
  );
}
