import { notFound } from "next/navigation";
import { listAssetsForJob } from "@/lib/assets";
import { isFixtureMode } from "@/lib/drive";
import { formatBytes, formatDimensions } from "@/lib/format";
import { computeGapMatrixForJob } from "@/lib/gap-matrix";
import { getJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

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
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${style}`}>{route}</span>;
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  const [assets, gapMatrix] = await Promise.all([listAssetsForJob(id), computeGapMatrixForJob(id)]);

  return (
    <main className="p-8 max-w-6xl mx-auto space-y-8">
      {isFixtureMode() && (
        <div className="rounded border border-amber-400 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          ⚠️ Dev fixture mode — no Google Drive credentials configured, showing sample ticket data instead of a real
          Drive scan. Set <code className="font-mono font-normal">GOOGLE_SERVICE_ACCOUNT_JSON</code> to scan a real
          folder.
        </div>
      )}

      <header>
        <h1 className="text-2xl font-bold text-slate-900">{job.clientName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {job.adSolution} / {job.channel} / {job.creativeFormat} · status:{" "}
          <span className="font-semibold">{job.status}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Drive folder: <span className="break-all">{job.driveFolderUrl}</span>
        </p>
        {job.campaignInstruction && (
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-medium">Instruction:</span> {job.campaignInstruction}
          </p>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Asset Inventory ({assets.length})</h2>
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2 font-medium">Filename</th>
                <th className="px-3 py-2 font-medium">Format</th>
                <th className="px-3 py-2 font-medium">Dimensions</th>
                <th className="px-3 py-2 font-medium">File Size</th>
                <th className="px-3 py-2 font-medium">Video Duration</th>
                <th className="px-3 py-2 font-medium">PSD Canvas</th>
                <th className="px-3 py-2 font-medium">Redesign Eligible</th>
                <th className="px-3 py-2 font-medium">Scan Error</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className={`border-b border-slate-100 ${a.scanError ? "bg-red-50" : ""}`}>
                  <td className="px-3 py-2 text-slate-800">{a.filename}</td>
                  <td className="px-3 py-2 text-slate-600">{a.format ?? a.mimeType ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{formatDimensions(a.width, a.height)}</td>
                  <td className="px-3 py-2 text-slate-600">{formatBytes(a.fileSizeBytes)}</td>
                  <td className="px-3 py-2 text-slate-600">{a.videoDurationSec != null ? `${a.videoDurationSec}s` : "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{formatDimensions(a.psdCanvasW, a.psdCanvasH)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {a.redesignEligible == null ? "—" : a.redesignEligible ? "Yes" : "No"}
                  </td>
                  <td className="px-3 py-2 text-red-700">{a.scanError ?? ""}</td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    No assets scanned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Coverage &amp; Gap Matrix</h2>
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2 font-medium">Placement / Channel</th>
                <th className="px-3 py-2 font-medium">Required Size</th>
                <th className="px-3 py-2 font-medium">Must-have</th>
                <th className="px-3 py-2 font-medium">Matched Asset</th>
                <th className="px-3 py-2 font-medium">Validation</th>
                <th className="px-3 py-2 font-medium">Route</th>
                <th className="px-3 py-2 font-medium">Reason Code</th>
                <th className="px-3 py-2 font-medium">Missing Components</th>
              </tr>
            </thead>
            <tbody>
              {gapMatrix.map((row) => (
                <tr key={`${row.jobTargetPlacementId}-${row.specDimension.id}`} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-800">
                    {row.specVersion.adSolution} · {row.specVersion.channel} · {row.specVersion.placement}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {formatDimensions(row.specDimension.width, row.specDimension.height)}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{row.specDimension.mustHaveLevel}</td>
                  <td className="px-3 py-2 text-slate-600">{row.matchedAssetFilename ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{row.validationResult}</td>
                  <td className="px-3 py-2">
                    <RouteBadge route={row.route} />
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.reasonCode}</td>
                  <td className="px-3 py-2 text-slate-500">
                    {row.missingComponents.length > 0 ? row.missingComponents.join(", ") : "—"}
                  </td>
                </tr>
              ))}
              {gapMatrix.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                    No gap matrix rows yet — this job may not have any matching spec_versions for its target
                    placements.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          `manual_compliance` and `blocked_safezone` are not implemented in Phase 1 — no icon/CTA/end-card/safe-zone
          detection exists yet, so these two routes are never shown here (see README).
        </p>
      </section>
    </main>
  );
}
