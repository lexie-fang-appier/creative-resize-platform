-- 2026-09-08: Designer-defined content groups, per Lexie's request.
--
-- Real problem this solves: the Gap Matrix picked ONE "best geometric fit"
-- asset per target size across the WHOLE job's asset pool — but a client
-- folder routinely has several distinct creative concepts (different product
-- photography, different campaign angles) that happen to share some sizes
-- (e.g. this repo's own fixture data: "MOX Invest-v1_*", "MOXPlus_*", and
-- "MOXINVEST_PM_banner_*" all have 300x250/300x600-ish sizes but are
-- probably three different concepts, not interchangeable). The old logic
-- could silently mix content from different concepts to fill one job's
-- must-have list.
--
-- Per the same "campaign context can't be guessed by AI" principle already
-- applied to industry/placement elsewhere in this schema, grouping is
-- explicit and manual (Designer checks assets in the UI), never inferred
-- from filename patterns.
--
-- Each group gets its OWN Coverage & Gap Matrix, computed only against its
-- member assets — Generate for a group can only pull from that group's
-- assets, never cross-pollinate with a different concept's photos.

create table asset_groups (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table asset_group_members (
  group_id uuid not null references asset_groups(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  primary key (group_id, asset_id)
);

-- gap_matrix_entries was one row per (job_target_placement, spec_dimension)
-- for the whole job; now there can be one such row PER GROUP, since each
-- group computes its own matrix against the same target dimensions.
alter table gap_matrix_entries add column asset_group_id uuid references asset_groups(id) on delete cascade;

-- generation_runs should record which group's asset pool it drew from, for
-- traceability in the Review UI (which concept did this candidate come from).
alter table generation_runs add column asset_group_id uuid references asset_groups(id);
