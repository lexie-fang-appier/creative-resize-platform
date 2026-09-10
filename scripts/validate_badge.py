"""Fails when the compliance badge grew relative to the canvas.

Rule: badge-corner-and-floor. Early rounds pushed the rating badge past 30% of canvas height
"to be safe"; it tested clearly legible at 30px. It is a corner marker sized to its legibility
floor, not a decorative element that scales with the canvas — a bigger canvas does not mean a
bigger badge.
"""
import sys
from validator_lib import Check, parse_args, load, h, elements

args = parse_args(__doc__.split("\n")[0], [(["--tolerance"], {"type": float, "default": 1.25,
                  "help": "allowed growth factor vs the source's relative height (default 1.25)"})])
m, layers = load(args)
c = Check("badge_size")
th, canvas = m["target"]["h"], m["source"]["canvas"]

for el in elements(m, "badge"):
    entry = layers.get(el.get("source_layer", ""))
    if not entry or not el.get("placed"):
        continue
    c.checked += 1
    src_frac = entry["bbox"]["h"] / canvas["h"]
    out_frac = h(el["placed"]) / th
    c.note(f"badge occupies {out_frac:.1%} of canvas height (source {src_frac:.1%})")
    if out_frac > src_frac * args.tolerance:
        c.fail(f"badge grew to {out_frac:.1%} of canvas height from {src_frac:.1%} in the source "
               f"(>{args.tolerance}x) — keep it at its legibility floor, corner-anchored")
sys.exit(c.report())
