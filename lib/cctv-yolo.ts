import {
  centerInRoad,
  detectCropsFor,
  type DetectCrop,
  type VehicleBox,
} from "@/lib/cctv-congestion";

/**
 * Quantized YOLOv10n (COCO). Fetched only after congestion estimation is turned on.
 * The graph is exported at 640. A larger inputSize would not match this file.
 * Distant cars on a 320×240 still are recovered by CAMERA_DETECT_CROPS, which
 * scales a road window up to this same 640 input.
 */
export const VEHICLE_DETECTOR = {
  modelUrl: "/models/yolov10n.onnx",
  inputSize: 640,
  /**
   * Below this the box is dropped.
   * On a 320×240 tunnel approach the queued cars often score 0.10–0.18, under a 0.30 cutoff.
   */
  scoreMin: 0.1,
  /** Width and height as a fraction of the full frame. Zoomed tiles make far cars smaller than 0.006. */
  minBoxFraction: 0.004,
  maxBoxFraction: 0.85,
  maxBoxes: 48,
  /** Overlap above this merges the full-frame pass with a road-crop pass. */
  mergeIou: 0.45,
} as const;

/** COCO: car, bus, truck. People, lights and signs are ignored. */
const VEHICLE_CLASS = new Set([2, 5, 7]);

type Ort = typeof import("onnxruntime-web/wasm");
type Session = import("onnxruntime-web").InferenceSession;

let sessionPromise: Promise<Session> | null = null;
let ready = false;

export type VehicleDetection = {
  boxes: VehicleBox[];
  /** Vehicle-class rows at or above scoreMin, before the size rule. */
  candidates: number;
  /** Rows that also passed the min/max box size. */
  afterSize: number;
};

export function vehicleModelReady() {
  return ready;
}

async function loadSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort: Ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(VEHICLE_DETECTOR.modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      ready = true;
      return session;
    })();
    sessionPromise.catch(() => {
      sessionPromise = null;
      ready = false;
    });
  }
  return sessionPromise;
}

/** Vehicle boxes as fractions of the camera frame. Throws if the model cannot run. */
export async function detectVehicles(image: HTMLImageElement, cameraKey?: string): Promise<VehicleDetection> {
  if (typeof window === "undefined") return { boxes: [], candidates: 0, afterSize: 0 };
  const ort: Ort = await import("onnxruntime-web/wasm");
  const session = await loadSession();
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  if (!inputName || !outputName) return { boxes: [], candidates: 0, afterSize: 0 };

  const passes: Array<{ sx: number; sy: number; sw: number; sh: number; fx: number; fy: number; fw: number; fh: number }> = [
    { sx: 0, sy: 0, sw: image.naturalWidth, sh: image.naturalHeight, fx: 0, fy: 0, fw: 1, fh: 1 },
    ...detectCropsFor(cameraKey).map((crop) => cropPixels(image, crop)),
  ];

  let candidates = 0;
  let afterSize = 0;
  const boxes: VehicleBox[] = [];
  for (const pass of passes) {
    const { tensor, resizedW, resizedH } = renderInput(image, pass.sx, pass.sy, pass.sw, pass.sh);
    const outputs = await session.run({
      [inputName]: new ort.Tensor("float32", tensor, [1, 3, VEHICLE_DETECTOR.inputSize, VEHICLE_DETECTOR.inputSize]),
    });
    const output = outputs[outputName];
    if (!output) continue;
    const parsed = boxesFromOutput(output.data as Float32Array, output.dims, resizedW, resizedH, pass);
    candidates += parsed.candidates;
    afterSize += parsed.afterSize;
    boxes.push(...parsed.boxes);
  }

  const merged = mergeOverlaps(boxes, VEHICLE_DETECTOR.mergeIou);
  const onRoad = merged.filter((box) => centerInRoad(box.x + box.w / 2, box.y + box.h / 2, cameraKey));
  onRoad.sort((a, b) => a.y - b.y || a.w * a.h - b.w * b.h);
  return { boxes: onRoad.slice(0, VEHICLE_DETECTOR.maxBoxes), candidates, afterSize };
}

function cropPixels(image: HTMLImageElement, crop: DetectCrop) {
  const x = clamp01(crop.x);
  const y = clamp01(crop.y);
  const fw = Math.min(1 - x, Math.max(0.05, crop.w));
  const fh = Math.min(1 - y, Math.max(0.05, crop.h));
  return {
    sx: Math.round(x * image.naturalWidth),
    sy: Math.round(y * image.naturalHeight),
    sw: Math.max(1, Math.round(fw * image.naturalWidth)),
    sh: Math.max(1, Math.round(fh * image.naturalHeight)),
    fx: x,
    fy: y,
    fw,
    fh,
  };
}

function renderInput(image: HTMLImageElement, sx: number, sy: number, sw: number, sh: number) {
  const size = VEHICLE_DETECTOR.inputSize;
  const scale = size / Math.max(sw, sh);
  const resizedW = Math.max(1, Math.round(sw * scale));
  const resizedH = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, resizedW, resizedH);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  const tensor = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    tensor[i] = pixels[i * 4] / 255;
    tensor[plane + i] = pixels[i * 4 + 1] / 255;
    tensor[plane * 2 + i] = pixels[i * 4 + 2] / 255;
  }
  return { tensor, resizedW, resizedH };
}

function boxesFromOutput(
  data: Float32Array,
  dims: readonly number[],
  resizedW: number,
  resizedH: number,
  frame: { fx: number; fy: number; fw: number; fh: number },
) {
  const rows = detectionRows(data, dims);
  const boxes: VehicleBox[] = [];
  let candidates = 0;
  for (const row of rows) {
    const [x1, y1, x2, y2, score, classId] = row;
    if (score < VEHICLE_DETECTOR.scoreMin || !VEHICLE_CLASS.has(Math.round(classId))) continue;
    candidates++;
    const pixel = Math.max(x2, y2) > 2;
    const width = pixel ? resizedW : 1;
    const height = pixel ? resizedH : 1;
    const x = frame.fx + (x1 / width) * frame.fw;
    const y = frame.fy + (y1 / height) * frame.fh;
    const w = ((x2 - x1) / width) * frame.fw;
    const h = ((y2 - y1) / height) * frame.fh;
    if (w < VEHICLE_DETECTOR.minBoxFraction || h < VEHICLE_DETECTOR.minBoxFraction) continue;
    if (w > VEHICLE_DETECTOR.maxBoxFraction || h > VEHICLE_DETECTOR.maxBoxFraction) continue;
    if (x < -0.05 || y < -0.05 || x + w > 1.05 || y + h > 1.05) continue;
    boxes.push({
      x: clamp01(x),
      y: clamp01(y),
      w: Math.min(1 - clamp01(x), w),
      h: Math.min(1 - clamp01(y), h),
      stopped: false,
    });
  }
  return { boxes, candidates, afterSize: boxes.length };
}

function mergeOverlaps(boxes: VehicleBox[], iouLimit: number) {
  const kept: VehicleBox[] = [];
  const sorted = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h);
  for (const box of sorted) {
    if (kept.some((other) => boxIou(box, other) >= iouLimit)) continue;
    kept.push(box);
  }
  return kept;
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

function detectionRows(data: Float32Array, dims: readonly number[]) {
  if (dims.length === 3 && dims[2] === 6) {
    const count = dims[1];
    return Array.from({ length: count }, (_, index) => data.slice(index * 6, index * 6 + 6));
  }
  if (dims.length === 3 && dims[1] === 6) {
    const count = dims[2];
    return Array.from({ length: count }, (_, index) =>
      Float32Array.from({ length: 6 }, (_, channel) => data[channel * count + index]),
    );
  }
  return [];
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
