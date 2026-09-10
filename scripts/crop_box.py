"""scripts/crop_box.py — aspect-ratio-first crop planning for hero reframing.

Exists to make one specific bug impossible to ship by accident: cropping "a region
that shows the content I want" by eye and then force-resizing it into an output box
of a different aspect ratio. That squeezes the hero narrower/wider than its natural
proportions, and it passes every framing / overlap / legibility check — the only
symptom is "this person looks too narrow", which is easy to miss and was in fact
missed (see 29 Spec - NARAKA Resize Guideline, the YJp814 320x1200 case, and the
recipe's Forbidden Change #18).

Two modes:

  derive   Pin whichever dimension the framing demands (e.g. a width that frames both
           shoulders), derive the other FROM the target aspect ratio, so the crop box
           is already the right shape before any resize happens.

  verify   Gate an existing crop box: PASS only if resizing it into the target is a
           uniform scale. Run this on every hero crop before resizing it.

Usage:
  python crop_box.py derive --target 1456x180 --pin-width 1400 --center 1350,700 \
                            [--source 2701x1465] [--canvas 1920x1080]
  python crop_box.py derive --target 320x1200 --pin-height 1100 --center 900,600
  python crop_box.py verify --box 500,120,1000,760 --target 320x1200

Coordinates are (left, top, right, bottom) in source-art pixel space, matching
psd-tools bboxes. --source/--canvas are optional: given them, the tool reports how far
the derived box reaches outside those bounds (i.e. how much bleed margin it needs, which
then has to pass the seam check before use — recipe Forbidden Change #16).
"""
import argparse
import sys

# A resize is "uniform enough" below this much per-axis scale difference. 0.5% on a
# 1456px-wide output is ~7px of stretch across the whole image — already below what
# reads as distortion, and anything above it is a real bug, not rounding.
MAX_DISTORTION_PCT = 0.5


def parse_dims(text: str) -> tuple[int, int]:
    w, h = text.lower().split("x")
    return int(w), int(h)


def parse_pair(text: str) -> tuple[int, int]:
    a, b = text.split(",")
    return int(a), int(b)


def parse_box(text: str) -> tuple[int, int, int, int]:
    left, top, right, bottom = (int(v) for v in text.split(","))
    if right <= left or bottom <= top:
        sys.exit(f"error: box {text} is empty or inverted (need left,top,right,bottom)")
    return left, top, right, bottom


def distortion_pct(box_w: int, box_h: int, target_w: int, target_h: int) -> float:
    """How much the two axes would be scaled differently, as a percentage."""
    scale_x = target_w / box_w
    scale_y = target_h / box_h
    return abs(scale_x / scale_y - 1) * 100


def report_bounds(box, label: str, bounds: tuple[int, int] | None) -> list[str]:
    if bounds is None:
        return []
    left, top, right, bottom = box
    width, height = bounds
    over = {
        "left": max(0, -left), "top": max(0, -top),
        "right": max(0, right - width), "bottom": max(0, bottom - height),
    }
    if not any(over.values()):
        return [f"  fits inside {label} ({width}x{height})"]
    parts = ", ".join(f"{side} +{px}px" for side, px in over.items() if px)
    return [
        f"  ⚠ reaches outside {label} ({width}x{height}): {parts}",
        f"    → that region is bleed margin: verify every contributing layer actually covers it",
        f"      (a shorter colour-grade/vignette layer over wider base art leaves a seam)",
    ]


def cmd_derive(args) -> int:
    target_w, target_h = parse_dims(args.target)
    target_aspect = target_w / target_h
    center_x, center_y = parse_pair(args.center)

    if (args.pin_width is None) == (args.pin_height is None):
        sys.exit("error: pass exactly one of --pin-width / --pin-height")

    if args.pin_width is not None:
        box_w = args.pin_width
        box_h = round(box_w / target_aspect)
        pinned = f"width={box_w} (given), height derived from {target_w}:{target_h}"
    else:
        box_h = args.pin_height
        box_w = round(box_h * target_aspect)
        pinned = f"height={box_h} (given), width derived from {target_w}:{target_h}"

    left = round(center_x - box_w / 2)
    top = round(center_y - box_h / 2)
    box = (left, top, left + box_w, top + box_h)

    lines = [
        f"target      {target_w}x{target_h}  (aspect {target_aspect:.4f})",
        f"pinned      {pinned}",
        f"crop box    {box[0]},{box[1]},{box[2]},{box[3]}   ({box_w}x{box_h})",
        f"resize      uniform scale x{target_w / box_w:.4f}  (distortion "
        f"{distortion_pct(box_w, box_h, target_w, target_h):.3f}%)",
    ]
    lines += report_bounds(box, "source art", parse_dims(args.source) if args.source else None)
    lines += report_bounds(box, "original canvas", parse_dims(args.canvas) if args.canvas else None)
    print("\n".join(lines))
    return 0


def cmd_verify(args) -> int:
    left, top, right, bottom = parse_box(args.box)
    box_w, box_h = right - left, bottom - top
    target_w, target_h = parse_dims(args.target)
    pct = distortion_pct(box_w, box_h, target_w, target_h)
    ok = pct <= MAX_DISTORTION_PCT

    print(f"crop box    {left},{top},{right},{bottom}   ({box_w}x{box_h}, aspect {box_w / box_h:.4f})")
    print(f"target      {target_w}x{target_h}   (aspect {target_w / target_h:.4f})")
    print(f"distortion  {pct:.3f}%   (limit {MAX_DISTORTION_PCT}%)")

    if ok:
        print("PASS — resizing this box into the target is a uniform scale")
        return 0

    scale_x, scale_y = target_w / box_w, target_h / box_h
    axis = "horizontally" if scale_x < scale_y else "vertically"
    fix_h, fix_w = round(box_w / (target_w / target_h)), round(box_h * (target_w / target_h))
    print(f"FAIL — the hero would be squeezed {axis}")
    print(f"  fix: keep width {box_w} → height should be {fix_h} (not {box_h})")
    print(f"   or: keep height {box_h} → width should be {fix_w} (not {box_w})")
    print("  do not resize this box as-is; re-derive it (crop_box.py derive)")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="mode", required=True)

    d = sub.add_parser("derive", help="compute an aspect-matched crop box")
    d.add_argument("--target", required=True, help="output size, e.g. 1456x180")
    d.add_argument("--center", required=True, help="crop centre in source coords, e.g. 1350,700")
    d.add_argument("--pin-width", type=int, help="crop width the framing requires")
    d.add_argument("--pin-height", type=int, help="crop height the framing requires")
    d.add_argument("--source", help="source art bounds, e.g. 2701x1465")
    d.add_argument("--canvas", help="original canvas bounds, e.g. 1920x1080")
    d.set_defaults(func=cmd_derive)

    v = sub.add_parser("verify", help="gate an existing crop box against a target size")
    v.add_argument("--box", required=True, help="left,top,right,bottom")
    v.add_argument("--target", required=True, help="output size, e.g. 320x1200")
    v.set_defaults(func=cmd_verify)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
