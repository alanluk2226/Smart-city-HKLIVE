export const LRT_ROUTE_ORDER = [
  "505",
  "507",
  "610",
  "614",
  "614P",
  "615",
  "615P",
  "705",
  "706",
  "751",
  "751P",
  "761P",
] as const;

export const LRT_ROUTE_COLORS: Record<string, string> = {
  "505": "#C8102E",
  "507": "#007A33",
  "610": "#6B3A2A",
  "614": "#00A3E0",
  "614P": "#E89BB8",
  "615": "#F6C700",
  "615P": "#004B87",
  "705": "#8DC63F",
  "706": "#7A3E9D",
  "751": "#F5A81C",
  "751P": "#C47A12",
  "761P": "#4A2C6A",
};

export const LRT_ROUTE_LABELS: Record<string, string> = {
  "505": "三聖 ↔ 兆康",
  "507": "屯門碼頭 ↔ 田景",
  "610": "屯門碼頭 ↔ 元朗",
  "614": "屯門碼頭 ↔ 元朗",
  "614P": "屯門碼頭 ↔ 兆康",
  "615": "屯門碼頭 ↔ 元朗",
  "615P": "屯門碼頭 ↔ 兆康",
  "705": "天水圍循環（逆時針）",
  "706": "天水圍循環（順時針）",
  "751": "友愛 ↔ 天逸",
  "751P": "天水圍 ↔ 天逸",
  "761P": "天逸 ↔ 元朗",
};

export function lrtRouteColor(route: string) {
  return LRT_ROUTE_COLORS[route];
}

export function lrtRouteInk(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  if (!Number.isFinite(n)) return "#ffffff";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.68 ? "#071018" : "#ffffff";
}
