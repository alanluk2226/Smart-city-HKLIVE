/**
 * Jam estimate from two Transport Department CCTV stills.
 *
 * Boxes prefer a YOLOv10n ONNX detector. This contour path is the fallback when
 * that model cannot load: local contrast inside a road ROI, then shape filters.
 * Frame subtraction is not used to draw boxes.
 */

export type CongestionStatus = "need_previous" | "unchanged" | "ready";
export type CongestionLevel = "clear" | "slow" | "jam" | "unknown";
/** signal = queued in one direction, like a red light. incident = scattered or piled up. */
export type JamCause = "signal" | "incident" | "flowing" | "unknown";

export type VehicleBox = {
  /** Fractions of the full camera frame, before object-fit cropping. */
  x: number;
  y: number;
  w: number;
  h: number;
  stopped: boolean;
};

/** Counts from one frame, so a before/after tune can be compared in the overlay. */
export type DetectionDebug = {
  /** Components left after open/close, before the vehicle shape rules. */
  candidates: number;
  /** Components that were a plausible vehicle size. */
  afterSize: number;
  /** Boxes actually drawn. */
  drawn: number;
  vehicleCount: number;
  stoppedCount: number;
  /** stoppedCount / vehicleCount. Null until a second, different snapshot exists. */
  stoppedRatio: number | null;
  /** Mean movement of matched vehicles, in the 160×90 sample. Null on the first frame. */
  meanShiftPx: number | null;
  /** Share of current vehicles with no match in the previous frame. */
  flowRatio: number | null;
  /** Which box source produced this reading. */
  engine?: "yolo" | "contour";
};

export type CongestionEstimate = {
  status: CongestionStatus;
  level: CongestionLevel;
  cause: JamCause;
  /** 0–1. Null until two different snapshots have been compared. */
  probability: number | null;
  summary: string;
  boxes: VehicleBox[];
  debug: DetectionDebug;
  /** True when too few boxes were drawn to treat the percentage as a firm reading. */
  lowSample?: boolean;
  /** True when the percentage comes from this still alone, before a second snapshot. */
  preliminary?: boolean;
};

type Blob = {
  cx: number;
  cy: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Road polygon in fractions of the full snapshot (0–1), clockwise.
 * Edit these when a fixed camera includes sidewalks, buildings, or the
 * opposite carriageway. Points outside the polygon are never boxed.
 */
export type RoiPoint = { x: number; y: number };

/** Used when a camera key has no entry in CAMERA_ROAD_ROI. */
export const DEFAULT_ROAD_ROI: RoiPoint[] = [
  { x: 0.05, y: 0.24 },
  { x: 0.95, y: 0.24 },
  { x: 0.98, y: 0.9 },
  { x: 0.02, y: 0.9 },
];

/**
 * Per-camera road masks. Keys are Transport Department camera ids.
 * A box is kept only when its center lies inside the polygon, so a flyover
 * or the opposite carriageway can be left outside.
 * K107F looks down the Cross Harbour Tunnel approach. The right-hand ramp and
 * the upper buildings are outside this polygon; the queued approach stays in.
 */
export const CAMERA_ROAD_ROI: Record<string, RoiPoint[]> = {
  K107F: [
    { x: 0.05, y: 0.46 },
    { x: 0.14, y: 0.28 },
    { x: 0.34, y: 0.22 },
    { x: 0.55, y: 0.24 },
    { x: 0.66, y: 0.4 },
    { x: 0.62, y: 0.7 },
    { x: 0.5, y: 0.88 },
    { x: 0.03, y: 0.88 },
  ],
  // Looks along the carriageway, so the road fills the frame. The default
  // band was cutting off the nearest and farthest vehicles the model had found.
  AID01111: [
    { x: -0.02, y: -0.02 },
    { x: 1.02, y: -0.02 },
    { x: 1.02, y: 1.02 },
    { x: -0.02, y: 1.02 },
  ],
};

/** A window of the frame, in the same 0–1 coordinates as the road polygon. */
export type DetectCrop = { x: number; y: number; w: number; h: number };

/**
 * Extra detector windows. Each one is scaled up to the model input so a
 * distant queue is not a handful of pixels. Full-frame detection still runs.
 */
export const CAMERA_DETECT_CROPS: Record<string, DetectCrop[]> = {
  // Three overlapping windows down the approach. One wide crop still leaves
  // the middle of the queue only a few pixels tall.
  K107F: [
    { x: 0.16, y: 0.2, w: 0.34, h: 0.26 },
    { x: 0.06, y: 0.36, w: 0.4, h: 0.26 },
    { x: 0.04, y: 0.52, w: 0.46, h: 0.3 },
  ],
};

export function detectCropsFor(cameraKey?: string): DetectCrop[] {
  if (!cameraKey) return [];
  return CAMERA_DETECT_CROPS[cameraKey] ?? [];
}

/** Fewer drawn vehicles than this cannot firmly call a jam or free flow. */
export const MIN_SAMPLE_VEHICLES = 8;
/** Drawn vehicles that fill a typical tunnel approach. Density saturates here. */
const QUEUE_VEHICLE_COUNT = 12;
/** Matched boxes required before movement can call the scene flowing. */
const MIN_TRACKED_FOR_MOTION = 3;

/** A matched vehicle that moved less than this (sample pixels) counts as stopped. */
const STOPPED_MATCH_PX = 8;
/** How many vehicles are required before the stopped ratio can reach a full jam score. */
const MIN_VEHICLES_FOR_FULL_SCORE = 4;
/** Weight of “share of vehicles that did not leave their spot”. */
const WEIGHT_STOPPED = 0.7;
/** Weight of “matched vehicles barely moved”. */
const WEIGHT_STILLNESS = 0.3;
/** Mean absolute difference below this means the JPEG has not changed. */
const UNCHANGED_MEAN_DIFF = 2.2;
const NIGHT_MEAN_LUM = 32;
const SHAKE_MOTION_RATIO = 0.28;
const MOTION_PIXEL_DELTA = 22;

const VEHICLE_LIMITS = {
  minArea: 22,
  maxArea: 1100,
  minW: 5,
  minH: 4,
  maxW: 58,
  maxH: 36,
  maxAspect: 2.8,
  minFill: 0.28,
};

export function isPlaceholderFrame(rgba: Uint8ClampedArray): boolean {
  let yellow = 0;
  let n = 0;
  for (let i = 0; i < rgba.length; i += 32) {
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    n++;
    if (r > 170 && g > 140 && b < 100 && r + g > b * 3) yellow++;
  }
  return n > 0 && yellow / n > 0.5;
}

export function grayFromRgba(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    gray[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
  }
  return gray;
}

export function roadRoiFor(cameraKey?: string): RoiPoint[] {
  if (cameraKey && CAMERA_ROAD_ROI[cameraKey]) return CAMERA_ROAD_ROI[cameraKey];
  return DEFAULT_ROAD_ROI;
}

export function outlineVehicles(
  gray: Uint8Array,
  width: number,
  height: number,
  rgba?: Uint8ClampedArray,
  cameraKey?: string,
): { boxes: VehicleBox[]; debug: DetectionDebug } {
  const found = findVehicles(gray, width, height, rgba, cameraKey);
  return {
    boxes: toBoxes(found.blobs, width, height, found.blobs.map(() => false)),
    debug: {
      candidates: found.candidates,
      afterSize: found.afterSize,
      drawn: found.blobs.length,
      vehicleCount: found.blobs.length,
      stoppedCount: 0,
      stoppedRatio: null,
      meanShiftPx: null,
      flowRatio: null,
    },
  };
}

export function compareSnapshots(
  prev: Uint8Array,
  curr: Uint8Array,
  width: number,
  height: number,
  rgba?: Uint8ClampedArray,
  cameraKey?: string,
): CongestionEstimate {
  if (prev.length !== curr.length || prev.length !== width * height || width < 16 || height < 16) {
    return emptyEstimate("need_previous", "畫面尺寸未對齊，等下一張快拍再估算。");
  }

  const roi = roadRoiFor(cameraKey);
  const preparedPrev = prepareFrame(prev, width, height);
  const preparedCurr = prepareFrame(curr, width, height);
  const motion = frameMotion(preparedPrev, preparedCurr, width, height, roi);
  if (motion.samples === 0) return emptyEstimate("need_previous", "讀唔到可用畫面。");

  const current = findVehicles(curr, width, height, rgba, cameraKey);
  const previous = findVehicles(prev, width, height, undefined, cameraKey);
  const matched = matchMotion(previous.blobs, current.blobs);
  const boxes = toBoxes(current.blobs, width, height, matched.stopped);
  const debug = debugOf(current, matched);

  if (motion.meanDiff < UNCHANGED_MEAN_DIFF) {
    return {
      status: "unchanged",
      level: "unknown",
      cause: "unknown",
      probability: null,
      summary: "運輸署未出新快拍，暫時沿用上次估算。",
      boxes,
      debug,
    };
  }

  if (motion.meanLum < NIGHT_MEAN_LUM || motion.motionRatio > SHAKE_MOTION_RATIO) {
    return {
      status: "ready",
      level: "unknown",
      cause: "unknown",
      probability: null,
      summary:
        motion.meanLum < NIGHT_MEAN_LUM
          ? "畫面太暗，未能可靠分辨車輛。"
          : "成幅畫面變化好大，可能受雨、反光或鏡頭晃動影響。",
      boxes,
      debug,
    };
  }

  const probability = jamProbability(matched);
  const cause = classifyCause(current.blobs.filter((_, index) => matched.stopped[index]), matched);
  const level = levelFrom(probability, cause);
  return {
    status: "ready",
    level,
    cause,
    probability,
    summary: summaryFor(cause, matched.vehicleCount),
    boxes,
    debug,
  };
}

function emptyEstimate(status: CongestionStatus, summary: string): CongestionEstimate {
  return {
    status,
    level: "unknown",
    cause: "unknown",
    probability: null,
    summary,
    boxes: [],
    debug: {
      candidates: 0,
      afterSize: 0,
      drawn: 0,
      vehicleCount: 0,
      stoppedCount: 0,
      stoppedRatio: null,
      meanShiftPx: null,
      flowRatio: null,
    },
  };
}

function debugOf(
  current: { candidates: number; afterSize: number; blobs: Blob[] },
  matched: MotionMatch,
): DetectionDebug {
  return {
    candidates: current.candidates,
    afterSize: current.afterSize,
    drawn: current.blobs.length,
    vehicleCount: matched.vehicleCount,
    stoppedCount: matched.stoppedCount,
    stoppedRatio: matched.stoppedRatio,
    meanShiftPx: matched.meanShiftPx,
    flowRatio: matched.flowRatio,
    engine: "contour",
  };
}

type MotionMatch = {
  stopped: boolean[];
  vehicleCount: number;
  stoppedCount: number;
  stoppedRatio: number;
  meanShiftPx: number;
  flowRatio: number;
};

/**
 * Jam score is not the box count or the boxed area.
 * support: too few vehicles cannot look like a jam.
 * stoppedRatio: share that stayed within STOPPED_MATCH_PX.
 * stillness: 1 when matched vehicles did not move, 0 when they moved a full match radius.
 */
function jamProbability(matched: MotionMatch) {
  if (matched.vehicleCount === 0) return 0.08;
  const support = clamp(matched.vehicleCount / MIN_VEHICLES_FOR_FULL_SCORE, 0, 1);
  const stillness = 1 - clamp(matched.meanShiftPx / STOPPED_MATCH_PX, 0, 1);
  const raw = support * (WEIGHT_STOPPED * matched.stoppedRatio + WEIGHT_STILLNESS * stillness);
  return roundProb(raw);
}

function levelFrom(probability: number, cause: JamCause): CongestionLevel {
  if (cause === "incident") return "jam";
  if (probability >= 0.55) return "jam";
  if (probability >= 0.32) return "slow";
  return "clear";
}

function summaryFor(cause: JamCause, vehicleCount: number) {
  if (vehicleCount === 0) return "路面少見車輛輪廓，暫時似暢通。";
  if (cause === "incident") return "停低嘅車散開或者疊埋一齊，較似意外或路障，唔似正常燈位排隊。";
  if (cause === "signal") return "車輛沿同一方向排住停低，較似等紅綠燈，未見打橫阻塞。";
  if (cause === "flowing") return "車輛位置郁得明顯，暫時未似塞車。";
  return "未見大量停低車輛。";
}

function classifyCause(stable: Blob[], matched: MotionMatch): JamCause {
  if (matched.vehicleCount === 0) return "unknown";
  if (matched.flowRatio >= 0.6) return "flowing";
  if (matched.stoppedRatio < 0.45) return "unknown";
  if (stable.length < 2) return "signal";
  const { alignment } = queueShape(stable);
  return alignment >= 0.62 ? "signal" : "incident";
}

function prepareFrame(gray: Uint8Array, width: number, height: number) {
  return clahe(gaussianBlur(gray, width, height), width, height);
}

function findVehicles(
  gray: Uint8Array,
  width: number,
  height: number,
  rgba: Uint8ClampedArray | undefined,
  cameraKey: string | undefined,
) {
  if (gray.length !== width * height || width < 16 || height < 16) {
    return { blobs: [] as Blob[], candidates: 0, afterSize: 0 };
  }
  const roi = roiMask(width, height, roadRoiFor(cameraKey));
  // Boxes use the raw grayscale. Blur and CLAHE stay on the frame-diff path:
  // blurring here washes the small cars into the road, and CLAHE then removes
  // the local contrast the boxes depend on.
  let mask = contrastMask(gray, width, height, roi, 8, -12, 22);
  suppressSmall(mask, width, height, 12);
  const closed = close3(mask, width, height);
  const beforeClose = components(mask, width, height, VEHICLE_LIMITS);
  const afterClose = components(closed, width, height, VEHICLE_LIMITS);
  const colorSized = rgba
    ? components(suppressSmall(colorContrastMask(rgba, width, height, roi, 14, 96), width, height, 18), width, height, VEHICLE_LIMITS)
    : [];
  const sized = mergeOverlaps([
    ...afterClose,
    ...beforeClose.filter((blob) => !afterClose.some((kept) => containsCenter(kept, blob))),
    ...colorSized.filter((blob) => ![...afterClose, ...beforeClose].some((kept) => containsCenter(kept, blob) || containsCenter(blob, kept))),
  ]);
  const blobs = sized.filter((blob) => looksLikeVehicle(gray, width, blob, rgba, roi));
  return { blobs, candidates: componentCount(mask, width, height) + colorSized.length, afterSize: sized.length };
}

function frameMotion(prev: Uint8Array, curr: Uint8Array, width: number, height: number, roi: RoiPoint[]) {
  let diffSum = 0;
  let motion = 0;
  let lum = 0;
  let samples = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!pointInPolygon(x, y, roi, width, height)) continue;
      const i = y * width + x;
      const delta = Math.abs(prev[i] - curr[i]);
      diffSum += delta;
      lum += curr[i];
      if (delta > MOTION_PIXEL_DELTA) motion++;
      samples++;
    }
  }
  return {
    samples,
    meanDiff: samples ? diffSum / samples : 0,
    motionRatio: samples ? motion / samples : 0,
    meanLum: samples ? lum / samples : 0,
  };
}

function matchMotion(prev: Blob[], curr: Blob[]): MotionMatch {
  const used = new Array<boolean>(prev.length).fill(false);
  const stopped = curr.map((blob) => {
    let best = -1;
    let bestDist = STOPPED_MATCH_PX * STOPPED_MATCH_PX;
    for (let i = 0; i < prev.length; i++) {
      if (used[i]) continue;
      const dx = blob.cx - prev[i].cx;
      const dy = blob.cy - prev[i].cy;
      const dist = dx * dx + dy * dy;
      if (dist <= bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    if (best < 0) return false;
    used[best] = true;
    return true;
  });
  let shiftSum = 0;
  let matched = 0;
  curr.forEach((blob, index) => {
    if (!stopped[index]) return;
    let nearest = STOPPED_MATCH_PX;
    for (const earlier of prev) {
      const dist = Math.hypot(blob.cx - earlier.cx, blob.cy - earlier.cy);
      if (dist < nearest) nearest = dist;
    }
    shiftSum += nearest;
    matched++;
  });
  const vehicleCount = curr.length;
  const stoppedCount = stopped.filter(Boolean).length;
  const stoppedRatio = vehicleCount === 0 ? 0 : stoppedCount / vehicleCount;
  return {
    stopped,
    vehicleCount,
    stoppedCount,
    stoppedRatio,
    meanShiftPx: matched === 0 ? STOPPED_MATCH_PX : shiftSum / matched,
    flowRatio: vehicleCount === 0 ? 1 : 1 - stoppedRatio,
  };
}

function gaussianBlur(src: Uint8Array, width: number, height: number) {
  const kernel = [1, 4, 6, 4, 1];
  const horizontal = new Uint8Array(src.length);
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const xx = Math.min(width - 1, Math.max(0, x + k));
        sum += src[y * width + xx] * kernel[k + 2];
      }
      horizontal[y * width + x] = sum >> 4;
    }
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) {
        const yy = Math.min(height - 1, Math.max(0, y + k));
        sum += horizontal[yy * width + x] * kernel[k + 2];
      }
      dst[y * width + x] = sum >> 4;
    }
  }
  return dst;
}

/** Tile-wise contrast stretch. Flattens cloud shadows without amplifying a single global histogram. */
function clahe(src: Uint8Array, width: number, height: number) {
  const tilesX = 4;
  const tilesY = 4;
  const clip = 2.2;
  const tileW = width / tilesX;
  const tileH = height / tilesY;
  const cdfs: Float32Array[] = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Float32Array(256);
      const x0 = Math.floor(tx * tileW);
      const y0 = Math.floor(ty * tileH);
      const x1 = Math.min(width, Math.floor((tx + 1) * tileW));
      const y1 = Math.min(height, Math.floor((ty + 1) * tileH));
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[src[y * width + x]]++;
          count++;
        }
      }
      const limit = Math.max(1, (clip * count) / 256);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > limit) {
          excess += hist[i] - limit;
          hist[i] = limit;
        }
      }
      const bonus = excess / 256;
      const cdf = new Float32Array(256);
      let acc = 0;
      for (let i = 0; i < 256; i++) {
        hist[i] += bonus;
        acc += hist[i];
        cdf[i] = count ? (acc / count) * 255 : i;
      }
      cdfs.push(cdf);
    }
  }
  const dst = new Uint8Array(src.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fx = x / tileW - 0.5;
      const fy = y / tileH - 0.5;
      const tx0 = clamp(Math.floor(fx), 0, tilesX - 1);
      const ty0 = clamp(Math.floor(fy), 0, tilesY - 1);
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const ty1 = Math.min(tilesY - 1, ty0 + 1);
      const ax = clamp(fx - tx0, 0, 1);
      const ay = clamp(fy - ty0, 0, 1);
      const value = src[y * width + x];
      const top = cdfs[ty0 * tilesX + tx0][value] * (1 - ax) + cdfs[ty0 * tilesX + tx1][value] * ax;
      const bottom = cdfs[ty1 * tilesX + tx0][value] * (1 - ax) + cdfs[ty1 * tilesX + tx1][value] * ax;
      dst[y * width + x] = top * (1 - ay) + bottom * ay;
    }
  }
  return dst;
}

function roiMask(width: number, height: number, polygon: RoiPoint[]) {
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pointInPolygon(x, y, polygon, width, height)) mask[y * width + x] = 1;
    }
  }
  return mask;
}

function pointInPolygon(x: number, y: number, polygon: RoiPoint[], width: number, height: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].y * height;
    const yj = polygon[j].y * height;
    const xi = polygon[i].x * width;
    const xj = polygon[j].x * width;
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-6) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function contrastMask(
  gray: Uint8Array,
  width: number,
  height: number,
  roi: Uint8Array,
  radius: number,
  darkDelta: number,
  lightDelta: number,
) {
  const integral = integralImage(gray, width, height);
  const stride = width + 1;
  const mask = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!roi[index]) continue;
      const x0 = Math.max(0, x - radius);
      const y0 = Math.max(0, y - radius);
      const x1 = Math.min(width - 1, x + radius);
      const y1 = Math.min(height - 1, y + radius);
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const local = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
      const value = gray[index];
      if (value < local + darkDelta || value > local + lightDelta) mask[index] = 1;
    }
  }
  return mask;
}

function colorContrastMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  roi: Uint8Array,
  radius: number,
  delta: number,
) {
  const stride = width + 1;
  const red = new Int32Array(stride * (height + 1));
  const green = new Int32Array(stride * (height + 1));
  const blue = new Int32Array(stride * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowR = 0;
    let rowG = 0;
    let rowB = 0;
    for (let x = 1; x <= width; x++) {
      const pixel = ((y - 1) * width + (x - 1)) * 4;
      rowR += rgba[pixel] ?? 0;
      rowG += rgba[pixel + 1] ?? 0;
      rowB += rgba[pixel + 2] ?? 0;
      const here = y * stride + x;
      const above = (y - 1) * stride + x;
      red[here] = red[above] + rowR;
      green[here] = green[above] + rowG;
      blue[here] = blue[above] + rowB;
    }
  }
  const mask = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!roi[index]) continue;
      const x0 = Math.max(0, x - radius);
      const y0 = Math.max(0, y - radius);
      const x1 = Math.min(width - 1, x + radius);
      const y1 = Math.min(height - 1, y + radius);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const a = y0 * stride + x0;
      const b = y0 * stride + (x1 + 1);
      const c = (y1 + 1) * stride + x0;
      const d = (y1 + 1) * stride + (x1 + 1);
      const pixel = index * 4;
      const distance =
        Math.abs((rgba[pixel] ?? 0) - (red[d] - red[b] - red[c] + red[a]) / count) +
        Math.abs((rgba[pixel + 1] ?? 0) - (green[d] - green[b] - green[c] + green[a]) / count) +
        Math.abs((rgba[pixel + 2] ?? 0) - (blue[d] - blue[b] - blue[c] + blue[a]) / count);
      if (distance > delta) mask[index] = 1;
    }
  }
  return mask;
}

function suppressSmall(mask: Uint8Array, width: number, height: number, minArea: number) {
  const seen = new Uint8Array(mask.length);
  const stack: number[] = [];
  const pixels: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    pixels.length = 0;
    while (stack.length) {
      const p = stack.pop() as number;
      pixels.push(p);
      const x = p % width;
      const y = (p / width) | 0;
      if (x > 0) push(p - 1);
      if (x + 1 < width) push(p + 1);
      if (y > 0) push(p - width);
      if (y + 1 < height) push(p + width);
    }
    if (pixels.length < minArea) {
      for (const p of pixels) mask[p] = 0;
    }
  }

  function push(index: number) {
    if (!mask[index] || seen[index]) return;
    seen[index] = 1;
    stack.push(index);
  }
  return mask;
}

function containsCenter(outer: Blob, inner: Blob) {
  return inner.cx >= outer.minX && inner.cx <= outer.maxX && inner.cy >= outer.minY && inner.cy <= outer.maxY;
}

function close3(src: Uint8Array, width: number, height: number) {
  return erode3(dilate3(src, width, height), width, height);
}

function erode3(src: Uint8Array, width: number, height: number) {
  const dst = new Uint8Array(src.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (src[i] && src[i - 1] && src[i + 1] && src[i - width] && src[i + width]) dst[i] = 1;
    }
  }
  return dst;
}

function dilate3(src: Uint8Array, width: number, height: number) {
  const dst = new Uint8Array(src.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (src[i] || src[i - 1] || src[i + 1] || src[i - width] || src[i + width]) dst[i] = 1;
    }
  }
  return dst;
}

type BlobLimits = {
  minArea: number;
  maxArea: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  maxAspect: number;
  minFill: number;
};

function components(mask: Uint8Array, width: number, height: number, limits: BlobLimits) {
  return walkComponents(mask, width, height, (blob, area, bw, bh) => {
    const fill = area / (bw * bh);
    const aspect = Math.max(bw, bh) / Math.min(bw, bh);
    if (area < limits.minArea || area > limits.maxArea) return false;
    if (bw < limits.minW || bh < limits.minH || bw > limits.maxW || bh > limits.maxH) return false;
    if (aspect > limits.maxAspect || fill < limits.minFill) return false;
    return Boolean(blob);
  });
}

function componentCount(mask: Uint8Array, width: number, height: number) {
  return walkComponents(mask, width, height, (_blob, area) => area >= 8).length;
}

function walkComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  keep: (blob: Blob, area: number, bw: number, bh: number) => boolean,
) {
  const seen = new Uint8Array(mask.length);
  const blobs: Blob[] = [];
  const stack: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.push(start);
    seen[start] = 1;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sx = 0;
    let sy = 0;
    while (stack.length) {
      const p = stack.pop() as number;
      const x = p % width;
      const y = (p / width) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (x > 0) push(p - 1);
      if (x + 1 < width) push(p + 1);
      if (y > 0) push(p - width);
      if (y + 1 < height) push(p + width);
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const blob = { cx: sx / area, cy: sy / area, minX, minY, maxX, maxY };
    if (keep(blob, area, bw, bh)) blobs.push(blob);
  }
  return blobs;

  function push(index: number) {
    if (!mask[index] || seen[index]) return;
    seen[index] = 1;
    stack.push(index);
  }
}

function looksLikeVehicle(
  gray: Uint8Array,
  width: number,
  blob: Blob,
  rgba: Uint8ClampedArray | undefined,
  roi: Uint8Array,
) {
  const bw = blob.maxX - blob.minX + 1;
  const bh = blob.maxY - blob.minY + 1;
  if (bh > bw * 1.4) return false;
  if (bw > bh * 3.2 && bh < 10) return false;
  if (bw < 16 && (blob.minX < width * 0.05 || blob.maxX > width * 0.94)) return false;
  if (roiCoverage(roi, width, blob) < 0.7) return false;
  if (!standsOut(gray, width, blob)) return false;
  if (isRegularStripe(gray, width, blob)) return false;
  if (isRoadPaint(gray, width, blob)) return false;
  if (rgba && isYellowRoad(rgba, width, blob)) return false;
  if (interiorStd(gray, width, blob) < 8) return false;
  return true;
}

function standsOut(gray: Uint8Array, width: number, blob: Blob) {
  let inside = 0;
  let insideCount = 0;
  for (let y = blob.minY; y <= blob.maxY; y++) {
    for (let x = blob.minX; x <= blob.maxX; x++) {
      inside += gray[y * width + x];
      insideCount++;
    }
  }
  let outside = 0;
  let outsideCount = 0;
  const y0 = Math.max(0, blob.minY - 4);
  const y1 = Math.min((gray.length / width) - 1, blob.maxY + 4);
  const x0 = Math.max(0, blob.minX - 4);
  const x1 = Math.min(width - 1, blob.maxX + 4);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= blob.minX && x <= blob.maxX && y >= blob.minY && y <= blob.maxY) continue;
      outside += gray[y * width + x];
      outsideCount++;
    }
  }
  if (!insideCount || !outsideCount) return false;
  return Math.abs(inside / insideCount - outside / outsideCount) >= 12;
}

function roiCoverage(roi: Uint8Array, width: number, blob: Blob) {
  let inside = 0;
  let count = 0;
  for (let y = blob.minY; y <= blob.maxY; y++) {
    for (let x = blob.minX; x <= blob.maxX; x++) {
      count++;
      if (roi[y * width + x]) inside++;
    }
  }
  return count ? inside / count : 0;
}

function mergeOverlaps(blobs: Blob[]) {
  const used = new Array<boolean>(blobs.length).fill(false);
  const merged: Blob[] = [];
  for (let i = 0; i < blobs.length; i++) {
    if (used[i]) continue;
    let minX = blobs[i].minX;
    let minY = blobs[i].minY;
    let maxX = blobs[i].maxX;
    let maxY = blobs[i].maxY;
    let cx = blobs[i].cx;
    let cy = blobs[i].cy;
    let count = 1;
    used[i] = true;
    for (let j = i + 1; j < blobs.length; j++) {
      if (used[j] || boxOverlap(blobs[i], blobs[j]) < 0.5) continue;
      used[j] = true;
      minX = Math.min(minX, blobs[j].minX);
      minY = Math.min(minY, blobs[j].minY);
      maxX = Math.max(maxX, blobs[j].maxX);
      maxY = Math.max(maxY, blobs[j].maxY);
      cx += blobs[j].cx;
      cy += blobs[j].cy;
      count++;
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (bw > VEHICLE_LIMITS.maxW || bh > VEHICLE_LIMITS.maxH || bw * bh > VEHICLE_LIMITS.maxArea) continue;
    merged.push({ cx: cx / count, cy: cy / count, minX, minY, maxX, maxY });
  }
  return merged;
}

function boxOverlap(a: Blob, b: Blob) {
  const width = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) + 1;
  const height = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY) + 1;
  if (width <= 0 || height <= 0) return 0;
  const inter = width * height;
  const areaA = (a.maxX - a.minX + 1) * (a.maxY - a.minY + 1);
  const areaB = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
  return inter / Math.min(areaA, areaB);
}

function toBoxes(blobs: Blob[], width: number, height: number, stopped: boolean[]): VehicleBox[] {
  return blobs
    .map((blob, index) => ({
      x: blob.minX / width,
      y: blob.minY / height,
      w: (blob.maxX - blob.minX + 1) / width,
      h: (blob.maxY - blob.minY + 1) / height,
      stopped: stopped[index] ?? false,
    }))
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .slice(0, 12);
}

function isRegularStripe(gray: Uint8Array, width: number, blob: Blob) {
  return regularStripes(lineMeans(gray, width, blob, "row")) || regularStripes(lineMeans(gray, width, blob, "col"));
}

function lineMeans(gray: Uint8Array, width: number, blob: Blob, axis: "row" | "col") {
  const means: number[] = [];
  if (axis === "row") {
    const span = blob.maxX - blob.minX + 1;
    for (let y = blob.minY; y <= blob.maxY; y++) {
      let sum = 0;
      for (let x = blob.minX; x <= blob.maxX; x++) sum += gray[y * width + x];
      means.push(sum / span);
    }
  } else {
    const span = blob.maxY - blob.minY + 1;
    for (let x = blob.minX; x <= blob.maxX; x++) {
      let sum = 0;
      for (let y = blob.minY; y <= blob.maxY; y++) sum += gray[y * width + x];
      means.push(sum / span);
    }
  }
  return means;
}

function regularStripes(means: number[]) {
  if (means.length < 6) return false;
  const average = means.reduce((sum, value) => sum + value, 0) / means.length;
  const peaks: number[] = [];
  for (let i = 1; i < means.length - 1; i++) {
    if (means[i] >= means[i - 1] && means[i] >= means[i + 1] && means[i] > average + 8) peaks.push(i);
  }
  if (peaks.length < 3) return false;
  const gaps: number[] = [];
  for (let i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
  const meanGap = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
  let variance = 0;
  for (const gap of gaps) variance += (gap - meanGap) ** 2;
  return meanGap <= 7 && Math.sqrt(variance / gaps.length) / meanGap < 0.55;
}

function isYellowRoad(rgba: Uint8ClampedArray, width: number, blob: Blob) {
  let yellow = 0;
  let count = 0;
  for (let y = blob.minY; y <= blob.maxY; y++) {
    for (let x = blob.minX; x <= blob.maxX; x++) {
      const i = (y * width + x) * 4;
      const r = rgba[i] ?? 0;
      const g = rgba[i + 1] ?? 0;
      const b = rgba[i + 2] ?? 0;
      count++;
      if (r > 145 && g > 120 && b < 155 && g > b + 25 && r > b + 30) yellow++;
    }
  }
  return count > 0 && yellow / count > 0.12;
}

function isRoadPaint(gray: Uint8Array, width: number, blob: Blob) {
  let bright = 0;
  let rest = 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = blob.minY; y <= blob.maxY; y++) {
    for (let x = blob.minX; x <= blob.maxX; x++) {
      const value = gray[y * width + x];
      count++;
      if (value > 185) bright++;
      else {
        rest++;
        sum += value;
        sumSq += value * value;
      }
    }
  }
  if (!count || rest < 8) return false;
  const mean = sum / rest;
  const restStd = Math.sqrt(Math.max(0, sumSq / rest - mean * mean));
  return restStd < 16 && bright / count > 0.05 && bright / count < 0.42;
}

function interiorStd(gray: Uint8Array, width: number, blob: Blob) {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = blob.minY; y <= blob.maxY; y++) {
    for (let x = blob.minX; x <= blob.maxX; x++) {
      const value = gray[y * width + x];
      sum += value;
      sumSq += value * value;
      count++;
    }
  }
  if (!count) return 0;
  const mean = sum / count;
  return Math.sqrt(Math.max(0, sumSq / count - mean * mean));
}

function integralImage(gray: Uint8Array, width: number, height: number) {
  const integral = new Int32Array((width + 1) * (height + 1));
  const stride = width + 1;
  for (let y = 1; y <= height; y++) {
    let row = 0;
    for (let x = 1; x <= width; x++) {
      row += gray[(y - 1) * width + (x - 1)];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
    }
  }
  return integral;
}

function queueShape(blobs: Blob[]) {
  let mx = 0;
  let my = 0;
  for (const blob of blobs) {
    mx += blob.cx;
    my += blob.cy;
  }
  mx /= blobs.length;
  my /= blobs.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const blob of blobs) {
    const dx = blob.cx - mx;
    const dy = blob.cy - my;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const half = (xx + yy) / 2;
  const det = xx * yy - xy * xy;
  const root = Math.sqrt(Math.max(0, half * half - det));
  const major = half + root;
  const minor = Math.max(0, half - root);
  const alignment = major <= 1e-6 ? 0 : 1 - minor / major;
  return { alignment };
}

function roundProb(value: number) {
  return Math.round(clamp(value, 0.05, 0.9) * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function centerInRoad(x: number, y: number, cameraKey?: string) {
  return pointInPolygon(x, y, roadRoiFor(cameraKey), 1, 1);
}

const BOX_MATCH_IOU = 0.2;
const BOX_STOPPED_IOU = 0.4;

/**
 * Jam score from detector boxes.
 * density: how full the road looks, from the drawn vehicle count.
 * hold: among boxes matched to the previous frame, how many barely moved.
 * Unmatched boxes are treated as flicker, not as proof the traffic is moving.
 * Below MIN_SAMPLE_VEHICLES the score is pulled toward uncertain.
 */
function jamFromVehicleSample(matched: BoxMotion) {
  const count = matched.vehicleCount;
  const lowSample = count < MIN_SAMPLE_VEHICLES;
  if (count === 0) return { probability: 0.08, lowSample: true };
  const density = clamp(count / QUEUE_VEHICLE_COUNT, 0, 1);
  const hold = matched.trackedCount === 0 ? 0.5 : matched.stoppedCount / matched.trackedCount;
  const stillness =
    matched.trackedCount === 0 ? 0.5 : 1 - clamp(matched.meanShiftPx / STOPPED_MATCH_PX, 0, 1);
  const motion = WEIGHT_STOPPED * hold + WEIGHT_STILLNESS * stillness;
  const flowing =
    matched.trackedCount >= MIN_TRACKED_FOR_MOTION &&
    hold < 0.35 &&
    matched.meanShiftPx > STOPPED_MATCH_PX * 0.75;
  let raw = flowing ? motion * (1 - 0.35 * density) : 0.55 * density + 0.45 * motion;
  if (lowSample) {
    const trust = count / MIN_SAMPLE_VEHICLES;
    raw = raw * trust + 0.45 * (1 - trust);
  }
  return { probability: roundProb(raw), lowSample };
}

function classifyBoxCause(stable: Blob[], matched: BoxMotion): JamCause {
  if (matched.trackedCount < MIN_TRACKED_FOR_MOTION) return "unknown";
  const hold = matched.stoppedCount / matched.trackedCount;
  if (hold < 0.35 && matched.meanShiftPx > STOPPED_MATCH_PX * 0.75) return "flowing";
  if (hold < 0.45) return "unknown";
  if (stable.length < 2) return "signal";
  return queueShape(stable).alignment >= 0.62 ? "signal" : "incident";
}

function boxSummary(cause: JamCause, count: number, lowSample: boolean) {
  const body =
    count === 0
      ? "路面未見車輛。"
      : cause === "incident"
        ? "停低嘅車散開或者疊埋一齊，較似意外或路障，唔似正常燈位排隊。"
        : cause === "signal"
          ? "車輛沿同一方向排住停低，較似等紅綠燈，未見打橫阻塞。"
          : cause === "flowing"
            ? "車輛位置郁得明顯，暫時未似塞車。"
            : "車輛位置未夠穩，未能判斷係燈位定意外。";
  return lowSample ? `偵測樣本少，估算僅供參考。${body}` : body;
}

/**
 * First look from the vehicles in this still. Movement is unknown until the
 * next snapshot, so the score follows how full the road looks.
 */
export function estimateCurrentVehicles(
  boxes: VehicleBox[],
  counts?: { candidates: number; afterSize: number },
  engine: DetectionDebug["engine"] = "yolo",
): CongestionEstimate {
  const count = boxes.length;
  const lowSample = count > 0 && count < MIN_SAMPLE_VEHICLES;
  const density = clamp(count / QUEUE_VEHICLE_COUNT, 0, 1);
  let probability = count === 0 ? 0.08 : roundProb(0.1 + 0.72 * density);
  if (lowSample) {
    const trust = count / MIN_SAMPLE_VEHICLES;
    probability = roundProb(probability * trust + 0.28 * (1 - trust));
  }
  const aligned =
    count >= 4 &&
    queueShape(
      boxes.map((box) => ({
        cx: (box.x + box.w / 2) * 160,
        cy: (box.y + box.h / 2) * 90,
        minX: box.x * 160,
        minY: box.y * 90,
        maxX: (box.x + box.w) * 160,
        maxY: (box.y + box.h) * 90,
      })),
    ).alignment >= 0.62;
  const summary =
    count === 0
      ? "呢張快拍未見車輛，暫時似暢通。下一張會再對比。"
      : count >= MIN_SAMPLE_VEHICLES && aligned
        ? "依呢張快拍，車輛排成一條龍，睇落似塞。下一張會再對比係咪停低。"
        : count >= MIN_SAMPLE_VEHICLES
          ? "依呢張快拍車輛幾多，睇落有機會塞。下一張會再對比。"
          : "依呢張快拍車輛唔多，暫時未似塞車。下一張會再對比。偵測樣本少，估算僅供參考。";
  return {
    status: "ready",
    level: count === 0 ? "clear" : levelFrom(probability, "unknown"),
    cause: "unknown",
    probability,
    lowSample,
    preliminary: true,
    summary,
    boxes,
    debug: {
      candidates: counts?.candidates ?? count,
      afterSize: counts?.afterSize ?? count,
      drawn: count,
      vehicleCount: count,
      stoppedCount: 0,
      stoppedRatio: null,
      meanShiftPx: null,
      flowRatio: null,
      engine,
    },
  };
}

/** Jam score from detector boxes. A high IoU means the same vehicle is still there. */
export function compareVehicleBoxes(
  prev: VehicleBox[],
  curr: VehicleBox[],
  counts?: { candidates: number; afterSize: number },
): CongestionEstimate {
  const matched = matchVehicleBoxes(prev, curr);
  const { probability, lowSample } = jamFromVehicleSample(matched);
  const stable = curr.filter((_, index) => matched.stopped[index]);
  const cause = classifyBoxCause(
    stable.map((box) => ({
      cx: (box.x + box.w / 2) * 160,
      cy: (box.y + box.h / 2) * 90,
      minX: box.x * 160,
      minY: box.y * 90,
      maxX: (box.x + box.w) * 160,
      maxY: (box.y + box.h) * 90,
    })),
    matched,
  );
  return {
    status: "ready",
    level: levelFrom(probability, cause),
    cause,
    probability,
    lowSample,
    summary: boxSummary(cause, matched.vehicleCount, lowSample),
    boxes: curr.map((box, index) => ({ ...box, stopped: matched.stopped[index] ?? false })),
    debug: {
      candidates: counts?.candidates ?? curr.length,
      afterSize: counts?.afterSize ?? curr.length,
      drawn: curr.length,
      vehicleCount: matched.vehicleCount,
      stoppedCount: matched.stoppedCount,
      stoppedRatio: matched.stoppedRatio,
      meanShiftPx: matched.meanShiftPx,
      flowRatio: matched.flowRatio,
      engine: "yolo",
    },
  };
}

type BoxMotion = MotionMatch & { trackedCount: number };

function matchVehicleBoxes(prev: VehicleBox[], curr: VehicleBox[]): BoxMotion {
  const used = new Array<boolean>(prev.length).fill(false);
  const shiftOf = new Array<number>(curr.length).fill(-1);
  const stopped = curr.map((box, index) => {
    let best = -1;
    let bestIou = BOX_MATCH_IOU;
    for (let i = 0; i < prev.length; i++) {
      if (used[i]) continue;
      const overlap = boxIou(box, prev[i]);
      if (overlap >= bestIou) {
        bestIou = overlap;
        best = i;
      }
    }
    if (best < 0) return false;
    used[best] = true;
    const shift = centerShiftPx(box, prev[best]);
    shiftOf[index] = shift;
    return bestIou >= BOX_STOPPED_IOU || shift <= STOPPED_MATCH_PX;
  });
  let shiftSum = 0;
  let trackedCount = 0;
  shiftOf.forEach((shift) => {
    if (shift < 0) return;
    shiftSum += shift;
    trackedCount++;
  });
  const vehicleCount = curr.length;
  const stoppedCount = stopped.filter(Boolean).length;
  const stoppedRatio = trackedCount === 0 ? 0 : stoppedCount / trackedCount;
  return {
    stopped,
    vehicleCount,
    stoppedCount,
    stoppedRatio,
    meanShiftPx: trackedCount === 0 ? STOPPED_MATCH_PX : shiftSum / trackedCount,
    flowRatio: trackedCount === 0 ? 1 : (trackedCount - stoppedCount) / trackedCount,
    trackedCount,
  };
}

function boxIou(a: VehicleBox, b: VehicleBox) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function centerShiftPx(a: VehicleBox, b: VehicleBox) {
  const dx = (a.x + a.w / 2 - (b.x + b.w / 2)) * 160;
  const dy = (a.y + a.h / 2 - (b.y + b.h / 2)) * 90;
  return Math.hypot(dx, dy);
}
