import { notFound } from "next/navigation";
import { listGroupsForJob } from "@/lib/asset-groups";
import { listAssetsForJob } from "@/lib/assets";
import { isFixtureMode } from "@/lib/drive";
import { formatDimensions } from "@/lib/format";
import { computeGapMatrixForJob } from "@/lib/gap-matrix";
import { isGeneratable, listGenerationRunsForJob } from "@/lib/generation";
import { getJob } from "@/lib/jobs";
import { getDecisionsForRuns } from "@/lib/reviews";
import AssetInventoryTable from "./AssetInventoryTable";
import { generateAction } from "./generate-actions";
import RejectForm from "./RejectForm";
import { approveAction } from "./review-actions";

export const dynamic = "force-dynamic";

const GENERATION_STATUS_STYLES: Record<string, string> = {
  queued: "bg-amber-100 text-amber-800",
  processing: "bg-sky-100 text-sky-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  failed_final: "bg-red-100 text-red-800",
};

const DECISION_STYLES: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};

const ROUTE_STYLES: Record<string, string> = {
  ready_to_use: "bg-emerald-100 text-emerald-800",
  eligible_scale: "bg-sky-100 text-sky-800",
  eligible_crop_fill: "bg-sky-100 text-sky-800",
  eligible_psd_redesign: "bg-violet-100 text-violet-800",
  video_compression: "bg-sky-100 text-sky-800",
  manual_rearrange: "bg-amber-100 text-amber-800",
  blocked_missing_context: "bg-red-100 text-red-800",
  blocked_no_usable_source: "bg-red-100 text-red-800",
  unsupported_format: "bg-slate-200 text-slate-700",
};

function RouteBadge({ route }: { route: string }) {
  const style = ROUTE_STYLES[route] ?? "bg-slate-200 text-slate-700";
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>
      {route.replace(/_/g, " ")}
    </span>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
        {subtitle && <span className="text-sm text-slate-400">{subtitle}</span>}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">{children}</div>
      </div>
    </section>
  );
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const [assets, groups, gapMatrix, generationRuns] = await Promise.all([
    listAssetsForJob(id),
    listGroupsForJob(id),
    computeGapMatrixForJob(id),
    listGenerationRunsForJob(id),
  ]);
  const decisions = await getDecisionsForRuns(generationRuns.map((r) => r.id));
  const runsByTarget = new Map<string, (typeof generationRuns)[number]>();
  for (const run of generationRuns) {
    const key = `${run.assetGroupId}-${run.targetPlacementId}-${run.specDimensionId}`;
    // Runs are ordered newest-first (listGenerationRunsForJob) — first write wins, so this ends up as the latest.
    if (!runsByTarget.has(key)) runsByTarget.set(key, run);
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-8 py-10">
      {isFixtureMode() && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
          <span aria-hidden>⚠️</span>
          <p>
            <span className="font-semibold">Dev fixture mode</span> — no Google Drive credentials configured, showing
            sample ticket data instead of a real Drive scan. Set{" "}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">GOOGLE_SERVICE_ACCOUNT_JSON</code>{" "}
            to scan a real folder.
          </p>
        </div>
      )}

      <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{job.clientName}</h1>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
            {job.status.replace(/_/g, " ")}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-slate-600">
          {job.adSolution} / {job.channel} / {job.creativeFormat}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Drive folder: <span className="break-all">{job.driveFolderUrl}</span>
        </p>
        {job.campaignInstruction && (
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <span className="font-medium">Instruction:</span> {job.campaignInstruction}
          </p>
        )}
      </header>

      <SectionCard title="Asset Inventory" subtitle={`${assets.length} scanned`}>
        <AssetInventoryTable jobId={id} assets={assets} groups={groups} />
      </SectionCard>
      <p className="-mt-4 text-xs text-slate-400">
        Same-size assets can be different content (this repo&rsquo;s own fixture data has three: Ridgeline Invest / RidgelinePlus /
        RIDGELINE_PM at overlapping sizes) — the Gap Matrix below is computed per group, never guessed from filenames.
        Check assets above and group them before they show up in a Gap Matrix.
      </p>

      {gapMatrix.ungroupedAssetIds.size > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {gapMatrix.ungroupedAssetIds.size} asset(s) aren&rsquo;t in a group yet — they won&rsquo;t appear in any Coverage &amp;
          Gap Matrix below until you group them.
        </div>
      )}

      {gapMatrix.groups.map((group) => (
        <div key={group.groupId}>
          <SectionCard title={`Coverage & Gap Matrix — ${group.groupName}`} subtitle={`${group.rows.length} target sizes`}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Placement / Channel</th>
                  <th className="px-4 py-3 font-semibold">Required Size</th>
                  <th className="px-4 py-3 font-semibold">Must-have</th>
                  <th className="px-4 py-3 font-semibold">Matched Asset</th>
                  <th className="px-4 py-3 font-semibold">Validation</th>
                  <th className="px-4 py-3 font-semibold">Route</th>
                  <th className="px-4 py-3 font-semibold">Reason Code</th>
                  <th className="px-4 py-3 font-semibold">Missing Components</th>
                  <th className="px-4 py-3 font-semibold">Generate</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row, i) => {
                  const existingRun = runsByTarget.get(`${row.assetGroupId}-${row.jobTargetPlacementId}-${row.specDimension.id}`);
                  return (
                    <tr
                      key={`${row.jobTargetPlacementId}-${row.specDimension.id}`}
                      className={`border-b border-slate-100 last:border-b-0 ${i % 2 === 1 ? "bg-slate-50/50" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {row.specVersion.adSolution} · {row.specVersion.channel} · {row.specVersion.placement}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                        {formatDimensions(row.specDimension.width, row.specDimension.height)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{row.specDimension.mustHaveLevel}</td>
                      <td className="max-w-[16rem] truncate px-4 py-2.5 text-slate-600" title={row.matchedAssetFilename ?? undefined}>
                        {row.matchedAssetFilename ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{row.validationResult}</td>
                      <td className="px-4 py-2.5">
                        <RouteBadge route={row.route} />
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{row.reasonCode}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {row.missingComponents.length > 0 ? row.missingComponents.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {existingRun ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              GENERATION_STATUS_STYLES[existingRun.status] ?? "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {existingRun.status}
                          </span>
                        ) : isGeneratable(row) ? (
                          <form action={generateAction.bind(null, id, row.assetGroupId, row.jobTargetPlacementId, row.specDimension.id)}>
                            <button
                              type="submit"
                              className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                            >
                              Generate
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {group.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                      No gap matrix rows yet — this job may not have any matching spec_versions for its target
                      placements.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SectionCard>
          <p className="mt-2 text-xs text-slate-400">
            <code className="font-mono">manual_compliance</code> and <code className="font-mono">blocked_safezone</code>{" "}
            are not implemented in Phase 1 — no icon/CTA/end-card/safe-zone detection exists yet, so these two routes
            are never shown here (see README). Generate is only offered for eligible_scale/eligible_crop_fill/
            eligible_psd_redesign/video_compression rows that have a matched source asset.
          </p>
        </div>
      ))}

      {gapMatrix.groups.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm">
          No asset groups yet — check some assets above and group them to see their Coverage &amp; Gap Matrix.
        </div>
      )}

      {generationRuns.length > 0 && (
        <SectionCard title="Generation Runs" subtitle={`${generationRuns.length} total`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Route</th>
                <th className="px-4 py-3 font-semibold">Prompt recipe</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Output</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Resolved prompt</th>
                <th className="px-4 py-3 font-semibold">Review</th>
              </tr>
            </thead>
            <tbody>
              {generationRuns.map((run, i) => {
                const decision = decisions.get(run.id);
                return (
                <tr key={run.id} className={`border-b border-slate-100 last:border-b-0 align-top ${i % 2 === 1 ? "bg-slate-50/50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <RouteBadge route={run.route} />
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{run.promptRecipeName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                        GENERATION_STATUS_STYLES[run.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {run.outputAssetUri ? (
                      <a href={run.outputAssetUri} className="text-slate-700 underline underline-offset-2">
                        view
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{new Date(run.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <details>
                      <summary className="cursor-pointer text-xs text-slate-500 marker:content-none">▸ view prompt</summary>
                      <pre className="mt-2 max-w-md whitespace-pre-wrap rounded-md bg-slate-50 p-2 font-mono text-xs leading-5 text-slate-600">
                        {run.resolvedPrompt}
                      </pre>
                    </details>
                  </td>
                  <td className="px-4 py-2.5">
                    {decision ? (
                      <div className="space-y-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${DECISION_STYLES[decision.decision]}`}
                        >
                          {decision.decision}
                        </span>
                        {decision.rejectionReason && <p className="max-w-[14rem] text-xs text-slate-500">{decision.rejectionReason}</p>}
                      </div>
                    ) : run.status === "succeeded" ? (
                      <div className="flex flex-wrap items-start gap-2">
                        <form action={approveAction.bind(null, id, run.id)}>
                          <button
                            type="submit"
                            className="rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 shadow-sm transition-colors hover:bg-emerald-50"
                          >
                            Approve
                          </button>
                        </form>
                        <RejectForm jobId={id} generationRunId={run.id} />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>
      )}
    </main>
  );
}
