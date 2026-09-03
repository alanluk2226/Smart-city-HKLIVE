"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Fill remaining viewport below `ref` top, minus sticky bottom chrome
 * (`--app-bottom-nav-h`) and optional extra offset (px).
 * Re-measures when the sticky header / alerts bar changes height.
 */
export function useFillViewportHeight(
  ref: RefObject<HTMLElement | null>,
  extraBottomPx = 0,
) {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function measure() {
      const node = ref.current;
      if (!node) return;
      const top = node.getBoundingClientRect().top;
      const root = getComputedStyle(document.documentElement);
      const bottomNav = Number.parseFloat(root.getPropertyValue("--app-bottom-nav-h")) || 0;
      const safeBottom = Number.parseFloat(root.getPropertyValue("--app-safe-bottom")) || 0;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const next = Math.floor(vh - top - bottomNav - safeBottom - extraBottomPx);
      setHeight(Math.max(320, next));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    const header = document.querySelector("header");
    if (header) ro.observe(header);
    ro.observe(el);

    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    window.visualViewport?.addEventListener("resize", measure);
    // Alerts / ActiveTrip often appear after first paint
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 600);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [ref, extraBottomPx]);

  return height;
}
