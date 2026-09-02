import type { AiTripGoal } from "@/lib/types";

export type SavedTrip = {
  from: string;
  to: string;
  goal: AiTripGoal;
  savedAt: number;
  /** 收藏當下 AI 回覆全文，點開可重看方案。 */
  reply?: string;
};

/** 持久化對話（唔存 advice，避免 localStorage 過大）。 */
export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  trip?: { from: string; to: string };
  fromStar?: boolean;
};

const HISTORY_KEY = "hk-live:ai-trip:history";
const STARS_KEY = "hk-live:ai-trip:stars";
const CHAT_KEY = "hk-live:ai-trip:chat";
/** 設定頁／其他分頁清除對話時廣播。 */
export const AI_CHAT_CLEARED_EVENT = "hk-live:ai-chat-cleared";
/** 標題下方收藏列最多顯示／保存幾個（用戶選擇 5）。 */
export const STAR_LIMIT = 5;
export const TRIP_CHIP_LIMIT = STAR_LIMIT;
const HISTORY_LIMIT = 10;
/** 對話最多保留幾則（不含歡迎訊息）。 */
export const AI_CHAT_LIMIT = 60;

export function tripPairKey(from: string, to: string) {
  return `${from.trim()}→${to.trim()}`;
}

function readList(key: string): SavedTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedTrip =>
        !!item &&
        typeof item === "object" &&
        typeof (item as SavedTrip).from === "string" &&
        typeof (item as SavedTrip).to === "string",
    );
  } catch {
    return [];
  }
}

function writeList(key: string, items: SavedTrip[]) {
  window.localStorage.setItem(key, JSON.stringify(items));
}

export function loadTripHistory() {
  return readList(HISTORY_KEY).slice(0, HISTORY_LIMIT);
}

export function loadTripStars() {
  return readList(STARS_KEY).slice(0, STAR_LIMIT);
}

export function pushTripHistory(trip: SavedTrip) {
  const next = [
    trip,
    ...loadTripHistory().filter((t) => tripPairKey(t.from, t.to) !== tripPairKey(trip.from, trip.to)),
  ].slice(0, HISTORY_LIMIT);
  writeList(HISTORY_KEY, next);
  return next;
}

export function isTripStarred(from: string, to: string, stars = loadTripStars()) {
  const key = tripPairKey(from, to);
  return stars.some((t) => tripPairKey(t.from, t.to) === key);
}

export function getStarredTrip(from: string, to: string, stars = loadTripStars()) {
  const key = tripPairKey(from, to);
  return stars.find((t) => tripPairKey(t.from, t.to) === key);
}

/**
 * 收藏／取消收藏。新收藏置頂；已滿 STAR_LIMIT 時擠掉最舊一筆。
 * 若同一對起終點再收藏，會更新 reply 與時間。
 */
export function toggleTripStar(trip: SavedTrip): { starred: boolean; stars: SavedTrip[] } {
  const key = tripPairKey(trip.from, trip.to);
  const current = loadTripStars();
  const exists = current.some((t) => tripPairKey(t.from, t.to) === key);
  const stars = exists
    ? current.filter((t) => tripPairKey(t.from, t.to) !== key)
    : [{ ...trip, savedAt: Date.now() }, ...current].slice(0, STAR_LIMIT);
  writeList(STARS_KEY, stars);
  return { starred: !exists, stars };
}

/** 只更新已收藏行程的方案內容（例如重新問 AI 後覆寫）。 */
export function updateStarredReply(trip: SavedTrip): SavedTrip[] {
  const key = tripPairKey(trip.from, trip.to);
  const current = loadTripStars();
  if (!current.some((t) => tripPairKey(t.from, t.to) === key)) return current;
  const stars = [
    { ...trip, savedAt: Date.now() },
    ...current.filter((t) => tripPairKey(t.from, t.to) !== key),
  ].slice(0, STAR_LIMIT);
  writeList(STARS_KEY, stars);
  return stars;
}

export function removeTripHistory(from: string, to: string) {
  const key = tripPairKey(from, to);
  const next = loadTripHistory().filter((t) => tripPairKey(t.from, t.to) !== key);
  writeList(HISTORY_KEY, next);
  return next;
}

/** 標題下方只顯示收藏（最多 STAR_LIMIT）。 */
export function tripChips(stars = loadTripStars(), _history: SavedTrip[] = []): SavedTrip[] {
  void _history;
  return stars.slice(0, TRIP_CHIP_LIMIT);
}

export function loadAiChat(): StoredChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is StoredChatMessage =>
          !!item &&
          typeof item === "object" &&
          typeof (item as StoredChatMessage).id === "string" &&
          ((item as StoredChatMessage).role === "user" ||
            (item as StoredChatMessage).role === "assistant") &&
          typeof (item as StoredChatMessage).text === "string",
      )
      .slice(-AI_CHAT_LIMIT);
  } catch {
    return [];
  }
}

export function saveAiChat(messages: StoredChatMessage[]) {
  if (typeof window === "undefined") return;
  const slim = messages
    .filter((m) => m.id !== "welcome")
    .slice(-AI_CHAT_LIMIT)
    .map((m) => {
      const out: StoredChatMessage = {
        id: m.id,
        role: m.role,
        text: m.text,
      };
      if (m.trip?.from && m.trip?.to) out.trip = { from: m.trip.from, to: m.trip.to };
      if (m.fromStar) out.fromStar = true;
      return out;
    });
  window.localStorage.setItem(CHAT_KEY, JSON.stringify(slim));
}

export function hasAiChat() {
  return loadAiChat().length > 0;
}

/** 清除所有 AI 對話記錄（唔清收藏）。 */
export function clearAiChat() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHAT_KEY);
  window.localStorage.removeItem(HISTORY_KEY);
  try {
    window.dispatchEvent(new Event(AI_CHAT_CLEARED_EVENT));
  } catch {
    // ignore
  }
}
