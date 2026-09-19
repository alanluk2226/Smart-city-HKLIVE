/**
 * Per-device first-run flag (localStorage). Survives redeploy hard-reloads;
 * only cleared if the user wipes site data or taps「重看初次教學」after reset.
 */
export const ONBOARDING_STORAGE_KEY = "hk-live-onboarding-v1";

export function hasCompletedOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingComplete() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function resetOnboarding() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
