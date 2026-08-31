"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  isTripStarred,
  loadTripHistory,
  loadTripStars,
  pushTripHistory,
  removeTripHistory,
  toggleTripStar,
  tripChips,
  tripPairKey,
  type SavedTrip,
} from "@/lib/ai-trip-store";
import { apiPost } from "@/lib/client";
import { matchTripPlaces } from "@/lib/static/hk-places";
import type { AiTripAdvice, AiTripOption } from "@/lib/types";

const FIT_LABEL: Record<AiTripOption["weatherFit"], string> = {
  good: "天氣合適",
  ok: "尚可",
  poor: "天氣不宜",
};

function PlaceField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => matchTripPlaces(value, 8), [value]);
  const show =
    open &&
    value.trim().length >= 1 &&
    matches.some((s) => s.name !== value && s.nameEn !== value);

  return (
    <div className="relative min-w-0 flex-1">
      <label htmlFor={id} className="text-[11px] text-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="mt-1 w-full rounded-xl border border-line bg-elev px-3 py-2.5 text-ink outline-none focus:border-teal"
      />
      {show ? (
        <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-line bg-elev py-1 shadow-lg">
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
                onClick={() => onChange(s.name)}
              >
                {s.name}
                <span className="ml-2 text-[11px] text-muted">{s.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OptionCard({
  opt,
  recommended,
  index,
}: {
  opt: AiTripOption;
  recommended: boolean;
  index: number;
}) {
  return (
    <article
      className={`rounded-xl border px-3 py-3 ${
        recommended ? "border-teal/50 bg-teal/10" : "border-line bg-elev/40"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-muted">方案 {index + 1}</span>
        <h4 className="text-sm font-medium">{opt.title}</h4>
        <span className="ml-auto font-mono text-sm text-teal">
          {opt.minutes != null ? `${opt.minutes} 分` : "視路面"}
          {opt.fareHkd != null ? ` · $${opt.fareHkd}` : ""}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {opt.badges.map((b) => (
          <span
            key={b}
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              b === "建議"
                ? "bg-teal/20 text-teal"
                : b === "最快"
                  ? "bg-sky/15 text-sky"
                  : b === "最平"
                    ? "bg-violet/15 text-violet"
                    : b === "天氣不宜"
                      ? "bg-amber/15 text-amber"
                      : "bg-ink/5 text-muted"
            }`}
          >
            {b}
          </span>
        ))}
        <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10px] text-muted">
          {FIT_LABEL[opt.weatherFit]}
        </span>
        {opt.source === "ai" ? (
          <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] text-violet">AI 估計</span>
        ) : null}
      </div>
      {opt.steps.length ? (
        <ol className="mt-2 space-y-1 text-[12px] text-muted">
          {opt.steps.map((s, i) => (
            <li key={`${i}-${s}`}>
              <span className="mr-1 font-mono text-[10px] text-teal/80">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="mt-2 text-[12px] leading-relaxed text-ink/90">{opt.why}</p>
      {opt.mtrFrom && opt.mtrTo ? (
        <Link
          href={`/transit/mtr?from=${encodeURIComponent(opt.mtrFrom)}&to=${encodeURIComponent(opt.mtrTo)}`}
          className="mt-2 inline-block text-[11px] text-teal hover:underline"
        >
          去港鐵路綫圖睇呢程 →
        </Link>
      ) : null}
    </article>
  );
}

export function AiTripAdvisor() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState<AiTripAdvice | null>(null);
  const [stars, setStars] = useState<SavedTrip[]>([]);
  const [history, setHistory] = useState<SavedTrip[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setStars(loadTripStars());
    setHistory(loadTripHistory());
    setReady(true);
  }, []);

  const chips = useMemo(() => tripChips(stars, history), [stars, history]);
  const currentStarred = advice
    ? isTripStarred(advice.fromName, advice.toName, stars)
    : isTripStarred(from, to, stars);

  function swap() {
    setFrom(to);
    setTo(from);
  }

  async function run(nextFrom = from, nextTo = to) {
    const a = nextFrom.trim();
    const b = nextTo.trim();
    if (!a || !b) {
      setError("請輸入起點同終點");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiPost<AiTripAdvice>("/api/ai/trip", { from: a, to: b });
      setAdvice(data);
      setHistory(
        pushTripHistory({
          from: data.fromName,
          to: data.toName,
          goal: "both",
          savedAt: Date.now(),
        }),
      );
    } catch (err) {
      setAdvice(null);
      setError(err instanceof Error ? err.message : "無法建議行程");
    } finally {
      setLoading(false);
    }
  }

  function starCurrent() {
    const trip: SavedTrip = advice
      ? { from: advice.fromName, to: advice.toName, goal: "both", savedAt: Date.now() }
      : { from: from.trim(), to: to.trim(), goal: "both", savedAt: Date.now() };
    if (!trip.from || !trip.to) return;
    const next = toggleTripStar(trip);
    setStars(next.stars);
  }

  function dismissChip(trip: SavedTrip, e: MouseEvent) {
    e.stopPropagation();
    if (isTripStarred(trip.from, trip.to, stars)) {
      setStars(toggleTripStar(trip).stars);
    } else {
      setHistory(removeTripHistory(trip.from, trip.to));
    }
  }

  return (
    <section className="rounded-2xl border border-teal/30 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] tracking-[0.2em] text-teal">WEATHER ROUTE</div>
          <h2 className="mt-0.5 text-lg">出行助手</h2>
          <p className="mt-1 max-w-xl text-xs text-muted">
            混和架構：路線／車費由本站公開資料計算，AI 只跟天氣寫評語同揀建議。支援港鐵站、屋邨同行政區（例如逸東邨⇄羅湖：38→纜車站→E41→東鐵）。
          </p>
        </div>
      </div>

      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <PlaceField id="ai-from" label="起點" value={from} onChange={setFrom} placeholder="逸東邨、東涌、荃灣…" />
          <button
            type="button"
            onClick={swap}
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:border-teal hover:text-ink sm:mb-0.5"
          >
            對調
          </button>
          <PlaceField id="ai-to" label="終點" value={to} onChange={setTo} placeholder="羅湖、天水圍、北區…" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-teal/20 px-4 py-1.5 text-sm text-teal hover:bg-teal/30 disabled:opacity-50"
          >
            {loading ? "諗緊…" : "建議行程"}
          </button>
        </div>
      </form>

      <div className="mt-3">
        {ready && chips.length === 0 ? (
          <p className="text-[11px] text-muted">搜過嘅行程會出現喺呢度。畫面最多 5 個，收藏優先。</p>
        ) : null}
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((trip) => {
              const starred = isTripStarred(trip.from, trip.to, stars);
              return (
                <div
                  key={tripPairKey(trip.from, trip.to)}
                  className={`flex items-center rounded-full border ${
                    starred ? "border-amber/40 bg-amber/10" : "border-line"
                  }`}
                >
                  <button
                    type="button"
                    className="px-2.5 py-1 text-[11px] text-muted hover:text-ink"
                    onClick={() => {
                      setFrom(trip.from);
                      setTo(trip.to);
                      void run(trip.from, trip.to);
                    }}
                  >
                    {starred ? <span className="mr-1 text-amber">★</span> : null}
                    {trip.from} → {trip.to}
                  </button>
                  <button
                    type="button"
                    aria-label={starred ? `取消收藏 ${trip.from} 至 ${trip.to}` : `移除 ${trip.from} 至 ${trip.to}`}
                    className="pr-2 text-[10px] text-muted hover:text-ink"
                    onClick={(e) => dismissChip(trip, e)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-rose">{error}</p> : null}

      {advice ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-elev px-3 py-2.5">
            {advice.weather.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={advice.weather.iconUrl} alt="" className="mt-0.5 h-8 w-8" />
            ) : null}
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{advice.weather.summary}</div>
              <p className="mt-0.5 text-sm leading-relaxed">{advice.weatherNote}</p>
            </div>
            <button
              type="button"
              onClick={starCurrent}
              aria-pressed={currentStarred}
              aria-label={currentStarred ? "取消收藏此行程" : "收藏此行程"}
              className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-sm ${
                currentStarred
                  ? "border-amber/50 bg-amber/15 text-amber"
                  : "border-line text-muted hover:border-amber hover:text-amber"
              }`}
            >
              {currentStarred ? "★ 已收藏" : "☆ 收藏"}
            </button>
          </div>
          <div className="grid gap-2">
            {advice.options.map((opt, index) => (
              <OptionCard
                key={opt.id}
                opt={opt}
                index={index}
                recommended={opt.id === advice.recommendedId}
              />
            ))}
          </div>
          <p
            className={`text-[11px] leading-relaxed ${
              advice.usedAi ? "text-muted" : "text-amber"
            }`}
          >
            {advice.disclaimer}
          </p>
        </div>
      ) : null}
    </section>
  );
}
