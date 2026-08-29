/**
 * Light adult fare hints for ferry legs (運輸署／營辦商公佈，2026-04 參考).
 * Prefer weekday Octopus single; holidays / cabin class may cost more.
 */
export type FerryFareHint = {
  /** Compact one-line adult fare summary */
  label: string;
};

const BY_LEG: Record<string, FerryFareHint> = {
  "star-central-tst": { label: "平日成人約 $4–$5（假日較高）" },
  "star-tst-central": { label: "平日成人約 $4–$5（假日較高）" },
  "star-tst-wanchai": { label: "平日成人 $5 · 假日 $6.5" },
  "star-wc-tst": { label: "平日成人 $5 · 假日 $6.5" },
  "sun-cecc": { label: "平日普通位 $16.7 · 高速船 $32.9" },
  "sun-ccce": { label: "平日普通位 $16.7 · 高速船 $32.9" },
  "sun-cemw": { label: "平日成人 $33.5 · 假日 $48.5" },
  "sun-mwce": { label: "平日成人 $33.5 · 假日 $48.5" },
  "sun-nphh": { label: "成人 $10" },
  "sun-hhnp": { label: "成人 $10" },
  "hkkf-ysk-out": { label: "平日成人 $24.9 · 假日 $34.7" },
  "hkkf-ysk-in": { label: "平日成人 $24.9 · 假日 $34.7" },
  "hkkf-skw-out": { label: "平日成人 $30.9 · 假日 $43.5" },
  "hkkf-skw-in": { label: "平日成人 $30.9 · 假日 $43.5" },
  "hkkf-pc-out": { label: "平日成人 $31.9 · 假日 $46.6" },
  "hkkf-pc-in": { label: "平日成人 $31.9 · 假日 $46.6" },
};

export function ferryFareHint(legId: string): FerryFareHint | null {
  return BY_LEG[legId] ?? null;
}
