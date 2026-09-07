-- Creative Resize Platform — Phase 0 schema.
-- Source of truth: 28 Technical Plan - Designer Creative Resize Platform.md §10.
-- Real Postgres (via `pg`, no ORM), not Google Sheets — see README for why this
-- diverges from ai-tool-hub's lib/sheets.ts convention.

create extension if not exists pgcrypto;

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  created_at timestamptz not null default now()
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  drive_folder_url text not null,
  drive_folder_id text not null,
  ad_solution text not null,
  channel text not null,
  creative_format text not null,
  campaign_instruction text,
  status text not null default 'draft',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table job_target_placements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  placement text not null,
  status text not null default 'pending'
);

create table spec_versions (
  id uuid primary key default gen_random_uuid(),
  ad_solution text not null,
  channel text not null,
  placement text not null,
  creative_format text not null,
  source_doc text not null,
  version int not null default 1,
  effective_from date not null default current_date,
  notes text
);

create table spec_dimensions (
  id uuid primary key default gen_random_uuid(),
  spec_version_id uuid not null references spec_versions(id) on delete cascade,
  width int not null,
  height int not null,
  device_scope text not null default 'pc_mobile',
  must_have_level text not null default 'required',
  notes text
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  drive_file_id text not null,
  filename text not null,
  mime_type text,
  format text,
  width int,
  height int,
  file_size_bytes bigint,
  video_duration_sec numeric,
  psd_canvas_w int,
  psd_canvas_h int,
  content_hash text,
  is_flattened boolean,
  has_multiple_artboards boolean,
  redesign_eligible boolean,
  scan_error text,
  created_at timestamptz not null default now()
);

create table asset_layers (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  layer_name text,
  layer_type_guess text,
  bbox_json jsonb,
  text_content text,
  render_crop_uri text
);

create table gap_matrix_entries (
  id uuid primary key default gen_random_uuid(),
  job_target_placement_id uuid not null references job_target_placements(id) on delete cascade,
  spec_dimension_id uuid not null references spec_dimensions(id),
  matched_asset_id uuid references assets(id),
  validation_result text,
  missing_components_json jsonb,
  route text,
  reason_code text,
  computed_at timestamptz not null default now()
);

create table prompt_recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  creative_format text,
  source_type text,
  aspect_ratio_category text,
  applicable_target_sizes_json jsonb,
  status text not null default 'draft',
  created_by text not null,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table prompt_versions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references prompt_recipes(id) on delete cascade,
  version_number int not null,
  base_prompt text not null,
  industry_rules text,
  layout_rules text,
  required_elements_json jsonb,
  forbidden_changes_json jsonb,
  validation_rules_json jsonb,
  status text not null default 'draft',
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (recipe_id, version_number)
);

create table target_prompt_assignment (
  id uuid primary key default gen_random_uuid(),
  spec_dimension_id uuid not null references spec_dimensions(id),
  prompt_version_id uuid not null references prompt_versions(id)
);

create table generation_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  source_asset_ids_json jsonb not null,
  target_placement_id uuid not null references job_target_placements(id),
  route text not null,
  prompt_recipe_id uuid references prompt_recipes(id),
  prompt_version_id uuid references prompt_versions(id),
  resolved_prompt text,
  openai_model text,
  api_params_json jsonb,
  output_asset_uri text,
  api_cost_usd numeric(10,4),
  processing_time_ms int,
  validation_result_json jsonb,
  cache_key text,
  parent_run_id uuid references generation_runs(id),
  status text not null default 'queued',
  created_at timestamptz not null default now()
);
create unique index generation_runs_cache_key_uq on generation_runs(cache_key) where status = 'succeeded';

create table review_decisions (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null references generation_runs(id) on delete cascade,
  decision text not null,
  rejection_reason text,
  designer_comment text,
  decided_by text not null,
  decided_at timestamptz not null default now()
);

create table output_assets (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid references generation_runs(id),
  deterministic_ref text,
  drive_output_file_id text not null,
  folder_state text not null,
  written_at timestamptz not null default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs(id),
  actor text not null,
  action text not null,
  target_type text,
  target_id text,
  drive_file_id text,
  detail_json jsonb,
  created_at timestamptz not null default now()
);

create table cost_records (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  generation_run_id uuid references generation_runs(id),
  api_cost_usd numeric(10,4) not null,
  created_at timestamptz not null default now()
);
