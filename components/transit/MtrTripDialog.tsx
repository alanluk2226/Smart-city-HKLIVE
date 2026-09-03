"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/client";
import { mtrDirectionHint } from "@/lib/static/mtr-direction";
import { MTR_LINE_COLORS } from "@/lib/static/mtr-schematic";
import type { MtrCarCrowding, MtrCarLoad, MtrTripLeg, MtrTripPlan } from "@/lib/types";

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

function lineColor(line: string) {
  return MTR_LINE_COLORS[line] ?? "#8aa3b0";
}

export function MtrTripDialog({
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
  const [openStops, setOpenStops] = useState<Record<number, boolean>>({});
  const [openCrowd, setOpenCrowd] = useState<Record<number, boolean>>({});

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
    setOpenStops({});
    setOpenCrowd({});
    apiGet<MtrTripPlan>(`/api/mtr/trip?from=${from}&to=${to}`)
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

  const railLegs = useMemo(() => plan?.legs.filter((l) => l.line !== "WALK") ?? [], [plan]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
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
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
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
              {plan.inService === false ? (
                <div
                  className="rounded-2xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-ink"
                  role="status"
                >
                  <p className="font-medium">非服務時段</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    現時約為尾班車後或未開出時段，港鐵大致暫停載客。以下車程與車費仍可供參考，但唔會顯示車廂空位。實際班次以港鐵公布為準。
                  </p>
                </div>
              ) : null}

              {/* Summary */}
              <div className="rounded-2xl border border-line bg-elev px-4 py-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted">全程時間</div>
                    <div className="font-mono text-3xl leading-none text-teal">{plan.minutes}</div>
                    <div className="text-xs text-muted">分鐘</div>
                  </div>
                  <div className="text-right text-xs text-muted">
                    {plan.interchangeCount === 0 ? "直達" : `轉車 ${plan.interchangeCount} 次`}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  乘車約 {plan.rideMinutes} 分
                  {plan.transferMinutes > 0 ? ` · 轉乘約 ${plan.transferMinutes} 分` : ""}
                  {plan.waitMinutes > 0 ? ` · 候車約 ${plan.waitMinutes} 分` : ""}
                </p>
              </div>

              {/* Timeline */}
              <section>
                <h3 className="text-sm font-medium">車程</h3>
                <ol className="relative mt-3 space-y-0">
                  {plan.legs.map((leg, i) => {
                    const prev = plan.legs[i - 1];
                    const showTransfer =
                      leg.line !== "WALK" &&
                      (leg.interchangeBeforeMin != null ||
                        (prev &&
                          prev.line !== "WALK" &&
                          prev.line !== leg.line &&
                          prev.to === leg.from));
                    const transferMin =
                      leg.interchangeBeforeMin ??
                      (showTransfer ? 4 : 0);

                    return (
                      <li key={`${leg.line}-${leg.from}-${leg.to}-${i}`}>
                        {showTransfer ? (
                          <TransferNode
                            station={leg.fromName}
                            minutes={transferMin}
                            nextLine={leg.lineName}
                            nextColor={lineColor(leg.line)}
                            direction={mtrDirectionHint(leg)}
                          />
                        ) : null}

                        {leg.line === "WALK" ? (
                          <WalkLegCard leg={leg} />
                        ) : (
                          <RailLegCard
                            leg={leg}
                            expandedStops={!!openStops[i]}
                            expandedCrowd={!!openCrowd[i]}
                            onToggleStops={() =>
                              setOpenStops((s) => ({ ...s, [i]: !s[i] }))
                            }
                            onToggleCrowd={() =>
                              setOpenCrowd((s) => ({ ...s, [i]: !s[i] }))
                            }
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
                {railLegs.length > 1 ? (
                  <p className="mt-2 text-[11px] text-muted">
                    {plan.inService === false
                      ? "每段路線可展開睇沿途車站；轉乘時間為月台估計。"
                      : "每段路線可展開睇沿途車站同建議車廂；轉乘時間為月台估計。"}
                  </p>
                ) : null}
              </section>

              {/* Fares */}
              <section>
                <h3 className="text-sm font-medium">車費（八達通）</h3>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <FareCard label="成人" value={formatFare(plan.fares.adult)} />
                  <FareCard label={plan.fares.studentLabel} value={formatFare(plan.fares.student)} />
                  <FareCard label={plan.fares.elderlyLabel} value={formatFare(plan.fares.elderly)} />
                </div>
                {plan.fares.note ? <p className="mt-2 text-[11px] text-muted">{plan.fares.note}</p> : null}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TransferNode({
  station,
  minutes,
  nextLine,
  nextColor,
  direction,
}: {
  station: string;
  minutes: number;
  nextLine: string;
  nextColor: string;
  direction: string;
}) {
  return (
    <div className="relative my-2 flex gap-3 pl-1">
      <div className="flex w-5 shrink-0 flex-col items-center">
        <div className="h-2 w-px bg-line" />
        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-amber/50 bg-amber/15 text-[10px]">
          🚶
        </div>
        <div className="min-h-[0.5rem] w-px flex-1 bg-line" />
      </div>
      <div className="mb-2 min-w-0 flex-1 rounded-xl border border-amber/35 bg-amber/10 px-3 py-2">
        <div className="text-sm font-medium text-ink">
          轉乘 · {station}
          <span className="ml-2 font-mono text-xs font-normal text-amber">約 {minutes} 分</span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted">
          月台內步行轉乘 ·{" "}
          <span className="font-medium" style={{ color: nextColor }}>
            {nextLine}
          </span>{" "}
          {direction}
        </p>
      </div>
    </div>
  );
}

function WalkLegCard({ leg }: { leg: MtrTripLeg }) {
  return (
    <div className="relative flex gap-3 py-1 pl-1">
      <div className="flex w-5 shrink-0 flex-col items-center">
        <div
          className="w-px flex-1"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, #8aa3b0 0 4px, transparent 4px 8px)",
          }}
        />
      </div>
      <div className="mb-2 min-w-0 flex-1 rounded-xl border border-dashed border-line px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span>出站步行</span>
          <span className="ml-auto font-mono text-xs text-muted">
            {Math.max(1, Math.round(leg.minutes))} 分
          </span>
        </div>
        <p className="mt-1 text-sm">
          {leg.fromName} → {leg.toName}
        </p>
      </div>
    </div>
  );
}

function RailLegCard({
  leg,
  expandedStops,
  expandedCrowd,
  onToggleStops,
  onToggleCrowd,
}: {
  leg: MtrTripLeg;
  expandedStops: boolean;
  expandedCrowd: boolean;
  onToggleStops: () => void;
  onToggleCrowd: () => void;
}) {
  const color = lineColor(leg.line);
  const midStops = leg.stops.slice(1, -1);
  const crowd = leg.crowding;

  return (
    <div className="relative flex gap-3 py-1 pl-1">
      {/* Vertical line rail */}
      <div className="flex w-5 shrink-0 flex-col items-center">
        <div className="mt-2 h-3 w-3 rounded-full border-2 border-card" style={{ background: color }} />
        <div className="w-[3px] flex-1 rounded-full" style={{ background: color, opacity: 0.85 }} />
      </div>

      <div className="mb-2 min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-elev/40">
        <div className="border-l-[3px] px-3 py-2.5" style={{ borderLeftColor: color }}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color }}>
              {leg.lineName}
            </span>
            <span className="ml-auto font-mono text-xs text-muted">
              {Math.max(1, Math.round(leg.minutes))} 分
            </span>
          </div>
          <p className="mt-1 text-sm text-ink">
            {leg.fromName}
            <span className="mx-1.5 text-muted">→</span>
            {leg.toName}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{mtrDirectionHint(leg)}</p>

          {midStops.length > 0 ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={onToggleStops}
                aria-expanded={expandedStops}
                aria-label={
                  expandedStops
                    ? `收起沿途 ${midStops.length} 站`
                    : `展開沿途 ${midStops.length} 站`
                }
                className="flex items-center gap-1 text-[11px] text-teal"
              >
                經 {midStops.length} 站
                <span className="text-muted" aria-hidden>
                  {expandedStops ? "▴" : "▾"}
                </span>
              </button>
              {expandedStops ? (
                <ul className="mt-1.5 space-y-1 border-l border-line pl-3">
                  {leg.stops.map((s, idx) => {
                    const end = idx === 0 || idx === leg.stops.length - 1;
                    return (
                      <li
                        key={`${s.code}-${idx}`}
                        className={`flex items-center gap-2 text-[11px] ${
                          end ? "font-medium text-ink" : "text-muted"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${end ? "" : "opacity-60"}`}
                          style={{ background: color }}
                        />
                        {s.name}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-1.5 flex items-center gap-1">
                  {midStops.slice(0, 6).map((s) => (
                    <span
                      key={s.code}
                      className="h-1.5 w-1.5 rounded-full opacity-50"
                      style={{ background: color }}
                      title={s.name}
                    />
                  ))}
                  {midStops.length > 6 ? (
                    <span className="text-[10px] text-muted">+{midStops.length - 6}</span>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {crowd ? (
            <CrowdingBlock
              crowding={crowd}
              expanded={expandedCrowd}
              onToggle={onToggleCrowd}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CrowdingBlock({
  crowding,
  expanded,
  onToggle,
}: {
  crowding: MtrCarCrowding;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tip = crowding.emptier.length
    ? `建議 ${crowding.emptier.map((n) => `${n}卡`).join("、")}`
    : "各卡相近";

  return (
    <div className="mt-2.5 rounded-lg border border-line/80 bg-card/60 px-2.5 py-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left text-[11px]"
      >
        <span className="text-muted">
          車廂空位
          <span className="ml-1 opacity-70">
            {crowding.peak ? "繁忙" : "非繁忙"}
          </span>
        </span>
        <span className="ml-auto font-medium text-teal">{tip}</span>
        <span className="text-muted">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded ? (
        <div className="mt-2">
          <div className="flex items-end gap-1">
            {crowding.cars.map((car) => (
              <div key={car.car} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className={`w-full rounded-md ${LOAD_COLOR[car.level]}`}
                  style={{ height: `${14 + car.level * 8}px` }}
                  title={`${car.car}卡 ${LOAD_LABEL[car.level]}`}
                />
                <span className="text-[9px] text-muted">{car.car}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-muted">{crowding.note}</p>
        </div>
      ) : null}
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
