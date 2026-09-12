#!/usr/bin/env python3
"""Export reusable transparent PSD objects and a compositor manifest.

The PSD-layer-name-to-role mapping is DATA, not a literal in this file. It used
to be a LAYER_MAPS dict with two assets in it, which made every new client asset
a code edit before anything could run end to end — the same shape as a layout
rule that only exists in one person's head.

  --draft  proposes a map by matching each visible PSD layer against a cached
           vision analysis (outputs/naraka-mvp/analysis-*.json) and writes it
           with status "draft".
  (export) reads db/layer-maps/<asset>.json and exports the layers it names.

A draft is never exported from. Roles decide what the compositor is allowed to
move and what it must refuse to drop, so a person confirms them first — set
"status": "confirmed" once the mapping has been checked against the artwork.

This intentionally does not guess a Hero mask when Hero and Background are
flattened into one smart object. The runtime routes that case to the Designer.
"""

import glob
import json
import sys
from pathlib import Path

from psd_tools import PSDImage

MAP_DIR = Path(__file__).resolve().parent.parent / "db" / "layer-maps"
ANALYSIS_DIR = Path(__file__).resolve().parent.parent / "outputs" / "naraka-mvp"
# Roles the compositor can place. Anything else is not worth proposing.
DRAFTABLE_ROLES = {"Brand logo", "Headline", "Supporting copy", "CTA", "Platform marks",
                   "Compliance", "Supporting visual"}
REQUIRED_BY_DEFAULT = {"Brand logo", "Headline", "Supporting copy", "CTA", "Platform marks", "Compliance"}
Z_BY_ROLE = {"Supporting visual": 10, "Brand logo": 30, "Headline": 40, "Supporting copy": 41,
             "CTA": 42, "Platform marks": 43, "Compliance": 100}


def visible_layers(parent, ancestors_visible=True):
    for layer in parent:
        visible = ancestors_visible and layer.is_visible()
        if layer.is_group():
            yield from visible_layers(layer, visible)
        elif visible:
            yield layer


def load_layer_map(source_asset: str) -> dict:
    path = MAP_DIR / f"{source_asset}.json"
    if not path.exists():
        raise SystemExit(
            f"no layer map for {source_asset}: expected {path}. "
            f"Run with --draft to propose one from a cached vision analysis, then confirm it."
        )
    data = json.loads(path.read_text())
    if data.get("status") != "confirmed":
        raise SystemExit(
            f"{path} is status {data.get('status')!r}. Roles decide what the compositor may move "
            f"and what it must refuse to drop, so check the mapping against the artwork and set "
            f'"status": "confirmed" before exporting.'
        )
    return {entry["layerName"]: (entry["id"], entry["role"], entry["required"], entry["z"])
            for entry in data["layers"]}


def iou(a, b) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix0, iy0, ix1, iy1 = max(ax0, bx0), max(ay0, by0), min(ax1, bx1), min(ay1, by1)
    if ix1 <= ix0 or iy1 <= iy0:
        return 0.0
    inter = (ix1 - ix0) * (iy1 - iy0)
    union = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter
    return inter / union if union else 0.0


def load_analysis(source_asset: str) -> list[dict]:
    for path in sorted(glob.glob(str(ANALYSIS_DIR / "analysis-*.json"))):
        data = json.loads(Path(path).read_text())
        if data.get("sourceAsset") == source_asset:
            return data["objects"]
    raise SystemExit(
        f"no cached vision analysis for {source_asset} in {ANALYSIS_DIR}. "
        f"Run the Workspace analyze step for this source first."
    )


def draft(psd: PSDImage, source_asset: str, output_path: Path) -> None:
    objects = [o for o in load_analysis(source_asset) if o["finalLabel"] in DRAFTABLE_ROLES]
    entries = []
    for layer in visible_layers(psd):
        x0, y0, x1, y1 = layer.bbox
        if x1 <= x0 or y1 <= y0:
            continue
        box = (x0 / psd.width * 1000, y0 / psd.height * 1000,
               x1 / psd.width * 1000, y1 / psd.height * 1000)
        best, score = None, 0.0
        for obj in objects:
            b = obj["bbox"]
            overlap = iou(box, (b["x"], b["y"], b["x"] + b["width"], b["y"] + b["height"]))
            if overlap > score:
                best, score = obj, overlap
        if best is None or score < 0.35:
            continue
        role = best["finalLabel"]
        entries.append({"layerName": layer.name, "id": f"{role.lower().replace(' ', '-')}-{len(entries)}",
                        "role": role, "required": role in REQUIRED_BY_DEFAULT,
                        "z": Z_BY_ROLE.get(role, 50), "matchIou": round(score, 3),
                        "matchedObject": best["name"]})
    output_path.write_text(json.dumps({
        "sourceAsset": source_asset,
        "status": "draft",
        "note": "Proposed by bbox overlap against a cached vision analysis. Check every role and id "
                "against the artwork, remove anything that is not a real placeable object, then set "
                'status to "confirmed".',
        "layers": entries,
    }, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": True, "mode": "draft", "proposed": len(entries), "path": str(output_path)}))


def export(psd: PSDImage, source_asset: str, output_dir: Path) -> None:
    layer_map = load_layer_map(source_asset)
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
        if not spec or layer.name in matched_names:
            continue
        matched_names.add(layer.name)
        layer_id, role, required, z = spec
        image = layer.composite(force=True)
        if image is None:
            raise SystemExit(f"could not composite PSD layer: {layer.name}")
        filename = f"{layer_id}.png"
        image.save(output_dir / filename, "PNG", optimize=True)
        exported.append({"id": layer_id, "role": role, "file": filename,
                         "required": required, "z": z, "sourceBbox": list(layer.bbox)})

    missing_mapped = sorted(set(layer_map) - matched_names)
    if missing_mapped:
        raise SystemExit(f"could not find visible mapped PSD layers: {', '.join(missing_mapped)}")

    exported.extend(preserved)
    has_hero = any(layer["role"] == "Hero" for layer in exported)
    manifest_path.write_text(json.dumps({
        "sourceAsset": source_asset,
        "sourceWidth": psd.width,
        "sourceHeight": psd.height,
        "layers": exported,
        "missingRequiredLayers": [] if has_hero else ["Hero"],
        "notes": "A Hero extracted from a flattened smart object remains experimental until Designer approval."
                 if has_hero else
                 "Hero is flattened with Background in the kv smart object and requires an approved transparent cutout.",
    }, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": True, "mode": "export", "exported": len(exported),
                      "missingRequiredLayers": [] if has_hero else ["Hero"]}))


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--draft"]
    is_draft = "--draft" in sys.argv[1:]
    if len(args) != 3:
        raise SystemExit("usage: prepare_extreme_layers.py [--draft] PSD OUTPUT_DIR SOURCE_ASSET")
    psd_path, output_dir, source_asset = Path(args[0]), Path(args[1]), args[2]
    psd = PSDImage.open(psd_path)
    if is_draft:
        MAP_DIR.mkdir(parents=True, exist_ok=True)
        draft(psd, source_asset, MAP_DIR / f"{source_asset}.draft.json")
    else:
        export(psd, source_asset, output_dir)


if __name__ == "__main__":
    main()
