"use server";

import { revalidatePath } from "next/cache";
import { recordDecision } from "@/lib/reviews";

/** Bound via .bind(null, jobId, generationRunId) — no reason needed to approve. */
export async function approveAction(jobId: string, generationRunId: string): Promise<void> {
  await recordDecision({ generationRunId, decision: "approved", rejectionReason: null, designerComment: null, decidedBy: "dev-designer" });
  revalidatePath(`/jobs/${jobId}`);
}

export interface RejectFormState {
  error?: string;
}

/** Bound via .bind(null, jobId, generationRunId). Reason is required — even
 * "Unspecified / overall impression" is a real answer here, per 27 PRD §五 —
 * silently allowing a blank reason would look the same as that option in the
 * data and defeat the point of having it. */
export async function rejectAction(jobId: string, generationRunId: string, _prevState: RejectFormState, formData: FormData): Promise<RejectFormState> {
  const rejectionReason = String(formData.get("rejectionReason") ?? "").trim();
  const designerComment = String(formData.get("designerComment") ?? "").trim() || null;
  if (!rejectionReason) return { error: "Pick a rejection reason." };

  await recordDecision({ generationRunId, decision: "rejected", rejectionReason, designerComment, decidedBy: "dev-designer" });
  revalidatePath(`/jobs/${jobId}`);
  return {};
}
