"""scripts/render_recipe_version.py — render recipe_rules into a prompt_versions row.

recipe_rules is the authoring surface; prompt_versions stays as the app's read path and as
the immutable snapshot a generation run points at. So prompt_versions rows are now
GENERATED, not hand-edited — which is the whole point: a rule is stated once, in one row,
and every place it needs to appear is derived from there.

Per-target prompts still come from scripts/resolve_prompt.py (only the rules that apply to
that target). This renders the unfiltered set, for the Prompt Lab UI and for the run
snapshot.

Usage:
  python render_recipe_version.py                 # print the rendered fields
  python render_recipe_version.py --insert 10     # archive the active version, insert v10
"""
import argparse
import json
import os
import subprocess
import sys

RECIPE_ID = "4c4c128c-e7c5-4431-9599-15307e42ff15"
AUTHOR = "lexie.fang23@gmail.com"

HEADER = (
    "GENERATED from the recipe_rules table (one rule = one row) — do not hand-edit this "
    "version. Edit or add a rule row instead and re-render, so a rule is stated exactly once "
    "rather than restated as a statement, a how-to, a prohibition and a check. Runs should "
    "resolve the rules that apply to their own target via scripts/resolve_prompt.py; this "
    "unfiltered rendering exists for the Prompt Lab view and the run snapshot.\n\n"
    "Rules whose enforcement is a validator are NOT restated as instructions here — a failing "
    "validator stops the run before its output can be wrong, which is stricter than asking the "
    "model to comply. They are listed under Forbidden Changes as the checks that gate a run.\n"
)


def db_url() -> str:
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    env = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
    for line in open(env):
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().strip('"')
    sys.exit("DATABASE_URL not set")


def q(sql: str) -> str:
    return subprocess.run(["psql", db_url(), "-tA", "-F", "\x1f", "-c", sql],
                          capture_output=True, text=True, check=True).stdout


def rules():
    out = q("select slug, statement, why, enforcement, layer from recipe_rules "
            f"where recipe_id='{RECIPE_ID}' and status='active' order by layer, slug")
    return [dict(zip(("slug", "statement", "why", "enforcement", "layer"), l.split("\x1f")))
            for l in out.strip("\n").split("\n") if l]


def render(rs):
    def block(layer):
        sel = [r for r in rs if r["layer"] == layer and r["enforcement"] == "eye"]
        return "\n\n".join(f"[{r['slug']}] {r['statement']}\n  Why: {r['why']}" for r in sel)

    validators = sorted({r["enforcement"].split(":", 1)[1] for r in rs
                         if r["enforcement"].startswith("validator:")})
    return {
        "base_prompt": HEADER + "\n" + block("global"),
        "industry_rules": block("industry") or None,
        "layout_rules": block("layout"),
        "required_elements": [f"[{r['slug']}] {r['statement']}" for r in rs if r["enforcement"] == "eye"],
        "forbidden_changes": [f"validator:{v} must pass before this run is reviewable" for v in validators],
        "validation_rules": [f"[{r['slug']}] {r['statement']}" for r in rs],
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--insert", type=int, metavar="N", help="insert as version N and make it active")
    args = p.parse_args()

    rs = rules()
    out = render(rs)
    eye = sum(1 for r in rs if r["enforcement"] == "eye")
    words = len((out["base_prompt"] + " " + (out["industry_rules"] or "") + " " + out["layout_rules"]).split())
    print(f"{len(rs)} rules ({eye} by eye, {len(rs) - eye} by validator) -> {words} words of prose",
          file=sys.stderr)

    if args.insert is None:
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0

    files = {}
    for k in ("base_prompt", "industry_rules", "layout_rules"):
        files[k] = f"/tmp/rv_{k}.txt"
        open(files[k], "w").write(out[k] or "")
    for k in ("required_elements", "forbidden_changes", "validation_rules"):
        files[k] = f"/tmp/rv_{k}.json"
        open(files[k], "w").write(json.dumps(out[k], ensure_ascii=False))

    sql = f"""
\\set base `cat {files['base_prompt']}`
\\set ind `cat {files['industry_rules']}`
\\set lay `cat {files['layout_rules']}`
\\set req `cat {files['required_elements']}`
\\set forb `cat {files['forbidden_changes']}`
\\set valid `cat {files['validation_rules']}`
begin;
update prompt_versions set status='archived' where recipe_id='{RECIPE_ID}' and status='active';
insert into prompt_versions (recipe_id, version_number, base_prompt, industry_rules, layout_rules,
  required_elements_json, forbidden_changes_json, validation_rules_json, status, created_by)
values ('{RECIPE_ID}', {args.insert}, :'base', nullif(:'ind',''), :'lay',
  :'req'::jsonb, :'forb'::jsonb, :'valid'::jsonb, 'active', '{AUTHOR}');
commit;
"""
    r = subprocess.run(["psql", db_url(), "-v", "ON_ERROR_STOP=1"], input=sql,
                       capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
