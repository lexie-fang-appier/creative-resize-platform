/**
 * Reads `spec_versions` / `spec_dimensions` — the single source of truth for
 * must-have sizes (see CLAUDE.md: "Must-have specs 一定要從 DB 讀，不准寫死").
 * Nothing in this file hardcodes a placement/size list; the Job Create form's
 * placement checkboxes and the Gap Matrix's target dimensions both come from
 * these queries.
 */
import { query } from "./db";

export interface PlacementOption {
  specVersionId: string;
  adSolution: string;
  channel: string;
  placement: string;
  creativeFormat: string;
  sourceDoc: string;
}

/** Distinct (ad_solution, channel, placement) combos — populates the Job
 * Create form's target-placement checkboxes and the ad_solution/channel
 * selects. Never hardcode "Banner"/"Native" in the UI — this is where those
 * strings come from. */
export async function listPlacements(): Promise<PlacementOption[]> {
  return query<PlacementOption>(
    `select id as "specVersionId", ad_solution as "adSolution", channel, placement,
            creative_format as "creativeFormat", source_doc as "sourceDoc"
     from spec_versions
     order by ad_solution, channel, placement`,
  );
}

export interface SpecVersionRow extends PlacementOption {
  version: number;
  notes: string | null;
}

/** The spec_version row(s) matching a job's (ad_solution, channel) and one of
 * its target placements' `placement` text — per 28 Technical Plan §10:
 * "Job Step1 選了哪些 target placements，就去抓對應 ad_solution/channel/placement 的
 * spec_version(s)". */
export async function findSpecVersions(adSolution: string, channel: string, placement: string): Promise<SpecVersionRow[]> {
  return query<SpecVersionRow>(
    `select id as "specVersionId", ad_solution as "adSolution", channel, placement,
            creative_format as "creativeFormat", source_doc as "sourceDoc", version, notes
     from spec_versions
     where ad_solution = $1 and channel = $2 and placement = $3
     order by version desc`,
    [adSolution, channel, placement],
  );
}

export interface SpecDimensionRow {
  id: string;
  specVersionId: string;
  width: number;
  height: number;
  deviceScope: string;
  mustHaveLevel: "required" | "provisional" | "good_to_have" | string;
  notes: string | null;
}

export async function getSpecDimensionsForSpecVersion(specVersionId: string): Promise<SpecDimensionRow[]> {
  return query<SpecDimensionRow>(
    `select id, spec_version_id as "specVersionId", width, height,
            device_scope as "deviceScope", must_have_level as "mustHaveLevel", notes
     from spec_dimensions
     where spec_version_id = $1
     order by width, height`,
    [specVersionId],
  );
}
