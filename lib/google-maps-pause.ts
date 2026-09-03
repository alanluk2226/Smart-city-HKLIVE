const PAUSE_KEY = "hk-live:google-maps-paused-until";
const REASON_KEY = "hk-live:google-maps-pause-reason";

/** Default pause when Google Maps quota / auth fails — prefer free OSM. */
const DEFAULT_PAUSE_MS = 45 * 60 * 1000;

export function isGoogleMapsPaused(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(PAUSE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (until <= Date.now()) {
      sessionStorage.removeItem(PAUSE_KEY);
      sessionStorage.removeItem(REASON_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getGoogleMapsPauseReason(): string | null {
  if (!isGoogleMapsPaused()) return null;
  try {
    return sessionStorage.getItem(REASON_KEY);
  } catch {
    return null;
  }
}

export function pauseGoogleMaps(
  reason = "Google 地圖配額或金鑰暫時不可用，已改用 OpenStreetMap",
  ms = DEFAULT_PAUSE_MS,
) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PAUSE_KEY, String(Date.now() + ms));
    sessionStorage.setItem(REASON_KEY, reason);
  } catch {
    /* private mode */
  }
}

export function clearGoogleMapsPause() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PAUSE_KEY);
    sessionStorage.removeItem(REASON_KEY);
  } catch {
    /* ignore */
  }
}
