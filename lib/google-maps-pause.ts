const PAUSE_KEY = "hk-live:google-maps-paused-until";
const REASON_KEY = "hk-live:google-maps-pause-reason";

/** Default pause when Google Maps quota / auth fails — prefer free OSM. */
const DEFAULT_PAUSE_MS = 45 * 60 * 1000;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    // localStorage so monthly circuit survives tab close; session-only would burn quota again.
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isGoogleMapsPaused(): boolean {
  const store = storage();
  if (!store) return false;
  try {
    const raw = store.getItem(PAUSE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    if (until <= Date.now()) {
      store.removeItem(PAUSE_KEY);
      store.removeItem(REASON_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function getGoogleMapsPauseReason(): string | null {
  if (!isGoogleMapsPaused()) return null;
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(REASON_KEY);
  } catch {
    return null;
  }
}

export function pauseGoogleMaps(
  reason = "Google 地圖配額或金鑰暫時不可用，已改用 OpenStreetMap",
  ms = DEFAULT_PAUSE_MS,
) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PAUSE_KEY, String(Date.now() + Math.max(60_000, ms)));
    store.setItem(REASON_KEY, reason);
  } catch {
    /* private mode */
  }
}

export function clearGoogleMapsPause() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PAUSE_KEY);
    store.removeItem(REASON_KEY);
  } catch {
    /* ignore */
  }
}
