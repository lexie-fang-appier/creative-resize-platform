/**
 * Orchestrates one job's Coverage & Gap Matrix: job_target_placements x
 * spec_dimensions (via matching spec_versions) x scanned assets -> lib/routing.ts
 * decision, persisted to `gap_matrix_entries` and returned in display shape.
 *
 * Every row carries its placement/channel tag (28 Technical Plan §10/§4: "每一
 * 列的 size 都固定帶著它所屬的 placement/channel 標籤...不會出現裸尺寸") by joining
 * back through spec_dimensions -> spec_versions rather than storing a bare
 * width/height anywhere.
 *
 * Recomputed (delete + reinsert for the job's target placements) on every call
 * rather than cached — Phase 1 has no async job queue yet (28 Technical Plan §5
 * describes one for later phases), and gap-matrix computation here is cheap
 * (in-process rule evaluation, no network/LLM calls), so recomputing on each
 * job-detail page load keeps the matrix honestly up to date after a rescan
 * without needing a separate "stale" flag.
 */
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
  matchedAssetId: string | null;
  matchedAssetFilename: string | null;
  validationResult: "pass" | "fail" | "needs_processing";
  route: RoutingResult["route"];
  reasonCode: string;
  missingComponents: string[];
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
    // classify.ts is metadata-only and cheap — safe to run per asset here
    // rather than storing a classification column on `assets` (Phase 0 schema
    // doesn't have one, and the result can change if spec-matrix.ts's enums
    // ever change, so deriving it at read time avoids a stale cached value).
    classificationConfidence: a.scanError ? null : classificationConfidenceFor(a),
  }));
}

function validationResultFor(route: RoutingResult["route"]): GapMatrixRow["validationResult"] {
  if (route === "ready_to_use") return "pass";
  if (route.startsWith("blocked_") || route === "unsupported_format") return "fail";
  return "needs_processing";
}

export async function computeGapMatrixForJob(jobId: string): Promise<GapMatrixRow[]> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`computeGapMatrixForJob: job ${jobId} not found`);

  const targetPlacements = await listTargetPlacements(jobId);
  const assets = await listAssetsForJob(jobId);
  const assetsById = new Map(assets.map((a) => [a.id, a]));
  const routingAssets = toRoutingAssets(assets);

  if (targetPlacements.length > 0) {
    await query(`delete from gap_matrix_entries where job_target_placement_id = any($1::uuid[])`, [
      targetPlacements.map((p) => p.id),
    ]);
  }

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
             (job_target_placement_id, spec_dimension_id, matched_asset_id, validation_result,
              missing_components_json, route, reason_code)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            tp.id,
            dim.id,
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
  return rows;
}
