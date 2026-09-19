"use client";

import { useEffect } from "react";

const CLIENT_BUILD = process.env.NEXT_PUBLIC_APP_BUILD_ID || "dev";
const RELOAD_KEY = "hk-live-forced-reload";
const POLL_MS = 60_000;

type VersionPayload = {
  ok?: boolean;
  data?: { buildId?: string };
  buildId?: string;
};

/**
 * When Vercel ships a new deployment, open tabs still hold the old JS bundle.
 * Poll /api/version and hard-reload once so users pick up the new build.
 * Onboarding is keyed in localStorage per device and is not cleared by reload.
 */
export function DeployRefresh() {
  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    async function check() {
      if (cancelled || document.hidden) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as VersionPayload;
        const serverId = payload.data?.buildId || payload.buildId || "";
        if (!serverId) return;

        if (serverId === CLIENT_BUILD) {
          try {
            sessionStorage.removeItem(RELOAD_KEY);
          } catch {
            /* ignore */
          }
          return;
        }

        try {
          if (sessionStorage.getItem(RELOAD_KEY) === serverId) return;
          sessionStorage.setItem(RELOAD_KEY, serverId);
        } catch {
          /* private mode — still attempt one reload */
        }
        window.location.reload();
      } catch {
        /* offline / transient */
      }
    }

    void check();
    timer = window.setInterval(check, POLL_MS);

    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, []);

  return null;
}
