from pathlib import Path
import re
from collections import OrderedDict, defaultdict

html = Path("public/lrt-system-map.svg").read_text(encoding="utf-8", errors="replace")
pat = re.compile(
    r'<path transform="matrix\(1,0,0,-1,([0-9.]+),([0-9.]+)\)" d="([^"]+)" fill="#ffffff"',
    re.I,
)
dots = []
for tx, ty, d in pat.findall(html):
    tx, ty = float(tx), float(ty)
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", d)]
    xs, ys = nums[0::2], nums[1::2]
    if not xs:
        continue
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    w, h = maxx - minx, maxy - miny
    if w > 40 or h > 40 or w < 4 or h < 4:
        continue
    dots.append((tx + (minx + maxx) / 2, ty - (miny + maxy) / 2, w, h))

uniq = []
for x, y, w, h in sorted(dots):
    if any(abs(x - u[0]) < 2 and abs(y - u[1]) < 2 for u in uniq):
        continue
    uniq.append([x, y, w, h])
raw = [u for u in uniq if u[1] < 455]
merged = []
for x, y, w, h in raw:
    found = False
    for m in merged:
        if (x - m[0]) ** 2 + (y - m[1]) ** 2 < 12 ** 2:
            n = m[4] + 1
            m[0] = (m[0] * m[4] + x) / n
            m[1] = (m[1] * m[4] + y) / n
            m[2] = max(m[2], w)
            m[3] = max(m[3], h)
            m[4] = n
            found = True
            break
    if not found:
        merged.append([x, y, w, h, 1])
pts = [(m[0], m[1], i) for i, m in enumerate(merged) if m[2] >= 15 and m[3] >= 15]

csv_path = Path.home() / "AppData/Local/Temp/lrt-stops.csv"
t = csv_path.read_text(encoding="utf-8-sig")
rows = [ln.split(",") for ln in t.splitlines()[1:] if ln.strip()]
meta = OrderedDict()
seqs = []
for r in rows:
    line, dire, code, sid, zh, en, seq = r[0], r[1], r[2], r[3], r[4], r[5], int(r[6])
    meta[sid] = (code, zh, en)
    seqs.append((line, dire, seq, sid))

adj = {}
by = defaultdict(list)
for line, dire, seq, sid in seqs:
    by[(line, dire)].append((seq, sid))
for stops in by.values():
    stops = sorted(stops)
    for a, b in zip(stops, stops[1:]):
        if a[1] == b[1]:
            continue
        adj.setdefault(a[1], set()).add(b[1])
        adj.setdefault(b[1], set()).add(a[1])

def nearest(x, y):
    return min(pts, key=lambda p: (p[0] - x) ** 2 + (p[1] - y) ** 2)


placed = {
    "1": nearest(88, 243),  # Ferry Pier 2×3 capsules
    "920": nearest(197, 399),  # Sam Shing (505 terminus)
    "600": nearest(880, 382),  # Yuen Long — 614/610/615/761P stack
    "550": nearest(914, 56),  # Tin Yat 761P/751/705 stack
    "100": nearest(628, 300),  # Siu Hong — 505/615P/614P stack
    "430": nearest(982, 214),  # Tin Shui Wai 705/706 + Tuen Ma
    "280": nearest(317, 342),  # Town Centre
    "295": nearest(355, 318),  # Tuen Mun
}
used = {p[2] for p in placed.values()}


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


# Walk every official route in sequence so shared-track neighbors stay on the corridor.
for _ in range(8):
    for stops in by.values():
        stops = sorted(stops)
        ids = [s[1] for s in stops]
        for i, sid in enumerate(ids):
            if sid not in placed:
                continue
            for j in (i - 1, i + 1):
                if j < 0 or j >= len(ids):
                    continue
                nb = ids[j]
                if nb in placed or nb == sid:
                    continue
                unused = [p for p in pts if p[2] not in used]
                if not unused:
                    continue
                cand = min(unused, key=lambda p: dist(p, placed[sid]))
                if dist(cand, placed[sid]) > 120:
                    continue
                placed[nb] = cand
                used.add(cand[2])

print("placed", len(placed), "of", len(meta), "pts", len(pts))
print("missing", [f"{sid} {meta[sid][0]} {meta[sid][1]}" for sid in meta if sid not in placed])
print("extra", [(round(p[0], 1), round(p[1], 1), p[2]) for p in pts if p[2] not in used])
print("---")
for sid, (code, zh, en) in meta.items():
    if sid not in placed:
        print(f"  {code:4} {sid:>4} {zh}  MISSING")
        continue
    x, y, i = placed[sid]
    print(f"  {code:4} {sid:>4} {zh:8}  {x:7.1f} {y:7.1f}  #{i:02d}")
