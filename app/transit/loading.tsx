export default function TransitLoading() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-12 rounded-2xl border border-line bg-card" />
      <div className="h-64 rounded-2xl border border-line bg-card sm:h-72" />
      <div className="h-40 rounded-2xl border border-line bg-card" />
    </div>
  );
}
