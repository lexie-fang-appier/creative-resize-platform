"""scripts/validate_all.py — run every active validator for one output as a single gate.

Which validators to run is not hardcoded here: it comes from the `recipe_rules` rows that
apply to this target (scripts/resolve_prompt.py's filtering) joined to `validators`. A rule
whose validator is still `declared` rather than `active` is reported as NOT CHECKED — never
silently as a pass, because "no code exists yet" and "checked and fine" must not look alike.

Exit code 0 only when nothing failed and nothing was silently skipped that should have run.

Usage:
  python validate_all.py --manifest manifest-1200x627.json --layers layers.json [--expected-insets 5]
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RECIPE_ID = "4c4c128c-e7c5-4431-9599-15307e42ff15"

# validator name -> (script, extra argv builder)
RUNNERS = {
    "crop_aspect":        ("crop_box.py", lambda a, m: [
        "verify", "--box", ",".join(str(v) for v in m["hero"]["crop"]),
        "--target", f"{m['hero']['placed'][2] - m['hero']['placed'][0]}x"
                    f"{m['hero']['placed'][3] - m['hero']['placed'][1]}"]),
    "bleed_coverage":     ("validate_bleed.py", None),
    "corner_anchor":      ("validate_anchor.py", None),
    "text_floor":         ("validate_text.py", None),
    "badge_size":         ("validate_badge.py", None),
    "inset_count":        ("validate_insets.py",
                           lambda a, m: (["--expected", str(a.expected_insets)] if a.expected_insets else [])),
    "fine_detail_shadow": ("validate_shadow.py", None),
    "zone_height":        ("validate_zone.py", None),
    # scene_extraction is enforced by producing the scene with extract_scene.py, and
    # crosscheck_render produces evidence for a human verdict — neither is a manifest check.
}


def db_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    for line in open(os.path.join(os.path.dirname(HERE), ".env.local")):
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("DATABASE_URL not set")


def active_validators():
    sql = (f"select r.slug, split_part(r.enforcement,':',2), v.status "
           f"from recipe_rules r left join validators v on v.name = split_part(r.enforcement,':',2) "
           f"where r.recipe_id='{RECIPE_ID}' and r.status='active' "
           f"and r.enforcement like 'validator:%' order by r.slug")
    out = subprocess.run(["psql", db_url(), "-tA", "-F", "\x1f", "-c", sql],
                         capture_output=True, text=True, check=True).stdout
    return [l.split("\x1f") for l in out.strip("\n").split("\n") if l]


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--manifest", required=True)
    p.add_argument("--layers")
    p.add_argument("--expected-insets", type=int)
    args = p.parse_args()
    manifest = json.load(open(args.manifest))

    failed, not_checked, ran = [], [], 0
    for slug, name, status in active_validators():
        if status != "active":
            not_checked.append(f"{name} ({slug}) — validator status={status or 'missing'}")
            continue
        script, extra = RUNNERS.get(name, (None, None))
        if not script:
            not_checked.append(f"{name} ({slug}) — no manifest-level runner")
            continue
        if extra and extra.__code__.co_argcount == 2 and name == "crop_aspect":
            cmd = [sys.executable, os.path.join(HERE, script)] + extra(args, manifest)
        else:
            cmd = [sys.executable, os.path.join(HERE, script), "--manifest", args.manifest]
            if args.layers:
                cmd += ["--layers", args.layers]
            if extra:
                cmd += extra(args, manifest)
        r = subprocess.run(cmd, capture_output=True, text=True)
        ran += 1
        head = (r.stdout.strip().split("\n") or [""])[-1]
        print(f"[{name}] {head}")
        for line in r.stdout.split("\n"):
            if line.strip().startswith("✗"):
                print(f"    {line.strip()}")
        if r.returncode == 1:
            failed.append(name)

    print(f"\n{ran} validator(s) ran, {len(failed)} failed")
    if not_checked:
        print("NOT CHECKED (not a pass):")
        for n in not_checked:
            print(f"  ? {n}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
