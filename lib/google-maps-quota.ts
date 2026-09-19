import { kvEnabled, kvGetJson, kvGetRaw, kvIncrExpire, kvSetJson } from "@/lib/kv";

/** Trip global Google→OSM circuit at this share of the monthly free map-load budget. */
export const GOOGLE_MAPS_QUOTA_TRIP_RATIO = 0.98;

/**
 * Expected Dynamic Maps free map loads / month (Google Maps Platform SKU).
 * Set `GOOGLE_MAPS_MONTHLY_BUDGET` to match Cloud Console free cap (often 10_000).
 */
export function googleMapsMonthlyBudget(): number {
  const n = Number(process.env.GOOGLE_MAPS_MONTHLY_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10_000;
}

/** Billing month key in America/Los_Angeles (Google free usage resets Pacific midnight on the 1st). */
export function pacificBillingMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

/** Seconds until next 1st-of-month 00:00 America/Los_Angeles. */
export function secondsUntilPacificMonthReset(now = new Date()): number {
  const month = pacificBillingMonth(now);
  let lo = now.getTime();
  let hi = lo + 32 * 86_400_000;
  while (pacificBillingMonth(new Date(hi)) === month) {
    hi += 5 * 86_400_000;
  }
  while (hi - lo > 500) {
    const mid = Math.floor((lo + hi) / 2);
    if (pacificBillingMonth(new Date(mid)) === month) lo = mid;
    else hi = mid;
  }
  return Math.max(60, Math.ceil((hi - now.getTime()) / 1000));
}

type MemCounter = { month: string; count: number };

let memGlobal: MemCounter = { month: "", count: 0 };
let memCircuitUntil = 0;
let memCircuitReason = "";

function memGlobalIncr(month: string): number {
  if (memGlobal.month !== month) memGlobal = { month, count: 0 };
  memGlobal.count += 1;
  return memGlobal.count;
}

function memGlobalGet(month: string): number {
  if (memGlobal.month !== month) return 0;
  return memGlobal.count;
}

function circuitMessage() {
  return "本月 Google 地圖免費額度將盡，已改用免費 OpenStreetMap，下個月初再恢復。";
}

async function readUsage(month: string): Promise<number> {
  if (kvEnabled) {
    const raw = await kvGetRaw(`maps:gload:${month}`);
    if (raw != null) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
  }
  return memGlobalGet(month);
}

export type GoogleMapsQuotaStatus = {
  paused: boolean;
  reason: string;
  retryAfterSec: number;
  used: number;
  budget: number;
  remaining: number;
};

export async function tripGoogleMapsCircuit(reason = circuitMessage()): Promise<void> {
  const retryAfterSec = secondsUntilPacificMonthReset();
  const until = Date.now() + retryAfterSec * 1000;
  memCircuitUntil = until;
  memCircuitReason = reason;
  const month = pacificBillingMonth();
  if (kvEnabled) {
    await kvSetJson(`maps:circuit:${month}`, { until, reason }, retryAfterSec);
  }
}

export async function getGoogleMapsQuotaStatus(): Promise<GoogleMapsQuotaStatus> {
  const budget = googleMapsMonthlyBudget();
  const now = Date.now();

  if (memCircuitUntil > now) {
    return {
      paused: true,
      reason: memCircuitReason || circuitMessage(),
      retryAfterSec: Math.ceil((memCircuitUntil - now) / 1000),
      used: budget,
      budget,
      remaining: 0,
    };
  }

  const month = pacificBillingMonth();
  if (kvEnabled) {
    const stored = await kvGetJson<{ until: number; reason?: string }>(`maps:circuit:${month}`);
    if (stored && stored.until > now) {
      memCircuitUntil = stored.until;
      memCircuitReason = stored.reason || circuitMessage();
      return {
        paused: true,
        reason: memCircuitReason,
        retryAfterSec: Math.ceil((stored.until - now) / 1000),
        used: budget,
        budget,
        remaining: 0,
      };
    }
  }

  const used = await readUsage(month);
  const tripAt = Math.floor(budget * GOOGLE_MAPS_QUOTA_TRIP_RATIO);
  if (used >= tripAt) {
    await tripGoogleMapsCircuit(circuitMessage());
    return {
      paused: true,
      reason: circuitMessage(),
      retryAfterSec: secondsUntilPacificMonthReset(),
      used,
      budget,
      remaining: 0,
    };
  }

  return {
    paused: false,
    reason: "",
    retryAfterSec: 0,
    used,
    budget,
    remaining: Math.max(0, tripAt - used),
  };
}

/** Count one successful Dynamic Maps load toward the monthly free budget. */
export async function recordGoogleMapLoad(): Promise<GoogleMapsQuotaStatus> {
  const before = await getGoogleMapsQuotaStatus();
  if (before.paused) return before;

  const month = pacificBillingMonth();
  const ttl = secondsUntilPacificMonthReset();
  const budget = googleMapsMonthlyBudget();
  const tripAt = Math.floor(budget * GOOGLE_MAPS_QUOTA_TRIP_RATIO);

  let count: number;
  if (kvEnabled) {
    const n = await kvIncrExpire(`maps:gload:${month}`, ttl);
    count = n ?? memGlobalIncr(month);
  } else {
    count = memGlobalIncr(month);
  }

  if (count >= tripAt) {
    await tripGoogleMapsCircuit(circuitMessage());
    return {
      paused: true,
      reason: circuitMessage(),
      retryAfterSec: secondsUntilPacificMonthReset(),
      used: count,
      budget,
      remaining: 0,
    };
  }

  return {
    paused: false,
    reason: "",
    retryAfterSec: 0,
    used: count,
    budget,
    remaining: Math.max(0, tripAt - count),
  };
}
