#!/usr/bin/env python3
"""Crop the planned centre extraction region and resize to the exact target."""

import json
import sys
from pathlib import Path

from PIL import Image


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


def main() -> None:
    if len(sys.argv) not in (5, 6):
        raise SystemExit("usage: finalize_generated_image.py INPUT OUTPUT WIDTH HEIGHT [crop|background_cover]")
    source, output, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    mode = sys.argv[5] if len(sys.argv) == 6 else "crop"
    if mode not in ("crop", "background_cover"):
        raise SystemExit(f"unsupported mode: {mode}")
    with Image.open(source) as image:
        source_rgb = image.convert("RGB")
        if mode == "background_cover":
            scale = max(width / image.width, height / image.height)
            cover_width = max(width, round(image.width * scale))
            cover_height = max(height, round(image.height * scale))
            cover = source_rgb.resize((cover_width, cover_height), resample=resample_for(scale))
            left = (cover_width - width) // 2
            top = (cover_height - height) // 2
            crop_box = (left, top, left + width, top + height)
            result = cover.crop(crop_box)
        else:
            target_ratio = width / height
            source_ratio = image.width / image.height
            if target_ratio > source_ratio:
                crop_height = max(1, round(image.width / target_ratio))
                top = (image.height - crop_height) // 2
                crop_box = (0, top, image.width, top + crop_height)
            else:
                crop_width = max(1, round(image.height * target_ratio))
                left = (image.width - crop_width) // 2
                crop_box = (left, 0, left + crop_width, image.height)
            cropped = source_rgb.crop(crop_box)
            result = cropped.resize((width, height), resample=resample_for(width / cropped.width))
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        save_args = {"optimize": True}
        if image.info.get("icc_profile"):
            save_args["icc_profile"] = image.info["icc_profile"]
        result.save(output, "PNG", **save_args)
    print(json.dumps({"ok": True, "width": width, "height": height, "mode": mode, "crop_box": crop_box, "resampling": "nearest-up/lanczos-down"}))


if __name__ == "__main__":
    main()
