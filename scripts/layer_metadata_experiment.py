"""scripts/layer_metadata_experiment.py — research-only, wider per-layer
metadata extraction than scripts/psd_probe.py (which only pulls
name/type-guess/bbox/text since that's all lib/drive.ts's hasSemanticLayerNames()
gate needs today).

Deliberately a SEPARATE script rather than widening psd_probe.py itself —
this is Lexie's exploratory "does per-layer metadata get us more precise
adjustments" experiment (2026-09-09), not a production data path yet. Keeping
it separate means the experiment can't accidentally change what the app's
routing logic sees.

Usage: python layer_metadata_experiment.py <path/to/file.psd>
Prints one JSON object to stdout: {"source_file", "layers": [...]}
Each layer entry mirrors psd_probe.py's fields (name/type/bbox/text_content)
plus the extra fields verified available on this psd-tools install
(2026-09-09, v1.19.0): blend_mode, opacity, fill_opacity, has_effects,
has_stroke, has_mask, clipping — see the layer-metadata-experiment writeup
for which of June's team's failure modes each field is meant to address.
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


GENERIC_NAME = None  # set below, mirrors lib/drive.ts's genericName regex intent


def is_semantic_name(name: str | None) -> bool:
    if not name or not name.strip():
        return False
    stripped = name.strip()
    # Same intent as lib/drive.ts's genericName check: Photoshop's own
    # auto-generated defaults ("圖層 1"/"图层 1" Traditional/Simplified, "Layer 1")
    # don't count.
    import re
    return not re.match(r"^(圖層|图层|layer)\s*\d+", stripped, re.IGNORECASE)


def extract(path: str) -> dict:
    from psd_tools import PSDImage

    psd = PSDImage.open(path)
    layers = []
    # descendants() yields bottom-to-top within each group in psd-tools —
    # enumerate() index here is what we log as "z-order", 0 = bottom-most.
    for idx, layer in enumerate(psd.descendants()):
        if not layer.is_visible():
            continue
        if layer.bbox == (0, 0, 0, 0):
            continue

        entry = {
            "z_index": idx,
            "name": layer.name,
            "is_semantic_name": is_semantic_name(layer.name),
            "type_guess": guess_layer_type(layer),
            "bbox": {"x": layer.left, "y": layer.top, "w": layer.width, "h": layer.height},
            "blend_mode": str(layer.blend_mode) if layer.blend_mode else None,
            "opacity": layer.opacity,
            "fill_opacity": layer.fill_opacity,
            "has_effects": layer.has_effects() if hasattr(layer, "has_effects") else None,
            "has_stroke": layer.has_stroke() if hasattr(layer, "has_stroke") else None,
            "has_mask": layer.has_mask() if hasattr(layer, "has_mask") else None,
            "clipping": bool(layer.clipping),
        }
        if layer.kind == "type":
            try:
                entry["text_content"] = layer.engine_dict["Editor"]["Text"].value
            except Exception:  # noqa: BLE001 - best-effort, same as psd_probe.py
                entry["text_content"] = None
        layers.append(entry)

    return {"source_file": path.split("/")[-1], "layers": layers}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: python layer_metadata_experiment.py <path/to/file.psd>"}))
        sys.exit(1)
    print(json.dumps(extract(sys.argv[1]), ensure_ascii=False, indent=None))
