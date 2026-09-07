import Link from "next/link";
import { listRecipes } from "@/lib/prompts";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const recipes = await listRecipes();

  return (
    <main className="mx-auto max-w-5xl px-8 py-10">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Prompt Lab</h1>
          <p className="mt-1 text-sm text-slate-500">
            Per-industry redesign prompt recipes. Composed as: global safety rules + industry rules + layout rules +
            target-size instruction + this Job&rsquo;s instruction.
          </p>
        </div>
        <Link
          href="/prompts/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-700"
        >
          + New Recipe
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Industry</th>
              <th className="px-4 py-3 font-semibold">Creative format</th>
              <th className="px-4 py-3 font-semibold">Aspect-ratio category</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/prompts/${r.id}`} className="font-medium text-slate-900 hover:text-slate-600 hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.industry ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{r.creativeFormat ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{r.aspectRatioCategory ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(r.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
            {recipes.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  No prompt recipes yet — create one to start composing redesign prompts by industry.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
