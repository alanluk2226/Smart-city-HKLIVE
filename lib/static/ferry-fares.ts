/**
 * Light fare hints for ferry legs (運輸署／營辦商公佈，2026-04 參考).
 * Prefer weekday single; holidays / deluxe / government concessions may differ.
 */
export type FerryVesselType = "fast" | "ordinary" | "unknown";

export type FerryTicketRow = {
  role: string;
  fare: string;
};

export type FerryFareHint = {
  /** Compact one-line adult fare summary (legacy / fallback) */
  label: string;
  /** Short weekday adult fare for「下一班」; may vary by vessel */
  short?: string;
  shortOrdinary?: string;
  shortFast?: string;
  /** Expanded ticket-type breakdown */
  tickets?: FerryTicketRow[];
  ticketNote?: string;
};

const CONCESSION_NOTE =
  "平日單程參考；假日較高。合資格長者／殘疾人士用樂悠咭或指定八達通或另享政府優惠；以閘機為準。";

const BY_LEG: Record<string, FerryFareHint> = {
  "star-central-tst": {
    label: "平日成人約 $4–$5（假日較高）",
    short: "約 $4–$5",
    tickets: [
      { role: "成人", fare: "平日上層 $5 · 下層 $4" },
      { role: "小童 3–11 歲", fare: "平日上層 $2.9 · 下層 $2.8" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: "假日較高。長者／殘疾人士優惠以天星及政府計劃為準。",
  },
  "star-tst-central": {
    label: "平日成人約 $4–$5（假日較高）",
    short: "約 $4–$5",
    tickets: [
      { role: "成人", fare: "平日上層 $5 · 下層 $4" },
      { role: "小童 3–11 歲", fare: "平日上層 $2.9 · 下層 $2.8" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: "假日較高。長者／殘疾人士優惠以天星及政府計劃為準。",
  },
  "star-tst-wanchai": {
    label: "平日成人 $5 · 假日 $6.5",
    short: "約 $5",
    tickets: [
      { role: "成人", fare: "平日 $5 · 假日 $6.5" },
      { role: "小童 3–11 歲", fare: "平日 $2.9 · 假日 $3.9" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: "長者／殘疾人士優惠以天星及政府計劃為準。",
  },
  "star-wc-tst": {
    label: "平日成人 $5 · 假日 $6.5",
    short: "約 $5",
    tickets: [
      { role: "成人", fare: "平日 $5 · 假日 $6.5" },
      { role: "小童 3–11 歲", fare: "平日 $2.9 · 假日 $3.9" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: "長者／殘疾人士優惠以天星及政府計劃為準。",
  },
  "sun-cecc": {
    label: "平日普通位 $16.7 · 高速船 $32.9",
    shortOrdinary: "約 $16.7",
    shortFast: "約 $32.9",
    short: "約 $16.7–$32.9",
    tickets: [
      { role: "成人", fare: "普通 $16.7 · 高速 $32.9" },
      { role: "小童 3–11 歲", fare: "普通 $8.3 · 高速 $16.4" },
      { role: "長者 65+", fare: "普通 $8.3 · 高速 $16.4" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: `${CONCESSION_NOTE} 普通船豪華位另議。`,
  },
  "sun-ccce": {
    label: "平日普通位 $16.7 · 高速船 $32.9",
    shortOrdinary: "約 $16.7",
    shortFast: "約 $32.9",
    short: "約 $16.7–$32.9",
    tickets: [
      { role: "成人", fare: "普通 $16.7 · 高速 $32.9" },
      { role: "小童 3–11 歲", fare: "普通 $8.3 · 高速 $16.4" },
      { role: "長者 65+", fare: "普通 $8.3 · 高速 $16.4" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: `${CONCESSION_NOTE} 普通船豪華位另議。`,
  },
  "sun-cemw": {
    label: "平日成人 $33.5 · 假日 $48.5",
    short: "約 $33.5",
    tickets: [
      { role: "成人", fare: "平日 $33.5 · 假日 $48.5" },
      { role: "小童 3–11 歲", fare: "平日 $16.7 · 假日 $24.2" },
      { role: "長者 65+", fare: "平日 $16.7 · 假日 $24.2" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
  "sun-mwce": {
    label: "平日成人 $33.5 · 假日 $48.5",
    short: "約 $33.5",
    tickets: [
      { role: "成人", fare: "平日 $33.5 · 假日 $48.5" },
      { role: "小童 3–11 歲", fare: "平日 $16.7 · 假日 $24.2" },
      { role: "長者 65+", fare: "平日 $16.7 · 假日 $24.2" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
  "sun-nphh": {
    label: "成人 $10",
    short: "約 $10",
    tickets: [
      { role: "成人", fare: "$10" },
      { role: "小童 3–11 歲", fare: "$5" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: "長者／殘疾人士優惠以營辦商及政府計劃為準。",
  },
  "sun-hhnp": {
    label: "成人 $10",
    short: "約 $10",
    tickets: [
      { role: "成人", fare: "$10" },
      { role: "小童 3–11 歲", fare: "$5" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: "長者／殘疾人士優惠以營辦商及政府計劃為準。",
  },
  "hkkf-ysk-out": {
    label: "平日成人 $24.9 · 假日 $34.7",
    short: "約 $24.9",
    tickets: [
      { role: "成人", fare: "平日 $24.9 · 假日 $34.7" },
      { role: "小童 3–11 歲", fare: "平日 $12.4 · 假日 $17.3" },
      { role: "長者 65+", fare: "平日 $12.4 · 假日 $17.3" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
  "hkkf-ysk-in": {
    label: "平日成人 $24.9 · 假日 $34.7",
    short: "約 $24.9",
    tickets: [
      { role: "成人", fare: "平日 $24.9 · 假日 $34.7" },
      { role: "小童 3–11 歲", fare: "平日 $12.4 · 假日 $17.3" },
      { role: "長者 65+", fare: "平日 $12.4 · 假日 $17.3" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
  "hkkf-skw-out": {
    label: "平日成人 $30.9 · 假日 $43.5",
    short: "約 $30.9",
    tickets: [
      { role: "成人", fare: "平日 $30.9 · 假日 $43.5" },
      { role: "小童 3–11 歲", fare: "平日 $15.4 · 假日 $21.7" },
      { role: "長者 65+", fare: "平日 $15.4 · 假日 $21.7" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
  "hkkf-skw-in": {
    label: "平日成人 $30.9 · 假日 $43.5",
    short: "約 $30.9",
    tickets: [
      { role: "成人", fare: "平日 $30.9 · 假日 $43.5" },
      { role: "小童 3–11 歲", fare: "平日 $15.4 · 假日 $21.7" },
      { role: "長者 65+", fare: "平日 $15.4 · 假日 $21.7" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
  "hkkf-pc-out": {
    label: "平日成人 $31.9 · 假日 $46.6",
    short: "約 $31.9",
    tickets: [
      { role: "成人", fare: "平日 $31.9 · 假日 $46.6" },
      { role: "小童 3–11 歲", fare: "平日 $15.9 · 假日 $23.3" },
      { role: "長者 65+", fare: "平日 $15.9 · 假日 $23.3" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
  "hkkf-pc-in": {
    label: "平日成人 $31.9 · 假日 $46.6",
    short: "約 $31.9",
    tickets: [
      { role: "成人", fare: "平日 $31.9 · 假日 $46.6" },
      { role: "小童 3–11 歲", fare: "平日 $15.9 · 假日 $23.3" },
      { role: "長者 65+", fare: "平日 $15.9 · 假日 $23.3" },
      { role: "3 歲以下", fare: "免費（成人陪同）" },
    ],
    ticketNote: CONCESSION_NOTE,
  },
};

export function ferryFareHint(legId: string): FerryFareHint | null {
  return BY_LEG[legId] ?? null;
}

/** One-line weekday adult fare for next-departure cards. */
export function ferryFareShort(
  legId: string,
  vesselType: FerryVesselType = "unknown",
): string | null {
  const hint = BY_LEG[legId];
  if (!hint) return null;
  if (vesselType === "fast" && hint.shortFast) return hint.shortFast;
  if (vesselType === "ordinary" && hint.shortOrdinary) return hint.shortOrdinary;
  return hint.short ?? hint.label;
}
