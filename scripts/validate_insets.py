"""Fails when hero-content insets are missing, clipped, or below recognizability.

Rule: hero-content-insets-all. NARAKA's first pass discarded all three skill badges as
decoration; Lexie: "他的招式也都是很重要的hero". They carry the same priority as the hero, so
all of them must be present, fully inside the canvas, and big enough that the content inside
reads — not just the badge silhouette. If one cannot reach that, the run is flagged for review
rather than shipped with it shrunk or dropped.
"""
import sys
from validator_lib import Check, parse_args, load, w, h, elements

args = parse_args(__doc__.split("\n")[0], [
    (["--expected"], {"type": int, "help": "how many insets the source has"}),
    (["--floor"], {"type": int, "default": 40, "help": "minimum inset side in px (default 40)"})])
m, layers = load(args)
c = Check("inset_count")
tw, th = m["target"]["w"], m["target"]["h"]
got = elements(m, "inset")

if args.expected is not None:
    c.checked += 1
    if len(got) != args.expected:
        c.fail(f"{len(got)} of {args.expected} hero-content insets placed — include all of them, "
               f"or flag the run for Designer review; never silently drop one")

for i, el in enumerate(got):
    if not el.get("placed"):
        continue
    c.checked += 1
    p = el["placed"]
    if p[0] < 0 or p[1] < 0 or p[2] > tw or p[3] > th:
        c.fail(f"inset {i} placed at {p} is clipped by the {tw}x{th} canvas")
    side = min(w(p), h(p))
    if side < args.floor:
        c.fail(f"inset {i} is {side}px on its short side, below the {args.floor}px "
               f"recognizability floor — the content inside will not read")
sys.exit(c.report())
