import { notFound } from "next/navigation";
import { listAssetsForJob } from "@/lib/assets";
import { isFixtureMode } from "@/lib/drive";
import { formatBytes, formatDimensions } from "@/lib/format";
import { computeGapMatrixForJob } from "@/lib/gap-matrix";
import { isGeneratable, listGenerationRunsForJob } from "@/lib/generation";
import { getJob } from "@/lib/jobs";
import { generateAction } from "./generate-actions";

export const dynamic = "force-dynamic";

const GENERATION_STATUS_STYLES: Record<string, string> = {
  queued: "bg-amber-100 text-amber-800",
  processing: "bg-sky-100 text-sky-800",
  succeeded: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  failed_final: "bg-red-100 text-red-800",
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

  const [assets, gapMatrix, generationRuns] = await Promise.all([
    listAssetsForJob(id),
    computeGapMatrixForJob(id),
    listGenerationRunsForJob(id),
  ]);
  const runsByTarget = new Map<string, (typeof generationRuns)[number]>();
  for (const run of generationRuns) {
    const key = `${run.targetPlacementId}-${run.specDimensionId}`;
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
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-semibold">Filename</th>
              <th className="px-4 py-3 font-semibold">Format</th>
              <th className="px-4 py-3 font-semibold">Dimensions</th>
              <th className="px-4 py-3 font-semibold">File Size</th>
              <th className="px-4 py-3 font-semibold">Video Duration</th>
              <th className="px-4 py-3 font-semibold">PSD Canvas</th>
              <th className="px-4 py-3 font-semibold">Redesign Eligible</th>
              <th className="px-4 py-3 font-semibold">Scan Error</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => (
              <tr
                key={a.id}
                className={`border-b border-slate-100 last:border-b-0 ${
                  a.scanError ? "bg-red-50" : i % 2 === 1 ? "bg-slate-50/50" : ""
                }`}
              >
                <td className="max-w-xs truncate px-4 py-2.5 font-medium text-slate-800" title={a.filename}>
                  {a.filename}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{a.format ?? a.mimeType ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-600">{formatDimensions(a.width, a.height)}</td>
                <td className="px-4 py-2.5 text-slate-600">{formatBytes(a.fileSizeBytes)}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {a.videoDurationSec != null ? `${a.videoDurationSec}s` : "—"}
                </td>
                <td className="px-4 py-2.5 text-slate-600">{formatDimensions(a.psdCanvasW, a.psdCanvasH)}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {a.redesignEligible == null ? "—" : a.redesignEligible ? "Yes" : "No"}
                </td>
                <td className="px-4 py-2.5 text-red-700">{a.scanError ?? ""}</td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  No assets scanned yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <div>
        <SectionCard title="Coverage & Gap Matrix" subtitle={`${gapMatrix.length} target sizes`}>
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
              {gapMatrix.map((row, i) => {
                const existingRun = runsByTarget.get(`${row.jobTargetPlacementId}-${row.specDimension.id}`);
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
                        <form action={generateAction.bind(null, id, row.jobTargetPlacementId, row.specDimension.id)}>
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
              {gapMatrix.length === 0 && (
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
              </tr>
            </thead>
            <tbody>
              {generationRuns.map((run, i) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </main>
  );
}
