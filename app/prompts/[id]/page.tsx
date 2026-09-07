import { notFound } from "next/navigation";
import { GLOBAL_SAFETY_RULES, getRecipe, listVersions } from "@/lib/prompts";
import { activateVersionAction } from "./actions";
import CloneForm from "./CloneForm";
import NewVersionForm from "./NewVersionForm";
import VersionDiff from "./VersionDiff";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  draft: "bg-amber-100 text-amber-800",
  archived: "bg-slate-100 text-slate-500",
};

export default async function PromptRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  const versions = await listVersions(id);
  const active = versions.find((v) => v.status === "active") ?? null;
  const latest = versions[0] ?? null;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-8 py-10">
      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{recipe.name}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {recipe.industry ?? "—"} · {recipe.creativeFormat ?? "—"} · {recipe.sourceType ?? "—"} ·{" "}
          {recipe.aspectRatioCategory ?? "—"}
        </p>
        {recipe.applicableTargetSizes.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">Applicable sizes: {recipe.applicableTargetSizes.join(", ")}</p>
        )}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <CloneForm recipeId={recipe.id} />
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-900">Resolved prompt preview (active version)</h2>
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
            <span className="font-semibold text-slate-600">1. Global safety rules —</span> {GLOBAL_SAFETY_RULES}
          </div>
          {active ? (
            <>
              <PromptBlock label="2. Industry rules" value={active.industryRules} />
              <PromptBlock label="3. Layout rules" value={active.layoutRules} />
              <PromptBlock label="4. Base prompt" value={active.basePrompt} />
              {active.requiredElements.length > 0 && (
                <PromptBlock label="Required elements" value={active.requiredElements.join(", ")} />
              )}
              {active.forbiddenChanges.length > 0 && (
                <PromptBlock label="Forbidden changes" value={active.forbiddenChanges.join(", ")} />
              )}
              <p className="px-3 pt-1 text-xs text-slate-400">
                + target-size instruction + this Job&rsquo;s campaign instruction, added at Generate time.
              </p>
            </>
          ) : (
            <p className="px-3 py-2 text-sm text-slate-400">No active version — publish a draft below.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-900">Version history</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Version</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-4 py-2.5 font-medium text-slate-800">v{v.versionNumber}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[v.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{new Date(v.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    {v.status !== "active" && (
                      <form action={activateVersionAction.bind(null, recipe.id, v.id)}>
                        <button type="submit" className="text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900">
                          {v.status === "draft" ? "Publish" : "Roll back to this version"}
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {versions.length >= 2 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-900">Diff</h2>
          <VersionDiff versions={versions} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-slate-900">New version</h2>
        <p className="mb-3 text-sm text-slate-500">Pre-filled from the latest version — edit and save as draft, or publish immediately.</p>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <NewVersionForm recipeId={recipe.id} latest={latest} />
        </div>
      </section>
    </main>
  );
}

function PromptBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="px-3 py-1">
      <span className="text-xs font-semibold text-slate-500">{label}:</span>{" "}
      <span className="text-xs text-slate-700">{value}</span>
    </div>
  );
}
