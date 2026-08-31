import { resolveTripPlace } from "@/lib/static/hk-places";

/** Parse chat-style queries:「東涌去何文田」「從逸東邨到羅湖」「Tung Chung to Lo Wu」 */
export function parseTripQuery(raw: string): { from: string; to: string } | null {
  const text = raw
    .trim()
    .replace(/[？?！!。．.]+$/g, "")
    .replace(/^(請問|唔該|幫我|我想|我想去|點樣由|點由|如何由|如何從)/, "")
    .trim();
  if (!text) return null;

  const en = text.match(/^(.+?)\s+to\s+(.+)$/i);
  if (en) {
    const from = en[1].trim();
    const to = en[2].trim();
    if (from && to) return { from, to };
  }

  const arrow = text.match(/^(.+?)\s*(?:→|->|➜)\s*(.+)$/);
  if (arrow) {
    const from = arrow[1].trim();
    const to = arrow[2].trim();
    if (from && to) return { from, to };
  }

  const zh = text.match(/^(?:從|由)?(.+?)(?:去到|去|到|至|往)\s*(.+)$/);
  if (zh) {
    const from = zh[1].trim();
    const to = zh[2].trim();
    if (from && to && from !== to) return { from, to };
  }

  return null;
}

export function canResolveTripPair(from: string, to: string) {
  return Boolean(resolveTripPlace(from) && resolveTripPlace(to));
}
