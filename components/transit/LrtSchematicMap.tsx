"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { haversineMeters } from "@/lib/geo";
import { getLocationEnabled } from "@/lib/location-pref";
import { LRT_MAP_EXTRA_HITS, LRT_MAP_HITS, LRT_MAP_HUBS, LRT_MAP_SIZE } from "@/lib/static/lrt-map-hits";
import { LRT_ROUTE_COLORS, LRT_ROUTE_LABELS, LRT_ROUTE_ORDER } from "@/lib/static/lrt-routes";
import { LRT_STATIONS } from "@/lib/static/lrt-stations";

const VB_W = LRT_MAP_SIZE.w;
const VB_H = LRT_MAP_SIZE.h;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;
const LOCATE_ZOOM = 3.6;
const TAP_R = 18;
const TAP_PX = 34;
const DRAG_PX = 12;
/** Walking / short-bus catchment around the Tuen Mun–Tin Shui Wai–Yuen Long network. */
const MAX_LOCATE_M = 6_000;
const LRT_AREA_PAD_M = 3_000;

const LRT_SERVICE_BOUNDS = (() => {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const s of LRT_STATIONS) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLng = Math.min(minLng, s.lng);
    maxLng = Math.max(maxLng, s.lng);
  }
  const latPad = LRT_AREA_PAD_M / 111_320;
  const lngPad = LRT_AREA_PAD_M / (111_320 * Math.cos((22.42 * Math.PI) / 180));
  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
})();

function inLrtServiceArea(lat: number, lng: number) {
  const b = LRT_SERVICE_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

type View = { x: number; y: number; w: number; h: number };
type Hit = { code: string; name: string; nameEn: string; dist: number };
type MapTarget = { code: string; name: string; nameEn: string; x: number; y: number; r: number; hub: boolean };

const FULL_VIEW: View = { x: 0, y: 0, w: VB_W, h: VB_H };

function clampView(v: View): View {
  const minW = VB_W / MAX_ZOOM;
  const w = Math.min(VB_W / MIN_ZOOM, Math.max(minW, v.w));
  const h = w * (VB_H / VB_W);
  return {
    x: Math.min(Math.max(0, v.x), VB_W - w),
    y: Math.min(Math.max(0, v.y), VB_H - h),
    w,
    h,
  };
}

function zoomAt(view: View, cx: number, cy: number, factor: number): View {
  const w = view.w / factor;
  const h = view.h / factor;
  const rx = view.w === 0 ? 0.5 : (cx - view.x) / view.w;
  const ry = view.h === 0 ? 0.5 : (cy - view.y) / view.h;
  return clampView({ x: cx - w * rx, y: cy - h * ry, w, h });
}

function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: VB_W / 2, y: VB_H / 2 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function viewCenter(view: View) {
  return { x: view.x + view.w / 2, y: view.y + view.h / 2 };
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function viewOn(cx: number, cy: number, zoom: number): View {
  const w = VB_W / zoom;
  const h = w * (VB_H / VB_W);
  return clampView({ x: cx - w / 2, y: cy - h / 2, w, h });
}

function tapRadiusSvg(svg: SVGSVGElement, viewW: number) {
  const w = svg.getBoundingClientRect().width;
  if (w < 8) return TAP_PX;
  return TAP_PX * (viewW / w);
}

function nearestStationCode(lat: number, lng: number): string | null {
  if (!inLrtServiceArea(lat, lng)) return null;
  let best: { code: string; dist: number } | null = null;
  for (const s of LRT_STATIONS) {
    if (!LRT_MAP_HITS[String(s.id)]) continue;
    const dist = haversineMeters(lat, lng, s.lat, s.lng);
    if (!best || dist < best.dist) best = { code: String(s.id), dist };
  }
  if (!best || best.dist > MAX_LOCATE_M) return null;
  return best.code;
}

export function LrtSchematicMap({
  selectedCode,
  originCode,
  destCode,
  pickHint,
  pickHintAction,
  cancelLabel,
  onSelect,
  onCancelPick,
  closedCodes,
  topOverlay,
}: {
  selectedCode?: string;
  originCode?: string;
  destCode?: string;
  pickHint?: string | null;
  pickHintAction?: { label: string; onClick: () => void };
  cancelLabel?: string;
  onSelect: (code: string) => void;
  onCancelPick?: () => void;
  closedCodes?: string[];
  topOverlay?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewRef = useRef<View>(FULL_VIEW);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ x: number; y: number; view: View } | null>(null);
  const pinch = useRef<{ dist: number; view: View } | null>(null);
  const dragged = useRef(false);
  const tapDown = useRef<{ x: number; y: number } | null>(null);
  const flyId = useRef(0);
  const [view, setViewState] = useState<View>(FULL_VIEW);
  const [panning, setPanning] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [picker, setPicker] = useState<Hit[] | null>(null);
  const [locatedCode, setLocatedCode] = useState<string | null>(null);
  const [locateUi, setLocateUi] = useState<"ask" | "locating" | "error" | null>(null);
  const [locateError, setLocateError] = useState("");

  function setView(next: View | ((prev: View) => View)) {
    setViewState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      const clamped = clampView(resolved);
      viewRef.current = clamped;
      return clamped;
    });
  }

  const closed = new Set(closedCodes ?? []);
  const zoom = VB_W / view.w;

  const targets = useMemo(() => {
    const byCode = new Map(LRT_STATIONS.map((s) => [String(s.id), s]));
    const out: MapTarget[] = [];
    for (const s of LRT_STATIONS) {
      const code = String(s.id);
      const hub = LRT_MAP_HUBS[code];
      const p = hub ?? LRT_MAP_HITS[code];
      if (!p) continue;
      out.push({
        code,
        name: s.name,
        nameEn: s.nameEn,
        x: p.x,
        y: p.y,
        r: hub?.r ?? TAP_R,
        hub: Boolean(hub),
      });
    }
    for (const extra of LRT_MAP_EXTRA_HITS) {
      const hub = LRT_MAP_HUBS[extra.code];
      if (hub && Math.hypot(extra.x - hub.x, extra.y - hub.y) <= hub.r) continue;
      const s = byCode.get(extra.code);
      if (s) out.push({ code: extra.code, name: s.name, nameEn: s.nameEn, x: extra.x, y: extra.y, r: TAP_R, hub: false });
    }
    return out;
  }, []);

  const tripEnds = useMemo(() => {
    if (!originCode || !destCode) return null;
    const pt = (code: string) => {
      const hub = LRT_MAP_HUBS[code];
      const hit = LRT_MAP_HITS[code];
      if (hub) return { x: hub.x, y: hub.y };
      if (hit) return { x: hit.x, y: hit.y };
      return null;
    };
    const a = pt(originCode);
    const b = pt(destCode);
    if (!a || !b) return null;
    return [a, b];
  }, [originCode, destCode]);

  useEffect(() => {
    if (!tripEnds) return;
    flyToBounds(tripEnds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originCode, destCode]);

  function hitsAt(x: number, y: number, extraR: number): Hit[] {
    const hubHits: Hit[] = [];
    const other: Hit[] = [];
    for (const t of targets) {
      const dist = Math.hypot(t.x - x, t.y - y);
      if (dist > Math.max(t.r, extraR)) continue;
      const hit = { code: t.code, name: t.name, nameEn: t.nameEn, dist };
      if (t.hub) hubHits.push(hit);
      else other.push(hit);
    }
    const pool = hubHits.length ? hubHits : other;
    return pool.sort((a, b) => a.dist - b.dist);
  }

  function cancelFly() {
    flyId.current += 1;
  }

  function flyTo(cx: number, cy: number, zoom = LOCATE_ZOOM) {
    flyToView(viewOn(cx, cy, zoom));
  }

  function flyToView(to: View) {
    const from = viewRef.current;
    const start = performance.now();
    const dur = 820;
    const id = ++flyId.current;
    const step = (now: number) => {
      if (id !== flyId.current) return;
      const t = Math.min(1, (now - start) / dur);
      const e = easeOutCubic(t);
      setView({
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e,
        w: from.w + (to.w - from.w) * e,
        h: from.h + (to.h - from.h) * e,
      });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function flyToBounds(pts: { x: number; y: number }[]) {
    if (!pts.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = Math.max(48, (maxX - minX) * 0.22, (maxY - minY) * 0.22);
    const bw = Math.max(40, maxX - minX) + pad * 2;
    const bh = Math.max(40, maxY - minY) + pad * 2;
    const aspect = VB_H / VB_W;
    let w = bw;
    let h = w * aspect;
    if (h < bh) {
      h = bh;
      w = h / aspect;
    }
    flyToView(clampView({ x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h }));
  }

  function focusStation(code: string) {
    const hub = LRT_MAP_HUBS[code];
    const p = hub ?? LRT_MAP_HITS[code];
    if (!p) return;
    setLocatedCode(code);
    flyTo(p.x, p.y);
  }

  function locateErrorMessage(err?: GeolocationPositionError) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return "這個瀏覽器不支援定位。";
    }
    if (!window.isSecureContext) {
      return "定位需要安全連線（HTTPS）。請用本機 https 或部署後的網址再開。";
    }
    if (!err) return "未能取得位置。";
    if (err.code === err.PERMISSION_DENIED) {
      return "定位被拒絕。請按瀏覽器網址列左邊的圖示，允許這個網站使用位置，然後再試。";
    }
    if (err.code === err.POSITION_UNAVAILABLE) return "暫時未能取得位置，請稍後再試。";
    if (err.code === err.TIMEOUT) return "定位逾時，請再試一次。";
    return "未能取得位置。";
  }

  function requestLocation(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (!getLocationEnabled()) {
      if (silent) {
        setLocateUi(null);
        return;
      }
      setLocateError("已在設定關閉定位。可按右上角齒輪重新開啟。");
      setLocateUi("error");
      return;
    }
    if (!navigator.geolocation) {
      if (silent) {
        setLocateUi(null);
        return;
      }
      setLocateError(locateErrorMessage());
      setLocateUi("error");
      return;
    }
    setLocateError("");
    if (!silent) setLocateUi("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const code = nearestStationCode(pos.coords.latitude, pos.coords.longitude);
        if (!code) {
          setLocatedCode(null);
          setLocateUi(null);
          return;
        }
        setLocateUi(null);
        focusStation(code);
      },
      (err) => {
        if (silent) {
          setLocateUi(null);
          return;
        }
        setLocateError(locateErrorMessage(err));
        setLocateUi("error");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  }

  function openLocatePrompt() {
    if (locateUi === "locating") return;
    setLocateError("");
    setLocateUi("ask");
  }

  useEffect(() => {
    let cancelled = false;
    if (!getLocationEnabled()) return;
    const perm = navigator.permissions;
    if (!perm?.query) return;
    perm
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) return;
        if (status.state === "granted") requestLocation({ silent: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cancelFly();
      const factor = Math.exp(-e.deltaY * 0.0018);
      const pt = clientToSvg(el, e.clientX, e.clientY);
      setView((v) => zoomAt(v, pt.x, pt.y, factor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function pointerList() {
    return [...pointers.current.values()];
  }

  function applyStationHits(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const src =
      clientX === 0 && clientY === 0 && tapDown.current
        ? tapDown.current
        : { x: clientX, y: clientY };
    const pt = clientToSvg(svg, src.x, src.y);
    const hits = hitsAt(pt.x, pt.y, tapRadiusSvg(svg, viewRef.current.w));
    if (!hits.length) return;
    if (hits.length === 1 || hits[0].dist <= hits[1].dist * 0.7) {
      setPicker(null);
      onSelect(hits[0].code);
    } else {
      setPicker(hits.slice(0, 8));
    }
  }

  function onPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    cancelFly();
    if (e.pointerType === "mouse") {
      svg.setPointerCapture(e.pointerId);
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tapDown.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
    const pts = pointerList();
    if (pts.length === 1) {
      pan.current = { x: e.clientX, y: e.clientY, view: viewRef.current };
      pinch.current = null;
      setPanning(true);
    } else if (pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinch.current = { dist: Math.max(dist, 1), view: viewRef.current };
      pan.current = null;
    }
  }

  function onPointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const svg = svgRef.current;
    if (!svg) return;
    const pts = pointerList();

    if (pts.length === 2 && pinch.current) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const factor = dist / pinch.current.dist;
      if (Math.abs(factor - 1) > 0.02) dragged.current = true;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const pt = clientToSvg(svg, mid.x, mid.y);
      setView(zoomAt(pinch.current.view, pt.x, pt.y, factor));
      return;
    }

    if (pts.length === 1 && pan.current) {
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      if (Math.hypot(dx, dy) <= DRAG_PX) return;
      dragged.current = true;
      const rect = svg.getBoundingClientRect();
      setView({
        ...pan.current.view,
        x: pan.current.view.x - dx * (pan.current.view.w / rect.width),
        y: pan.current.view.y - dy * (pan.current.view.h / rect.height),
      });
    }
  }

  function onPointerUp(e: ReactPointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    const pts = pointerList();
    if (pts.length === 1) {
      pan.current = { x: pts[0].x, y: pts[0].y, view: viewRef.current };
      pinch.current = null;
      return;
    }
    pan.current = null;
    pinch.current = null;
    setPanning(false);
    if (dragged.current) return;
    applyStationHits(e.clientX, e.clientY);
  }

  function zoomBy(factor: number) {
    cancelFly();
    const c = viewCenter(viewRef.current);
    setView((v) => zoomAt(v, c.x, c.y, factor));
  }

  const locatedName = locatedCode
    ? LRT_STATIONS.find((s) => String(s.id) === locatedCode)?.name
    : null;

  function renderLegend() {
    return LRT_ROUTE_ORDER.filter((id) => LRT_ROUTE_COLORS[id]).map((id) => (
      <span key={id} className="inline-flex items-center gap-1 shrink-0">
        <span className="h-2 w-2 rounded-full" style={{ background: LRT_ROUTE_COLORS[id] }} />
        {id}
        <span className="text-muted/70">{LRT_ROUTE_LABELS[id]}</span>
      </span>
    ));
  }

  return (
    <div className="relative max-md:-mx-4 max-md:h-[calc(100dvh-10.5rem)] max-md:min-h-[22rem] md:space-y-3">
      {topOverlay ? (
        <div className="pointer-events-none z-30 space-y-2 max-md:absolute max-md:inset-x-0 max-md:top-0 max-md:p-3 md:relative md:pointer-events-auto">
          <div className="pointer-events-auto">{topOverlay}</div>
        </div>
      ) : null}
      <div className="overflow-hidden max-md:absolute max-md:inset-0 md:relative md:rounded-2xl md:border md:border-line">
        <div className="hidden md:flex px-3 py-2 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted border-b border-line bg-elev">
          {renderLegend()}
        </div>
        <div className="relative h-full overflow-auto max-md:h-full md:max-h-[min(80vh,720px)] bg-[#f3f1ea]">
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 space-y-2 p-3 md:hidden">
            {topOverlay ? <div className="h-[3.25rem]" aria-hidden /> : null}
            <div className="pointer-events-auto flex gap-x-3 gap-y-1 overflow-x-auto rounded-xl border border-line/80 bg-elev/90 px-3 py-2 text-[11px] text-muted shadow-lg backdrop-blur-md">
              {renderLegend()}
            </div>
          </div>
          {pickHint ? (
          <div
            className={`absolute left-3 right-16 z-10 flex items-center gap-2 rounded-lg border border-teal/40 bg-elev/95 px-2.5 py-1.5 text-[12px] text-ink shadow-lg ${
              topOverlay ? "top-[7.5rem] md:top-3" : "top-3"
            }`}
          >
            <span className="min-w-0 flex-1">{pickHint}</span>
            {pickHintAction ? (
              <button
                type="button"
                onClick={pickHintAction.onClick}
                className="shrink-0 rounded-md bg-teal px-2 py-0.5 text-[11px] text-bg hover:opacity-90"
              >
                {pickHintAction.label}
              </button>
            ) : null}
            {onCancelPick ? (
              <button
                type="button"
                onClick={onCancelPick}
                className="shrink-0 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
              >
                {cancelLabel ?? "取消"}
              </button>
            ) : null}
          </div>
        ) : locatedName ? (
          <div
            className={`absolute left-3 z-10 rounded-lg border border-line bg-elev/90 px-2.5 py-1 text-[11px] text-ink ${
              topOverlay ? "top-[7.5rem] md:top-3" : "top-3"
            }`}
          >
            附近：{locatedName}
          </div>
        ) : null}
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={`relative z-0 block w-full select-none touch-none max-md:h-full max-md:min-h-full md:min-w-[720px] md:h-auto ${panning ? "cursor-grabbing" : "cursor-grab"}`}
          role="img"
          aria-label="輕鐵互動路綫圖"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => {
            const svg = svgRef.current;
            if (!svg) return;
            const pt = clientToSvg(svg, e.clientX, e.clientY);
            setView((v) => zoomAt(v, pt.x, pt.y, ZOOM_STEP));
          }}
        >
          <image href="/lrt-system-map.svg" width={VB_W} height={VB_H} preserveAspectRatio="none" />
          {targets.map((t) => {
            const isSel = selectedCode === t.code;
            const isHov = hovered === t.code;
            const isLocated = locatedCode === t.code;
            const isOrigin = originCode === t.code;
            const isDest = destCode === t.code;
            const isClosed = closed.has(t.code);
            const ring = isDest ? "#f0b429" : isOrigin ? "#3ee0c5" : isSel ? "#3ee0c5" : "#0f766e";
            const active = isSel || isHov || isOrigin || isDest;
            return (
              <g
                key={`${t.code}-${t.x}-${t.y}`}
                transform={`translate(${t.x} ${t.y})`}
                onMouseEnter={() => setHovered(t.code)}
                onMouseLeave={() => setHovered(null)}
                className="cursor-pointer"
              >
                <circle r={t.r} fill="transparent" />
                {t.hub ? (
                  <circle
                    r={t.r}
                    fill={active ? "rgba(62,224,197,0.18)" : "rgba(15,118,110,0.08)"}
                    stroke={ring}
                    strokeWidth={active ? 2.6 : 1.7}
                    strokeDasharray={active ? undefined : "5 4"}
                    opacity={active ? 1 : 0.85}
                  />
                ) : null}
                {isClosed ? (
                  <>
                    <circle r="12" fill="#6b7280" opacity="0.72" />
                    <text
                      y={t.hub ? -t.r - 4 : -14}
                      textAnchor="middle"
                      fill="#9ca3af"
                      stroke="#071018"
                      strokeWidth="2"
                      paintOrder="stroke"
                      fontSize="10"
                      fontWeight="700"
                    >
                      未開放
                    </text>
                  </>
                ) : null}
                {isLocated ? (
                  <>
                    <circle r={t.hub ? t.r * 0.72 : 16} className="mtr-pulse" fill="#3ee0c5" />
                    <circle
                      r={t.hub ? t.r : 8}
                      className="mtr-pulse-ring"
                      fill="none"
                      stroke="#3ee0c5"
                      strokeWidth="3"
                    />
                  </>
                ) : null}
                {!isLocated && (isSel || isOrigin || isDest) && !t.hub ? (
                  <circle r="14" className="mtr-glow" fill={isDest ? "#f0b429" : "#3ee0c5"} opacity="0.55" />
                ) : null}
                {!isLocated && active && !t.hub ? (
                  <circle r="8" fill="none" stroke={ring} strokeWidth="3" />
                ) : null}
                {isOrigin || isDest ? (
                  <text
                    y={t.hub ? -t.r - 4 : -14}
                    textAnchor="middle"
                    fill={isDest ? "#f0b429" : "#3ee0c5"}
                    stroke="#071018"
                    strokeWidth="2"
                    paintOrder="stroke"
                    fontSize="12"
                    fontWeight="700"
                  >
                    {isDest ? "終" : "起"}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>

        {picker ? (
          <div className="absolute inset-x-3 bottom-14 rounded-xl border border-line bg-elev/95 p-2 shadow-lg">
            <p className="px-2 py-1 text-[11px] text-muted">附近有多個車站，請選一個：</p>
            {picker.map((h) => (
              <button
                key={h.code}
                type="button"
                onClick={() => {
                  setPicker(null);
                  onSelect(h.code);
                }}
                className="flex w-full items-baseline justify-between rounded-lg px-3 py-2 text-left hover:bg-white/5"
              >
                <span>{h.name}</span>
                <span className="text-[11px] text-muted">{h.nameEn}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPicker(null)}
              className="mt-1 w-full rounded-lg px-3 py-1.5 text-[11px] text-muted hover:text-ink"
            >
              取消
            </button>
          </div>
        ) : null}

        {locateUi ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 p-4">
            <div
              role="dialog"
              aria-modal="true"
                  aria-labelledby="lrt-locate-title"
              className="w-full max-w-sm rounded-2xl border border-line bg-card p-4 shadow-2xl"
            >
              {locateUi === "ask" ? (
                <>
                  <h2 id="lrt-locate-title" className="text-base">
                    使用你的位置？
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    允許後，若你喺屯門、天水圍或元朗，地圖會跳到最近嘅輕鐵站。唔喺呢個範圍就唔會標示位置。瀏覽器可能再問一次權限。
                  </p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => requestLocation()}
                      className="flex-1 rounded-xl bg-teal px-3 py-2.5 text-sm text-bg hover:opacity-90"
                    >
                      允許定位
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocateUi(null)}
                      className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm text-muted hover:text-ink"
                    >
                      暫時不要
                    </button>
                  </div>
                </>
              ) : null}
              {locateUi === "locating" ? (
                <>
                  <h2 id="lrt-locate-title" className="text-base">
                    正在取得位置
                  </h2>
                  <p className="mt-2 text-sm text-muted">請在瀏覽器提示中選擇允許。這可能需要幾秒。</p>
                </>
              ) : null}
              {locateUi === "error" ? (
                <>
                  <h2 id="lrt-locate-title" className="text-base">
                    未能定位
                  </h2>
                  <p className="mt-2 text-sm text-rose">{locateError}</p>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => requestLocation()}
                      className="flex-1 rounded-xl bg-teal px-3 py-2.5 text-sm text-bg hover:opacity-90"
                    >
                      再試一次
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocateUi(null)}
                      className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm text-muted hover:text-ink"
                    >
                      關閉
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

          <div className="pointer-events-auto absolute right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex flex-col gap-1">
            <button
              type="button"
              aria-label="放大"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM - 0.05}
              className="h-9 w-9 rounded-lg border border-line bg-elev/90 text-lg text-ink hover:border-teal disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              aria-label="縮小"
              onClick={() => zoomBy(1 / ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM + 0.05}
              className="h-9 w-9 rounded-lg border border-line bg-elev/90 text-lg text-ink hover:border-teal disabled:opacity-40"
            >
              −
            </button>
            <button
              type="button"
              aria-label="附近車站"
              onClick={openLocatePrompt}
              className="h-9 w-9 rounded-lg border border-line bg-elev/90 text-[10px] text-ink hover:border-teal"
            >
              附近
            </button>
            <button
              type="button"
              aria-label="重設視圖"
              onClick={() => {
                cancelFly();
                setView(FULL_VIEW);
              }}
              disabled={zoom <= MIN_ZOOM + 0.05}
              className="h-9 w-9 rounded-lg border border-line bg-elev/90 text-[10px] text-ink hover:border-teal disabled:opacity-40"
            >
              重設
            </button>
            <div className="rounded-lg border border-line bg-elev/90 py-1 text-center text-[10px] text-muted">
              {Math.round(zoom * 100)}%
            </div>
          </div>
        </div>
        <p className="hidden md:block px-3 py-2 text-[11px] text-muted bg-elev border-t border-line">
          點車站或路綫編號簇可睇到達時間，或設起點後再點終點規劃行程。喺屯門／天水圍／元朗範圍內可按「附近」跳到最近站。
        </p>
      </div>
    </div>
  );
}
