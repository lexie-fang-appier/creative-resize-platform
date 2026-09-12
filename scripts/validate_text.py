"""Fails when a true-text element is below its legibility floor, or a source line is missing.

Rule: text-legibility-floor. Two separate incidents: a 1456x180 pass dropped a subtitle that
was part of the product name, and YJp816's nameplate was left at an inherited small size while
the title was being sized generously. So this checks each true-text element INDEPENDENTLY, and
separately checks that every kind=='type' layer in the source still appears in the plan.
"""
import sys
from validator_lib import Check, parse_args, load, h, w

args = parse_args(__doc__.split("\n")[0], [(["--floor"], {"type": int, "default": 10,
                  "help": "minimum rendered text height in px (default 10)"})])
m, layers = load(args)
c = Check("text_floor")

placed = {e.get("source_layer") for e in m.get("elements", []) if e.get("role") == "text"}
placed |= {e.get("label") for e in m.get("elements", []) if e.get("role") == "text"}
# Text baked into a composited element (a grid cell that carries its own label) is present,
# just not placed standalone — the element declares what it contains so "carried" and
# "dropped" stop looking the same.
for e in m.get("elements", []):
    placed |= set(e.get("contains_text") or [])
for el in m.get("elements", []):
    if el.get("role") != "text" or not el.get("placed"):
        continue
    c.checked += 1
    p = el["placed"]
    tw, th = m["target"]["w"], m["target"]["h"]
    if p[0] < 0 or p[1] < 0 or p[2] > tw or p[3] > th:
        c.fail(f"{el.get('label') or el.get('source_layer')!r} at {p} is clipped by the "
               f"{tw}x{th} canvas — a true-text line must be wholly inside the frame; shrink "
               f"the block or move it, never let the canvas cut it")
    ph = h(el["placed"])
    if ph < args.floor:
        c.fail(f"{el.get('label') or el.get('source_layer')!r} renders {ph}px tall, below the {args.floor}px floor "
               f"— shrink the whole text block as a unit or reduce a lower-priority element, "
               f"never take a text element below readable")

# A ticket may explicitly authorise dropping text for one placement (Kakao bizboard is
# specified as image-only). That has to be declared WITH its reason, so an authorised omission
# and a careless one never look the same.
omit = m.get("text_omitted_reason")
if omit:
    c.checked += 1
    c.note(f"此尺寸刻意不放文字:{omit}")
    layers = {}

# nothing from the source may be silently dropped
if layers:
    for name, e in layers.items():
        if e.get("type_guess") != "text":
            continue
        c.checked += 1
        if name not in placed:
            c.fail(f"source true-text layer {name!r} is not placed in this output — a source "
                   f"line may never be dropped for space; shrink the block instead")
sys.exit(c.report())
