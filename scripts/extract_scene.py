"""scripts/extract_scene.py — render the "scene" (hero art minus text/logo/badge)
with every remaining layer's real blend mode applied.

Exists because the intuitive approach is wrong in a way that's hard to diagnose:
hand-picking named sub-layers and alpha_compositing them yourself silently ignores
each layer's actual blend mode (multiply / screen / linear-burn …) and can print a
hard-edged rectangle exactly at some layer's bbox — well inside the canvas, nothing
to do with bleed coverage. That seam looks identical to a bleed-coverage seam and
isn't fixed by checking bbox coverage, so it costs a debugging round every time
(see 29 Spec - NARAKA Resize Guideline, the YJp814 图层50 case; recipe Forbidden
Change #17).

The correct approach, which this script does: temporarily hide the layers you don't
want, call composite() on the parent group (or the whole document), restore
visibility afterwards.

Usage:
  # see what's in the file first
  python extract_scene.py <file.psd> --list

  # render the scene with text/logo/badge hidden
  python extract_scene.py <file.psd> --hide 标题 --hide logo --hide 分级 --out scene.png

  # same, but render the full bleed extent rather than just the canvas
  python extract_scene.py <file.psd> --hide logo --full-bleed --out scene-bleed.png

  # render one specific region (bleed coordinates allowed)
  python extract_scene.py <file.psd> --viewport -400,0,2300,1465 --out region.png

--hide matches a layer name case-insensitively as a substring, so `--hide logo` catches
"中式logo-NAKARA繁體". Every match is reported, so you can see what actually got hidden.
"""
import argparse
import sys


def iter_layers(node):
    for layer in node.descendants():
        yield layer


def cmd_list(psd) -> int:
    print(f"canvas {psd.width}x{psd.height}")
    for layer in iter_layers(psd):
        depth = 0
        parent = layer.parent
        while parent is not None and hasattr(parent, "parent"):
            depth += 1
            parent = parent.parent
        mark = " " if layer.is_visible() else "×"
        kind = "group" if layer.is_group() else str(layer.kind)
        left, top, right, bottom = layer.bbox
        print(
            f"{mark} {'  ' * depth}{layer.name!r:40s} {kind:12s} "
            f"bbox=({left},{top},{right},{bottom}) blend={layer.blend_mode}"
        )
    return 0


def resolve_hides(psd, patterns: list[str]) -> list:
    hidden = []
    for layer in iter_layers(psd):
        if not layer.is_visible():
            continue
        name = (layer.name or "").lower()
        if any(p.lower() in name for p in patterns):
            hidden.append(layer)
    return hidden


def resolve_group(psd, name: str):
    for layer in iter_layers(psd):
        if layer.is_group() and name.lower() in (layer.name or "").lower():
            return layer
    sys.exit(f"error: no group matching {name!r} — run with --list to see layer names")


def full_bleed_viewport(node) -> tuple[int, int, int, int]:
    boxes = [l.bbox for l in iter_layers(node) if l.is_visible() and l.bbox != (0, 0, 0, 0)]
    if not boxes:
        sys.exit("error: no visible layers with a bbox")
    return (
        min(b[0] for b in boxes), min(b[1] for b in boxes),
        max(b[2] for b in boxes), max(b[3] for b in boxes),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("psd")
    parser.add_argument("--list", action="store_true", help="print the layer tree and exit")
    parser.add_argument("--hide", action="append", default=[], metavar="NAME",
                        help="hide layers whose name contains this (repeatable)")
    parser.add_argument("--group", metavar="NAME",
                        help="composite this group only (default: the whole document)")
    parser.add_argument("--viewport", metavar="L,T,R,B",
                        help="render this region; may extend past the canvas into bleed")
    parser.add_argument("--full-bleed", action="store_true",
                        help="render the union bbox of all visible layers")
    parser.add_argument("--out", metavar="PATH", help="output PNG path")
    args = parser.parse_args()

    from psd_tools import PSDImage

    psd = PSDImage.open(args.psd)

    if args.list:
        return cmd_list(psd)
    if not args.out:
        sys.exit("error: --out is required (or pass --list)")
    if args.viewport and args.full_bleed:
        sys.exit("error: pass at most one of --viewport / --full-bleed")

    target = resolve_group(psd, args.group) if args.group else psd

    hidden = resolve_hides(psd, args.hide) if args.hide else []
    for layer in hidden:
        print(f"hiding {layer.name!r}")
        layer.visible = False
    if args.hide and not hidden:
        print(f"warning: nothing matched {args.hide} — is the layer already hidden?", file=sys.stderr)

    try:
        if args.viewport:
            viewport = tuple(int(v) for v in args.viewport.split(","))
        elif args.full_bleed:
            viewport = full_bleed_viewport(target)
            print(f"full bleed extent: {viewport}")
        else:
            viewport = None
        image = target.composite(viewport=viewport) if viewport else target.composite()
    finally:
        for layer in hidden:
            layer.visible = True

    image.save(args.out)
    print(f"wrote {args.out}  ({image.width}x{image.height})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
