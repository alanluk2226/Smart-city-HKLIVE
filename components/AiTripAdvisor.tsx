"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import type { AiTripAdvice } from "@/lib/types";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  advice?: AiTripAdvice;
};

const WELCOME =
  "你好，我係 HK LIVE 出行助手。用日常說話問我即可，例如：\n\n「東涌去何文田」\n「逸東邨到羅湖」\n「荃灣去中環」\n\n我會用本站港鐵／巴士資料計真實路線，再跟天氣畀建議——唔會亂估「視路面」假方案。";

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function ReplyBody({ text }: { text: string }) {
  const blocks = text.split("\n");
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-ink">
      {blocks.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        const numbered = line.match(/^(\d+)\.\s+(.+)$/);
        if (numbered) {
          return (
            <p key={i} className="font-medium text-ink">
              <span className="mr-1.5 font-mono text-teal">{numbered[1]}.</span>
              {numbered[2]}
            </p>
          );
        }
        if (line.startsWith("路線：") || line.startsWith("車程：") || line.startsWith("說明：") || line.startsWith("天氣：")) {
          return (
            <p key={i} className="pl-5 text-[13px] text-muted">
              {line}
            </p>
          );
        }
        return (
          <p key={i} className="text-[13px]">
            {line}
          </p>
        );
      })}
    </div>
  );
}

export function AiTripAdvisor() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: WELCOME },
  ]);
  const [stars, setStars] = useState<SavedTrip[]>([]);
  const [history, setHistory] = useState<SavedTrip[]>([]);
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setStars(loadTripStars());
    setHistory(loadTripHistory());
    setReady(true);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const chips = useMemo(() => tripChips(stars, history), [stars, history]);

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { id: newId(), role: "user", text }]);
    setLoading(true);

    try {
      const data = await apiPost<AiTripAdvice>("/api/ai/trip", { message: text });
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: "assistant", text: data.reply, advice: data },
      ]);
      setHistory(
        pushTripHistory({
          from: data.fromName,
          to: data.toName,
          goal: "both",
          savedAt: Date.now(),
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "無法建議行程";
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: `${msg}\n\n可以再試：「東涌去何文田」或「逸東邨到羅湖」。`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function starAdvice(advice: AiTripAdvice) {
    const trip: SavedTrip = {
      from: advice.fromName,
      to: advice.toName,
      goal: "both",
      savedAt: Date.now(),
    };
    setStars(toggleTripStar(trip).stars);
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
            像對話咁問：路線由本站公開資料計算，AI 只跟天氣寫評語。例如「東涌去何文田」「逸東邨到羅湖」。
          </p>
        </div>
      </div>

      <div className="mt-3">
        {ready && chips.length === 0 ? (
          <p className="text-[11px] text-muted">問過嘅行程會出現喺呢度，撳一下即可再問。</p>
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
                    onClick={() => void ask(`${trip.from}去${trip.to}`)}
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

      <div className="mt-3 flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-elev/40 p-3">
        {messages.map((m) => {
          const starred = m.advice
            ? isTripStarred(m.advice.fromName, m.advice.toName, stars)
            : false;
          return (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[95%] rounded-2xl px-3.5 py-2.5 sm:max-w-[85%] ${
                  m.role === "user"
                    ? "rounded-br-md bg-teal/20 text-ink"
                    : "rounded-bl-md border border-line bg-card"
                }`}
              >
                {m.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{m.text}</p>
                ) : (
                  <ReplyBody text={m.text} />
                )}
                {m.advice ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2">
                    {m.advice.weather.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.advice.weather.iconUrl} alt="" className="h-6 w-6" />
                    ) : null}
                    <span className="text-[11px] text-muted">{m.advice.weather.summary}</span>
                    <button
                      type="button"
                      onClick={() => starAdvice(m.advice!)}
                      className={`ml-auto rounded-lg border px-2 py-1 text-[11px] ${
                        starred
                          ? "border-amber/50 bg-amber/15 text-amber"
                          : "border-line text-muted hover:border-amber hover:text-amber"
                      }`}
                    >
                      {starred ? "★ 已收藏" : "☆ 收藏"}
                    </button>
                    {m.advice.options.some((o) => o.mtrFrom && o.mtrTo) ? (
                      <Link
                        href={`/transit/mtr?from=${encodeURIComponent(
                          m.advice.options.find((o) => o.mtrFrom)?.mtrFrom ?? "",
                        )}&to=${encodeURIComponent(
                          m.advice.options.find((o) => o.mtrTo)?.mtrTo ?? "",
                        )}`}
                        className="text-[11px] text-teal hover:underline"
                      >
                        港鐵路綫圖 →
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {loading ? (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-line bg-card px-3.5 py-2.5 text-sm text-muted">
              諗緊路線…
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="問我：東涌去何文田…"
          disabled={loading}
          className="min-w-0 flex-1 rounded-xl border border-line bg-elev px-3 py-2.5 text-ink outline-none focus:border-teal disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-xl bg-teal/20 px-4 py-2.5 text-sm text-teal hover:bg-teal/30 disabled:opacity-50"
        >
          傳送
        </button>
      </form>
    </section>
  );
}
