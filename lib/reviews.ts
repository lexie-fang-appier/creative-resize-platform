/**
 * review_decisions — a Designer's approve/reject call on one generation_run.
 * Per 27 PRD §五: rejection reasons must include a genuine "I can't articulate
 * why" option (16 Ref documents 2+ real cases of exactly this) — forcing a
 * category onto an unclear rejection would corrupt the analytics this table
 * exists to feed later (approval rate by reason, etc.).
 */
import { query } from "./db";

export { REJECTION_REASONS } from "./review-reasons";

export interface ReviewDecision {
  id: string;
  generationRunId: string;
  decision: "approved" | "rejected";
  rejectionReason: string | null;
  designerComment: string | null;
  decidedBy: string;
  decidedAt: string;
}

const COLUMNS = `id, generation_run_id as "generationRunId", decision,
  rejection_reason as "rejectionReason", designer_comment as "designerComment",
  decided_by as "decidedBy", decided_at as "decidedAt"`;

export async function getDecisionsForRuns(runIds: string[]): Promise<Map<string, ReviewDecision>> {
  if (runIds.length === 0) return new Map();
  const rows = await query<ReviewDecision>(
    `select ${COLUMNS} from review_decisions where generation_run_id = any($1::uuid[]) order by decided_at desc`,
    [runIds],
  );
  const map = new Map<string, ReviewDecision>();
  for (const r of rows) {
    // Newest first, keep only the latest decision per run (a run could in
    // principle be re-decided; the UI only ever shows the current verdict).
    if (!map.has(r.generationRunId)) map.set(r.generationRunId, r);
  }
  return map;
}

export async function recordDecision(input: {
  generationRunId: string;
  decision: "approved" | "rejected";
  rejectionReason: string | null;
  designerComment: string | null;
  decidedBy: string;
}): Promise<void> {
  await query(
    `insert into review_decisions (generation_run_id, decision, rejection_reason, designer_comment, decided_by)
     values ($1,$2,$3,$4,$5)`,
    [input.generationRunId, input.decision, input.rejectionReason, input.designerComment, input.decidedBy],
  );
}
