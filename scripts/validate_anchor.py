"""Fails when an element that is edge-flush in the source is not flush to the same edge.

Rule: corner-anchor-preserved. Corner anchoring is a deliberate design decision, not the
generic padding other elements use, and it is asset-specific — Keeta's badge was placed on
a corner assumed from a previous asset. The source edge comes from layer_metadata's
corner_anchor, never from a convention.
"""
import sys
from validator_lib import Check, parse_args, load, TOL

args = parse_args(__doc__.split("\n")[0])
m, layers = load(args)
c = Check("corner_anchor")
if not layers:
    print("SKIP corner_anchor: --layers is required"); sys.exit(2)

tw, th = m["target"]["w"], m["target"]["h"]
canvas = m["source"]["canvas"]

for el in m.get("elements", []):
    entry = layers.get(el.get("source_layer", ""))
    if not entry or not el.get("placed"):
        continue
    anchors = [s for s, on in entry["corner_anchor"].items() if on]
    if not anchors:
        continue
    p, b = el["placed"], entry["bbox"]
    src = {"left": b["x"], "top": b["y"],
           "right": canvas["w"] - (b["x"] + b["w"]), "bottom": canvas["h"] - (b["y"] + b["h"])}
    out = {"left": p[0], "top": p[1], "right": tw - p[2], "bottom": th - p[3]}
    scale = {"left": tw / canvas["w"], "right": tw / canvas["w"],
             "top": th / canvas["h"], "bottom": th / canvas["h"]}
    c.checked += len(anchors)
    for side in anchors:
        want = src[side] * scale[side]
        # A source margin near zero means "flush". Scaling it by a factor is meaningless there
        # (1.5x of 2px is still 3px), so flush is judged as an absolute band of the canvas
        # dimension; a genuinely large source margin falls back to the proportional check.
        span = tw if side in ("left", "right") else th
        allowed = max(want * 1.5, span * 0.015) + TOL
        if out[side] > allowed:
            c.fail(f"{el.get('source_layer')!r} is {side}-anchored in the source "
                   f"(margin {src[side]}px of {canvas['w'] if side in ('left','right') else canvas['h']}) "
                   f"but sits {out[side]}px from the {side} edge — expected within "
                   f"{allowed:.0f}px")
sys.exit(c.report())
