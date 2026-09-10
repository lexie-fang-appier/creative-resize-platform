"""scripts/validator_lib.py — shared plumbing for the recipe_rules validators.

Every validator reads the same two inputs so they can be run together as one gate:

  layers.json   output of scripts/layer_metadata_experiment.py on the source PSD
  manifest.json the PLAN for one output: what was cropped, what was placed, and where

Manifest shape (only the keys a given validator needs have to be present):

  {
    "target":   {"w": 1456, "h": 180},
    "source":   {"canvas": {"w": 1080, "h": 1080}},
    "hero":     {"crop": [l, t, r, b], "placed": [l, t, r, b]},
    "zones":    {"element": [l, t, r, b]},
    "elements": [
      {"role": "logo"|"badge"|"text"|"inset"|"icon_row"|"title",
       "source_layer": "<layer name>",         # or:
       "source_bbox":  [l, t, r, b],
       "placed":       [l, t, r, b],
       "dilated_shadow": false}
    ]
  }

Roles matter: `text` means a true text layer (psd-tools kind == "type"), not a graphic with
lettering baked into it — the two have different rules, and conflating them is one of the
mistakes the rules exist to stop.

A validator exits 0 on pass, 1 on fail, and 2 when it cannot judge (missing input). Exit 2
is deliberately not a pass: "I could not check" must never read as "checked and fine".
"""
import argparse
import json
import sys

TOL = 2  # px slack for edge/flush comparisons


class Check:
    def __init__(self, name: str):
        self.name = name
        self.failures: list[str] = []
        self.notes: list[str] = []
        self.checked = 0

    def fail(self, msg: str) -> None:
        self.failures.append(msg)

    def note(self, msg: str) -> None:
        self.notes.append(msg)

    def report(self) -> int:
        for n in self.notes:
            print(f"  · {n}")
        if not self.checked:
            print(f"SKIP {self.name}: nothing in the manifest for this validator to check")
            return 2
        if self.failures:
            print(f"FAIL {self.name}  ({len(self.failures)} failure(s) across {self.checked} check(s))")
            for f in self.failures:
                print(f"  ✗ {f}")
            return 1
        print(f"PASS {self.name}  ({self.checked} check(s))")
        return 0


def parse_args(description: str, extra=None):
    p = argparse.ArgumentParser(description=description)
    p.add_argument("--manifest", required=True)
    p.add_argument("--layers", help="layer_metadata_experiment.py output for the source PSD")
    for args, kwargs in (extra or []):
        p.add_argument(*args, **kwargs)
    return p.parse_args()


def load(args):
    manifest = json.load(open(args.manifest))
    layers = {}
    if getattr(args, "layers", None):
        for entry in json.load(open(args.layers))["layers"]:
            layers[entry["name"]] = entry
    return manifest, layers


def w(rect) -> int:
    return rect[2] - rect[0]


def h(rect) -> int:
    return rect[3] - rect[1]


def aspect(rect) -> float:
    return w(rect) / h(rect)


def elements(manifest, *roles):
    return [e for e in manifest.get("elements", []) if not roles or e.get("role") in roles]


def source_rect(el, layers):
    """The element's bbox in source pixels, from an explicit bbox or its named layer."""
    if el.get("source_bbox"):
        return el["source_bbox"]
    entry = layers.get(el.get("source_layer", ""))
    if not entry:
        return None
    b = entry["bbox"]
    return [b["x"], b["y"], b["x"] + b["w"], b["y"] + b["h"]]
