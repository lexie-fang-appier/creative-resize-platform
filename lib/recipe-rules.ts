import { query } from "./db";

/** The two pipelines resolve rules by different taxonomies on purpose — the skill
 * path by aspect class, this one by layout family — so a rule row declares which
 * surface it serves rather than one vocabulary being forced on both. */
export const GENERATION_SURFACE = "generate";

export type RuleLayer = "global" | "industry" | "layout";

export interface GenerationRule {
  slug: string;
  statement: string;
  why: string | null;
  layer: RuleLayer;
  enforcement: string;
  appliesTo: {
    surface?: string;
    layoutFamily?: string[];
    roles?: string[];
    minAspectRatio?: number;
  };
}

const LAYER_ORDER: Record<RuleLayer, number> = { global: 0, industry: 1, layout: 2 };

/** Deterministic and total: two runs with the same inputs resolve the same
 * prompt, which is what makes the generation cache key meaningful. */
export function selectGenerationRules(
  rules: GenerationRule[],
  context: { layoutFamily: string; aspectRatio: number; roles: Set<string> },
): GenerationRule[] {
  return rules
    .filter((rule) => {
      const spec = rule.appliesTo;
      const families = spec.layoutFamily ?? ["any"];
      if (!families.includes("any") && !families.includes(context.layoutFamily)) return false;
      if (spec.minAspectRatio !== undefined && context.aspectRatio <= spec.minAspectRatio) return false;
      if (spec.roles && !spec.roles.some((role) => context.roles.has(role))) return false;
      return true;
    })
    .sort((a, b) => LAYER_ORDER[a.layer] - LAYER_ORDER[b.layer] || a.slug.localeCompare(b.slug));
}

export async function loadGenerationRules(): Promise<GenerationRule[]> {
  const rows = await query<GenerationRule & { appliesTo: GenerationRule["appliesTo"] }>(
    `select slug, statement, why, layer, enforcement, applies_to as "appliesTo"
       from recipe_rules
      where status = 'active' and applies_to->>'surface' = $1
      order by slug`,
    [GENERATION_SURFACE],
  );
  if (rows.length === 0) {
    // No silent fallback: an empty rule set would quietly send the model a
    // prompt with none of its constraints in it.
    throw new Error("No active generation-surface rules found in recipe_rules — seed db/seed_recipe_rules_generation.sql.");
  }
  return rows;
}
