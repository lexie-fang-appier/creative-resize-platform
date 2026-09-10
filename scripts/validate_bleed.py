"""Fails when a crop reaches past the shortest layer contributing to that region.

Rule: bleed-seam-check. A base-art layer often extends well beyond the canvas while a
colour-grade or vignette layer stacked on it stops at the canvas edge — crop past that
shorter layer and its boundary prints as a tonal seam inside the output. The seam looks
identical to a compositing bug and is not fixed by checking bbox coverage of the base art,
so the check has to be per contributing layer.
"""
import sys
from validator_lib import Check, parse_args, load, w, h

args = parse_args(__doc__.split("\n")[0])
m, layers = load(args)
c = Check("bleed_coverage")
if not layers:
    print("SKIP bleed_coverage: --layers is required"); sys.exit(2)

canvas = m["source"]["canvas"]
crops = [("hero", m["hero"]["crop"])] if m.get("hero") else []
crops += [(f"{e.get('role')}:{e.get('source_layer', '')}", e["source_bbox"])
          for e in m.get("elements", []) if e.get("source_bbox")]

for label, crop in crops:
    outside = (crop[0] < 0 or crop[1] < 0 or crop[2] > canvas["w"] or crop[3] > canvas["h"])
    if not outside:
        continue
    c.checked += 1
    c.note(f"{label} crop {crop} reaches outside the canvas ({canvas['w']}x{canvas['h']})")
    for name, e in layers.items():
        b = e["bbox"]
        lb = [b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]]
        # only layers that actually contribute to this region matter
        if lb[2] <= crop[0] or lb[0] >= crop[2] or lb[3] <= crop[1] or lb[1] >= crop[3]:
            continue
        edges = [side for side, inside in (
            ("left", lb[0] > crop[0]), ("top", lb[1] > crop[1]),
            ("right", lb[2] < crop[2]), ("bottom", lb[3] < crop[3])) if inside]
        if edges:
            c.fail(f"{label}: layer {name!r} contributes but ends inside the crop "
                   f"({', '.join(edges)}) — its boundary will print as a seam. "
                   f"layer bbox {lb} vs crop {crop}")
sys.exit(c.report())
