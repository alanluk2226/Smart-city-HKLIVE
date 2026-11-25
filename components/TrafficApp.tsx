"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ListSkeleton } from "@/components/ListSkeleton";
import { LocationOffBanner } from "@/components/LocationOffBanner";
import { MapPanel } from "@/components/MapPanel";
import { NearbyMapDynamic } from "@/components/NearbyMapDynamic";
import {
  compareSnapshots,
  compareVehicleBoxes,
  grayFromRgba,
  isPlaceholderFrame,
  MIN_SAMPLE_VEHICLES,
  outlineVehicles,
  type CongestionEstimate,
  type DetectionDebug,
  type JamCause,
  type VehicleBox,
} from "@/lib/cctv-congestion";
import { detectVehicles, vehicleModelReady } from "@/lib/cctv-yolo";
import { apiGet, formatDistance, useGeo } from "@/lib/client";
import { DEFAULT_CENTER } from "@/lib/geo";
import type { CctvCamera, CctvRegionFacet, TrafficSnapshot } from "@/lib/providers/traffic";

type BrowseMode = "nearby" | "district";

type CameraEstimate = CongestionEstimate & { key: string };

const SAMPLE_W = 160;
const SAMPLE_H = 90;

const CAUSE_LABEL: Record<JamCause, string> = {
  signal: "似等紅綠燈",
  incident: "可能意外或阻塞",
  flowing: "車流仍在移動",
  unknown: "估算中",
};

export function TrafficApp() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [hasLocated, setHasLocated] = useState(false);
  const [mode, setMode] = useState<BrowseMode>("nearby");
  const [region, setRegion] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [facets, setFacets] = useState<CctvRegionFacet[]>([]);
  const [cameras, setCameras] = useState<CctvCamera[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [estimateOn, setEstimateOn] = useState(false);
  const [estimate, setEstimate] = useState<CameraEstimate | null>(null);
  const [frameEpoch, setFrameEpoch] = useState(0);
  const [frameBox, setFrameBox] = useState<FrameBox | null>(null);
  const framesRef = useRef<Map<string, Uint8Array>>(new Map());
  const boxFramesRef = useRef<Map<string, VehicleBox[]>>(new Map());
  const readyRef = useRef<Map<string, CameraEstimate>>(new Map());
  const estimateOnRef = useRef(false);
  const readToken = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const locate = useGeo(
    (lat, lng) => {
      setCenter({ lat, lng });
      setHasLocated(true);
      setMode("nearby");
      setRegion(null);
      setDistrict(null);
      setError("");
    },
    (message) => setError(message),
  );

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const image = imgRef.current;
    if (!image || !estimateOn) return;
    const observer = new ResizeObserver(() => setFrameBox(measureImage(image)));
    observer.observe(image);
    return () => observer.disconnect();
  }, [estimateOn, frameEpoch, activeKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setCameras([]);

    const params = new URLSearchParams();
    params.set("lat", String(center.lat));
    params.set("lng", String(center.lng));
    if (mode === "district" && region && district) {
      params.set("region", region);
      params.set("district", district);
    } else {
      params.set("limit", "40");
    }

    apiGet<TrafficSnapshot>(`/api/traffic?${params}`)
      .then((snap) => {
        if (cancelled) return;
        setFacets(snap.facets);
        setCameras(snap.cameras);
        setActiveKey(snap.cameras[0]?.key ?? null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || "載入失敗");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng, mode, region, district]);

  const active = useMemo(
    () => cameras.find((c) => c.key === activeKey) ?? null,
    [cameras, activeKey],
  );

  const regionFacet = facets.find((f) => f.region === region) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cameras;
    return cameras.filter(
      (c) =>
        c.description.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q) ||
        c.district.includes(query.trim()),
    );
  }, [cameras, query]);

  const mapCenter = active
    ? { lat: active.lat, lng: active.lng }
    : cameras[0]
      ? { lat: cameras[0].lat, lng: cameras[0].lng }
      : center;

  const readFrame = async (image: HTMLImageElement, key: string) => {
    const token = ++readToken.current;
    if (image.naturalWidth < 32 || image.naturalHeight < 32) return;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, SAMPLE_W, SAMPLE_H);
    const pixels = ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data;
    if (isPlaceholderFrame(pixels)) {
      framesRef.current.delete(key);
      boxFramesRef.current.delete(key);
      setEstimate({
        key,
        status: "need_previous",
        level: "unknown",
        cause: "unknown",
        probability: null,
        boxes: [],
        debug: emptyDebug(),
        summary: "這個鏡頭暫時沒有路況畫面。",
      });
      return;
    }
    const gray = grayFromRgba(pixels, SAMPLE_W, SAMPLE_H);
    const prevGray = framesRef.current.get(key);
    const current = () => token === readToken.current && estimateOnRef.current;

    let yoloBoxes: VehicleBox[] | null = null;
    let yoloCounts = { candidates: 0, afterSize: 0 };
    try {
      if (!vehicleModelReady()) {
        setEstimate((currentEstimate) =>
          currentEstimate?.key === key && currentEstimate.boxes.length
            ? currentEstimate
            : {
                key,
                status: "need_previous",
                level: "unknown",
                cause: "unknown",
                probability: null,
                boxes: [],
                debug: emptyDebug(),
                summary: "正在載入車輛模型，第一次會下載約 3MB。",
              },
        );
      }
      const detected = await detectVehicles(image, key);
      if (!current()) return;
      yoloBoxes = detected.boxes;
      yoloCounts = { candidates: detected.candidates, afterSize: detected.afterSize };
    } catch (error) {
      console.warn("Vehicle model unavailable, using contour fallback.", error);
      yoloBoxes = null;
    }
    if (!current()) return;

    framesRef.current.set(key, gray);
    if (framesRef.current.size > 12) {
      const oldest = framesRef.current.keys().next().value;
      if (oldest && oldest !== key) framesRef.current.delete(oldest);
    }

    if (yoloBoxes) {
      const prevBoxes = boxFramesRef.current.get(key);
      boxFramesRef.current.set(key, yoloBoxes);
      const unchanged = Boolean(prevGray && meanAbsDiff(prevGray, gray) < 2.2);
      const prior = readyRef.current.get(key);
      if (!prevBoxes || !prevGray || (unchanged && !prior)) {
        setEstimate({
          key,
          status: "need_previous",
          level: "unknown",
          cause: "unknown",
          probability: null,
          boxes: yoloBoxes,
          lowSample: yoloBoxes.length > 0 && yoloBoxes.length < MIN_SAMPLE_VEHICLES,
          debug: {
            ...emptyDebug(),
            candidates: yoloCounts.candidates,
            afterSize: yoloCounts.afterSize,
            drawn: yoloBoxes.length,
            vehicleCount: yoloBoxes.length,
            engine: "yolo",
          },
          summary: yoloBoxes.length
            ? sampleSummary("已用車輛模型框出車輛。下一張快拍會計塞車機率。", yoloBoxes.length)
            : "模型未見車輛。下一張快拍再計。",
        });
        return;
      }
      if (unchanged && prior) {
        setEstimate({
          ...prior,
          status: "unchanged",
          boxes: yoloBoxes,
          lowSample: yoloBoxes.length > 0 && yoloBoxes.length < MIN_SAMPLE_VEHICLES,
          debug: {
            ...prior.debug,
            candidates: yoloCounts.candidates,
            afterSize: yoloCounts.afterSize,
            drawn: yoloBoxes.length,
            engine: "yolo",
          },
        });
        return;
      }
      const next = compareVehicleBoxes(prevBoxes, yoloBoxes, yoloCounts);
      const reading = { ...next, key };
      if (next.probability != null) readyRef.current.set(key, reading);
      setEstimate(reading);
      return;
    }

    if (!prevGray) {
      const outlined = outlineVehicles(gray, SAMPLE_W, SAMPLE_H, pixels, key);
      setEstimate({
        key,
        status: "need_previous",
        level: "unknown",
        cause: "unknown",
        probability: null,
        boxes: outlined.boxes,
        debug: outlined.debug,
        summary: outlined.boxes.length
          ? "模型未載入，暫時用輪廓框車。下一張快拍再計。"
          : "已收第一張快拍。下一張更新後就會計塞車機率。",
      });
      return;
    }

    const next = compareSnapshots(prevGray, gray, SAMPLE_W, SAMPLE_H, pixels, key);
    if (next.status === "unchanged") {
      const prior = readyRef.current.get(key);
      setEstimate(
        prior
          ? { ...prior, status: "unchanged", boxes: next.boxes, debug: next.debug }
          : { ...next, key },
      );
      return;
    }

    const reading = { ...next, key };
    if (next.status === "ready" && next.probability != null) readyRef.current.set(key, reading);
    setEstimate(reading);
  };

  const toggleEstimate = () => {
    const next = !estimateOnRef.current;
    estimateOnRef.current = next;
    setEstimateOn(next);
    if (!next) {
      readToken.current += 1;
      setEstimate(null);
      return;
    }
    const image = imgRef.current;
    if (image?.complete && active) readFrame(image, active.key);
  };

  const pickRegion = (next: string) => {
    setMode("district");
    setRegion(next);
    const facet = facets.find((f) => f.region === next);
    const firstDistrict = facet?.districts[0]?.district ?? null;
    setDistrict(firstDistrict);
    setQuery("");
  };

  const pickNearby = () => {
    setMode("nearby");
    setRegion(null);
    setDistrict(null);
    setQuery("");
  };

  return (
    <AppShell>
      <div className="mb-4 space-y-3">
        {mode === "nearby" ? <LocationOffBanner label="附近鏡頭" /> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pickNearby}
            className={`rounded-full px-3 py-1.5 text-sm ${
              mode === "nearby"
                ? "bg-amber/20 text-amber"
                : "border border-line text-muted hover:text-ink"
            }`}
          >
            附近鏡頭
          </button>
          {facets.map((f) => (
            <button
              key={f.region}
              type="button"
              onClick={() => pickRegion(f.region)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                mode === "district" && region === f.region
                  ? "bg-amber/20 text-amber"
                  : "border border-line text-muted hover:text-ink"
              }`}
            >
              {f.region}
              <span className="ml-1 font-mono text-[11px] opacity-70">{f.count}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={locate}
            className="ml-auto rounded-xl border border-line px-3 py-1.5 text-sm text-muted hover:text-ink"
          >
            {hasLocated ? "更新位置" : "使用我的位置"}
          </button>
        </div>

        {mode === "district" && regionFacet ? (
          <div className="flex flex-wrap gap-2">
            {regionFacet.districts.map((d) => (
              <button
                key={d.district}
                type="button"
                onClick={() => {
                  setDistrict(d.district);
                  setQuery("");
                }}
                className={`rounded-lg border px-2.5 py-1 text-xs ${
                  district === d.district
                    ? "border-amber/50 bg-amber/15 text-ink"
                    : "border-line text-muted hover:border-amber/30 hover:text-ink"
                }`}
              >
                {d.district}
                <span className="ml-1 font-mono opacity-70">{d.count}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted">
            顯示距離你較近嘅運輸署快拍。想睇全港：先揀港島／九龍／新界，再揀行政區。
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋鏡頭名稱或編號…"
            className="min-w-[12rem] flex-1 rounded-xl border border-line bg-card px-3 py-2 text-sm outline-none focus:border-amber/50"
          />
          <p className="text-xs text-muted">
            {loading
              ? "載入中…"
              : mode === "district" && district
                ? `${district} · ${filtered.length} 個鏡頭`
                : `附近 ${filtered.length} 個鏡頭`}
          </p>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose">{error}</p> : null}

      {loading && !cameras.length ? (
        <ListSkeleton rows={6} map />
      ) : (
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          {active ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  key={`${active.key}-${tick}`}
                  src={`${active.imageUrl}&t=${tick}`}
                  alt={active.description}
                  className="aspect-video w-full bg-black object-cover"
                  onLoad={(event) => {
                    setFrameBox(measureImage(event.currentTarget));
                    setFrameEpoch((n) => n + 1);
                    if (!estimateOnRef.current) return;
                    readFrame(event.currentTarget, active.key);
                  }}
                />
                {estimateOn && estimate?.key === active.key ? (
                  <CongestionOverlay epoch={frameEpoch} frame={frameBox} estimate={estimate} />
                ) : null}
              </div>
              <div className="p-3">
                <div className="text-sm leading-snug">{active.description}</div>
                <div className="mt-1 text-xs text-muted">
                  {active.region} · {active.district}
                  {active.distanceMeters != null ? ` · ${formatDistance(active.distanceMeters)}` : ""}
                  <span className="ml-2 font-mono opacity-70">{active.key}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-card p-6 text-sm text-muted">
              呢個範圍暫時冇鏡頭。
            </div>
          )}

          <MapPanel>
            <NearbyMapDynamic
              lat={mapCenter.lat}
              lng={mapCenter.lng}
              zoom={mode === "district" ? 12 : 13}
              fitAllPoints={cameras.length > 1}
              selectedId={active?.key}
              onSelect={(p) => setActiveKey(p.id)}
              heightClass="h-64 sm:h-80"
              points={cameras.map((c) => ({
                id: c.key,
                name: c.description,
                lat: c.lat,
                lng: c.lng,
                detail: `${c.district}${c.distanceMeters != null ? ` · ${formatDistance(c.distanceMeters)}` : ""}`,
              }))}
            />
          </MapPanel>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-2">
          <button
            type="button"
            aria-pressed={estimateOn}
            onClick={toggleEstimate}
            className={`shrink-0 rounded-2xl px-3 py-3 text-left shadow-sm ${
              estimateOn
                ? "border border-lime/60 bg-lime/20 text-ink"
                : "bg-amber text-[#1c1404] hover:brightness-105"
            }`}
          >
            <span className="text-sm font-semibold">{estimateOn ? "關閉塞車估算" : "開啟塞車估算"}</span>
            <span className={`mt-0.5 block text-[11px] ${estimateOn ? "text-muted" : "text-[#1c1404]/75"}`}>
              {estimateOn ? "再撳一下，綠框同百分比會收起" : "撳呢度，畫面就會框住車輛並顯示塞車機率"}
            </span>
          </button>
        <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-card p-2">
          {filtered.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted">冇符合嘅鏡頭</p>
          ) : null}
          {filtered.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setActiveKey(c.key)}
              className={`w-full rounded-lg px-3 py-2.5 text-left transition ${
                active?.key === c.key ? "bg-amber/15" : "hover:bg-ink/5"
              }`}
            >
              <div className="text-sm leading-snug">{c.description}</div>
              <div className="mt-0.5 text-xs text-muted">
                {c.district}
                {c.distanceMeters != null ? ` · ${formatDistance(c.distanceMeters)}` : ""}
                <span className="ml-2 font-mono opacity-60">{c.key}</span>
              </div>
            </button>
          ))}
        </div>
        </div>
      </div>
      )}
    </AppShell>
  );
}

type FrameBox = { cw: number; ch: number; nw: number; nh: number };

function measureImage(image: HTMLImageElement): FrameBox {
  return {
    cw: image.clientWidth,
    ch: image.clientHeight,
    nw: image.naturalWidth,
    nh: image.naturalHeight,
  };
}

function CongestionOverlay({
  frame,
  epoch,
  estimate,
}: {
  frame: FrameBox | null;
  epoch: number;
  estimate: CameraEstimate;
}) {
  const boxes = frame ? placeBoxes(frame, estimate.boxes) : [];
  const cause = estimate.cause;
  const causeClass =
    cause === "incident" ? "text-rose" : cause === "signal" ? "text-amber" : cause === "flowing" ? "text-lime" : "text-white";
  const percent = estimate.probability != null ? `${Math.round(estimate.probability * 100)}%` : "—";

  return (
    <div className="pointer-events-none absolute inset-0">
      {boxes.map((box, index) => (
        <div
          key={`${epoch}-${index}`}
          className="absolute rounded-sm border-2 border-lime shadow-[0_0_0_1px_rgba(0,0,0,0.55)]"
          style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
        />
      ))}
      <div className="absolute left-2 top-2 max-w-[min(100%-1rem,18rem)] rounded-lg bg-black/75 px-2.5 py-1.5 text-white shadow-lg">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-base font-semibold">{percent}</span>
          <span className={`text-sm font-medium ${causeClass}`}>{CAUSE_LABEL[cause]}</span>
          {estimate.lowSample && estimate.probability != null ? (
            <span className="text-[11px] font-medium text-amber">樣本少</span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-white/80">{estimate.summary}</p>
        {process.env.NODE_ENV === "development" && estimate.debug ? (
          <p className="mt-0.5 font-mono text-[10px] leading-snug text-white/55">
            候選 {estimate.debug.candidates} → 尺寸 {estimate.debug.afterSize} → 畫出 {estimate.debug.drawn}
            {estimate.debug.engine === "yolo" ? " · 模型" : estimate.debug.engine === "contour" ? " · 輪廓" : ""}
            {estimate.debug.stoppedRatio != null
              ? ` · 停 ${Math.round(estimate.debug.stoppedRatio * 100)}% · 位移 ${estimate.debug.meanShiftPx?.toFixed(1)}px`
              : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function emptyDebug(): DetectionDebug {
  return {
    candidates: 0,
    afterSize: 0,
    drawn: 0,
    vehicleCount: 0,
    stoppedCount: 0,
    stoppedRatio: null,
    meanShiftPx: null,
    flowRatio: null,
  };
}

function sampleSummary(summary: string, count: number) {
  if (count <= 0 || count >= MIN_SAMPLE_VEHICLES) return summary;
  return `偵測樣本少，估算僅供參考。${summary}`;
}

function meanAbsDiff(prev: Uint8Array, curr: Uint8Array) {
  if (prev.length !== curr.length || prev.length === 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let i = 0; i < prev.length; i++) sum += Math.abs(prev[i] - curr[i]);
  return sum / prev.length;
}

function placeBoxes(frame: FrameBox, boxes: VehicleBox[]) {
  const { cw, ch, nw, nh } = frame;
  if (!cw || !ch || !nw || !nh) return [];
  const scale = Math.max(cw / nw, ch / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  return boxes
    .map((box) => ({
      left: ox + box.x * dw,
      top: oy + box.y * dh,
      width: box.w * dw,
      height: box.h * dh,
    }))
    .filter(
      (box) =>
        box.width >= 8 &&
        box.height >= 8 &&
        box.left < cw &&
        box.top < ch &&
        box.left + box.width > 0 &&
        box.top + box.height > 0,
    );
}
