#!/usr/bin/env python3
"""Export reusable transparent PSD objects and a compositor manifest.

This intentionally does not guess a Hero mask when Hero and Background are
flattened into one smart object. The runtime will route that case to Designer.
"""

import json
import sys
from pathlib import Path

from psd_tools import PSDImage


LAYER_MAPS = {
    "YJp810": {
        "中式logo-NAKARA繁體(上白下白)": ("brand-logo", "Brand logo", True, 30),
        "群組 2": ("supporting-visual-left", "Supporting visual", False, 10),
        "群組 2 拷貝": ("supporting-visual-right", "Supporting visual", False, 11),
        "群組 2 拷貝 2": ("supporting-visual-top", "Supporting visual", False, 12),
        "577badad59376887731259ae7efbdc91c57da1c2682c96-9LGq9S": ("headline", "Headline", True, 40),
        "群組 3": ("supporting-copy", "Supporting copy", True, 41),
        "群組 1": ("platform-marks", "Platform marks", True, 43),
        "圖層 6": ("cta", "CTA", True, 42),
        "分級標章15+": ("compliance", "Compliance", True, 100),
    },
    "YJp814": {
        "繁中": ("brand-logo", "Brand logo", True, 30),
        "西行志": ("headline", "Headline", True, 40),
        "特木爾全新外觀": ("supporting-copy", "Supporting copy", True, 41),
        "分級標章15+": ("compliance", "Compliance", True, 100),
    },
}


def visible_layers(parent, ancestors_visible=True):
    for layer in parent:
        visible = ancestors_visible and layer.is_visible()
        if layer.is_group():
            yield from visible_layers(layer, visible)
        elif visible:
            yield layer


def main() -> None:
    if len(sys.argv) != 4:
        raise SystemExit("usage: prepare_extreme_layers.py PSD OUTPUT_DIR SOURCE_ASSET")
    psd_path, output_dir, source_asset = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
    layer_map = LAYER_MAPS.get(source_asset)
    if layer_map is None:
        raise SystemExit(f"no reviewed PSD layer mapping for: {source_asset}")
    psd = PSDImage.open(psd_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"
    preserved = []
    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())
        # A rerun must not erase reviewed segmentation work created separately.
        preserved = [layer for layer in existing.get("layers", []) if layer.get("role") == "Hero"]
    exported = []

    matched_names = set()
    for layer in visible_layers(psd):
        spec = layer_map.get(layer.name)
        if not spec:
            continue
        if layer.name in matched_names:
            continue
        matched_names.add(layer.name)
        layer_id, role, required, z = spec
        image = layer.composite(force=True)
        if image is None:
            raise SystemExit(f"could not composite PSD layer: {layer.name}")
        filename = f"{layer_id}.png"
        image.save(output_dir / filename, "PNG", optimize=True)
        exported.append({
            "id": layer_id,
            "role": role,
            "file": filename,
            "required": required,
            "z": z,
            "sourceBbox": list(layer.bbox),
        })

    missing_mapped = sorted(set(layer_map) - matched_names)
    if missing_mapped:
        raise SystemExit(f"could not find visible mapped PSD layers: {', '.join(missing_mapped)}")

    exported.extend(preserved)
    has_hero = any(layer["role"] == "Hero" for layer in exported)
    manifest = {
        "sourceAsset": source_asset,
        "sourceWidth": psd.width,
        "sourceHeight": psd.height,
        "layers": exported,
        "missingRequiredLayers": [] if has_hero else ["Hero"],
        "notes": "A Hero extracted from a flattened smart object remains experimental until Designer approval." if has_hero else "Hero is flattened with Background in the kv smart object and requires an approved transparent cutout.",
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": True, "exported": len(exported), "missingRequiredLayers": manifest["missingRequiredLayers"]}))


if __name__ == "__main__":
    main()
