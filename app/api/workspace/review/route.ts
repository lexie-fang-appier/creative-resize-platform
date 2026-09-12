import { NextResponse } from "next/server";
import { listGenerationTargets } from "@/lib/specs";
import { requireSessionEmail } from "@/lib/require-session";
import { logGenerationRun } from "@/lib/sheets-log";
import { NARAKA_SOURCES } from "@/lib/creative-analysis";
import { getAsset } from "@/lib/assets";
import { getJob } from "@/lib/jobs";

interface ReviewBody {
  runId?: string;
  targetId?: string;
  decision?: "adopted" | "rejected" | "complete";
  sourceAsset?: string;
  jobId?: string;
  assetId?: string;
  promptVersion?: string;
}

export async function POST(request: Request) {
  let actor: string;
  try {
    actor = await requireSessionEmail();
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let body: ReviewBody;
  try {
    body = await request.json() as ReviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.runId || !/^[0-9a-f-]{36}$/i.test(body.runId)) return NextResponse.json({ error: "Invalid run ID." }, { status: 400 });
  if (!body.decision || !["adopted", "rejected", "complete"].includes(body.decision)) return NextResponse.json({ error: "Invalid decision." }, { status: 400 });
  let sourceAsset = body.sourceAsset ?? "";
  if (body.jobId && body.assetId) {
    const [job, asset] = await Promise.all([getJob(body.jobId), getAsset(body.assetId)]);
    if (!job || !asset || asset.jobId !== job.id) return NextResponse.json({ error: "Drive source was not found." }, { status: 404 });
    sourceAsset = asset.filename;
  } else if (!sourceAsset || !(sourceAsset in NARAKA_SOURCES)) {
    return NextResponse.json({ error: "Invalid source asset." }, { status: 400 });
  }
  if (body.decision !== "complete" && (!body.targetId || !(await listGenerationTargets()).some((target) => target.id === body.targetId))) return NextResponse.json({ error: "Invalid target size." }, { status: 400 });

  await logGenerationRun({
    timestamp: new Date().toISOString(),
    runId: body.runId,
    sourceAsset,
    targetSize: body.targetId ?? "all",
    phase: body.decision === "complete" ? "run_complete" : "customer_review",
    status: body.decision,
    model: "",
    quality: "",
    promptVersion: body.promptVersion ?? "workspace-review-v1",
    cacheKey: "",
    requestId: null,
    processingTimeMs: 0,
    apiCostUsd: null,
    outputUri: null,
    errorCode: null,
    errorMessage: null,
    actor,
    labelSnapshotHash: "",
    usageJson: null,
  });
  return NextResponse.json({ ok: true });
}
