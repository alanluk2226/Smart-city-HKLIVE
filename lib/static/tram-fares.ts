/** Hong Kong Tramways flat fares (Octopus / electronic). Update when operator revises. */
export const TRAM_FARES = {
  adult: 3.3,
  child: 1.6,
  elderly: 1.5,
  note: "全程劃一 · 後上前落繳費 · 以香港電車公佈為準",
} as const;

export function formatTramFareLine(): string {
  const { adult, child, elderly } = TRAM_FARES;
  return `成人 $${adult.toFixed(1)} · 小童 $${child.toFixed(1)} · 長者 $${elderly.toFixed(1)}`;
}
