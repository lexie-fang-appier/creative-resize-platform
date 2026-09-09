"""scripts/layer_metadata_experiment.py — research-only, wider per-layer
metadata extraction than scripts/psd_probe.py (which only pulls
name/type-guess/bbox/text since that's all lib/drive.ts's hasSemanticLayerNames()
gate needs today).

Deliberately a SEPARATE script rather than widening psd_probe.py itself —
this is Lexie's exploratory "does per-layer metadata get us more precise
adjustments" experiment (started 2026-09-09), not a production data path yet.
Keeping it separate means the experiment can't accidentally change what the
app's routing logic sees.

2026-09-09 v2: added two fields that came directly out of the NARAKA
guideline's v1->v6 iteration (see 29 Spec - NARAKA Resize Guideline.md,
"Production Checklist" section) — each one exists specifically to stop a
mistake that was previously only caught by eye, days apart, across separate
redesign passes:
  - corner_anchor: which canvas edges the layer's own bbox touches. A
    element corner-anchored in the SOURCE must stay corner-anchored at the
    new size (margin=0 on that edge) — this used to be checked by hand.
  - fine_detail_ratio: low for thin line-art/small text where a dilated
    contact shadow will bridge the gaps between strokes and read as a blur
    (this is exactly what happened to the NARAKA platform-icon row in v4).

Deliberately NOT automated: "is this layer's isolated composite() actually
trustworthy, or does psd-tools misrender it in isolation" (the NARAKA logo
bug — see 29 Spec). Tried three different pixel-comparison heuristics
against the full flattened composite; all three gave the known-broken logo
layer a score that fell inside the normal range of known-GOOD layers that
simply have a lot of transparent padding in their own bbox (banners, icon
rows) — there's no clean numeric threshold that separates "legitimately
mostly-transparent" from "wrongly rendered mostly-transparent" without
understanding what should be there. Shipping a flag that can't reliably
tell those apart would be false confidence, not a real check. This stays a
manual step in the guideline: for any element whose exact appearance
matters, look at the isolated render next to the full-composite crop before
trusting it — don't assume they match.

Usage: python layer_metadata_experiment.py <path/to/file.psd>
Prints one JSON object to stdout: {"source_file", "layers": [...]}
"""
import json
import sys


def guess_layer_type(layer) -> str:
    name = (layer.name or "").lower()
    if layer.kind == "type":
        return "text"
    if "logo" in name:
        return "logo"
    if any(k in name for k in ("cta", "button", "btn")):
        return "cta"
    return "image"


def is_semantic_name(name: str | None) -> bool:
    if not name or not name.strip():
        return False
    stripped = name.strip()
    # Same intent as lib/drive.ts's genericName check: Photoshop's own
    # auto-generated defaults ("圖層 1"/"图层 1" Traditional/Simplified, "Layer 1")
    # don't count.
    import re
    return not re.match(r"^(圖層|图层|layer)\s*\d+", stripped, re.IGNORECASE)


def corner_anchor(bbox, canvas_w: int, canvas_h: int, tol: int = 2) -> dict:
    """Which canvas edges this layer's bbox touches, within `tol` px. A
    corner-anchored source element (see the Keeta/NARAKA badge cases in
    16/29 Ref) must keep margin=0 on that same edge when repositioned —
    this makes that check a lookup instead of an eyeball judgment."""
    left, top, right, bottom = bbox
    return {
        "left": left <= tol,
        "top": top <= tol,
        "right": right >= canvas_w - tol,
        "bottom": bottom >= canvas_h - tol,
    }


def fine_detail_ratio(img) -> float | None:
    """Erode the layer's own alpha by ~2px and measure how much area
    survives. Thin strokes/small text lose most of their area under even a
    small erosion (holes and gaps close up); a solid shape barely changes.
    Low ratio => a dilated contact-shadow will bridge the gaps and read as
    blur (this is exactly the NARAKA platform-icon-row bug) — such layers
    should get little or no dilation, if any shadow at all."""
    try:
        from PIL import ImageFilter
        import numpy as np
    except ImportError:
        return None
    alpha = np.array(img.getchannel("A"))
    total = int((alpha > 20).sum())
    if not total:
        return None
    eroded = np.array(img.getchannel("A").filter(ImageFilter.MinFilter(5)))  # ~2px erosion
    survived = int((eroded > 20).sum())
    return round(survived / total, 3)


def extract(path: str) -> dict:
    from psd_tools import PSDImage

    psd = PSDImage.open(path)
    canvas_w, canvas_h = psd.width, psd.height
    layers = []
    # descendants() yields bottom-to-top within each group in psd-tools —
    # enumerate() index here is what we log as "z-order", 0 = bottom-most.
    for idx, layer in enumerate(psd.descendants()):
        if not layer.is_visible():
            continue
        if layer.bbox == (0, 0, 0, 0):
            continue

        img = None
        try:
            img = layer.composite()
        except Exception:  # noqa: BLE001 - best-effort, matches psd_probe.py
            img = None
        img_rgba = img.convert("RGBA") if img else None

        entry = {
            "z_index": idx,
            "name": layer.name,
            "is_semantic_name": is_semantic_name(layer.name),
            "type_guess": guess_layer_type(layer),
            "bbox": {"x": layer.left, "y": layer.top, "w": layer.width, "h": layer.height},
            "corner_anchor": corner_anchor(layer.bbox, canvas_w, canvas_h),
            "blend_mode": str(layer.blend_mode) if layer.blend_mode else None,
            "opacity": layer.opacity,
            "fill_opacity": layer.fill_opacity,
            "has_effects": layer.has_effects() if hasattr(layer, "has_effects") else None,
            "has_stroke": layer.has_stroke() if hasattr(layer, "has_stroke") else None,
            "has_mask": layer.has_mask() if hasattr(layer, "has_mask") else None,
            "clipping": bool(layer.clipping),
            "fine_detail_ratio": fine_detail_ratio(img_rgba) if img_rgba else None,
        }
        if layer.kind == "type":
            try:
                entry["text_content"] = layer.engine_dict["Editor"]["Text"].value
            except Exception:  # noqa: BLE001 - best-effort, same as psd_probe.py
                entry["text_content"] = None
        layers.append(entry)

    return {"source_file": path.split("/")[-1], "canvas": {"w": canvas_w, "h": canvas_h}, "layers": layers}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: python layer_metadata_experiment.py <path/to/file.psd>"}))
        sys.exit(1)
    print(json.dumps(extract(sys.argv[1]), ensure_ascii=False, indent=None))
