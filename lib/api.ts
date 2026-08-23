import { NextResponse } from "next/server";

export function jsonOk(data: unknown, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: true, data, ...extra });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function num(value: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
