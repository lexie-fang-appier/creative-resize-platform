import { notFound, redirect } from "next/navigation";
import { listAssetsForJob } from "@/lib/assets";
import { resolvePromptRecipe } from "@/lib/generation";
import { getJob } from "@/lib/jobs";
import { rankSourceAssets } from "@/lib/source-assets";
import { requireSessionEmail } from "@/lib/require-session";
import SourceAssetPicker from "./SourceAssetPicker";

export const dynamic = "force-dynamic";

export default async function SourceSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const sessionEmail = await requireSessionEmail().catch(() => null);
  if (!sessionEmail) redirect("/login");
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [assets, prompt] = await Promise.all([listAssetsForJob(id), resolvePromptRecipe(job.clientIndustry, job.creativeFormat)]);
  const candidates = rankSourceAssets(assets);

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-8 lg:px-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-600">Step 2 of 3 · Select source</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Choose the original file to resize</h1>
        <p className="mt-1 text-sm text-slate-500">Scanned {assets.length} files from {job.clientName}. Choose one source before object detection begins.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="whitespace-nowrap font-semibold">Industry: {job.clientIndustry ?? "Other"}</span>
        <span className="text-slate-300">→</span>
        <span className="whitespace-nowrap font-semibold">Prompt: {prompt.recipeName}</span>
        {prompt.resolution !== "industry" && <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">General fallback</span>}
      </div>
      <SourceAssetPicker jobId={job.id} candidates={candidates} />
    </main>
  );
}
