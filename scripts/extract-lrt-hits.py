"""Extract white station-marker centres from public/lrt-system-map.svg."""
import re
from pathlib import Path

html = Path("public/lrt-system-map.svg").read_text(encoding="utf-8", errors="replace")

# White filled paths that are station pills/circles (not the huge background rect).
pat = re.compile(
    r'<path transform="matrix\(1,0,0,-1,([0-9.]+),([0-9.]+)\)" d="([^"]+)" fill="#ffffff"',
    re.I,
)

dots = []
for tx, ty, d in pat.findall(html):
    tx, ty = float(tx), float(ty)
    nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", d)]
    if len(nums) < 4:
        continue
    # Path coords are in local space; svg y is flipped by the matrix.
    xs, ys = nums[0::2], nums[1::2]
    if not xs or not ys:
        continue
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    w, h = maxx - minx, maxy - miny
    # Background rect is huge; glyphs are tiny; station pills ~10–18 units.
    if w > 40 or h > 40 or w < 4 or h < 4:
        continue
    cx = tx + (minx + maxx) / 2
    cy = ty - (miny + maxy) / 2
    dots.append((round(cx, 1), round(cy, 1), round(w, 1), round(h, 1)))

# Dedup near-identical centres (fill + maybe another white overlay).
uniq = []
for x, y, w, h in sorted(dots, key=lambda t: (t[0], t[1])):
    if any(abs(x - u[0]) < 2 and abs(y - u[1]) < 2 for u in uniq):
        continue
    uniq.append((x, y, w, h))

# Legend strip sits at the bottom of the SVG (y ≳ 447).
raw = [u for u in uniq if u[1] < 455]

# Merge overlapping fill/stroke pills and stacked interchange marks.
merged: list[list[float]] = []
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

merged.sort(key=lambda t: (t[0], t[1]))
print("raw", len(raw), "merged", len(merged))
for i, (x, y, w, h, n) in enumerate(merged):
    print(f"{i:02d}  {x:7.1f} {y:7.1f}  {w:5.1f}x{h:5.1f}  n={n:.0f}")

lines = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="561" viewBox="0 0 1200 561">',
    '<image href="/lrt-system-map.svg" width="1200" height="561"/>',
]
for i, (x, y, w, h, n) in enumerate(merged):
    lines.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="#e11" fill-opacity="0.85"/>')
    lines.append(
        f'<text x="{x:.1f}" y="{y + 3.5:.1f}" text-anchor="middle" font-size="8" font-weight="700" font-family="Arial,sans-serif" fill="#fff">{i}</text>'
    )
lines.append("</svg>")
Path("public/lrt-hits-debug.svg").write_text("\n".join(lines), encoding="utf-8")
print("wrote public/lrt-hits-debug.svg")

badges = []
for i, (x, y, w, h, n) in enumerate(merged):
    badges.append(
        f'<div style="position:absolute;left:{x-8:.0f}px;top:{y-8:.0f}px;width:16px;height:16px;'
        f'border-radius:50%;background:#e11;color:#fff;font:700 9px/16px Arial,sans-serif;text-align:center">{i}</div>'
    )
Path("public/lrt-hits-debug.html").write_text(
    "<!DOCTYPE html><meta charset=utf-8><title>lrt hits</title>"
    '<body style="margin:0;background:#333">'
    '<div style="position:relative;width:1200px;height:561px">'
    '<img src="/lrt-system-map.svg" width="1200" height="561" style="display:block">'
    + "".join(badges)
    + "</div></body>",
    encoding="utf-8",
)
print("wrote public/lrt-hits-debug.html")
