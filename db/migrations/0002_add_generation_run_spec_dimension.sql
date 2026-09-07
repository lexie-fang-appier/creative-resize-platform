-- 2026-09-07: generation_runs.target_placement_id only identifies which
-- placement a run is for (e.g. "Banner"), not which of that placement's many
-- required sizes (spec_dimensions rows) — discovered while wiring the
-- Generate button to a specific Gap Matrix row. A run is for one exact size,
-- not "some size under this placement".
alter table generation_runs add column spec_dimension_id uuid references spec_dimensions(id);
