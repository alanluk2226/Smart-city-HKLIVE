"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import type { RacecourseStatus } from "@/lib/types";

export function RacecourseDialog({
  status,
  onClose,
}: {
  status: RacecourseStatus | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<RacecourseStatus | null>(status);
  const [error, setError] = useState("");

  useEffect(() => {
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

  useEffect(() => {
    if (status) {
      setData(status);
      return;
    }
    let cancelled = false;
    apiGet<RacecourseStatus>("/api/mtr/racecourse")
      .then((row) => {
        if (!cancelled) setData(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "無法載入馬場站狀態");
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const open = data?.open ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/55" aria-label="關閉馬場站說明" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rac-dialog-title"
        className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-y-auto rounded-t-2xl border border-line bg-card p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="rac-dialog-title" className="text-lg leading-tight">
              馬場
            </h2>
            <p className="mt-0.5 text-xs text-muted">Racecourse · 東鐵線支線</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-teal hover:text-ink"
          >
            關閉
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-rose">{error}</p> : null}

        <div
          className={`mt-3 rounded-xl border px-3 py-3 ${
            open ? "border-lime/40 bg-lime/10 text-lime" : "border-white/10 bg-black/40 text-muted"
          }`}
        >
          <div className="text-sm">{data?.headline ?? "載入狀態中…"}</div>
          {data?.detail ? <p className="mt-1 text-xs leading-relaxed text-ink/80">{data.detail}</p> : null}
          {data?.nextOpen ? <p className="mt-2 text-xs text-amber">{data.nextOpen}</p> : null}
        </div>

        <section className="mt-4">
          <h3 className="text-sm">行車分叉</h3>
          <p className="mt-1 text-sm text-muted leading-relaxed">
            大學站之後東鐵線分成兩條平行支線，最後在沙田站匯合：
          </p>
          <ul className="mt-2 space-y-1 rounded-xl border border-line bg-elev px-3 py-3 text-sm">
            <li>大學 → <span className="text-muted">馬場</span>（僅賽馬日）→ 沙田</li>
            <li>大學 → <span className="text-teal">火炭 Fo Tan</span>（關閉時 100% 經此）→ 沙田</li>
          </ul>
        </section>

        <section className="mt-4 space-y-3 text-sm">
          <h3 className="text-sm">主要開放日子（賽馬日）</h3>
          <div className="rounded-xl border border-line px-3 py-3">
            <div className="text-ink">星期日（或少數星期六）日賽</div>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              約在 <span className="text-ink">12:00 – 19:00</span> 期間營運。
            </p>
          </div>
          <div className="rounded-xl border border-line px-3 py-3">
            <div className="text-ink">星期三夜賽</div>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              若當晚賽事移師至沙田馬場舉行，約在 <span className="text-ink">17:00 – 23:00</span> 期間營運。大部分星期三夜賽會在跑馬地馬場舉行，此時馬場站不開放。
            </p>
          </div>
          <div className="rounded-xl border border-line px-3 py-3">
            <div className="text-ink">非賽馬日（非賽馬時間）</div>
            <p className="mt-1 text-xs text-muted leading-relaxed">
              馬場站全天關閉。東鐵線列車會直接經火炭站（Fo Tan）通過，不停靠馬場站。
            </p>
          </div>
        </section>
        <p className="mt-3 text-[11px] text-muted">開放狀態綜合港鐵即時班次與賽馬會賽期表，實際以當日安排為準。</p>
      </div>
    </div>
  );
}
