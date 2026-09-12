"use server";

import { redirect } from "next/navigation";
import { getAsset, updateScannedAsset } from "@/lib/assets";
import { getDriveScanner, type ScannedAsset } from "@/lib/drive";
import { computeGapMatrixForJob } from "@/lib/gap-matrix";
import { getJob, updateJobStatus } from "@/lib/jobs";
import { requireSessionEmail } from "@/lib/require-session";

export async function openWorkspaceAction(jobId: string, formData: FormData): Promise<void> {
  await requireSessionEmail();
  const assetId = String(formData.get("assetId") ?? "");
  const [job, asset] = await Promise.all([getJob(jobId), getAsset(assetId)]);
  if (!job || !asset || asset.jobId !== job.id) throw new Error("Selected source asset does not belong to this Drive scan.");
  await updateJobStatus(job.id, "scanning");
  const metadata: ScannedAsset = {
    driveFileId: asset.driveFileId,
    filename: asset.filename,
    mimeType: asset.mimeType,
    format: asset.format,
    width: asset.width,
    height: asset.height,
    fileSizeBytes: asset.fileSizeBytes,
    videoDurationSec: asset.videoDurationSec,
    psdCanvasW: asset.psdCanvasW,
    psdCanvasH: asset.psdCanvasH,
    contentHash: asset.contentHash,
    isFlattened: asset.isFlattened,
    hasMultipleArtboards: asset.hasMultipleArtboards,
    redesignEligible: asset.redesignEligible,
    scanError: asset.scanError,
  };
  const inspected = await getDriveScanner().probeAsset(metadata);
  await updateScannedAsset(asset.id, inspected);
  if (inspected.scanError) {
    await updateJobStatus(job.id, "scan_error");
    throw new Error(`Selected source could not be analyzed: ${inspected.scanError}`);
  }
  await updateJobStatus(job.id, "scanned");
  await computeGapMatrixForJob(job.id);
  await updateJobStatus(job.id, "gap_analyzed");
  await updateJobStatus(job.id, "routed");
  const query = new URLSearchParams({ jobId: job.id, assetId: asset.id });
  redirect(`/workspace?${query.toString()}`);
}
