#!/usr/bin/env python3
"""Compose original transparent objects over an LLM-generated background plate."""

import json
import sys
from pathlib import Path

from PIL import Image


# Which roles each family can actually place. A role absent here has no zone in
# that layout: optional layers are omitted and reported, required ones stop the
# run so the target routes to the Designer instead of shipping without them.
# Queryable with --describe so the preflight check cannot drift from the geometry.
WIDE_OVERLAY_ROLES = frozenset({"Brand logo", "Headline", "Supporting copy", "CTA", "Platform marks", "Compliance", "Supporting visual"})
MODEL_PAINTED_ROLES = frozenset({"Hero", "Background", "Decorative"})


def family_roles(family: str) -> frozenset[str]:
    if family == "wide_landscape":
        return WIDE_OVERLAY_ROLES
    return frozenset(boxes(1000, 1000, family))


def resample_for(scale: float) -> Image.Resampling:
    """Pick the filter by direction.

    Enlarging keeps NEAREST: no convolution touches the original pixels or
    shifts their colour values. Shrinking cannot keep them all — NEAREST just
    discards the ones it skips, which on this content means a compliance badge's
    caption breaking into disconnected blocks and PS5/STEAM marks going chunky
    (checked by eye at 12x against the real layers, not assumed). LANCZOS
    resolves the discarded detail into the pixels that survive.
    """
    return Image.Resampling.NEAREST if scale >= 1 else Image.Resampling.LANCZOS


FAMILIES = ("ultra_landscape", "ultra_portrait", "wide_landscape")


def fit_layer(image: Image.Image, box: tuple[int, int, int, int], fixed_scale: float | None = None) -> tuple[Image.Image, tuple[int, int]]:
    x, y, width, height = box
    scale = fixed_scale if fixed_scale is not None else min(width / image.width, height / image.height)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    resized = image.resize(size, resample_for(scale))
    return resized, (x + (width - size[0]) // 2, y + (height - size[1]) // 2)


def boxes(width: int, height: int, family: str) -> dict[str, tuple[int, int, int, int]]:
    if family == "ultra_landscape":
        return {
            "Brand logo": (round(width * 0.02), round(height * 0.08), round(width * 0.14), round(height * 0.30)),
            "Hero": (round(width * 0.17), 0, round(width * 0.34), height),
            "Headline": (round(width * 0.48), round(height * 0.18), round(width * 0.22), round(height * 0.64)),
            "Supporting copy": (round(width * 0.70), round(height * 0.18), round(width * 0.13), round(height * 0.64)),
            "CTA": (round(width * 0.83), round(height * 0.18), round(width * 0.10), round(height * 0.64)),
            "Compliance": (round(width * 0.96), round(height * 0.70), round(width * 0.035), round(height * 0.25)),
        }
    return {
        "Brand logo": (round(width * 0.08), round(height * 0.025), round(width * 0.84), round(height * 0.09)),
        "Hero": (0, round(height * 0.12), width, round(height * 0.50)),
        "Headline": (round(width * 0.05), round(height * 0.62), round(width * 0.90), round(height * 0.12)),
        "Supporting copy": (round(width * 0.12), round(height * 0.74), round(width * 0.76), round(height * 0.045)),
        "CTA": (round(width * 0.14), round(height * 0.79), round(width * 0.72), round(height * 0.07)),
        "Compliance": (round(width * 0.02), round(height * 0.94), round(width * 0.12), round(height * 0.05)),
    }


def trim_transparent(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit("transparent layer has no visible pixels")
    return image.crop(bbox)


def scaled(image: Image.Image, scale: float) -> Image.Image:
    return image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), resample_for(scale))


def overlaps(first: tuple[int, int, int, int], second: tuple[int, int, int, int]) -> bool:
    ax, ay, aw, ah = first
    bx, by, bw, bh = second
    return ax < bx + bw and ax + aw > bx and ay < by + bh and ay + ah > by


def compose_wide_landscape(canvas: Image.Image, manifest: dict, layer_root: Path, width: int, height: int, suggested_text_ratio: float | None) -> tuple[list[dict], float, list[dict]]:
    by_role: dict[str, list[tuple[dict, Image.Image]]] = {}
    omitted: list[dict] = []
    for layer in sorted(manifest["layers"], key=lambda item: item["z"]):
        role = layer["role"]
        if role not in WIDE_OVERLAY_ROLES:
            # The model paints the scene, so hero/background/ornament are already
            # in the plate and must not be composited on top of themselves.
            # Anything else that is required has nowhere to go: say so.
            if role not in MODEL_PAINTED_ROLES and layer.get("required"):
                raise SystemExit(
                    f"wide layout has no overlay slot for required role {role!r} "
                    f"(layer {layer['id']!r})"
                )
            omitted.append({"id": layer["id"], "role": role,
                            "reason": "painted_by_model" if role in MODEL_PAINTED_ROLES else "no_slot_in_layout"})
            continue
        with Image.open(layer_root / layer["file"]) as source:
            visible = trim_transparent(source.convert("RGBA"))
        by_role.setdefault(role, []).append((layer, visible))

    required_roles = sorted({layer["role"] for layer in manifest["layers"] if layer.get("required") and layer["role"] in WIDE_OVERLAY_ROLES})
    missing = [role for role in required_roles if not by_role.get(role)]
    if missing:
        raise SystemExit(f"wide layout is missing protected layers: {', '.join(missing)}")

    margin = max(8, round(height * 0.04))
    gap = max(8, min(24, round(height * 0.035)))
    logo = by_role.get("Brand logo", [None])[0]
    headline = by_role.get("Headline", [None])[0]
    supporting_copy = by_role.get("Supporting copy", [None])[0]
    cta = by_role.get("CTA", [None])[0]
    platform = by_role.get("Platform marks", [None])[0]
    compliance = by_role.get("Compliance", [None])[0]
    text_layers = [item for item in (headline, supporting_copy, cta) if item is not None]
    if not any((logo, *text_layers, platform)):
        raise SystemExit("wide layout has no approved foreground flow layers")

    logo_scale = min(height * 0.16 / logo[1].height, width * 0.16 / logo[1].width) if logo else None
    platform_scale = min(height * 0.065 / platform[1].height, width * 0.28 / platform[1].width) if platform else None
    logo_size = scaled(logo[1], logo_scale).size if logo and logo_scale else (0, 0)
    platform_size = scaled(platform[1], platform_scale).size if platform and platform_scale else (0, 0)

    recommendation = suggested_text_ratio if suggested_text_ratio is not None else 0.34
    reference_text = headline or (text_layers[0] if text_layers else None)
    recommended_scale = height * recommendation / reference_text[1].height if reference_text else float("inf")
    row_layers = [item for item in (supporting_copy, cta) if item is not None]
    row_width = sum(item[1].width for item in row_layers) + gap * max(0, len(row_layers) - 1)

    gameplay_size = round(height * 0.41)
    gameplay_size = min(round(height * 0.44), gameplay_size, max(1, round((width * 0.30 - gap) / 2)))
    if by_role.get("Supporting visual") and gameplay_size < round(height * 0.28):
        raise SystemExit("supporting visuals cannot meet the minimum proportional size")
    right_group_width = gameplay_size * 2 + gap if by_role.get("Supporting visual") else 0
    right_start = width - margin - right_group_width
    hero_reserve = max(round(width * 0.28), round(height * 1.05))
    left_width_limit = right_start - hero_reserve - gap * 2 - margin if by_role.get("Supporting visual") else round(width * 0.46) - margin
    if left_width_limit <= 0:
        raise SystemExit("target has no room for protected copy and hero zones")

    stacked_width_units = [item[1].width for item in ([headline] if headline else [])]
    if row_layers:
        stacked_width_units.append(row_width)
    stacked_height_units = (headline[1].height if headline else 0) + max((item[1].height for item in row_layers), default=0)
    stacked_blocks = int(bool(headline)) + int(bool(row_layers))
    stacked_gaps = max(0, int(bool(logo)) + stacked_blocks - 1) + int(bool(platform) and (bool(logo) or stacked_blocks > 0))
    stacked_height_available = height - margin * 2 - logo_size[1] - platform_size[1] - gap * stacked_gaps
    stacked_scale = min(
        recommended_scale,
        min((left_width_limit / unit for unit in stacked_width_units), default=float("inf")),
        stacked_height_available / stacked_height_units if stacked_height_units else float("inf"),
    )

    horizontal_layers = sorted(text_layers, key=lambda item: (item[0].get("sourceBbox", [0, 0])[1], item[0]["z"]))
    horizontal_width_units = sum(item[1].width for item in horizontal_layers) + gap * max(0, len(horizontal_layers) - 1)
    horizontal_height_units = max((item[1].height for item in horizontal_layers), default=0)
    horizontal_blocks = int(bool(horizontal_layers))
    horizontal_gaps = max(0, int(bool(logo)) + horizontal_blocks - 1) + int(bool(platform) and (bool(logo) or horizontal_blocks > 0))
    horizontal_height_available = height - margin * 2 - logo_size[1] - platform_size[1] - gap * horizontal_gaps
    horizontal_scale = min(
        recommended_scale,
        left_width_limit / horizontal_width_units if horizontal_width_units else float("inf"),
        horizontal_height_available / horizontal_height_units if horizontal_height_units else float("inf"),
    )
    row_scale_floor = 0.70 if not by_role.get("Supporting visual") else 0.85
    use_horizontal_text_row = len(horizontal_layers) > 1 and horizontal_scale >= stacked_scale * row_scale_floor
    shared_text_scale = horizontal_scale if use_horizontal_text_row else stacked_scale
    if text_layers and shared_text_scale <= 0:
        raise SystemExit("target cannot fit the protected typography group")

    placed: list[dict] = []
    occupied: list[tuple[str, tuple[int, int, int, int]]] = []

    def paste(layer: dict, source: Image.Image, x: int, y: int, scale: float) -> None:
        foreground = scaled(source, scale)
        rect = (x, y, foreground.width, foreground.height)
        if x < 0 or y < 0 or x + foreground.width > width or y + foreground.height > height:
            raise SystemExit(f"protected layer would be clipped: {layer['id']}")
        for other_id, other_rect in occupied:
            if overlaps(rect, other_rect):
                raise SystemExit(f"protected layers would overlap: {other_id}, {layer['id']}")
        canvas.alpha_composite(foreground, (x, y))
        occupied.append((layer["id"], rect))
        placed.append({"id": layer["id"], "role": layer["role"], "position": [x, y], "size": list(foreground.size)})

    cursor_y = margin
    if logo and logo_scale:
        paste(logo[0], logo[1], margin, cursor_y, logo_scale)
        cursor_y += logo_size[1] + gap
    if use_horizontal_text_row:
        row_x = margin
        for layer, source in horizontal_layers:
            row_image = scaled(source, shared_text_scale)
            paste(layer, source, row_x, cursor_y, shared_text_scale)
            row_x += row_image.width + gap
    else:
        if headline:
            headline_image = scaled(headline[1], shared_text_scale)
            paste(headline[0], headline[1], margin, cursor_y, shared_text_scale)
            cursor_y += headline_image.height + (gap if row_layers else 0)
        row_x = margin
        for layer, source in row_layers:
            row_image = scaled(source, shared_text_scale)
            paste(layer, source, row_x, cursor_y, shared_text_scale)
            row_x += row_image.width + gap
    if platform and platform_scale:
        platform_y = height - margin - platform_size[1]
        paste(platform[0], platform[1], margin, platform_y, platform_scale)

    supporting = by_role.get("Supporting visual", [])[:3]
    slots = [
        (right_start, margin),
        (right_start + gameplay_size + gap, margin),
        (right_start + (gameplay_size + gap) // 2, height - margin - gameplay_size),
    ]
    for (layer, source), (slot_x, slot_y) in zip(supporting, slots):
        visual_scale = min(gameplay_size / source.width, gameplay_size / source.height)
        visual = scaled(source, visual_scale)
        paste(layer, source, slot_x + (gameplay_size - visual.width) // 2, slot_y + (gameplay_size - visual.height) // 2, visual_scale)

    if compliance:
        compliance_scale = min(height * 0.12 / compliance[1].height, width * 0.05 / compliance[1].width)
        compliance_image = scaled(compliance[1], compliance_scale)
        paste(compliance[0], compliance[1], width - margin - compliance_image.width, height - margin - compliance_image.height, compliance_scale)
    return placed, shared_text_scale, omitted


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "--describe":
        print(json.dumps({"families": {f: sorted(family_roles(f)) for f in FAMILIES},
                          "modelPainted": sorted(MODEL_PAINTED_ROLES)}))
        return
    if len(sys.argv) not in (7, 8):
        raise SystemExit("usage: compose_extreme_layout.py BACKGROUND MANIFEST OUTPUT WIDTH HEIGHT FAMILY [SUGGESTED_TEXT_RATIO]\n"
                         "       compose_extreme_layout.py --describe")
    background_path, manifest_path, output_path = map(Path, sys.argv[1:4])
    width, height, family = int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
    suggested_text_ratio = float(sys.argv[7]) if len(sys.argv) == 8 else None
    if family not in FAMILIES:
        raise SystemExit(f"unsupported family: {family}")

    manifest = json.loads(manifest_path.read_text())
    layer_root = manifest_path.parent
    with Image.open(background_path) as background:
        canvas = background.convert("RGBA")
        if canvas.size != (width, height):
            raise SystemExit(f"background must already be {width}x{height}, got {canvas.size}")

    if family == "wide_landscape":
        placed, shared_text_scale, omitted = compose_wide_landscape(canvas, manifest, layer_root, width, height, suggested_text_ratio)
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        canvas.convert("RGB").save(output_path, "PNG", optimize=True)
        print(json.dumps({"ok": True, "family": family, "suggested_text_ratio": suggested_text_ratio, "shared_text_scale": shared_text_scale, "placed": placed, "omitted": omitted}))
        return

    role_boxes = boxes(width, height, family)
    prepared = []
    omitted: list[dict] = []
    for layer in sorted(manifest["layers"], key=lambda item: item["z"]):
        role = layer["role"]
        box = role_boxes.get(role)
        if box is None:
            # Previously this branch was reached silently, and a required
            # Platform marks layer simply vanished with every gate still green.
            if layer.get("required"):
                raise SystemExit(
                    f"{family} has no zone for required role {role!r} "
                    f"(layer {layer['id']!r}); add a zone or route this target to the Designer"
                )
            omitted.append({"id": layer["id"], "role": role, "reason": "no_zone_in_family"})
            continue
        asset_path = layer_root / layer["file"]
        with Image.open(asset_path) as source:
            prepared.append((layer, source.convert("RGBA"), box))

    # All rasterized copy uses one shared scale. This preserves the Designer's
    # original relative font sizing instead of independently enlarging each box.
    text_roles = {"Headline", "Supporting copy", "CTA"}
    text_scales = []
    headline_source = None
    for layer, source, box in prepared:
        if layer["role"] in text_roles:
            _, _, box_width, box_height = box
            text_scales.append(min(box_width / source.width, box_height / source.height))
        if layer["role"] == "Headline":
            headline_source = source
    recommended_scale = height * suggested_text_ratio / headline_source.height if suggested_text_ratio is not None and headline_source is not None else None
    shared_text_scale = min([*text_scales, recommended_scale] if recommended_scale is not None else text_scales) if text_scales else None

    placed = []
    for layer, source, box in prepared:
        role = layer["role"]
        foreground, position = fit_layer(source, box, shared_text_scale if role in text_roles else None)
        if position[0] < 0 or position[1] < 0 or position[0] + foreground.width > width or position[1] + foreground.height > height:
            raise SystemExit(f"protected layer would be clipped: {layer['id']}")
        canvas.alpha_composite(foreground, position)
        placed.append({"id": layer["id"], "role": role, "position": position, "size": foreground.size})

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output_path, "PNG", optimize=True)
    print(json.dumps({"ok": True, "family": family, "suggested_text_ratio": suggested_text_ratio, "shared_text_scale": shared_text_scale, "placed": placed, "omitted": omitted}))


if __name__ == "__main__":
    main()
