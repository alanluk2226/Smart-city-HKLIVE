"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  hasCompletedOnboarding,
  markOnboardingComplete,
} from "@/lib/onboarding";

export const ONBOARDING_OPEN_EVENT = "hk-live:open-onboarding";

type Placement = "top" | "bottom" | "left" | "right";

type Step = {
  title: string;
  body: string;
  targets: string[];
  prefer?: Placement;
  ensureHome?: boolean;
};

const STEPS: Step[] = [
  {
    title: "歡迎使用 HK LIVE",
    body: "呢度整合香港公開資料：天氣、交通到站、急症輪候、路況 CCTV、停車場同場地。撳左上角商標隨時返主頁。",
    targets: ['[data-tour="brand"]'],
    prefer: "bottom",
  },
  {
    title: "交通同地圖",
    body: "撳呢度入「交通工具」查巴士、小巴、港鐵、輕鐵、電車同渡輪。手機用底欄都可以切換。",
    targets: ['[data-tour="transit"]'],
    prefer: "bottom",
  },
  {
    title: "我的收藏",
    body: "巴士、港鐵、出行AI 方案撳星之後會出現喺呢度；完整列表喺底欄「收藏」。",
    targets: ['[data-tour="favorites"]', '[data-tour="favorites-nav"]'],
    prefer: "bottom",
    ensureHome: true,
  },
  {
    title: "出行 AI",
    body: "主頁呢個區塊可以問天氣、點去邊、或者同 AI 傾偈。每日有免費提問次數。",
    targets: ['[data-tour="ai"]', "#ai-trip"],
    prefer: "top",
    ensureHome: true,
  },
  {
    title: "設定同定位",
    body: "撳齒輪轉淺色／深色、開關定位，以及重睇呢個教學。定位開啟後附近站點會更準。",
    targets: ['[data-tour="settings"]'],
    prefer: "bottom",
  },
];

const PAD = 10;
const CARD_W = 320;
const GAP = 14;

type Anchor = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

function findTarget(selectors: string[]): HTMLElement | null {
  for (const sel of selectors) {
    const nodes = document.querySelectorAll(sel);
    for (const node of nodes) {
      if (node instanceof HTMLElement && isVisible(node)) return node;
    }
  }
  return null;
}

function pickPlacement(
  anchor: Anchor,
  prefer: Placement,
  cardH: number,
): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const space = {
    top: anchor.top - PAD,
    bottom: vh - (anchor.top + anchor.height + PAD),
    left: anchor.left - PAD,
    right: vw - (anchor.left + anchor.width + PAD),
  };
  const need = {
    top: cardH + GAP,
    bottom: cardH + GAP,
    left: CARD_W + GAP,
    right: CARD_W + GAP,
  };
  if (space[prefer] >= need[prefer] * 0.7) return prefer;
  const order: Placement[] = ["bottom", "top", "left", "right"];
  return order.find((p) => space[p] >= need[p] * 0.55) ?? prefer;
}

function cardPosition(
  anchor: Anchor,
  placement: Placement,
  cardH: number,
): { top: number; left: number } {
  const vw = window.innerWidth;
  let top = 0;
  let left = 0;
  if (placement === "bottom") {
    top = anchor.top + anchor.height + PAD + GAP;
    left = anchor.left + anchor.width / 2 - CARD_W / 2;
  } else if (placement === "top") {
    top = anchor.top - PAD - GAP - cardH;
    left = anchor.left + anchor.width / 2 - CARD_W / 2;
  } else if (placement === "left") {
    top = anchor.top + anchor.height / 2 - cardH / 2;
    left = anchor.left - PAD - GAP - CARD_W;
  } else {
    top = anchor.top + anchor.height / 2 - cardH / 2;
    left = anchor.left + anchor.width + PAD + GAP;
  }
  left = Math.max(12, Math.min(left, vw - CARD_W - 12));
  top = Math.max(12, Math.min(top, window.innerHeight - cardH - 12));
  return { top, left };
}

function caretOffset(
  anchor: Anchor,
  card: { top: number; left: number },
  placement: Placement,
): { top?: string; left?: string; right?: string; bottom?: string } {
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;
  if (placement === "bottom" || placement === "top") {
    const x = Math.max(20, Math.min(cx - card.left, CARD_W - 20));
    return placement === "bottom"
      ? { left: `${x}px`, top: "-6px" }
      : { left: `${x}px`, bottom: "-6px" };
  }
  const y = Math.max(20, Math.min(cy - card.top, 160));
  return placement === "left"
    ? { top: `${y}px`, right: "-6px" }
    : { top: `${y}px`, left: "-6px" };
}

export function OnboardingTour() {
  const titleId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [placement, setPlacement] = useState<Placement>("bottom");
  const [cardH, setCardH] = useState(180);

  useEffect(() => {
    if (!hasCompletedOnboarding()) {
      setStep(0);
      setOpen(true);
    }
    function onOpen() {
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(ONBOARDING_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, onOpen);
  }, []);

  const current = STEPS[step];

  useEffect(() => {
    if (!open || !current?.ensureHome) return;
    if (pathname === "/") return;
    router.push("/");
  }, [open, current, pathname, router]);

  useLayoutEffect(() => {
    if (!open || !current) return;

    let cancelled = false;
    let tries = 0;
    let timer = 0;
    let raf = 0;

    function applyRect(el: HTMLElement) {
      const r = el.getBoundingClientRect();
      const next: Anchor = {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      };
      const h = cardRef.current?.offsetHeight || 180;
      setAnchor(next);
      setPlacement(pickPlacement(next, current.prefer ?? "bottom", h));
      if (cardRef.current) {
        const measured = cardRef.current.offsetHeight;
        setCardH((prev) => (Math.abs(prev - measured) > 2 ? measured : prev));
      }
    }

    function measure() {
      if (cancelled) return;
      const el = findTarget(current.targets);
      if (!el) {
        setAnchor(null);
        if (tries < 24) {
          tries += 1;
          timer = window.setTimeout(measure, 80);
        }
        return;
      }
      // Scroll first, then measure — otherwise spotlight sticks to stale coords.
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      raf = window.requestAnimationFrame(() => {
        if (cancelled) return;
        raf = window.requestAnimationFrame(() => {
          if (cancelled) return;
          applyRect(el);
        });
      });
    }

    measure();
    const onResize = () => {
      const el = findTarget(current.targets);
      if (el) applyRect(el);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, step, current, pathname]);

  function finish() {
    markOnboardingComplete();
    setOpen(false);
  }

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }

  if (!open) return null;

  const isLast = step === STEPS.length - 1;
  const fallbackLeft =
    typeof window === "undefined"
      ? 12
      : Math.max(12, (window.innerWidth - CARD_W) / 2);
  const fallbackTop =
    typeof window === "undefined" ? 80 : Math.max(80, window.innerHeight / 2 - 100);
  const pos = anchor
    ? cardPosition(anchor, placement, cardH)
    : { top: fallbackTop, left: fallbackLeft };
  const caret = anchor ? caretOffset(anchor, pos, placement) : null;

  return (
    <div className="fixed inset-0 z-[1300]" role="presentation">
      {/* Four-pane dim so the hole stays clickable / not a dismiss trap */}
      {anchor ? (
        <>
          <div
            className="absolute bg-ink/55"
            style={{ left: 0, top: 0, right: 0, height: Math.max(0, anchor.top - PAD) }}
            aria-hidden
          />
          <div
            className="absolute bg-ink/55"
            style={{
              left: 0,
              top: anchor.top - PAD,
              width: Math.max(0, anchor.left - PAD),
              height: anchor.height + PAD * 2,
            }}
            aria-hidden
          />
          <div
            className="absolute bg-ink/55"
            style={{
              left: anchor.left + anchor.width + PAD,
              top: anchor.top - PAD,
              right: 0,
              height: anchor.height + PAD * 2,
            }}
            aria-hidden
          />
          <div
            className="absolute bg-ink/55"
            style={{
              left: 0,
              top: anchor.top + anchor.height + PAD,
              right: 0,
              bottom: 0,
            }}
            aria-hidden
          />
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-2xl ring-2 ring-teal"
            style={{
              top: anchor.top - PAD,
              left: anchor.left - PAD,
              width: anchor.width + PAD * 2,
              height: anchor.height + PAD * 2,
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-ink/55" aria-hidden />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute w-[min(100%-1.5rem,20rem)] rounded-2xl border border-line bg-card p-4 shadow-xl sm:p-5"
        style={{ top: pos.top, left: pos.left, maxWidth: CARD_W }}
      >
        {caret ? <Caret placement={placement} style={caret} /> : null}
        <div className="font-mono text-[11px] tracking-[0.2em] text-teal">
          初次教學 · {step + 1}/{STEPS.length}
        </div>
        <h2 id={titleId} className="mt-2 text-lg font-medium text-ink">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>

        <div className="mt-3 flex gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-teal" : "bg-line"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex gap-2">
          {!isLast ? (
            <button
              type="button"
              onClick={finish}
              className="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm text-muted hover:border-teal hover:text-ink"
            >
              略過
            </button>
          ) : null}
          <button
            type="button"
            onClick={next}
            className="min-h-11 flex-[1.4] rounded-xl bg-teal/20 px-3 text-sm font-medium text-teal hover:bg-teal/30"
          >
            {isLast ? "開始使用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Caret({
  placement,
  style,
}: {
  placement: Placement;
  style: { top?: string; left?: string; right?: string; bottom?: string };
}) {
  const edge =
    placement === "bottom"
      ? "border-t border-l -translate-x-1/2"
      : placement === "top"
        ? "border-r border-b -translate-x-1/2"
        : placement === "left"
          ? "border-r border-t -translate-y-1/2"
          : "border-b border-l -translate-y-1/2";
  return (
    <span
      className={`pointer-events-none absolute h-3 w-3 rotate-45 border-line bg-card ${edge}`}
      style={style}
      aria-hidden
    />
  );
}

export function openOnboardingTour() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ONBOARDING_OPEN_EVENT));
}
