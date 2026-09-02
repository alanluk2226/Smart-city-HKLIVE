"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  AI_CHAT_CLEARED_EVENT,
  isTripStarred,
  loadAiChat,
  loadTripStars,
  saveAiChat,
  STAR_LIMIT,
  toggleTripStar,
  tripChips,
  tripPairKey,
  type SavedTrip,
} from "@/lib/ai-trip-store";
import { apiPost } from "@/lib/client";
import type { AiAssistantResponse, AiTripAdvice } from "@/lib/types";

type ChatRole = "user" | "assistant" | "system";

type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  advice?: AiTripAdvice;
  /** Gemini-judged endpoints; present means starable */
  trip?: { from: string; to: string };
  /** Opened from favorites row */
  fromStar?: boolean;
};

const WELCOME = [
  "你好呀，我係 HK LIVE AI。天氣、路況、點去邊度，定係想傾下偈都得，當我係你朋友就得喇。",
  "覺得啱用嘅方案可以收藏（最多 5 個），之後喺上面撳開就可以再睇。",
].join("\n");

const HISTORY_TURNS = 12;

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
        if (
          line.startsWith("路線：") ||
          line.startsWith("車程：") ||
          line.startsWith("說明：") ||
          line.startsWith("天氣：")
        ) {
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
  const [ready, setReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setStars(loadTripStars());
    const saved = loadAiChat();
    if (saved.length > 0) {
      setMessages([{ id: "welcome", role: "assistant", text: WELCOME }, ...saved]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveAiChat(
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          text: m.text,
          trip: m.trip,
          fromStar: m.fromStar,
        })),
    );
  }, [messages, ready]);

  useEffect(() => {
    function onCleared() {
      setMessages([{ id: "welcome", role: "assistant", text: WELCOME }]);
      saveAiChat([]);
    }
    window.addEventListener(AI_CHAT_CLEARED_EVENT, onCleared);
    function onStorage(e: StorageEvent) {
      if (e.key === "hk-live:ai-trip:chat" && (e.newValue == null || e.newValue === "[]")) {
        onCleared();
      }
    }
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AI_CHAT_CLEARED_EVENT, onCleared);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading, ready]);

  const chips = tripChips(stars);

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { id: newId(), role: "user", text };
    const nextMessages = [...messages, userMsg];
    setInput("");
    setMessages(nextMessages);
    setLoading(true);

    const historyPayload = nextMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => m.id !== "welcome" && !m.fromStar)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));

    const lastTripMsg = [...nextMessages].reverse().find((m) => m.trip || m.advice);
    const lastTrip = lastTripMsg?.trip
      ? lastTripMsg.trip
      : lastTripMsg?.advice
        ? { from: lastTripMsg.advice.fromName, to: lastTripMsg.advice.toName }
        : undefined;

    try {
      const data = await apiPost<AiAssistantResponse>("/api/ai/trip", {
        messages: historyPayload,
        lastTrip,
      });
      const trip =
        data.trip ??
        (data.advice ? { from: data.advice.fromName, to: data.advice.toName } : null);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: data.reply,
          advice: data.advice ?? undefined,
          trip: trip ?? undefined,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "無法回應";
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: `${msg}\n\n可以再試問天氣，或「逸東邨去瑪嘉烈醫院」「東涌去何文田」。`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function starMessage(m: ChatMessage) {
    const from = m.trip?.from || m.advice?.fromName;
    const to = m.trip?.to || m.advice?.toName;
    if (!from || !to) return;
    const trip: SavedTrip = {
      from,
      to,
      goal: "both",
      savedAt: Date.now(),
      reply: m.text,
    };
    setStars(toggleTripStar(trip).stars);
  }

  function openStarred(trip: SavedTrip) {
    const body =
      trip.reply?.trim() ||
      `呢個收藏暫時未有保存方案內容。可再問「${trip.from}去${trip.to}」再收藏一次。`;
    setMessages((prev) => [
      ...prev,
      {
        id: newId(),
        role: "user",
        text: `${trip.from} → ${trip.to}`,
        fromStar: true,
      },
      {
        id: newId(),
        role: "assistant",
        text: `【收藏方案】${trip.from} → ${trip.to}\n\n${body}`,
        trip: { from: trip.from, to: trip.to },
        fromStar: true,
      },
    ]);
  }

  function dismissChip(trip: SavedTrip, e: MouseEvent) {
    e.stopPropagation();
    setStars(toggleTripStar(trip).stars);
  }

  return (
    <section className="rounded-2xl border border-teal/30 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] tracking-[0.2em] text-teal">HK LIVE AI</div>
          <h2 className="mt-0.5 text-lg">出行AI</h2>
        </div>
      </div>

      <div className="mt-3">
        {ready && chips.length === 0 ? (
          <p className="text-[11px] text-muted">
            {'收藏嘅行程會出現喺呢度（最多 '}
            {STAR_LIMIT}
            {' 個），撳一下可重看方案。'}
          </p>
        ) : null}
        {chips.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((trip) => (
              <div
                key={tripPairKey(trip.from, trip.to)}
                className="flex items-center rounded-full border border-amber/40 bg-amber/10"
              >
                <button
                  type="button"
                  className="px-2.5 py-1 text-[11px] text-muted hover:text-ink"
                  onClick={() => openStarred(trip)}
                  title="查看收藏方案"
                >
                  <span className="mr-1 text-amber">★</span>
                  {trip.from} → {trip.to}
                </button>
                <button
                  type="button"
                  aria-label={`取消收藏 ${trip.from} 至 ${trip.to}`}
                  className="pr-2 text-[10px] text-muted hover:text-ink"
                  onClick={(e) => dismissChip(trip, e)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex max-h-[28rem] flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-elev/40 p-3">
        {messages.map((m) => {
          const tripFrom = m.trip?.from || m.advice?.fromName;
          const tripTo = m.trip?.to || m.advice?.toName;
          const canStar = m.role === "assistant" && !!tripFrom && !!tripTo && !m.fromStar;
          const starred =
            tripFrom && tripTo ? isTripStarred(tripFrom, tripTo, stars) : false;
          const showFooter = canStar || !!m.advice || !!m.fromStar;
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
                {showFooter ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line/70 pt-2">
                    {m.advice?.weather.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.advice.weather.iconUrl} alt="" className="h-6 w-6" />
                    ) : null}
                    {m.advice?.weather.summary ? (
                      <span className="text-[11px] text-muted">{m.advice.weather.summary}</span>
                    ) : null}
                    {canStar ? (
                      <button
                        type="button"
                        onClick={() => starMessage(m)}
                        className={`ml-auto rounded-lg border px-2 py-1 text-[11px] ${
                          starred
                            ? "border-amber/50 bg-amber/15 text-amber"
                            : "border-line text-muted hover:border-amber hover:text-amber"
                        }`}
                        title={
                          starred
                            ? "取消收藏"
                            : stars.length >= STAR_LIMIT
                              ? `收藏（滿 ${STAR_LIMIT} 個時會取代最舊）`
                              : "收藏此方案"
                        }
                      >
                        {starred ? "★ 已收藏" : "☆ 收藏"}
                      </button>
                    ) : null}
                    {m.advice?.options.some((o) => o.mtrFrom && o.mtrTo) ? (
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
                    {m.fromStar && tripFrom && tripTo ? (
                      <button
                        type="button"
                        className="ml-auto text-[11px] text-teal hover:underline"
                        onClick={() => void ask(`${tripFrom}去${tripTo}`)}
                      >
                        重新問 AI →
                      </button>
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
              諗緊…
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
          placeholder="逸東邨去瑪嘉烈醫院…"
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
