-- One rule = one row, replacing the six prose fields as the AUTHORING surface.
--
-- Why: recipe 4c4c128c ("Gaming — Character-Centric Key Art") reached v9 at ~4200 words
-- while holding only ~17 distinct rules. The six prose fields of prompt_versions are not
-- six kinds of content, they are four FACETS of the same rule (statement / how-to /
-- prohibition / check), so every rule got written 3-5 times: "aspect/distortion" appears
-- 18 times in v9, "multi-instance" 19, "bleed seam" 14. Adding v9's single new idea took
-- 10 separate edits and still grew the recipe 10-13%. Prose also has no identity — you
-- cannot "update rule 7" when rule 7 is a clause inside a 300-word paragraph — so every
-- correction round could only append.
--
-- prompt_versions is NOT dropped: a generation run must snapshot exactly the text it was
-- given (generation_runs.resolved_prompt), and the run lineage v1..v9 stays readable.
-- It becomes a GENERATED artifact — scripts/resolve_prompt.py composes the rules that
-- apply to one target into a prompt_versions-shaped payload — instead of a hand-edited one.

create table recipe_rules (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references prompt_recipes(id) on delete cascade,
  slug text not null,                  -- stable identity: 'crop-aspect-first'. Lets a rule be
                                       -- UPDATED (new version row) instead of restated.
  version int not null default 1,
  statement text not null,             -- the rule itself, stated ONCE
  why text,                            -- the incident it came from; kept so edge cases can be
                                       -- judged instead of blindly followed
  applies_to jsonb not null default '{}'::jsonb,
                                       -- {"aspect": ["matte","portrait"], "traits": ["multi_instance"]}
                                       -- aspect: any|square|landscape|portrait|matte
                                       -- traits: multi_instance|has_insets|uses_bleed|split_layout|any_fill
  enforcement text not null,           -- 'validator:<name>' = code fails the run; 'eye' = human/agent judgment
  severity text not null default 'block',   -- block | warn
  layer text not null default 'layout',     -- global | industry | layout  (composition order)
  status text not null default 'active',    -- active | archived
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (recipe_id, slug, version)
);

create index recipe_rules_active_idx on recipe_rules (recipe_id, status);

-- Validators are the other half: a rule whose enforcement is code needs no prose in the
-- prompt at all, because a failing run never reaches the model's output. Registered here so
-- a rule row can point at one and analytics can show which validator fails most often.
create table validators (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,           -- matches recipe_rules.enforcement after 'validator:'
  entrypoint text not null,            -- e.g. 'scripts/crop_box.py verify'
  description text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
