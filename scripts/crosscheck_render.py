"""Produces the isolated-render vs full-composite comparison. The verdict stays human.

Rule: isolated-render-crosscheck. psd-tools silently misrendered the NARAKA logo, and three
different numeric heuristics all failed to separate "legitimately mostly transparent" from
"wrongly rendered" — a layer with lots of honest transparent padding scores the same as a
broken one. So this deliberately does NOT return a pass/fail verdict on appearance: it renders
each named layer beside the same bbox cropped from the full composite and writes one sheet for
a human to look at. It fails only when it cannot produce that evidence.

Usage:
  python crosscheck_render.py --psd file.psd --layer logo终版 --layer 확률형 --out sheet.png
"""
import argparse
import sys

p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
p.add_argument("--psd", required=True)
p.add_argument("--layer", action="append", default=[], help="layer name substring (repeatable)")
p.add_argument("--out", required=True)
args = p.parse_args()

from PIL import Image
from psd_tools import PSDImage

psd = PSDImage.open(args.psd)
full = psd.composite().convert("RGBA")
rows = []
for pat in args.layer:
    hit = next((l for l in psd.descendants() if pat.lower() in (l.name or "").lower()), None)
    if hit is None:
        print(f"FAIL crosscheck_render: no layer matching {pat!r}", file=sys.stderr)
        sys.exit(1)
    iso = hit.composite()
    if iso is None:
        print(f"FAIL crosscheck_render: {hit.name!r} produced no isolated render", file=sys.stderr)
        sys.exit(1)
    l, t, r, b = hit.bbox
    cmp_ = full.crop((max(0, l), max(0, t), min(full.width, r), min(full.height, b)))
    dark = Image.new("RGBA", iso.size, (30, 30, 36, 255))
    dark.alpha_composite(iso.convert("RGBA"))
    row = Image.new("RGB", (dark.width + cmp_.width + 20, max(dark.height, cmp_.height)), (90, 20, 20))
    row.paste(dark.convert("RGB"), (0, 0))
    row.paste(cmp_.convert("RGB"), (dark.width + 20, 0))
    rows.append((hit.name, row))

if not rows:
    print("FAIL crosscheck_render: no --layer given, so no evidence was produced", file=sys.stderr)
    sys.exit(1)

W = max(r.width for _, r in rows)
sheet = Image.new("RGB", (W, sum(r.height + 12 for _, r in rows)), (0, 0, 0))
y = 0
for _, r in rows:
    sheet.paste(r, (0, y)); y += r.height + 12
sheet.save(args.out)
print(f"EVIDENCE crosscheck_render: wrote {args.out} — left = isolated render on dark, "
      f"right = same bbox from the full composite, for: {', '.join(n for n, _ in rows)}")
print("  verdict is human: no numeric threshold separates honest transparency from a misrender")
