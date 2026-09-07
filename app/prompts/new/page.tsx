import { listIndustries } from "@/lib/industries";
import { GLOBAL_SAFETY_RULES } from "@/lib/prompts";
import { listPlacements } from "@/lib/specs";
import NewRecipeForm from "./NewRecipeForm";

export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  const [industries, placements] = await Promise.all([listIndustries(), listPlacements()]);
  const creativeFormats = [...new Set(placements.map((p) => p.creativeFormat))];

  return (
    <main className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">New Prompt Recipe</h1>
      <p className="mt-1 mb-6 text-sm text-slate-500">
        Creates the recipe with an active version 1 — every recipe has at least one usable version from the start.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <NewRecipeForm industries={industries} creativeFormats={creativeFormats} globalSafetyRules={GLOBAL_SAFETY_RULES} />
      </div>
    </main>
  );
}
