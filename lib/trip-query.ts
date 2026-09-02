import { resolveTripPlace } from "@/lib/static/hk-places";

/** 短地名先當行程；長英文句入面嘅 "to" 唔好當去邊度（避免 LLM 問題誤觸） */
function isPlausiblePlaceToken(s: string) {
  const t = s.trim();
  if (!t || t.length > 36) return false;
  if (/[,:;!?]/.test(t)) return false;
  if (/\n/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  // 明顯科技／抽象詞 → 唔係香港行程
  if (
    /\b(embedding|embeddings|transformer|token|tokens|matrix|llm|gpt|model|models|python|gpu|neural|attention|api|vector|vectors|dataset|pytorch|tensorflow)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

/** Parse chat-style queries:「東涌去何文田」「從逸東邨到羅湖」「Tung Chung to Lo Wu」 */
export function parseTripQuery(raw: string): { from: string; to: string } | null {
  const text = raw
    .trim()
    .replace(/[？?！!。．.]+$/g, "")
    .replace(/^(請問|唔該|幫我|我想|我想去|點樣由|點由|如何由|如何從)/, "")
    .trim();
  if (!text) return null;

  // 英文 "A to B"：兩邊都要似短地名（唔好吞整句英文）
  const en = text.match(/^(.+?)\s+to\s+(.+)$/i);
  if (en) {
    const from = en[1].trim();
    const to = en[2].trim();
    if (from && to && isPlausiblePlaceToken(from) && isPlausiblePlaceToken(to)) {
      return { from, to };
    }
  }

  const arrow = text.match(/^(.+?)\s*(?:→|->|➜)\s*(.+)$/);
  if (arrow) {
    const from = arrow[1].trim();
    const to = arrow[2].trim();
    if (from && to && isPlausiblePlaceToken(from) && isPlausiblePlaceToken(to)) {
      return { from, to };
    }
  }

  const zh = text.match(/^(?:從|由)?(.+?)(?:去到|去|到|至|往)\s*(.+)$/);
  if (zh) {
    const from = zh[1].trim();
    const to = zh[2].trim();
    if (
      from &&
      to &&
      from !== to &&
      isPlausiblePlaceToken(from) &&
      isPlausiblePlaceToken(to)
    ) {
      return { from, to };
    }
  }

  return null;
}

export function canResolveTripPair(from: string, to: string) {
  return Boolean(resolveTripPlace(from) && resolveTripPlace(to));
}

/** 係咪真正問香港點去（畀意圖分類後再把關） */
export function isLikelyTransitTripQuery(userText: string, from: string, to: string) {
  if (!isPlausiblePlaceToken(from) || !isPlausiblePlaceToken(to)) return false;
  if (canResolveTripPair(from, to)) return true;
  // 至少一邊似香港地名／站名，或者句中有搭車語境
  const placeish =
    /[\u4e00-\u9fff]/.test(from + to) ||
    /\b(estate|station|hospital|mall|airport|hong kong|kowloon|nt|island)\b/i.test(
      `${from} ${to}`,
    );
  const transitCue =
    /(點去|點樣去|點搭|點轉|搭車|巴士|港鐵|小巴|去邊|去哪|怎麼去|怎么去|how (?:do i |to )?get|route to)\b/i.test(
      userText,
    );
  return placeish || transitCue;
}
