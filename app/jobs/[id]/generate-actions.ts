"use server";

import { revalidatePath } from "next/cache";
import { computeGapMatrixForJob } from "@/lib/gap-matrix";
import { createGenerationRun } from "@/lib/generation";
import { getJob } from "@/lib/jobs";

/** Bound via .bind(null, jobId, jobTargetPlacementId, specDimensionId) from
 * the Gap Matrix row's Generate button. Recomputes the gap matrix rather
 * than trusting stale props from the page render, since a rescan or a prior
 * Generate click could have changed routing since this page loaded. */
export async function generateAction(jobId: string, jobTargetPlacementId: string, specDimensionId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found.`);

  const matrix = await computeGapMatrixForJob(jobId);
  const row = matrix.find((r) => r.jobTargetPlacementId === jobTargetPlacementId && r.specDimension.id === specDimensionId);
  if (!row) throw new Error("Gap Matrix row not found — it may have changed since the page loaded, try reloading.");

  await createGenerationRun(job, row);
  revalidatePath(`/jobs/${jobId}`);
}
