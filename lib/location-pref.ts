export const LOCATION_PREF_KEY = "hk-live-location";

/** In-memory mirror so click handlers can read without React context. */
let enabledMemory = true;

export function getLocationEnabled() {
  return enabledMemory;
}

export function setLocationEnabledMemory(enabled: boolean) {
  enabledMemory = enabled;
}

export function readStoredLocationEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(LOCATION_PREF_KEY);
    if (raw === "off") return false;
    if (raw === "on") return true;
    return true;
  } catch {
    return true;
  }
}

export function persistLocationEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(LOCATION_PREF_KEY, enabled ? "on" : "off");
  } catch {
    // ignore quota / private mode
  }
}
