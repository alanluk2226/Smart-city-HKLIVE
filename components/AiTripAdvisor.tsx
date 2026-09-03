"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  AI_CHAT_CLEARED_EVENT,
  AI_STARS_CHANGED_EVENT,
  getStarredTrip,
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
import { useLocationEnabled } from "@/components/LocationPrefProvider";
import { ApiError, apiPost } from "@/lib/client";
import { getLocationEnabled } from "@/lib/location-pref";
import {
  buildLocationTripPlaceholder,
  DEFAULT_TRIP_PLACEHOLDER,
} from "@/lib/trip-example";
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
  "覺得啱用嘅方案可以收藏，之後喺「收藏」頁或上面撳開就可以再睇。",
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

export function AiTripAdvisor({
  defaultCollapsed = false,
  hideStarChips = false,
}: {
  /** Home: collapse chat until the user asks or opens a favorite. */
  defaultCollapsed?: boolean;
  /** When favorites are shown in a parent panel, hide the duplicate chip row. */
  hideStarChips?: boolean;
} = {}) {
  const locationEnabled = useLocationEnabled();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: WELCOME },
  ]);
  const [stars, setStars] = useState<SavedTrip[]>([]);
  const [ready, setReady] = useState(false);
  const [placeholder, setPlaceholder] = useState(DEFAULT_TRIP_PLACEHOLDER);
  /** When Gemini / our AI rate limit trips — show reason and pause sends. */
  const [servicePause, setServicePause] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const openedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    setStars(loadTripStars());
    const saved = loadAiChat();
    if (saved.length > 0) {
      setMessages([{ id: "welcome", role: "assistant", text: WELCOME }, ...saved]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    function syncStars() {
      setStars(loadTripStars());
    }
    window.addEventListener(AI_STARS_CHANGED_EVENT, syncStars);
    return () => window.removeEventListener(AI_STARS_CHANGED_EVENT, syncStars);
  }, []);

  useEffect(() => {
    if (!locationEnabled || !getLocationEnabled()) {
      setPlaceholder(DEFAULT_TRIP_PLACEHOLDER);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPlaceholder(DEFAULT_TRIP_PLACEHOLDER);
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled) return;
        setPlaceholder(
          buildLocationTripPlaceholder(pos.coords.latitude, pos.coords.longitude),
        );
      },
      () => {
        if (!cancelled) setPlaceholder(DEFAULT_TRIP_PLACEHOLDER);
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 120_000 },
    );
    return () => {
      cancelled = true;
    };
  }, [locationEnabled]);

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
    if (!ready || collapsed) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, loading, ready, collapsed]);

  const chips = tripChips(stars);

  async function ask(raw: string) {
    const text = raw.trim();
    if (!text || loading || servicePause) return;

    setCollapsed(false);
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
      const pauseHint =
        data.aiError &&
        /配額|速率|暫停|quota|RESOURCE_EXHAUSTED|rate.?limit|過於頻繁|用量已達/i.test(
          data.aiError,
        )
          ? data.aiError
          : null;
      if (pauseHint) setServicePause(pauseHint);
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
      const status = err instanceof ApiError ? err.status : 0;
      const isPause =
        status === 429 ||
        status === 503 ||
        /配額|速率|暫停|quota|過於頻繁|用量已達|GEMINI_PAUSED/i.test(msg);
      if (isPause) {
        setServicePause(msg);
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            text: `${msg}\n\n已暫時暫停 AI。可用「交通」頁查路線，稍後再回來問我。`,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: newId(),
            role: "assistant",
            text: `${msg}\n\n可以再試問天氣，或「逸東邨去瑪嘉烈醫院」「東涌去何文田」。`,
          },
        ]);
      }
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
    setCollapsed(false);
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

  useEffect(() => {
    function onOpenStar(e: Event) {
      const trip = (e as CustomEvent<SavedTrip>).detail;
      if (!trip?.from || !trip?.to) return;
      openStarred(trip);
      document.getElementById("ai-trip")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener("hk-live:open-ai-star", onOpenStar);
    return () => window.removeEventListener("hk-live:open-ai-star", onOpenStar);
    // openStarred closes over stable setters only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link from /favorites or home chips: /?aiFrom=&aiTo=
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const from = params.get("aiFrom")?.trim();
    const to = params.get("aiTo")?.trim();
    if (!from || !to) return;
    const token = tripPairKey(from, to);
    if (openedQueryRef.current === token) return;
    const trip = getStarredTrip(from, to) ?? {
      from,
      to,
      goal: "both" as const,
      savedAt: Date.now(),
    };
    openedQueryRef.current = token;
    openStarred(trip);
    document.getElementById("ai-trip")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const url = new URL(window.location.href);
    url.searchParams.delete("aiFrom");
    url.searchParams.delete("aiTo");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function dismissChip(trip: SavedTrip, e: MouseEvent) {
    e.stopPropagation();
    setStars(toggleTripStar(trip).stars);
  }

  return (
    <section id="ai-trip" className="scroll-mt-28 rounded-2xl border border-teal/30 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] tracking-[0.2em] text-teal">HK LIVE AI</div>
          <h2 className="mt-0.5 text-lg">出行AI</h2>
          {collapsed ? (
            <p className="mt-1 text-xs text-muted">問天氣、路況或「東涌去何文田」</p>
          ) : null}
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-xs text-muted hover:border-teal hover:text-ink"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? "展開對話" : "收合對話"}
        </button>
      </div>

      {!hideStarChips ? (
        <div className="mt-3">
          {ready && chips.length === 0 ? (
            <p className="text-[11px] text-muted">
              {"收藏嘅行程會出現喺呢度（最多 "}
              {STAR_LIMIT}
              {" 個），撳一下可重看方案。"}
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
                    className="min-h-9 px-2.5 py-1 text-[11px] text-muted hover:text-ink"
                    onClick={() => openStarred(trip)}
                    title="查看收藏方案"
                  >
                    <span className="mr-1 text-amber">★</span>
                    {trip.from} → {trip.to}
                  </button>
                  <button
                    type="button"
                    aria-label={`取消收藏 ${trip.from} 至 ${trip.to}`}
                    className="min-h-9 pr-2 text-[10px] text-muted hover:text-ink"
                    onClick={(e) => dismissChip(trip, e)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {servicePause ? (
        <div
          role="status"
          className="mt-3 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-sm text-amber"
        >
          <p className="font-medium">AI 已暫時暫停</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/90">{servicePause}</p>
          <button
            type="button"
            className="mt-2 text-[11px] text-teal underline-offset-2 hover:underline"
            onClick={() => setServicePause(null)}
          >
            稍後再試（關閉提示）
          </button>
        </div>
      ) : null}

      {!collapsed ? (
      <div className="mt-3 flex max-h-[22rem] flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-elev/40 p-3">
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
      ) : null}

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
          placeholder={servicePause ? "AI 暫停中…" : placeholder}
          disabled={loading || Boolean(servicePause)}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-elev px-3 py-2.5 text-ink outline-none focus:border-teal disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || Boolean(servicePause) || !input.trim()}
          className="min-h-11 shrink-0 rounded-xl bg-teal/20 px-4 py-2.5 text-sm text-teal hover:bg-teal/30 disabled:opacity-50"
        >
          傳送
        </button>
      </form>
    </section>
  );
}
