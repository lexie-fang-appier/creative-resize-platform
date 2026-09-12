import Link from "next/link";
import { listRecipes } from "@/lib/prompts";

export const dynamic = "force-dynamic";

const COMPOSITION_LAYERS = [
  { step: "01", label: "Global safety", detail: "Never alter logo, copy, people, products, or compliance content", dot: "bg-slate-400" },
  { step: "02", label: "Format", detail: "Banner, Native, Video and source-type constraints", dot: "bg-sky-500" },
  { step: "03", label: "Industry", detail: "Gaming, commerce, regulated-industry priorities", dot: "bg-violet-500" },
  { step: "04", label: "Aspect class", detail: "Matte, portrait, square and landscape layout behavior", dot: "bg-amber-500" },
  { step: "05", label: "Asset traits", detail: "Insets, multiple heroes, true text, bleed and anchored badges", dot: "bg-fuchsia-500" },
  { step: "06", label: "Target + Job", detail: "Exact output size and campaign-specific instruction", dot: "bg-emerald-500" },
];

const RULE_EXAMPLES = [
  { slug: "framing-floor", statement: "Keep every hero's identity-critical core fully in frame.", scope: "Hero · all aspects", enforcement: "Designer eye", tone: "amber" },
  { slug: "crop-aspect-first", statement: "Derive the crop from the target ratio before resizing.", scope: "Hero crop · all aspects", enforcement: "Validator", tone: "emerald" },
  { slug: "text-row-not-stack", statement: "Spread true text toward the hero on short-wide targets.", scope: "Text · matte only", enforcement: "Designer eye", tone: "amber" },
  { slug: "badge-corner-and-floor", statement: "Preserve this asset's own compliance-badge corner and legibility floor.", scope: "Compliance · when present", enforcement: "Validator", tone: "emerald" },
];

const TONE_STYLES: Record<string, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${TONE_STYLES[tone] ?? TONE_STYLES.slate}`}>{children}</span>;
}

function recipeStatusTone(status: string) {
  if (status === "active") return "emerald";
  if (status === "draft") return "amber";
  return "slate";
}

export default async function PromptsPage() {
  const recipes = await listRecipes();
  const activeCount = recipes.filter((recipe) => recipe.status === "active").length;
  const industries = new Set(recipes.map((recipe) => recipe.industry).filter(Boolean)).size;

  return (
    <main className="mx-auto max-w-[1480px] space-y-5 px-5 py-6 lg:px-8">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Pill tone="violet">Prompt architecture preview</Pill>
              <span className="text-xs text-slate-400">Rules are authored once, resolved per target</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">Prompt Lab</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
              Manage reusable rule atoms by industry, format, aspect class, and asset traits. A generation run receives only
              the visual rules and validators that apply to its exact target—not one full monolithic prompt.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[[recipes.length, "Recipes"], [activeCount, "Active"], [industries, "Industries"]].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <p className="text-lg font-bold text-slate-900">{value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              </div>
            ))}
            <Link href="/prompts/new" className="ml-1 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700">
              + New recipe
            </Link>
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">How a run resolves its prompt</h2>
              <p className="mt-0.5 text-xs text-slate-400">Specific layers narrow general guidance; they do not duplicate it.</p>
            </div>
            <Pill>Resolved snapshot saved with every run</Pill>
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
          {COMPOSITION_LAYERS.map((layer, index) => (
            <div key={layer.label} className="relative rounded-xl border border-slate-200 p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold text-slate-300">{layer.step}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${layer.dot}`} />
              </div>
              <p className="mt-3 text-xs font-bold text-slate-800">{layer.label}</p>
              <p className="mt-1 text-[11px] leading-4 text-slate-400">{layer.detail}</p>
              {index < COMPOSITION_LAYERS.length - 1 && <span className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-[10px] text-slate-400 xl:grid">→</span>}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Industry recipes</h2>
              <p className="mt-0.5 text-xs text-slate-400">One recipe owns its scope; generated versions preserve run history.</p>
            </div>
            <div className="flex gap-2">
              <button disabled className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-400">Filter industry</button>
              <button disabled className="cursor-not-allowed rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-400">Filter status</button>
            </div>
          </div>

          {recipes.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recipes.map((recipe) => (
                <Link key={recipe.id} href={`/prompts/${recipe.id}`} className="group block px-5 py-4 transition-colors hover:bg-slate-50/80">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-bold text-slate-900 group-hover:text-violet-700">{recipe.name}</h3>
                        <Pill tone={recipeStatusTone(recipe.status)}>{recipe.status}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{recipe.industry ?? "Cross-industry"} · {recipe.creativeFormat ?? "All formats"} · {recipe.sourceType ?? "Any source"}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:grid-cols-3 lg:w-[470px]">
                      <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Aspect scope</p><p className="mt-0.5 font-semibold text-slate-600">{recipe.aspectRatioCategory ?? "Target resolved"}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Target mapping</p><p className="mt-0.5 font-semibold text-slate-600">{recipe.applicableTargetSizes.length > 0 ? `${recipe.applicableTargetSizes.length} sizes` : "Rule-based"}</p></div>
                      <div><p className="text-[10px] uppercase tracking-wide text-slate-400">Updated</p><p className="mt-0.5 font-semibold text-slate-600">{new Date(recipe.updatedAt).toLocaleDateString()}</p></div>
                    </div>
                    <span className="text-slate-300 transition-transform group-hover:translate-x-1 group-hover:text-violet-600">→</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="px-5 py-16 text-center"><p className="text-sm font-semibold text-slate-600">No prompt recipes yet</p><p className="mt-1 text-xs text-slate-400">Create a recipe to define the first industry calibration scope.</p></div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3.5">
              <div className="flex items-center justify-between gap-2">
                <div><h2 className="text-sm font-bold text-slate-900">Rule atom preview</h2><p className="mt-0.5 text-xs text-slate-400">Representative structure—not an editor yet</p></div>
                <Pill tone="violet">Gaming</Pill>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {RULE_EXAMPLES.map((rule) => (
                <div key={rule.slug} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3"><p className="font-mono text-[11px] font-bold text-slate-700">{rule.slug}</p><Pill tone={rule.tone}>{rule.enforcement}</Pill></div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{rule.statement}</p>
                  <p className="mt-1 text-[10px] text-slate-400">Applies to: {rule.scope}</p>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 p-3"><button disabled className="w-full cursor-not-allowed rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-400">Open rule library · planned</button></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">Publish gate</h2><Pill tone="amber">Designer review</Pill></div>
            <ol className="mt-4 space-y-3">
              {[
                ["1", "Draft rule change", "Explain what failed and why the rule generalizes."],
                ["2", "Run regression set", "Re-check approved assets and extreme aspect ratios."],
                ["3", "Prompt Owner review", "Approve the rule, validator, scope, and snapshot."],
                ["4", "Publish new version", "Archive the previous snapshot; never rewrite old runs."],
              ].map(([number, title, detail]) => (
                <li key={number} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{number}</span><div><p className="text-xs font-semibold text-slate-700">{title}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-400">{detail}</p></div></li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
