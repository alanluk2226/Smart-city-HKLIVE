/**
 * Letters that appear in GMB route codes from data.etagmb.gov.hk (/route, 570 routes).
 * Includes prefix N (e.g. N27, N4A) and suffix letters (e.g. 48M, 101M, N51S).
 */
export const GMB_ROUTE_KEYPAD_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "K",
  "M",
  "N",
  "P",
  "R",
  "S",
  "T",
  "W",
  "X",
] as const;

export type GmbRouteKeypadLetter = (typeof GMB_ROUTE_KEYPAD_LETTERS)[number];
