"""Fails when a hero/element zone split is taller than the elements actually need.

Rule: zone-height-from-floors. PR196.3's info bands were a guessed 32-34% of canvas height,
stealing ~50px from the hero on every landscape size for no reason; derived from the elements'
own floors they came out at 24-25%. Every pixel the element zone does not need belongs to the
hero.
"""
import sys
from validator_lib import Check, parse_args, load, h, w

args = parse_args(__doc__.split("\n")[0], [(["--slack"], {"type": float, "default": 1.15, "help": "unused (kept for CLI compatibility)"})])
m, _ = load(args)
c = Check("zone_height")
zone = (m.get("zones") or {}).get("element")
if not zone:
    print("SKIP zone_height: manifest has no zones.element (not a split layout)"); sys.exit(2)

placed = [e["placed"] for e in m.get("elements", []) if e.get("placed")]
inside = [p for p in placed if p[3] > zone[1] and p[1] < zone[3]]
if not inside:
    print("SKIP zone_height: no elements placed in the element zone"); sys.exit(2)

c.checked += 1
top, bottom = min(p[1] for p in inside), max(p[3] for p in inside)
zh = h(zone)
pad = max(10, round(m["target"]["h"] * 0.02))
# Measure the space the zone reserves but does not use. Comparing the element block's own
# height against the zone height is not enough — elements get centred, so an oversized zone
# still "fits" them; the tell is dead space beyond normal padding on either side.
waste = max(0, (top - zone[1]) - pad) + max(0, (zone[3] - bottom) - pad)
c.note(f"element zone {zh}px tall ({zh / m['target']['h']:.0%} of canvas); elements occupy "
       f"{bottom - top}px; unused beyond padding: {waste}px")
# A builder may declare a floor when the zone height is forced by geometry rather than
# chosen — on a very tall target, a shorter element zone means a taller hero zone, which at
# a fixed aspect means a NARROWER crop, which can cut the hero. The declaration has to carry
# its reason so a reviewer can see it was a constraint and not a guess.
floor = (m.get("zones") or {}).get("element_floor")
reason = (m.get("zones") or {}).get("element_floor_reason")
if floor:
    c.note(f"builder declares a floor of {floor}px: {reason or 'no reason given'}")
    if not reason:
        c.fail("zones.element_floor is declared without element_floor_reason — an unexplained "
               "floor is indistinguishable from the guessed fraction this check exists to catch")
limit = max(8, round(zh * 0.10))
if floor and reason and zh <= floor:
    waste = 0
if waste > limit:
    c.fail(f"element zone reserves {waste}px it does not use (limit {limit}px) — that height "
           f"belongs to the hero. Size the zone from the elements' legibility floors "
           f"(text height + one element row + padding), not a fraction of the canvas")
sys.exit(c.report())
