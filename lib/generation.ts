/**
 * Generation run creation + prompt resolution for the Gap Matrix's Generate
 * button. Per 28 Technical Plan §8/§15: only queues a run — never calls an
 * image-generation API here. This prototype has no OpenAI key provisioned
 * yet, so the actual pixel work is done by a Designer asking Claude Code to
 * process a queued run by hand (see README "How generation actually runs
 * today"), not by an automated worker. This module's job is just: resolve
 * the right prompt, dedupe via cache_key, and persist the queued row so that
 * workflow has something concrete to act on.
 */
import { createHash } from "node:crypto";
import { query } from "./db";
import type { GapMatrixRow } from "./gap-matrix";
import type { Job } from "./jobs";
import { GLOBAL_SAFETY_RULES } from "./prompts";

export type GeneratableRoute = "eligible_scale" | "eligible_crop_fill" | "eligible_psd_redesign" | "video_compression";

const GENERATABLE_ROUTES: ReadonlySet<string> = new Set([
  "eligible_scale",
  "eligible_crop_fill",
  "eligible_psd_redesign",
  "video_compression",
]);

/** Whether this Gap Matrix row is a candidate for the Generate button at all
 * — must have a route that implies "there's a usable source to work from"
 * AND an actual matched asset (routing.ts sometimes emits these routes
 * without one only in edge cases that shouldn't reach the UI as clickable). */
export function isGeneratable(row: Pick<GapMatrixRow, "route" | "matchedAssetId">): boolean {
  return GENERATABLE_ROUTES.has(row.route) && row.matchedAssetId != null;
}

interface RecipeMatch {
  recipeId: string;
  recipeName: string;
  versionId: string;
  basePrompt: string;
  industryRules: string | null;
  layoutRules: string | null;
  requiredElements: string[];
  forbiddenChanges: string[];
}

/** Picks the most specific active recipe for this job: exact
 * industry+format match beats industry-only or format-only beats the fully
 * general (industry & creative_format both null) fallback. Returns null only
 * if there's no active recipe at all — including no general fallback, which
 * means Prompt Lab is empty and Generate should refuse rather than guess. */
async function findBestRecipe(industry: string | null, creativeFormat: string | null): Promise<RecipeMatch | null> {
  const rows = await query<RecipeMatch & { industryCol: string | null; formatCol: string | null }>(
    `select r.id as "recipeId", r.name as "recipeName", v.id as "versionId",
            v.base_prompt as "basePrompt", v.industry_rules as "industryRules", v.layout_rules as "layoutRules",
            coalesce(v.required_elements_json, '[]'::jsonb) as "requiredElements",
            coalesce(v.forbidden_changes_json, '[]'::jsonb) as "forbiddenChanges",
            r.industry as "industryCol", r.creative_format as "formatCol"
     from prompt_recipes r
     join prompt_versions v on v.recipe_id = r.id and v.status = 'active'
     where (r.industry = $1 or r.industry is null) and (r.creative_format = $2 or r.creative_format is null)
     order by (r.industry is not null)::int + (r.creative_format is not null)::int desc
     limit 1`,
    [industry, creativeFormat],
  );
  return rows[0] ?? null;
}

function targetSizeInstruction(dim: { width: number; height: number; deviceScope: string; mustHaveLevel: string }): string {
  return `Target canvas: ${dim.width}x${dim.height} (${dim.deviceScope}, ${dim.mustHaveLevel}). Output must be exactly this pixel size.`;
}

export function composeResolvedPrompt(
  recipe: RecipeMatch,
  dim: { width: number; height: number; deviceScope: string; mustHaveLevel: string },
  campaignInstruction: string | null,
): string {
  const parts = [`Global safety rules: ${GLOBAL_SAFETY_RULES}`];
  if (recipe.industryRules) parts.push(`Industry rules: ${recipe.industryRules}`);
  if (recipe.layoutRules) parts.push(`Layout rules: ${recipe.layoutRules}`);
  parts.push(`Base prompt: ${recipe.basePrompt}`);
  if (recipe.requiredElements.length) parts.push(`Required elements: ${recipe.requiredElements.join(", ")}`);
  if (recipe.forbiddenChanges.length) parts.push(`Forbidden changes: ${recipe.forbiddenChanges.join(", ")}`);
  parts.push(targetSizeInstruction(dim));
  if (campaignInstruction) parts.push(`Job instruction: ${campaignInstruction}`);
  return parts.join("\n\n");
}

export function computeCacheKey(sourceAssetIds: string[], specDimensionId: string, promptVersionId: string): string {
  const sorted = [...sourceAssetIds].sort().join(",");
  return createHash("sha256").update(`${sorted}|${specDimensionId}|${promptVersionId}`).digest("hex");
}

export interface GenerationRun {
  id: string;
  jobId: string;
  sourceAssetIds: string[];
  targetPlacementId: string;
  specDimensionId: string;
  route: string;
  promptRecipeId: string | null;
  promptRecipeName: string | null;
  promptVersionId: string | null;
  resolvedPrompt: string | null;
  outputAssetUri: string | null;
  cacheKey: string | null;
  status: string;
  createdAt: string;
}

const RUN_COLUMNS = `g.id, g.job_id as "jobId", g.source_asset_ids_json as "sourceAssetIds",
  g.target_placement_id as "targetPlacementId", g.spec_dimension_id as "specDimensionId", g.route,
  g.prompt_recipe_id as "promptRecipeId", r.name as "promptRecipeName",
  g.prompt_version_id as "promptVersionId", g.resolved_prompt as "resolvedPrompt",
  g.output_asset_uri as "outputAssetUri", g.cache_key as "cacheKey", g.status, g.created_at as "createdAt"`;

export async function listGenerationRunsForJob(jobId: string): Promise<GenerationRun[]> {
  return query<GenerationRun>(
    `select ${RUN_COLUMNS} from generation_runs g left join prompt_recipes r on r.id = g.prompt_recipe_id
     where g.job_id = $1 order by g.created_at desc`,
    [jobId],
  );
}

export async function listQueuedRuns(): Promise<GenerationRun[]> {
  return query<GenerationRun>(
    `select ${RUN_COLUMNS} from generation_runs g left join prompt_recipes r on r.id = g.prompt_recipe_id
     where g.status = 'queued' order by g.created_at asc`,
  );
}

export interface CreateGenerationRunResult {
  run: GenerationRun;
  reused: boolean;
}

/** Creates a queued generation run for one Gap Matrix row, or returns the
 * existing succeeded run if the cache key already matches (§15: same source
 * + target + prompt version never re-runs). Throws if there's no active
 * prompt recipe at all for this job — including no general fallback — since
 * queuing a run with no prompt to resolve isn't a "generate later" state,
 * it's a configuration gap the Designer needs to fix in Prompt Lab first. */
export async function createGenerationRun(job: Job, row: GapMatrixRow): Promise<CreateGenerationRunResult> {
  if (!isGeneratable(row)) throw new Error(`Route ${row.route} is not generatable, or has no matched asset.`);

  const recipe = await findBestRecipe(job.clientIndustry, job.creativeFormat);
  if (!recipe) {
    throw new Error("No active prompt recipe found — not even a general fallback. Create one in Prompt Lab first.");
  }

  const sourceAssetIds = [row.matchedAssetId!];
  const cacheKey = computeCacheKey(sourceAssetIds, row.specDimension.id, recipe.versionId);

  const existing = await query<GenerationRun>(
    `select ${RUN_COLUMNS} from generation_runs g left join prompt_recipes r on r.id = g.prompt_recipe_id
     where g.cache_key = $1 and g.status = 'succeeded' limit 1`,
    [cacheKey],
  );
  if (existing[0]) return { run: existing[0], reused: true };

  const resolvedPrompt = composeResolvedPrompt(recipe, row.specDimension, job.campaignInstruction);

  const inserted = await query<{ id: string }>(
    `insert into generation_runs
       (job_id, source_asset_ids_json, target_placement_id, spec_dimension_id, route,
        prompt_recipe_id, prompt_version_id, resolved_prompt, cache_key, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued') returning id`,
    [
      job.id,
      JSON.stringify(sourceAssetIds),
      row.jobTargetPlacementId,
      row.specDimension.id,
      row.route,
      recipe.recipeId,
      recipe.versionId,
      resolvedPrompt,
      cacheKey,
    ],
  );

  const created = await query<GenerationRun>(`select ${RUN_COLUMNS} from generation_runs g left join prompt_recipes r on r.id = g.prompt_recipe_id where g.id = $1`, [
    inserted[0].id,
  ]);
  return { run: created[0], reused: false };
}
