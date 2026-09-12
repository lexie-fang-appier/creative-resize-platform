import { NextResponse } from "next/server";
import { analyzeCreative, analyzeCreativeImage, EXAMPLE_SOURCES, type ExampleSourceId } from "@/lib/creative-analysis";
import { getAsset } from "@/lib/assets";
import { getAssetPreview } from "@/lib/asset-preview";
import { getJob } from "@/lib/jobs";
import { requireSessionEmail } from "@/lib/require-session";
import { logGenerationRun } from "@/lib/sheets-log";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: Request) {
  let actor: string;
  try { actor = await requireSessionEmail(); } catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }
  const body = await request.json().catch(() => null) as { sourceAsset?: string; jobId?: string; assetId?: string; externalProcessingConsent?: boolean } | null;
  if (!body) return NextResponse.json({ error: "Invalid source asset." }, { status: 400 });
  try {
    let result;
    if (body.jobId && body.assetId) {
      if (body.externalProcessingConsent !== true) return NextResponse.json({ error: "Explicit consent is required before sending this Drive source to OpenAI Vision." }, { status: 409 });
      const [job, asset] = await Promise.all([getJob(body.jobId), getAsset(body.assetId)]);
      if (!job || !asset || asset.jobId !== job.id) return NextResponse.json({ error: "Drive source was not found." }, { status: 404 });
      const preview = await getAssetPreview(asset);
      if (!preview.ok) return NextResponse.json({ error: preview.reason }, { status: 422 });
      result = await analyzeCreativeImage(asset.filename, preview.buffer);
    } else if (body.sourceAsset && body.sourceAsset in EXAMPLE_SOURCES) {
      result = await analyzeCreative(body.sourceAsset as ExampleSourceId);
    } else {
      return NextResponse.json({ error: "Invalid source asset." }, { status: 400 });
    }
    await logGenerationRun({ timestamp: new Date().toISOString(), runId: result.analysisId, sourceAsset: result.sourceAsset, targetSize: "source", phase: "object_analysis", status: result.cached ? "cache_hit" : "completed", model: result.model, quality: "high_detail", promptVersion: result.promptVersion, cacheKey: "analysis_cache", requestId: result.requestId, processingTimeMs: result.processingTimeMs, apiCostUsd: null, outputUri: null, errorCode: null, errorMessage: null, actor, labelSnapshotHash: "", usageJson: result.usage ? JSON.stringify(result.usage) : null });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Object analysis failed." }, { status: 500 });
  }
}
