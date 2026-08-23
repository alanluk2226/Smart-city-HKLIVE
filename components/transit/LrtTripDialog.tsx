"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { LRT_ROUTE_COLORS } from "@/lib/static/lrt-routes";
import type { MtrCarLoad, MtrTripPlan } from "@/lib/types";

const LOAD_COLOR: Record<MtrCarLoad["level"], string> = {
  1: "bg-lime/80",
  2: "bg-teal/80",
  3: "bg-amber/80",
  4: "bg-rose/80",
};

const LOAD_LABEL: Record<MtrCarLoad["level"], string> = {
  1: "較空",
  2: "尚可",
  3: "較滿",
  4: "擠迫",
};

function formatFare(n: number | null) {
  if (n == null) return "—";
  return `$${n.toFixed(1)}`;
}

export function LrtTripDialog({
  from,
  to,
  onSwap,
  onClose,
}: {
  from: string;
  to: string;
  onSwap: () => void;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<MtrTripPlan | null>(null);
  const [loading, setLoading] = useState(true);
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
    let cancelled = false;
    setLoading(true);
    setError("");
    setPlan(null);
    apiGet<MtrTripPlan>(`/api/lrt/trip?from=${from}&to=${to}`)
      .then((data) => {
        if (!cancelled) setPlan(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "無法規劃行程");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="關閉行程視窗"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mtr-trip-title"
        className="relative z-10 flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-line bg-card shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h2 id="mtr-trip-title" className="text-lg leading-tight">
              {plan ? `${plan.fromName} → ${plan.toName}` : "規劃行程"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">月台至月台估計 · 八達通車費</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onSwap}
              className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-teal hover:text-ink"
            >
              對調
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:border-teal hover:text-ink"
            >
              關閉
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          {loading ? <p className="mt-2 text-sm text-muted">規劃行程中…</p> : null}
          {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}
          {plan ? (
            <div className="space-y-4">
              <div className="flex items-end justify-between rounded-2xl border border-line bg-elev px-4 py-3">
                <div>
                  <div className="text-xs text-muted">全程時間</div>
                  <div className="font-mono text-3xl leading-none text-teal">{plan.minutes}</div>
                  <div className="text-xs text-muted">分鐘</div>
                </div>
                <div className="text-right text-xs text-muted">
                  {plan.interchangeCount === 0 ? "直達" : `轉車 ${plan.interchangeCount} 次`}
                </div>
              </div>

              <section>
                <h3 className="text-sm">車程</h3>
                <ol className="mt-2 space-y-2">
                  {plan.legs.map((leg, i) => (
                    <li key={`${leg.line}-${leg.from}-${leg.to}-${i}`} className="rounded-xl border border-line px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: LRT_ROUTE_COLORS[leg.line] ?? "#d97706" }}
                        />
                        <span>{leg.lineName}</span>
                        <span className="ml-auto font-mono text-xs text-muted">{Math.max(1, Math.round(leg.minutes))} 分</span>
                      </div>
                      <p className="mt-1 text-sm">
                        {leg.fromName} → {leg.toName}
                      </p>
                      {leg.stops.length > 2 ? (
                        <p className="mt-0.5 text-[11px] text-muted">
                          {leg.stops.map((s) => s.name).join(" → ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="text-sm">車費（八達通）</h3>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <FareCard label="成人" value={formatFare(plan.fares.adult)} />
                  <FareCard label={plan.fares.studentLabel} value={formatFare(plan.fares.student)} />
                  <FareCard label={plan.fares.elderlyLabel} value={formatFare(plan.fares.elderly)} />
                </div>
                {plan.fares.note ? <p className="mt-2 text-[11px] text-muted">{plan.fares.note}</p> : null}
              </section>

              <section>
                <h3 className="text-sm">
                  車廂空位
                  <span className="ml-2 text-[11px] font-normal text-muted">
                    {plan.crowding.lineName}
                    {plan.crowding.peak ? " · 繁忙時段" : " · 非繁忙"}
                  </span>
                </h3>
                <div className="mt-2 flex items-end gap-1">
                  {plan.crowding.cars.map((car) => (
                    <div key={car.car} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <div
                        className={`w-full rounded-md ${LOAD_COLOR[car.level]}`}
                        style={{ height: `${18 + car.level * 10}px` }}
                        title={`${car.car}卡 ${LOAD_LABEL[car.level]}`}
                      />
                      <span className="text-[10px] text-muted">{car.car}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-sm">
                  較多空位：
                  {plan.crowding.emptier.length
                    ? plan.crowding.emptier.map((n) => `${n}卡`).join("、")
                    : "各卡相近"}
                  <span className="text-muted">（頭卡 → 尾卡）</span>
                </p>
                <p className="mt-1 text-[11px] text-muted">{plan.crowding.note}</p>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FareCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-2 py-3 text-center">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 font-mono text-lg">{value}</div>
    </div>
  );
}
