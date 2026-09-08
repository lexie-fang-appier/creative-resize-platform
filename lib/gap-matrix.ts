/**
 * Orchestrates a job's Coverage & Gap Matrix — now ONE PER ASSET GROUP, not
 * one flat matrix across the whole job's assets. Changed 2026-09-08 per
 * Lexie's request: a client folder routinely holds several distinct
 * creative concepts (different product photography, different campaign
 * angles) that happen to share some sizes — the old whole-job matrix could
 * silently pick "best geometric fit" across concepts and mix content that
 * was never meant to be interchangeable (this repo's own fixture data has
 * exactly this: "Ridgeline Invest-v1_*", "RidgelinePlus_*", "RIDGELINE_PM_banner_*" all
 * have overlapping sizes but are presumably three different concepts).
 * Grouping is manual (lib/asset-groups.ts), never inferred from filenames,
 * for the same reason campaign context elsewhere in this app is never
 * guessed by the platform.
 *
 * Each group's matrix only ever matches against that group's own member
 * assets — Generate for a group can only pull from that group's pool.
 * Assets not yet assigned to any group get no matrix at all (not a
 * best-effort one) until the Designer groups them.
 *
 * Still recomputed (delete + reinsert) on every call rather than cached —
 * same reasoning as before, this is cheap in-process rule evaluation.
 */
import { listUngroupedAssetIds, listGroupsForJob, type AssetGroup } from "./asset-groups";
import { listAssetsForJob, type AssetRow } from "./assets";
import { query } from "./db";
import { getJob, listTargetPlacements } from "./jobs";
import { classificationConfidenceFor, routeTarget, type RoutingAsset, type RoutingResult } from "./routing";
import { findSpecVersions, getSpecDimensionsForSpecVersion, type SpecDimensionRow, type SpecVersionRow } from "./specs";

export interface GapMatrixRow {
  jobTargetPlacementId: string;
  placement: string;
  specVersion: Pick<SpecVersionRow, "specVersionId" | "adSolution" | "channel" | "placement" | "creativeFormat" | "sourceDoc">;
  specDimension: SpecDimensionRow;
  assetGroupId: string;
  matchedAssetId: string | null;
  matchedAssetFilename: string | null;
  validationResult: "pass" | "fail" | "needs_processing";
  route: RoutingResult["route"];
  reasonCode: string;
  missingComponents: string[];
}

export interface GroupGapMatrix {
  groupId: string;
  groupName: string;
  rows: GapMatrixRow[];
}

export interface JobGapMatrix {
  groups: GroupGapMatrix[];
  ungroupedAssetIds: Set<string>;
}

function toRoutingAssets(assets: AssetRow[]): RoutingAsset[] {
  return assets.map((a) => ({
    id: a.id,
    format: a.format,
    width: a.width,
    height: a.height,
    fileSizeBytes: a.fileSizeBytes,
    videoDurationSec: a.videoDurationSec,
    redesignEligible: a.redesignEligible,
    scanError: a.scanError,
    classificationConfidence: a.scanError ? null : classificationConfidenceFor(a),
  }));
}

function validationResultFor(route: RoutingResult["route"]): GapMatrixRow["validationResult"] {
  if (route === "ready_to_use") return "pass";
  if (route.startsWith("blocked_") || route === "unsupported_format") return "fail";
  return "needs_processing";
}

export async function computeGapMatrixForJob(jobId: string): Promise<JobGapMatrix> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`computeGapMatrixForJob: job ${jobId} not found`);

  const [targetPlacements, groups, assets, ungroupedAssetIds] = await Promise.all([
    listTargetPlacements(jobId),
    listGroupsForJob(jobId),
    listAssetsForJob(jobId),
    listUngroupedAssetIds(jobId),
  ]);
  const assetsById = new Map(assets.map((a) => [a.id, a]));

  if (targetPlacements.length > 0) {
    await query(`delete from gap_matrix_entries where job_target_placement_id = any($1::uuid[])`, [
      targetPlacements.map((p) => p.id),
    ]);
  }

  const groupMatrices: GroupGapMatrix[] = [];

  for (const group of groups) {
    const groupAssets = group.assetIds.map((id) => assetsById.get(id)).filter((a): a is AssetRow => a != null);
    const routingAssets = toRoutingAssets(groupAssets);
    const rows: GapMatrixRow[] = [];

    for (const tp of targetPlacements) {
      const specVersions = await findSpecVersions(job.adSolution, job.channel, tp.placement);
      for (const sv of specVersions) {
        const dims = await getSpecDimensionsForSpecVersion(sv.specVersionId);
        for (const dim of dims) {
          const result = routeTarget({ width: dim.width, height: dim.height }, routingAssets);
          const validationResult = validationResultFor(result.route);
          const matchedFilename = result.matchedAssetId ? assetsById.get(result.matchedAssetId)?.filename ?? null : null;

          await query(
            `insert into gap_matrix_entries
               (job_target_placement_id, spec_dimension_id, asset_group_id, matched_asset_id, validation_result,
                missing_components_json, route, reason_code)
             values ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              tp.id,
              dim.id,
              group.id,
              result.matchedAssetId,
              validationResult,
              JSON.stringify(result.missingComponents),
              result.route,
              result.reasonCode,
            ],
          );

          rows.push({
            jobTargetPlacementId: tp.id,
            placement: tp.placement,
            specVersion: sv,
            specDimension: dim,
            assetGroupId: group.id,
            matchedAssetId: result.matchedAssetId,
            matchedAssetFilename: matchedFilename,
            validationResult,
            route: result.route,
            reasonCode: result.reasonCode,
            missingComponents: result.missingComponents,
          });
        }
      }
    }

    rows.sort((a, b) => a.placement.localeCompare(b.placement) || a.specDimension.width - b.specDimension.width);
    groupMatrices.push({ groupId: group.id, groupName: group.name, rows });
  }

  return { groups: groupMatrices, ungroupedAssetIds };
}
