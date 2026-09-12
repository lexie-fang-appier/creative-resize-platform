"""Fails when an element that is edge-flush in the source is not flush to the same edge.

Rule: corner-anchor-preserved. Corner anchoring is a deliberate design decision, not the
generic padding other elements use, and it is asset-specific — Keeta's badge was placed on
a corner assumed from a previous asset. The source edge comes from layer_metadata's
corner_anchor, never from a convention.
"""
import sys
from validator_lib import Check, parse_args, load, TOL

ANCHOR_FRAC = 0.03   # a source margin within 3% of the canvas reads as a corner placement
FLUSH_BAND = 0.025   # at the output size, this much of the span still reads as flush

args = parse_args(__doc__.split("\n")[0])
m, layers = load(args)
c = Check("corner_anchor")

tw, th = m["target"]["w"], m["target"]["h"]
canvas = m["source"]["canvas"]

for el in m.get("elements", []):
    if not el.get("placed"):
        continue
    if el.get("role") in ("hero", "hero_cell"):
        # A reflowed cell sits where the grid puts it; its source position says nothing about
        # where it belongs in a different arrangement. Corner anchoring is a property of chrome
        # (badge, logo, legal line), not of content that gets re-laid-out.
        continue
    # Prefer the layer's own corner_anchor from layer metadata; fall back to the element's
    # source bbox, since edge-flushness is a geometric fact that does not need a layer name.
    # (Found by the PR855 experiment: manifests that identify elements by bbox alone were
    # being skipped silently, so the one rule this asset most exercised went unchecked.)
    entry = layers.get(el.get("source_layer", ""))
    if entry:
        b = entry["bbox"]
        src_box = [b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]]
    elif el.get("source_bbox"):
        src_box = el["source_bbox"]
    else:
        continue
    # "Corner-anchored" is judged here rather than taken from layer_metadata's strict
    # 2px flushness: an element sitting 14px into a 1080px canvas is plainly a corner
    # marker, and treating only pixel-flush layers as anchored made this check skip the
    # one rule the PR855 endorsement asset most exercised (its disclosure line is
    # top-left, where the previous asset's was bottom-right).
    near = lambda margin, span: margin <= span * ANCHOR_FRAC
    anchors = [s for s, on in (
        ("left", near(src_box[0], canvas["w"])), ("top", near(src_box[1], canvas["h"])),
        ("right", near(canvas["w"] - src_box[2], canvas["w"])),
        ("bottom", near(canvas["h"] - src_box[3], canvas["h"]))) if on]
    if not anchors:
        continue
    p = el["placed"]
    src = {"left": src_box[0], "top": src_box[1],
           "right": canvas["w"] - src_box[2], "bottom": canvas["h"] - src_box[3]}
    out = {"left": p[0], "top": p[1], "right": tw - p[2], "bottom": th - p[3]}
    scale = {"left": tw / canvas["w"], "right": tw / canvas["w"],
             "top": th / canvas["h"], "bottom": th / canvas["h"]}
    override = el.get("anchor_override")
    if override:
        c.checked += 1
        c.note(f"{el.get('label') or el.get('source_layer')}: anchoring deliberately overridden — {override}")
        continue
    if anchors and el.get("anchor_override_missing_reason"):
        c.checked += 1
        c.fail(f"{el.get('label') or el.get('source_layer')} moves off its source anchor with no "
               f"reason given — an undocumented move is indistinguishable from an oversight")
        continue
    c.checked += len(anchors)
    for side in anchors:
        want = src[side] * scale[side]
        # A source margin near zero means "flush". Scaling it by a factor is meaningless there
        # (1.5x of 2px is still 3px), so flush is judged as an absolute band of the canvas
        # dimension; a genuinely large source margin falls back to the proportional check.
        span = tw if side in ("left", "right") else th
        allowed = max(want * 1.5, span * FLUSH_BAND) + TOL
        if out[side] > allowed:
            c.fail(f"{el.get('label') or el.get('source_layer')!r} is {side}-anchored in the source "
                   f"(margin {src[side]}px of {canvas['w'] if side in ('left','right') else canvas['h']}) "
                   f"but sits {out[side]}px from the {side} edge — expected within "
                   f"{allowed:.0f}px")
sys.exit(c.report())
