"use client";

export default function TransitError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-5 py-10 text-center">
      <p className="text-base text-ink">呢頁暫時載入唔到</p>
      <p className="mt-2 text-sm text-muted">可能係切換太快，或者地圖卸載時出錯。撳下面再試一次。</p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-xl bg-teal px-4 py-2.5 text-sm font-medium text-bg hover:opacity-90"
      >
        重新載入
      </button>
    </div>
  );
}
