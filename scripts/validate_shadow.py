"""Fails when a dilated shadow is applied to fine line-art.

Rule: no-dilated-shadow-on-fine-detail. NARAKA's platform-icon row was given the title's
shadow treatment in v4; the dilation radius exceeded the stroke spacing in "SERIES"/"X|S" and
filled the counters, so it read as blur. fine_detail_ratio (from layer_metadata) measures
exactly this: erode the layer's alpha ~2px and see how much area survives. Thin strokes lose
most of theirs.
"""
import sys
from validator_lib import Check, parse_args, load

args = parse_args(__doc__.split("\n")[0], [(["--threshold"], {"type": float, "default": 0.3,
                  "help": "fine_detail_ratio below which dilation is forbidden (default 0.3)"})])
m, layers = load(args)
c = Check("fine_detail_shadow")
if not layers:
    print("SKIP fine_detail_shadow: --layers is required"); sys.exit(2)

for el in m.get("elements", []):
    if not el.get("dilated_shadow"):
        continue
    c.checked += 1
    entry = layers.get(el.get("source_layer", ""))
    if not entry:
        c.fail(f"{el.get('source_layer')!r} declares a dilated shadow but is not in layers.json "
               f"— cannot confirm its stroke weight, so the shadow is not approved")
        continue
    fdr = entry.get("fine_detail_ratio")
    if fdr is None:
        c.fail(f"{el.get('source_layer')!r} declares a dilated shadow but has no "
               f"fine_detail_ratio — cannot confirm it can carry one")
    elif fdr < args.threshold:
        c.fail(f"{el.get('source_layer')!r} has fine_detail_ratio {fdr} < {args.threshold}: a "
               f"dilated shadow will bridge the gaps between strokes and read as blur. Place it "
               f"with no shadow and rely on its own contrast against the scene")
sys.exit(c.report())
