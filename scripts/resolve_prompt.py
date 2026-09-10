"""scripts/resolve_prompt.py — compose the prompt for ONE target from recipe_rules.

This is what makes "one rule = one row" actually save anything. The recipe is no longer a
document that gets sent whole: each rule declares what it applies to, and a run only ever
sees the rules that apply to its own target. A 320x1200 run never reads the matte
text-row rules; a single-character asset never reads the multi-instance paragraphs; and
rules whose enforcement is a validator are not sent as prose at all, because a failing
validator stops the run before its output can be wrong.

Usage:
  python resolve_prompt.py --target 1456x180 [--traits multi_instance,has_insets]
  python resolve_prompt.py --target 500x500 --format json
  python resolve_prompt.py --target 1456x180 --show-all   # include validator-enforced rules

Reads DATABASE_URL from the environment (or .env.local next to the repo root).
"""
import argparse
import json
import os
import sys

RECIPE_ID = "4c4c128c-e7c5-4431-9599-15307e42ff15"
LAYER_ORDER = {"global": 0, "industry": 1, "layout": 2}


def aspect_class(w: int, h: int) -> str:
    a = w / h
    if a >= 2.2:
        return "matte"
    if a <= 0.8:
        return "portrait"
    if 0.95 <= a <= 1.05:
        return "square"
    return "landscape"


def load_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
    if os.path.exists(env):
        for line in open(env):
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"')
    sys.exit("DATABASE_URL not set and not found in .env.local")


def fetch_rules():
    import subprocess
    sql = (
        "select slug, statement, why, applies_to::text, enforcement, layer "
        f"from recipe_rules where recipe_id='{RECIPE_ID}' and status='active' order by slug"
    )
    out = subprocess.run(["psql", load_url(), "-tA", "-F", "\x1f", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    rules = []
    for line in out.strip("\n").split("\n"):
        if not line:
            continue
        slug, statement, why, applies, enforcement, layer = line.split("\x1f")
        rules.append({"slug": slug, "statement": statement, "why": why,
                      "applies_to": json.loads(applies), "enforcement": enforcement, "layer": layer})
    return rules


def applies(rule, aspect: str, traits: set) -> bool:
    spec = rule["applies_to"]
    want_aspect = spec.get("aspect", ["any"])
    if "any" not in want_aspect and aspect not in want_aspect:
        return False
    return set(spec.get("traits", [])).issubset(traits)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--target", required=True, help="output size, e.g. 1456x180")
    p.add_argument("--traits", default="", help="comma-separated: multi_instance,has_insets,uses_bleed,split_layout,any_fill")
    p.add_argument("--show-all", action="store_true", help="also print rules enforced by a validator")
    p.add_argument("--format", choices=["text", "json"], default="text")
    args = p.parse_args()

    w, h = (int(v) for v in args.target.lower().split("x"))
    aspect = aspect_class(w, h)
    traits = {t for t in args.traits.split(",") if t}

    all_rules = fetch_rules()
    matched = [r for r in all_rules if applies(r, aspect, traits)]
    prose = [r for r in matched if r["enforcement"] == "eye" or args.show_all]
    gated = [r for r in matched if r["enforcement"].startswith("validator:")]
    prose.sort(key=lambda r: (LAYER_ORDER.get(r["layer"], 9), r["slug"]))

    if args.format == "json":
        print(json.dumps({"target": f"{w}x{h}", "aspect_class": aspect, "traits": sorted(traits),
                          "prompt_rules": prose, "validators": [r["enforcement"].split(":", 1)[1] for r in gated]},
                         ensure_ascii=False, indent=2))
        return 0

    body = "\n\n".join(f"- {r['statement']}" for r in prose)
    print(f"# {w}x{h} ({aspect}{', ' + ', '.join(sorted(traits)) if traits else ''})\n")
    print("## Rules to judge by eye\n")
    print(body or "- (none)")
    print("\n## Enforced by validators before this run can pass\n")
    for r in gated:
        print(f"- {r['enforcement'].split(':', 1)[1]}  ({r['slug']})")
    words = len(body.split())
    print(f"\n---\nprompt: {words} words from {len(prose)} rules "
          f"({len(all_rules) - len(matched)} rules not applicable to this target, "
          f"{len(gated)} handled by code)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
