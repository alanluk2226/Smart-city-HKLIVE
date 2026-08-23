"""Emit lib/static/lrt-*.ts from CSV + hand-placed map hits."""
from pathlib import Path

HITS = {
    # Tuen Mun south / ferry
    "1": (196.9, 399.2),
    "10": (164.1, 344.8),
    "15": (121.9, 344.8),
    "20": (94.2, 312.9),
    "240": (220.3, 341.9),
    "250": (270.5, 341.9),
    "260": (317.2, 341.9),
    # West corridor
    "30": (90.8, 250.2),
    "40": (112.6, 250.2),
    "50": (68.7, 250.2),
    "200": (83.5, 170.8),
    "190": (119.2, 142.2),
    "180": (168.3, 142.2),
    "170": (217.6, 142.2),
    "160": (271.3, 142.2),
    "150": (323.3, 142.2),
    "140": (375.9, 139.1),
    "130": (431.1, 139.1),
    # Tuen Mun centre
    "920": (561.8, 408.2),
    "265": (449.1, 408.2),
    "270": (401.2, 408.2),
    "275": (358.1, 397.8),
    "280": (473.1, 265.4),
    "295": (355.2, 318.5),
    "60": (375.9, 288.9),
    "70": (265.4, 294.5),
    "75": (428.7, 288.9),
    "230": (502.8, 288.9),
    "220": (473.1, 234.3),
    "212": (473.1, 201.1),
    "80": (556.3, 288.9),
    "90": (612.7, 190.8),
    # 614P to Siu Hong
    "300": (502.8, 288.9),
    "310": (556.3, 288.9),
    "320": (616.4, 109.1),
    "330": (612.7, 151.3),
    "340": (634.6, 240.7),
    "100": (629.3, 282.6),
    "120": (576.7, 66.4),
    "110": (537.9, 66.4),
    # Hung Shui Kiu corridor
    "350": (664.4, 294.8),
    "360": (693.4, 294.8),
    "370": (731.5, 294.8),
    "380": (794.9, 294.8),
    "390": (844.5, 382.3),
    "400": (880.7, 380.8),
    "560": (884.0, 397.2),
    "570": (946.6, 385.8),
    "580": (1004.8, 385.8),
    "590": (1062.6, 385.8),
    "600": (1120.5, 385.8),
    # Tin Shui Wai
    "425": (860.3, 210.3),
    "430": (825.0, 181.2),
    "445": (900.4, 210.3),
    "448": (934.7, 256.3),
    "460": (979.4, 214.3),
    "468": (994.7, 206.5),
    "480": (1031.4, 204.4),
    "490": (1062.7, 204.4),
    "435": (828.0, 104.9),
    "450": (920.8, 72.9),
    "455": (932.5, 58.9),
    "500": (920.7, 52.9),
    "510": (989.4, 58.9),
    "520": (1039.2, 58.9),
    "530": (1094.7, 58.9),
    "540": (1124.1, 104.8),
    "550": (857.2, 58.9),
}

# 230/220/212/75/300 share some dots — split Tai Hing onto unused north-row leftovers
HITS["230"] = (323.3, 142.2)  # will overlap LEK — move 銀圍
HITS["220"] = (271.3, 142.2)
HITS["212"] = (217.6, 142.2)
# restore 505 row shifted
HITS["170"] = (168.3, 142.2)
HITS["180"] = (119.2, 142.2)
HITS["190"] = (83.5, 170.8)
HITS["160"] = (375.9, 139.1)
HITS["150"] = (431.1, 139.1)
HITS["140"] = (537.9, 66.4)
HITS["130"] = (576.7, 66.4)
HITS["120"] = (616.4, 109.1)
HITS["110"] = (612.7, 151.3)
HITS["90"] = (639.5, 324.0)
HITS["80"] = (612.7, 190.8)
HITS["190"] = (102.0, 156.0)
HITS["120"] = (590.0, 92.0)
HITS["330"] = (622.0, 168.0)

LATLNG = {
    "1": (22.3718, 113.9659),
    "10": (22.3785, 113.9628),
    "15": (22.3842, 113.9615),
    "20": (22.3864, 113.9688),
    "30": (22.3856, 113.9766),
    "40": (22.3889, 113.9794),
    "50": (22.3932, 113.9798),
    "60": (22.3949, 113.9708),
    "70": (22.3978, 113.9736),
    "75": (22.4007, 113.9749),
    "80": (22.4049, 113.9766),
    "90": (22.4078, 113.9772),
    "100": (22.4113, 113.9788),
    "110": (22.4156, 113.9771),
    "120": (22.4178, 113.9722),
    "130": (22.4186, 113.9674),
    "140": (22.4172, 113.9628),
    "150": (22.4144, 113.9611),
    "160": (22.4108, 113.9619),
    "170": (22.4072, 113.9648),
    "180": (22.4038, 113.9622),
    "190": (22.4011, 113.9628),
    "200": (22.3968, 113.9641),
    "212": (22.4033, 113.9694),
    "220": (22.4006, 113.9702),
    "230": (22.3984, 113.9718),
    "240": (22.3756, 113.9698),
    "250": (22.3788, 113.9731),
    "260": (22.3816, 113.9758),
    "265": (22.3849, 113.9776),
    "270": (22.3878, 113.9752),
    "275": (22.3852, 113.9718),
    "280": (22.3908, 113.9759),
    "295": (22.3948, 113.9731),
    "300": (22.3972, 113.9768),
    "310": (22.3996, 113.9794),
    "320": (22.4038, 113.9806),
    "330": (22.4072, 113.9818),
    "340": (22.4096, 113.9802),
    "350": (22.4184, 113.9836),
    "360": (22.4236, 113.9878),
    "370": (22.4296, 113.9926),
    "380": (22.4338, 113.9972),
    "390": (22.4386, 114.0068),
    "400": (22.4408, 114.0118),
    "425": (22.4446, 114.0022),
    "430": (22.4481, 114.0048),
    "435": (22.4512, 114.0066),
    "445": (22.4506, 114.0012),
    "448": (22.4538, 113.9994),
    "450": (22.4542, 114.0058),
    "455": (22.4572, 114.0064),
    "460": (22.4568, 113.9982),
    "468": (22.4602, 113.9974),
    "480": (22.4636, 113.9978),
    "490": (22.4588, 114.0028),
    "500": (22.4604, 114.0069),
    "510": (22.4648, 114.0062),
    "520": (22.4676, 114.0028),
    "530": (22.4702, 113.9994),
    "540": (22.4716, 113.9958),
    "550": (22.4684, 113.9946),
    "560": (22.4426, 114.0188),
    "570": (22.4442, 114.0236),
    "580": (22.4452, 114.0278),
    "590": (22.4456, 114.0316),
    "600": (22.4460, 114.0353),
    "920": (22.3822, 113.9806),
}

ZONE = {}
for i in [1, 10, 15, 20, 30, 40, 50, 60, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 212, 220, 230, 240, 250, 260, 265, 270, 275, 280, 295, 300, 310, 320, 330, 340, 920]:
    ZONE[str(i)] = "屯門"
for i in [425, 430, 435, 445, 448, 450, 455, 460, 468, 480, 490, 500, 510, 520, 530, 540, 550]:
    ZONE[str(i)] = "天水圍"
for i in [350, 360, 370, 380, 390, 400, 560, 570, 580, 590, 600]:
    ZONE[str(i)] = "元朗"

csv = Path.home().joinpath("AppData/Local/Temp/lrt-stops.csv").read_text(encoding="utf-8-sig")
meta = {}
edges = set()
from collections import defaultdict
by = defaultdict(list)
for ln in csv.splitlines()[1:]:
    if not ln.strip():
        continue
    line, dire, code, sid, zh, en, seq = ln.split(",")[:7]
    meta[sid] = (code, zh, en)
    by[(line, dire)].append((int(seq), sid))
for stops in by.values():
    stops = sorted(stops)
    for a, b in zip(stops, stops[1:]):
        if a[1] != b[1]:
            edges.add(tuple(sorted((a[1], b[1]))))

missing_hits = [s for s in meta if s not in HITS]
print("missing hits", missing_hits)
dup_xy = {}
for sid, xy in HITS.items():
    if xy is None:
        continue
    dup_xy.setdefault((round(xy[0], 1), round(xy[1], 1)), []).append(sid)
dups = {k: v for k, v in dup_xy.items() if len(v) > 1}
print("duplicate xy", dups)

rows = []
for sid, (code, zh, en) in meta.items():
    lat, lng = LATLNG[sid]
    zone = ZONE[sid]
    x, y = HITS[sid]
    rows.append((int(sid), code, zh, en, zone, lat, lng, x, y))
rows.sort(key=lambda r: (["屯門", "天水圍", "元朗"].index(r[4]), r[0]))

sta_lines = [
    "export type LrtZone = \"屯門\" | \"天水圍\" | \"元朗\";",
    "",
    "export type LrtStation = {",
    "  id: number;",
    "  code: string;",
    "  name: string;",
    "  nameEn: string;",
    "  zone: LrtZone;",
    "  lat: number;",
    "  lng: number;",
    "};",
    "",
    "export const LRT_ZONES: LrtZone[] = [\"屯門\", \"天水圍\", \"元朗\"];",
    "",
    "export const LRT_STATIONS: LrtStation[] = [",
]
for sid, code, zh, en, zone, lat, lng, x, y in rows:
    sta_lines.append(
        f'  {{ id: {sid}, code: "{code}", name: "{zh}", nameEn: "{en}", zone: "{zone}", lat: {lat}, lng: {lng} }},'
    )
sta_lines += [
    "];",
    "",
    "export function lrtStation(id: string | number) {",
    "  const n = String(id);",
    "  return LRT_STATIONS.find((s) => String(s.id) === n || s.code === n) ?? null;",
    "}",
    "",
    "export function lrtName(id: string | number) {",
    "  return lrtStation(id)?.name ?? String(id);",
    "}",
    "",
    "export function searchLrtStations(q: string, zone?: string): LrtStation[] {",
    "  const n = q.trim().toLowerCase();",
    "  return LRT_STATIONS.filter((s) => {",
    "    if (zone && s.zone !== zone) return false;",
    "    if (!n) return true;",
    "    return (",
    "      s.name.toLowerCase().includes(n) ||",
    "      s.nameEn.toLowerCase().includes(n) ||",
    "      s.code.toLowerCase() === n ||",
    "      String(s.id) === n",
    "    );",
    "  });",
    "}",
    "",
]
Path("lib/static/lrt-stations.ts").write_text("\n".join(sta_lines) + "\n", encoding="utf-8")

hit_lines = [
    "/** Click targets on `public/lrt-system-map.svg` (viewBox 1200 × 561). */",
    "export const LRT_MAP_SIZE = { w: 1200, h: 561 } as const;",
    "",
    "/** Station-dot centres parsed from the SVG, keyed by station id. */",
    "export const LRT_MAP_HITS: Record<string, { x: number; y: number }> = {",
]
for sid, code, zh, en, zone, lat, lng, x, y in sorted(rows, key=lambda r: r[0]):
    hit_lines.append(f'  "{sid}": {{ x: {x:.1f}, y: {y:.1f} }}, // {code} {zh}')
hit_lines += [
    "};",
    "",
    "export const LRT_MAP_EXTRA_HITS: { code: string; x: number; y: number }[] = [",
    '  { code: "600", x: 1120.4, y: 294.8 },',
    '  { code: "430", x: 828.0, y: 104.9 },',
    '  { code: "100", x: 639.5, y: 324.0 },',
    "];",
    "",
]
Path("lib/static/lrt-map-hits.ts").write_text("\n".join(hit_lines) + "\n", encoding="utf-8")

edge_lines = [
    "/** Undirected Light Rail adjacencies from MTR open data sequences. */",
    "export const LRT_EDGES: Array<[string, string]> = [",
]
for a, b in sorted(edges, key=lambda e: (int(e[0]), int(e[1]))):
    edge_lines.append(f'  ["{a}", "{b}"],')
edge_lines.append("];")
edge_lines.append("")
Path("lib/static/lrt-edges.ts").write_text("\n".join(edge_lines) + "\n", encoding="utf-8")
print("wrote stations", len(rows), "edges", len(edges))
