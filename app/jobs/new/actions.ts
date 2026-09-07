"use server";

/**
 * Job Create server action — validate Drive access, create the job + target
 * placements, kick off the scan (real or dev-fixture, see lib/drive.ts),
 * compute the Gap Matrix, then redirect to the job detail page. Per §11's
 * state machine: draft -> scanning -> scanned|scan_error -> gap_analyzed ->
 * routed, all driven synchronously in this one request — Phase 1 has no async
 * job queue yet (that's a later-phase architecture piece per §5), and this
 * repo's dev-fixture scan / DB-only gap computation is fast enough that a
 * synchronous request is a reasonable Phase 1 scope call.
 */
import { redirect } from "next/navigation";
import { insertScannedAssets } from "@/lib/assets";
import { getDriveScanner, parseFolderId } from "@/lib/drive";
import { computeGapMatrixForJob } from "@/lib/gap-matrix";
import { createJob, updateJobStatus } from "@/lib/jobs";

export interface CreateJobState {
  error?: string;
}

export async function createJobAction(_prevState: CreateJobState, formData: FormData): Promise<CreateJobState> {
  const driveFolderUrl = String(formData.get("driveFolderUrl") ?? "").trim();
  const clientName = String(formData.get("clientName") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim() || null;
  const adSolution = String(formData.get("adSolution") ?? "").trim();
  const channel = String(formData.get("channel") ?? "").trim();
  const creativeFormat = String(formData.get("creativeFormat") ?? "").trim();
  const campaignInstruction = String(formData.get("campaignInstruction") ?? "").trim() || null;
  const targetPlacements = formData.getAll("targetPlacements").map(String).filter(Boolean);

  if (!driveFolderUrl) return { error: "Drive folder URL is required." };
  if (!clientName) return { error: "Client is required." };
  if (!adSolution || !channel || !creativeFormat) {
    return { error: "Ad solution, channel, and creative format are required." };
  }
  if (targetPlacements.length === 0) return { error: "Select at least one target placement." };

  const driveFolderId = parseFolderId(driveFolderUrl);
  if (!driveFolderId) return { error: "Could not parse a Drive folder ID out of this URL." };

  // §6: "Job Create 步驟必須當場驗證 folder 存取權" — block Job creation on failure,
  // don't wait until the scan step to discover a 404.
  const scanner = getDriveScanner();
  const access = await scanner.checkAccess(driveFolderUrl);
  if (!access.ok) {
    return { error: access.error ?? "Drive folder access check failed." };
  }

  const job = await createJob({
    clientName,
    industry,
    driveFolderUrl,
    driveFolderId,
    adSolution,
    channel,
    creativeFormat,
    campaignInstruction,
    targetPlacements,
    // No SSO wired into pages yet (see lib/auth.ts — config-only, per README).
    // Placeholder actor until auth is wired into this route.
    createdBy: "dev-designer",
  });

  try {
    await updateJobStatus(job.id, "scanning");
    const scanned = await scanner.scanFolder(driveFolderUrl);
    await insertScannedAssets(job.id, scanned);

    if (scanned.length === 0) {
      await updateJobStatus(job.id, "scan_error");
    } else {
      await updateJobStatus(job.id, "scanned");
      await computeGapMatrixForJob(job.id);
      await updateJobStatus(job.id, "gap_analyzed");
      await updateJobStatus(job.id, "routed");
    }
  } catch {
    // Job-level scan failure (distinct from the per-asset scan_error column —
    // see §13). Still redirect below so the Designer can see the job exists
    // and its status, rather than losing the record entirely.
    await updateJobStatus(job.id, "scan_error");
  }

  redirect(`/jobs/${job.id}`);
}
