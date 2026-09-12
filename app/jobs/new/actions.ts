"use server";

/**
 * Job Create server action — validate Drive access, create the job + target
 * placements, run a metadata-only scan, then redirect to source selection.
 * File download, PSD probing, and Gap Matrix computation are deliberately
 * deferred until the user chooses one source, so Job creation never downloads
 * every large creative in the Drive folder.
 *
 * 2026-09-07: simplified per Lexie's request ("我可以不要填那麼多嗎？就放 drive folder
 * url就好") — ad_solution/channel/creative_format are no longer typed in by hand;
 * ad_solution+channel are derived from spec_versions (today there's only one
 * pair, RTB/Global — soleAdSolutionAndChannel() throws loudly if that ever
 * stops being true, which is the signal to bring back an explicit selector),
 * and creative_format is derived from whichever target placements were
 * checked. Client defaults to the Drive folder's own name when left blank.
 * Target placements stay required — that's the one field that genuinely can't
 * be dropped: campaign context can't be inferred from file metadata alone
 * (see 27 PRD "只看素材尺寸不能完整判斷 campaign 要投什麼").
 */
import { redirect } from "next/navigation";
import { insertScannedAssets } from "@/lib/assets";
import { getDriveScanner, parseFolderId } from "@/lib/drive";
import { createJob, updateJobStatus } from "@/lib/jobs";
import { requireSessionEmail } from "@/lib/require-session";
import { listPlacements, soleAdSolutionAndChannel } from "@/lib/specs";

export interface CreateJobState {
  error?: string;
}

export async function createJobAction(_prevState: CreateJobState, formData: FormData): Promise<CreateJobState> {
  const actorEmail = await requireSessionEmail();

  const driveFolderUrl = String(formData.get("driveFolderUrl") ?? "").trim();
  const clientNameInput = String(formData.get("clientName") ?? "").trim();
  const industry = String(formData.get("industry") ?? "").trim() || null;
  const campaignInstruction = String(formData.get("campaignInstruction") ?? "").trim() || null;
  const targetPlacements = formData.getAll("targetPlacements").map(String).filter(Boolean);

  if (!driveFolderUrl) return { error: "Drive folder URL is required." };
  if (!industry) return { error: "Select an industry." };
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

  const clientName = clientNameInput || access.folderName || `Untitled (${driveFolderId})`;

  const { adSolution, channel } = await soleAdSolutionAndChannel();
  const placements = await listPlacements();
  const creativeFormat = [
    ...new Set(placements.filter((p) => targetPlacements.includes(p.placement)).map((p) => p.creativeFormat)),
  ].join(", ");

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
    createdBy: actorEmail,
  });

  try {
    await updateJobStatus(job.id, "scanning");
    // Metadata-only first pass: do not download every file before the user can
    // choose the actual source. Deep PSD/image probing happens after selection.
    const scanned = await scanner.scanFolderMetadata(driveFolderUrl);
    await insertScannedAssets(job.id, scanned);

    if (scanned.length === 0) {
      await updateJobStatus(job.id, "scan_error");
    } else {
      await updateJobStatus(job.id, "scanned");
    }
  } catch {
    // Job-level scan failure (distinct from the per-asset scan_error column —
    // see §13). Still redirect below so the Designer can see the job exists
    // and its status, rather than losing the record entirely.
    await updateJobStatus(job.id, "scan_error");
  }

  redirect(`/jobs/${job.id}/source`);
}
