/**
 * Prompt Lab data access — prompt_recipes / prompt_versions (28 Technical
 * Plan §9). Composition order for a resolved prompt is:
 *
 *   GLOBAL_SAFETY_RULES + version.industry_rules + version.layout_rules
 *     + (required/forbidden/validation) + target-size instruction
 *     + Job's campaign_instruction
 *
 * GLOBAL_SAFETY_RULES is platform-wide and intentionally NOT a DB column —
 * it must never be different per recipe (16 Ref's Global rules and the "no
 * ghostwriting copy, no touching the logo" boundary from the PRD apply
 * uniformly). The actual composition into a generation_runs.resolved_prompt
 * happens in the Generate flow (task 3), not here — this module only manages
 * recipes/versions themselves.
 *
 * Versioning: publishing a new version never edits an old row (schema §18 —
 * "改 prompt 不可改寫舊 generation run"). Exactly one version per recipe should
 * be 'active' at a time; publishOrActivateVersion() enforces that by
 * demoting the recipe's previous active version to 'archived' in the same
 * transaction.
 */
import { getPool, query } from "./db";

export const GLOBAL_SAFETY_RULES = `Do not rewrite the client's copy or CTA text. Do not alter the logo. Do not invent products, people, or compliance/legal content that isn't in the source. Do not remove required CTAs, disclaimers, or certification marks. This output is a candidate only — it is never auto-published, and must be reviewed by a Designer before use.`;

export interface PromptRecipe {
  id: string;
  name: string;
  industry: string | null;
  creativeFormat: string | null;
  sourceType: string | null;
  aspectRatioCategory: string | null;
  applicableTargetSizes: string[];
  status: string;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  recipeId: string;
  versionNumber: number;
  basePrompt: string;
  industryRules: string | null;
  layoutRules: string | null;
  requiredElements: string[];
  forbiddenChanges: string[];
  validationRules: string[];
  status: string;
  createdBy: string;
  createdAt: string;
}

const RECIPE_COLUMNS = `id, name, industry, creative_format as "creativeFormat", source_type as "sourceType",
  aspect_ratio_category as "aspectRatioCategory",
  coalesce(applicable_target_sizes_json, '[]'::jsonb) as "applicableTargetSizes",
  status, created_by as "createdBy", updated_by as "updatedBy",
  created_at as "createdAt", updated_at as "updatedAt"`;

const VERSION_COLUMNS = `id, recipe_id as "recipeId", version_number as "versionNumber", base_prompt as "basePrompt",
  industry_rules as "industryRules", layout_rules as "layoutRules",
  coalesce(required_elements_json, '[]'::jsonb) as "requiredElements",
  coalesce(forbidden_changes_json, '[]'::jsonb) as "forbiddenChanges",
  coalesce(validation_rules_json, '[]'::jsonb) as "validationRules",
  status, created_by as "createdBy", created_at as "createdAt"`;

export async function listRecipes(): Promise<PromptRecipe[]> {
  return query<PromptRecipe>(`select ${RECIPE_COLUMNS} from prompt_recipes order by industry, name`);
}

export async function getRecipe(id: string): Promise<PromptRecipe | null> {
  const rows = await query<PromptRecipe>(`select ${RECIPE_COLUMNS} from prompt_recipes where id = $1`, [id]);
  return rows[0] ?? null;
}

export async function listVersions(recipeId: string): Promise<PromptVersion[]> {
  return query<PromptVersion>(
    `select ${VERSION_COLUMNS} from prompt_versions where recipe_id = $1 order by version_number desc`,
    [recipeId],
  );
}

export async function getVersion(id: string): Promise<PromptVersion | null> {
  const rows = await query<PromptVersion>(`select ${VERSION_COLUMNS} from prompt_versions where id = $1`, [id]);
  return rows[0] ?? null;
}

/** The version Generate should use for this recipe right now. Exactly one
 * active version is the invariant publishOrActivateVersion() maintains. */
export async function getActiveVersion(recipeId: string): Promise<PromptVersion | null> {
  const rows = await query<PromptVersion>(
    `select ${VERSION_COLUMNS} from prompt_versions where recipe_id = $1 and status = 'active'`,
    [recipeId],
  );
  return rows[0] ?? null;
}

export interface CreateRecipeInput {
  name: string;
  industry: string | null;
  creativeFormat: string | null;
  sourceType: string | null;
  aspectRatioCategory: string | null;
  applicableTargetSizes: string[];
  createdBy: string;
  // First version's content — every recipe is created with one active version,
  // there's no such thing as a recipe with zero versions to review.
  basePrompt: string;
  industryRules: string | null;
  layoutRules: string | null;
  requiredElements: string[];
  forbiddenChanges: string[];
  validationRules: string[];
}

export async function createRecipe(input: CreateRecipeInput): Promise<{ recipeId: string; versionId: string }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const recipeRes = await client.query(
      `insert into prompt_recipes (name, industry, creative_format, source_type, aspect_ratio_category,
         applicable_target_sizes_json, status, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,'active',$7,$7) returning id`,
      [
        input.name,
        input.industry,
        input.creativeFormat,
        input.sourceType,
        input.aspectRatioCategory,
        JSON.stringify(input.applicableTargetSizes),
        input.createdBy,
      ],
    );
    const recipeId = recipeRes.rows[0].id as string;
    const versionRes = await client.query(
      `insert into prompt_versions (recipe_id, version_number, base_prompt, industry_rules, layout_rules,
         required_elements_json, forbidden_changes_json, validation_rules_json, status, created_by)
       values ($1,1,$2,$3,$4,$5,$6,$7,'active',$8) returning id`,
      [
        recipeId,
        input.basePrompt,
        input.industryRules,
        input.layoutRules,
        JSON.stringify(input.requiredElements),
        JSON.stringify(input.forbiddenChanges),
        JSON.stringify(input.validationRules),
        input.createdBy,
      ],
    );
    await client.query("commit");
    return { recipeId, versionId: versionRes.rows[0].id as string };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export interface CreateVersionInput {
  basePrompt: string;
  industryRules: string | null;
  layoutRules: string | null;
  requiredElements: string[];
  forbiddenChanges: string[];
  validationRules: string[];
  createdBy: string;
  /** Publish immediately (demotes the current active version to archived) vs.
   * save as draft for further editing first. */
  publish: boolean;
}

export async function createVersion(recipeId: string, input: CreateVersionInput): Promise<string> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const maxRes = await client.query(`select coalesce(max(version_number), 0) as max from prompt_versions where recipe_id = $1`, [
      recipeId,
    ]);
    const nextVersion = (maxRes.rows[0].max as number) + 1;
    if (input.publish) {
      await client.query(`update prompt_versions set status = 'archived' where recipe_id = $1 and status = 'active'`, [recipeId]);
    }
    const res = await client.query(
      `insert into prompt_versions (recipe_id, version_number, base_prompt, industry_rules, layout_rules,
         required_elements_json, forbidden_changes_json, validation_rules_json, status, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [
        recipeId,
        nextVersion,
        input.basePrompt,
        input.industryRules,
        input.layoutRules,
        JSON.stringify(input.requiredElements),
        JSON.stringify(input.forbiddenChanges),
        JSON.stringify(input.validationRules),
        input.publish ? "active" : "draft",
        input.createdBy,
      ],
    );
    await client.query(`update prompt_recipes set updated_by = $2, updated_at = now() where id = $1`, [recipeId, input.createdBy]);
    await client.query("commit");
    return res.rows[0].id as string;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Publish a draft version, or roll back to an archived one — both are "make
 * this the active version" and both demote whatever's currently active.
 * Never deletes or rewrites the version being demoted (§18: history stays
 * intact for generation runs that already used it). */
export async function activateVersion(recipeId: string, versionId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`update prompt_versions set status = 'archived' where recipe_id = $1 and status = 'active'`, [recipeId]);
    await client.query(`update prompt_versions set status = 'active' where id = $1 and recipe_id = $2`, [versionId, recipeId]);
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Duplicates a recipe's metadata + its active (or latest) version's content
 * into a brand-new recipe — for adapting an existing recipe to a new
 * industry/format rather than starting from a blank prompt. Never mutates
 * the source recipe. */
export async function cloneRecipe(sourceRecipeId: string, newName: string, createdBy: string): Promise<string> {
  const source = await getRecipe(sourceRecipeId);
  if (!source) throw new Error("Source recipe not found.");
  const versions = await listVersions(sourceRecipeId);
  const base = versions.find((v) => v.status === "active") ?? versions[0];
  if (!base) throw new Error("Source recipe has no versions to clone.");
  const { recipeId } = await createRecipe({
    name: newName,
    industry: source.industry,
    creativeFormat: source.creativeFormat,
    sourceType: source.sourceType,
    aspectRatioCategory: source.aspectRatioCategory,
    applicableTargetSizes: source.applicableTargetSizes,
    createdBy,
    basePrompt: base.basePrompt,
    industryRules: base.industryRules,
    layoutRules: base.layoutRules,
    requiredElements: base.requiredElements,
    forbiddenChanges: base.forbiddenChanges,
    validationRules: base.validationRules,
  });
  return recipeId;
}
