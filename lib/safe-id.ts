/** Reject path-traversal / open-proxy style segments before they hit upstream URLs. */

const SAFE_TOKEN = /^[A-Za-z0-9._-]{1,48}$/;
const SAFE_ROUTE = /^[A-Za-z0-9]{1,16}$/;
const SAFE_NUMERIC = /^[0-9]{1,12}$/;

export class BadInputError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "BadInputError";
  }
}

function deny(label: string): never {
  throw new BadInputError(`無效的${label}`);
}

export function safeToken(value: string, label = "參數"): string {
  const v = value.trim();
  if (!v || !SAFE_TOKEN.test(v) || v.includes("..")) deny(label);
  return v;
}

export function safeRouteCode(value: string, label = "路線"): string {
  const v = value.trim().toUpperCase();
  if (!v || !SAFE_ROUTE.test(v)) deny(label);
  return v;
}

export function safeNumericId(value: string, label = "編號"): string {
  const v = value.trim();
  if (!v || !SAFE_NUMERIC.test(v)) deny(label);
  return v;
}

export function safeBound(value: string): "O" | "I" {
  const v = value.trim().toUpperCase();
  if (v === "I" || v === "INBOUND") return "I";
  return "O";
}

export function safeServiceType(value: string): string {
  const v = value.trim();
  if (!SAFE_NUMERIC.test(v) || Number(v) < 1 || Number(v) > 99) deny("服務類型");
  return v;
}

export function parseIdList(raw: string | null, max: number, label = "編號"): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    out.push(safeToken(t, label));
    if (out.length >= max) break;
  }
  return out;
}
