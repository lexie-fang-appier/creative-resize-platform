"""Fails when a true-text element is below its legibility floor, or a source line is missing.

Rule: text-legibility-floor. Two separate incidents: a 1456x180 pass dropped a subtitle that
was part of the product name, and YJp816's nameplate was left at an inherited small size while
the title was being sized generously. So this checks each true-text element INDEPENDENTLY, and
separately checks that every kind=='type' layer in the source still appears in the plan.
"""
import sys
from validator_lib import Check, parse_args, load, h

args = parse_args(__doc__.split("\n")[0], [(["--floor"], {"type": int, "default": 10,
                  "help": "minimum rendered text height in px (default 10)"})])
m, layers = load(args)
c = Check("text_floor")

placed = {e.get("source_layer") for e in m.get("elements", []) if e.get("role") == "text"}
for el in m.get("elements", []):
    if el.get("role") != "text" or not el.get("placed"):
        continue
    c.checked += 1
    ph = h(el["placed"])
    if ph < args.floor:
        c.fail(f"{el.get('source_layer')!r} renders {ph}px tall, below the {args.floor}px floor "
               f"— shrink the whole text block as a unit or reduce a lower-priority element, "
               f"never take a text element below readable")

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
