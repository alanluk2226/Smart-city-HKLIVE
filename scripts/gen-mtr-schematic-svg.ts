/**
 * Generate HK LIVE original blocky-tile MTR schematic (not official MTR art).
 * Style: sea + land plates + thick octolinear lines + bilingual station tiles.
 *
 * Run: npx tsx scripts/gen-mtr-schematic-svg.ts
 */
import { writeFileSync } from "fs";
import {
  MTR_LINE_COLORS,
  MTR_SCHEMATIC,
  MTR_SCHEMATIC_LINES,
  MTR_WALK_LINKS,
  mtrLineInk,
  schematicLineColor,
} from "../lib/static/mtr-schematic";
import { MTR_STATIONS } from "../lib/static/mtr-stations";

const SX = 1.65;
const SY = 1.65;
const PAD = 120;
const TILE_W = 92;
const TILE_H = 56;
const LINE_W = 22;
const FONT = "Noto Sans TC, Microsoft JhengHei, system-ui, sans-serif";

const byCode = new Map(MTR_STATIONS.map((s) => [s.code, s]));

function px(x: number) {
  return Math.round(x * SX + PAD);
}
function py(y: number) {
  return Math.round(y * SY + PAD);
}

const scaled = Object.fromEntries(
  Object.entries(MTR_SCHEMATIC).map(([code, p]) => [code, { x: px(p.x), y: py(p.y) }]),
) as Record<string, { x: number; y: number }>;

const xs = Object.values(scaled).map((p) => p.x);
const ys = Object.values(scaled).map((p) => p.y);
const W = Math.max(...xs) + PAD + 80;
const H = Math.max(...ys) + PAD + 80;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shortEn(name: string) {
  if (name.length <= 14) return name;
  return name
    .replace("Disneyland Resort", "Disneyland")
    .replace("Exhibition Centre", "Exhibition")
    .replace("East Tsim Sha Tsui", "East TST")
    .replace("AsiaWorld-Expo", "AsiaWorld")
    .replace("Hong Kong West Kowloon", "West Kowloon")
    .replace("Che Kung Temple", "Che Kung T.")
    .replace("Tiu Keng Leng", "Tiu Keng Leng")
    .slice(0, 16);
}

function tileFill(code: string): { fill: string; pattern?: string } {
  const st = byCode.get(code);
  const lines = (st?.lines ?? []).filter((l) => l !== "HSR" && MTR_LINE_COLORS[l]);
  if (!lines.length) return { fill: "#64748b" };
  if (lines.length === 1) return { fill: MTR_LINE_COLORS[lines[0]] };
  const id = `pat-${code}`;
  return { fill: `url(#${id})`, pattern: id };
}

function patternDef(code: string): string {
  const st = byCode.get(code);
  const lines = (st?.lines ?? []).filter((l) => l !== "HSR" && MTR_LINE_COLORS[l]);
  if (lines.length < 2) return "";
  const id = `pat-${code}`;
  const n = Math.min(lines.length, 4);
  const slice = TILE_W / n;
  const rects = lines
    .slice(0, n)
    .map((l, i) => `<rect x="${(i * slice).toFixed(1)}" y="0" width="${slice.toFixed(1)}" height="${TILE_H}" fill="${MTR_LINE_COLORS[l]}"/>`)
    .join("");
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${TILE_W}" height="${TILE_H}">${rects}</pattern>`;
}

function resolveScaledPath(path: (string | { x: number; y: number })[]): string {
  return path
    .map((node) => {
      if (typeof node === "string") {
        const p = scaled[node];
        return p ? `${p.x},${p.y}` : "";
      }
      return `${px(node.x)},${py(node.y)}`;
    })
    .filter(Boolean)
    .join(" ");
}

/** Soft land plates (original geometry, not traced from third-party maps). */
function landPlates(): string {
  const plates: Array<{ x: number; y: number; w: number; h: number; label: string; lx?: number; ly?: number }> = [
    { x: 40, y: 40, w: W - 80, h: Math.round(H * 0.42), label: "New Territories", lx: W * 0.42, ly: 120 },
    { x: 40, y: Math.round(H * 0.28), w: Math.round(W * 0.28), h: Math.round(H * 0.42), label: "Lantau Island", lx: 160, ly: H * 0.48 },
    { x: Math.round(W * 0.26), y: Math.round(H * 0.36), w: Math.round(W * 0.55), h: Math.round(H * 0.38), label: "Kowloon", lx: W * 0.48, ly: H * 0.52 },
    { x: Math.round(W * 0.12), y: Math.round(H * 0.68), w: Math.round(W * 0.78), h: Math.round(H * 0.28), label: "Hong Kong Island", lx: W * 0.45, ly: H * 0.9 },
  ];
  return plates
    .map(
      (p) => `<g>
  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="48" ry="48" fill="#ffffff" opacity="0.96"/>
  <text x="${Math.round(p.lx ?? p.x + p.w / 2)}" y="${Math.round(p.ly ?? p.y + p.h / 2)}" text-anchor="middle" font-family="${FONT}" font-size="42" font-weight="600" fill="#c5d0da">${esc(p.label)}</text>
</g>`,
    )
    .join("\n");
}

const patterns = Object.keys(scaled)
  .map(patternDef)
  .filter(Boolean)
  .join("\n");

const linePolys = MTR_SCHEMATIC_LINES.map((line) => {
  const pts = resolveScaledPath(line.path);
  const color = schematicLineColor(line.id);
  return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${LINE_W}" stroke-linecap="round" stroke-linejoin="round"/>`;
}).join("\n");

const walk = MTR_WALK_LINKS.filter(([a, b]) => scaled[a] && scaled[b])
  .map(([a, b]) => {
    const pa = scaled[a];
    const pb = scaled[b];
    return `<line x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}" stroke="#64748b" stroke-width="4" stroke-dasharray="10 8" opacity="0.7"/>`;
  })
  .join("\n");

const stations = Object.entries(scaled)
  .map(([code, pos]) => {
    const st = byCode.get(code);
    if (!st) return "";
    const { fill } = tileFill(code);
    const lines = (st.lines ?? []).filter((l) => l !== "HSR" && MTR_LINE_COLORS[l]);
    const ink =
      lines.length > 1
        ? "#ffffff"
        : mtrLineInk(lines[0] ? MTR_LINE_COLORS[lines[0]] : "#64748b");
    const en = shortEn(st.nameEn);
    const enSize = en.length > 12 ? 11 : 13;
    const zhSize = st.name.length >= 4 ? 15 : 17;
    const x = pos.x - TILE_W / 2;
    const y = pos.y - TILE_H / 2;
    return `<g id="st-${code}" data-code="${code}" transform="translate(${x} ${y})">
  <rect width="${TILE_W}" height="${TILE_H}" rx="10" ry="10" fill="${fill}" stroke="#1e293b" stroke-width="1.2"/>
  <text x="${TILE_W / 2}" y="24" text-anchor="middle" font-family="${FONT}" font-size="${zhSize}" font-weight="700" fill="${ink}">${esc(st.name)}</text>
  <text x="${TILE_W / 2}" y="44" text-anchor="middle" font-family="${FONT}" font-size="${enSize}" fill="${ink}" opacity="0.92">${esc(en)}</text>
</g>`;
  })
  .filter(Boolean)
  .join("\n");

const legendItems: Array<[string, string]> = [
  ["TWL", "荃灣綫"],
  ["ISL", "港島綫"],
  ["KTL", "觀塘綫"],
  ["TKL", "將軍澳綫"],
  ["TML", "屯馬綫"],
  ["TCL", "東涌綫"],
  ["AEL", "機場快綫"],
  ["EAL", "東鐵綫"],
  ["SIL", "南港島綫"],
  ["DRL", "迪士尼綫"],
];

const legend = legendItems
  .map(([id, name], i) => {
    const col = i < 5 ? 0 : 1;
    const row = i % 5;
    const x = W - 420 + col * 200;
    const y = 36 + row * 28;
    const c = schematicLineColor(id);
    return `<g transform="translate(${x} ${y})">
  <rect width="28" height="12" rx="3" fill="${c}"/>
  <text x="36" y="11" font-family="${FONT}" font-size="15" fill="#334155">${esc(name)}</text>
</g>`;
  })
  .join("\n");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>HK LIVE 港鐵示意路綫圖</title>
  <desc>Original HK LIVE blocky schematic. Not an official MTR map.</desc>
  <defs>
${patterns}
  </defs>
  <rect width="100%" height="100%" fill="#bde3f2"/>
${landPlates()}
  <g id="lines" opacity="0.95">${linePolys}</g>
  <g id="walk-links">${walk}</g>
  <g id="stations">${stations}</g>
  <g id="legend">${legend}</g>
  <text x="48" y="${H - 52}" font-family="${FONT}" font-size="36" font-weight="800" fill="#0f172a">HK LIVE</text>
  <text x="48" y="${H - 24}" font-family="${FONT}" font-size="16" fill="#475569">自製色塊示意路綫圖 · 非港鐵官方圖 · 僅供參考</text>
</svg>
`;

writeFileSync("public/mtr-schematic-own.svg", svg);
console.log("wrote public/mtr-schematic-own.svg", svg.length, "bytes", `${W}x${H}`);
