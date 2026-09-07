"""scripts/psd_probe.py — merged PSD/AI probing + layer manifest extraction.

Ported from classifier/probe_source.py (canvas/artboard geometry probing) and
classifier/extract_manifest.py (PSD layer manifest via psd-tools), merged into one
script per the platform design: PSD/AI parsing is invoked as a bundled Python CLI
script called via Node child_process, not a separate service — both prototype
scripts operate on the same source file, so probing + manifest extraction belong
in one call rather than two subprocess round-trips.

Usage: python psd_probe.py <path/to/file.psd|.ai>
Prints a single JSON object to stdout.

PSD: canvas size is read from the fixed 26-byte header (Adobe Photoshop File
Format spec) via struct.unpack — no dependency needed, works even on files too
large to fully download, matches probe_source.py exactly. Layer manifest
extraction (name/type-guess/bbox/text) uses psd-tools (read-only — cannot write
back edited text or move layers, a psd-tools limitation carried over from
extract_manifest.py's original docstring; the designer's own Photoshop
ExtendScript/UXP tool is still needed for the actual redesign "套版" step, this
script only proves a manifest can be extracted programmatically).

AI (modern Illustrator, PDF-compatible container): each PDF page is one artboard;
pypdf reads each page's MediaBox for its exact size in points (1pt = 1px at this
file's native 72dpi convention). No layer manifest extraction for .ai — psd-tools
doesn't support it, and .ai redesign is out of MVP scope per the vault plan docs
(".ai 維持擱置，不計入 MVP 支援率").
"""
import json
import struct
import sys
from pathlib import Path


def probe_psd_header(path: str) -> dict:
    with open(path, "rb") as f:
        header = f.read(26)
    sig, ver, _reserved, channels, height, width, depth, colormode = \
        struct.unpack(">4sH6sHIIHH", header)
    if sig != b"8BPS":
        return {"error": f"not a PSD (signature={sig!r})"}
    return {
        "width": width, "height": height, "channels": channels,
        "depth": depth, "colormode": colormode,
    }


def guess_layer_type(layer) -> str:
    name = (layer.name or "").lower()
    if layer.kind == "type":
        return "text"
    if "logo" in name:
        return "logo"
    if any(k in name for k in ("cta", "button", "btn")):
        return "cta"
    return "image"


def extract_psd_layers(path: str) -> list[dict]:
    """Read-only layer manifest via psd-tools. Returns [] if psd-tools isn't
    installed (see scripts/requirements.txt); probing still returns canvas
    geometry even when this fails — layer extraction is a bonus, not a
    prerequisite, for the geometry half of this script's job."""
    try:
        from psd_tools import PSDImage
    except ImportError:
        return []

    try:
        psd = PSDImage.open(path)
    except Exception as e:  # noqa: BLE001 - report any parse failure as data, not a crash
        return [{"error": f"psd-tools failed to open file: {e}"}]

    elements = []
    for layer in psd.descendants():
        if not layer.is_visible():
            continue
        if layer.bbox == (0, 0, 0, 0):
            continue
        entry = {
            "name": layer.name,
            "type": guess_layer_type(layer),
            "bbox": {"x": layer.left, "y": layer.top, "w": layer.width, "h": layer.height},
        }
        if layer.kind == "type":
            try:
                entry["text_content"] = layer.engine_dict["Editor"]["Text"].value
            except Exception:  # noqa: BLE001 - text extraction is best-effort
                entry["text_content"] = None
        elements.append(entry)
    return elements


def probe_ai(path: str) -> list[dict]:
    import pypdf
    reader = pypdf.PdfReader(path)
    artboards = []
    for i, page in enumerate(reader.pages):
        box = page.mediabox
        artboards.append({
            "artboard_index": i,
            "width": round(float(box.width)),
            "height": round(float(box.height)),
        })
    return artboards


def probe(path: str) -> dict:
    p = Path(path)
    suffix = p.suffix.lower()

    if suffix == ".psd":
        geo = probe_psd_header(path)
        if "error" in geo:
            return {"source_file": p.name, "source_type": "psd", "error": geo["error"]}
        return {
            "source_file": p.name,
            "source_type": "psd",
            "canvas": {"width": geo["width"], "height": geo["height"]},
            "channels": geo["channels"],
            "depth": geo["depth"],
            "colormode": geo["colormode"],
            "elements": extract_psd_layers(path),
        }

    if suffix == ".ai":
        return {
            "source_file": p.name,
            "source_type": "ai",
            "artboards": probe_ai(path),
            # psd-tools doesn't read .ai files; no layer manifest available for this format.
            "elements": [],
        }

    return {"source_file": p.name, "error": f"unsupported source format: {suffix}"}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: python psd_probe.py <path/to/file.psd|.ai>"}))
        sys.exit(1)
    print(json.dumps(probe(sys.argv[1]), indent=2, ensure_ascii=False))
