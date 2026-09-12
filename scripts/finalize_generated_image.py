#!/usr/bin/env python3
"""Crop the planned center extraction region and resize without convolution."""

import json
import sys
from pathlib import Path

from PIL import Image, ImageStat


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
        raise SystemExit("usage: finalize_generated_image.py INPUT OUTPUT WIDTH HEIGHT [crop|contain_edge_extend|background_cover]")
    source, output, width, height = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    mode = sys.argv[5] if len(sys.argv) == 6 else "crop"
    if mode not in ("crop", "contain_edge_extend", "background_cover"):
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
        elif mode == "contain_edge_extend":
            scale = min(width / image.width, height / image.height)
            contained_width = max(1, round(image.width * scale))
            contained_height = max(1, round(image.height * scale))
            contained = source_rgb.resize((contained_width, contained_height), resample=resample_for(scale))
            # Extreme-ratio prompts pin Compliance to the far/right or bottom
            # edge. Align the retained composition to that same edge so the
            # background extension cannot push it away from the final corner.
            left = width - contained_width
            top = height - contained_height
            result = Image.new("RGB", (width, height))
            if left > 0:
                sample_width = max(1, contained_width // 50)
                left_color = tuple(round(value) for value in ImageStat.Stat(contained.crop((0, 0, sample_width, contained_height))).mean[:3])
                right_color = tuple(round(value) for value in ImageStat.Stat(contained.crop((contained_width - sample_width, 0, contained_width, contained_height))).mean[:3])
                right_width = width - left - contained_width
                result.paste(Image.new("RGB", (left, contained_height), left_color), (0, top))
                result.paste(Image.new("RGB", (right_width, contained_height), right_color), (left + contained_width, top))
            if top > 0:
                sample_height = max(1, contained_height // 50)
                top_color = tuple(round(value) for value in ImageStat.Stat(contained.crop((0, 0, contained_width, sample_height))).mean[:3])
                bottom_color = tuple(round(value) for value in ImageStat.Stat(contained.crop((0, contained_height - sample_height, contained_width, contained_height))).mean[:3])
                bottom_height = height - top - contained_height
                result.paste(Image.new("RGB", (contained_width, top), top_color), (left, 0))
                result.paste(Image.new("RGB", (contained_width, bottom_height), bottom_color), (left, top + contained_height))
            result.paste(contained, (left, top))
            crop_box = None
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
