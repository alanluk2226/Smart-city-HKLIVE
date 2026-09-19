import { kvEnabled, kvGetJson, kvGetRaw, kvIncrExpire, kvSetJson } from "@/lib/kv";

/** Per client (IP) free questions per Hong Kong calendar day. */
export const AI_QUESTIONS_PER_IP_DAY = 20;

/** Trip the global circuit when Gemini API calls reach this share of the daily budget. */
export const GEMINI_QUOTA_TRIP_RATIO = 0.98;

/**
 * Expected Gemini free-tier requests/day for this project.
 * Set `GEMINI_DAILY_BUDGET` in env to match Google AI Studio / Cloud free RPD.
 */
export function geminiDailyBudget(): number {
  const n = Number(process.env.GEMINI_DAILY_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 250;
}

export function hkCalendarDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function secondsUntilHkMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const elapsed = num("hour") * 3600 + num("minute") * 60 + num("second");
  const left = 86_400 - elapsed;
  return left <= 0 ? 86_400 : left;
}

type MemCounter = { day: string; count: number };

const memIp = new Map<string, MemCounter>();
let memGlobal: MemCounter = { day: "", count: 0 };
let memCircuitUntil = 0;
let memCircuitReason = "";

function memIncr(mapKey: string, day: string): number {
  const hit = memIp.get(mapKey);
  if (!hit || hit.day !== day) {
    memIp.set(mapKey, { day, count: 1 });
    return 1;
  }
  hit.count += 1;
  return hit.count;
}

function memGlobalIncr(day: string): number {
  if (memGlobal.day !== day) memGlobal = { day, count: 0 };
  memGlobal.count += 1;
  return memGlobal.count;
}

function memGlobalGet(day: string): number {
  if (memGlobal.day !== day) return 0;
  return memGlobal.count;
}

export type AiQuotaBlock = {
  ok: false;
  status: 429 | 503;
  message: string;
  retryAfterSec: number;
  remaining: 0;
  limit: number;
};

export type AiQuotaOk = {
  ok: true;
  remaining: number;
  limit: number;
};

export type AiQuotaResult = AiQuotaOk | AiQuotaBlock;

function circuitMessage() {
  return "出行 AI 今日 Gemini 配額將盡，已暫停至明日香港時間 0:00 再開放。請改用交通搜尋頁查路線。";
}

function ipLimitMessage() {
  return `每日免費${AI_QUESTIONS_PER_IP_DAY}次提問已用完，請明日再試，或改用交通搜尋頁查路線。`;
}

async function readGeminiUsage(day: string): Promise<number> {
  if (kvEnabled) {
    const raw = await kvGetRaw(`ai:gemini:${day}`);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return memGlobalGet(day);
}

/** Persist / restore a same-day global pause (survives serverless instances when KV is set). */
export async function getAiGlobalCircuit(): Promise<{
  paused: boolean;
  reason: string;
  retryAfterSec: number;
}> {
  const now = Date.now();
  if (memCircuitUntil > now) {
    return {
      paused: true,
      reason: memCircuitReason || circuitMessage(),
      retryAfterSec: Math.ceil((memCircuitUntil - now) / 1000),
    };
  }

  const day = hkCalendarDay();
  if (kvEnabled) {
    const stored = await kvGetJson<{ until: number; reason?: string }>(`ai:circuit:${day}`);
    if (stored && stored.until > now) {
      memCircuitUntil = stored.until;
      memCircuitReason = stored.reason || circuitMessage();
      return {
        paused: true,
        reason: memCircuitReason,
        retryAfterSec: Math.ceil((stored.until - now) / 1000),
      };
    }
  }

  const budget = geminiDailyBudget();
  const usedN = await readGeminiUsage(day);
  if (usedN >= Math.floor(budget * GEMINI_QUOTA_TRIP_RATIO)) {
    await tripAiGlobalCircuit(circuitMessage());
    return {
      paused: true,
      reason: circuitMessage(),
      retryAfterSec: secondsUntilHkMidnight(),
    };
  }

  return { paused: false, reason: "", retryAfterSec: 0 };
}

export async function tripAiGlobalCircuit(reason = circuitMessage()): Promise<void> {
  const retryAfterSec = secondsUntilHkMidnight();
  const until = Date.now() + retryAfterSec * 1000;
  memCircuitUntil = until;
  memCircuitReason = reason;
  const day = hkCalendarDay();
  if (kvEnabled) {
    await kvSetJson(`ai:circuit:${day}`, { until, reason }, retryAfterSec);
  }
}

/**
 * Reserve one user question for this IP for the Hong Kong calendar day.
 * Call before invoking Gemini. Does not count model retries — one chat turn = one question.
 */
export async function consumeAiQuestion(ip: string): Promise<AiQuotaResult> {
  const circuit = await getAiGlobalCircuit();
  if (circuit.paused) {
    return {
      ok: false,
      status: 503,
      message: circuit.reason,
      retryAfterSec: circuit.retryAfterSec,
      remaining: 0,
      limit: AI_QUESTIONS_PER_IP_DAY,
    };
  }

  const day = hkCalendarDay();
  const ttl = secondsUntilHkMidnight();
  const key = `ai:q:${day}:${ip}`;

  let count: number;
  if (kvEnabled) {
    const n = await kvIncrExpire(key, ttl);
    count = n ?? memIncr(key, day);
  } else {
    count = memIncr(key, day);
  }

  if (count > AI_QUESTIONS_PER_IP_DAY) {
    return {
      ok: false,
      status: 429,
      message: ipLimitMessage(),
      retryAfterSec: ttl,
      remaining: 0,
      limit: AI_QUESTIONS_PER_IP_DAY,
    };
  }

  return {
    ok: true,
    remaining: Math.max(0, AI_QUESTIONS_PER_IP_DAY - count),
    limit: AI_QUESTIONS_PER_IP_DAY,
  };
}

/**
 * Count one successful Gemini HTTP call toward the free-tier daily budget.
 * At ≥98% of `GEMINI_DAILY_BUDGET`, trip the global circuit until HK midnight.
 */
export async function recordGeminiApiCall(): Promise<{ tripped: boolean; reason: string }> {
  const day = hkCalendarDay();
  const ttl = secondsUntilHkMidnight();
  const budget = geminiDailyBudget();
  const tripAt = Math.floor(budget * GEMINI_QUOTA_TRIP_RATIO);
  const reason = circuitMessage();

  let count: number;
  if (kvEnabled) {
    const n = await kvIncrExpire(`ai:gemini:${day}`, ttl);
    count = n ?? memGlobalIncr(day);
  } else {
    count = memGlobalIncr(day);
  }

  if (count >= tripAt) {
    await tripAiGlobalCircuit(reason);
    return { tripped: true, reason };
  }
  return { tripped: false, reason: "" };
}
