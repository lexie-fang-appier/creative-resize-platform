"""scripts/psd_preview.py — flattened PNG preview for the Asset Inventory's
click-to-expand preview (app/api/assets/[id]/preview/route.ts).

Separate from psd_probe.py on purpose: that script reads the fixed-size PSD
header directly (works without fully downloading huge files) and only needs
psd-tools for the layer manifest. Rendering a flattened preview always needs
the full pixel data via psd-tools' composite(), so there's no header-only
fast path here — this script exists for the one thing it does, not bundled
into psd_probe.py's "works on partial downloads" contract.

.ai is NOT handled here — flattening a vector file needs pymupdf, which 16
Ref's investigation found real ceilings for (outlined text is unreadable,
etc.) and this repo doesn't depend on pymupdf anywhere. The API route returns
"no preview available" for .ai rather than calling this script.

Usage: python psd_preview.py <path/to/file.psd> <output/path.png>
Prints {"ok": true} or {"ok": false, "error": "..."} as JSON to stdout.
"""

import json
import sys


def main() -> None:
    if len(sys.argv) != 3:
        print(json.dumps({"ok": False, "error": "usage: psd_preview.py <input.psd> <output.png>"}))
        sys.exit(1)

    src, dst = sys.argv[1], sys.argv[2]
    try:
        from psd_tools import PSDImage

        psd = PSDImage.open(src)
        image = psd.composite()
        if image is None:
            print(json.dumps({"ok": False, "error": "psd-tools returned no composite (empty or unreadable PSD)"}))
            sys.exit(1)
        image.convert("RGB").save(dst, "PNG")
        print(json.dumps({"ok": True, "width": image.width, "height": image.height}))
    except Exception as exc:  # noqa: BLE001 — this is a CLI boundary, report and exit non-zero
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
