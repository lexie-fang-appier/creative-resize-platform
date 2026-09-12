import { NextResponse } from "next/server";
import { getAsset } from "@/lib/assets";
import { resolvePromptRecipe } from "@/lib/generation";
import { getJob } from "@/lib/jobs";
import { requireSessionEmail } from "@/lib/require-session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try { await requireSessionEmail(); } catch { return NextResponse.json({ error: "Unauthorized." }, { status: 401 }); }
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId") ?? "";
  const assetId = url.searchParams.get("assetId") ?? "";
  const [job, asset] = await Promise.all([getJob(jobId), getAsset(assetId)]);
  if (!job || !asset || asset.jobId !== job.id) return NextResponse.json({ error: "Workspace source was not found." }, { status: 404 });
  const prompt = await resolvePromptRecipe(job.clientIndustry, job.creativeFormat);
  return NextResponse.json({
    job: { id: job.id, clientName: job.clientName, industry: job.clientIndustry, creativeFormat: job.creativeFormat },
    asset: {
      id: asset.id,
      filename: asset.filename,
      format: asset.format,
      width: asset.psdCanvasW ?? asset.width,
      height: asset.psdCanvasH ?? asset.height,
      previewUrl: `/api/assets/${asset.id}/preview`,
    },
    prompt: { recipeName: prompt.recipeName, versionId: prompt.versionId, resolution: prompt.resolution },
  });
}
