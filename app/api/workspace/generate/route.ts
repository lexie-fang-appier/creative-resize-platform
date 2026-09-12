import { NextResponse } from "next/server";
import { generateDriveCandidate, generateNarakaCandidates, type ConfirmedLayerLabel } from "@/lib/naraka-generation";
import { listGenerationTargets } from "@/lib/specs";
import { NARAKA_SOURCES, type NarakaSourceId } from "@/lib/creative-analysis";
import { getAsset } from "@/lib/assets";
import { getAssetPreview } from "@/lib/asset-preview";
import { resolvePromptRecipe } from "@/lib/generation";
import { getJob } from "@/lib/jobs";
import { requireSessionEmail } from "@/lib/require-session";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RequestBody {
  labelsConfirmed?: boolean;
  layerLabels?: ConfirmedLayerLabel[];
  targetIds?: string[];
  sourceAsset?: string;
  jobId?: string;
  assetId?: string;
  externalProcessingConsent?: boolean;
}

const ALLOWED_LABELS = new Set(["Group container", "Hero + background artwork", "Hero", "Background", "Headline", "Supporting copy", "Supporting visual", "Brand logo", "App icon", "Compliance", "CTA", "Copy decoration", "Decorative", "Adjustment layer", "Unclassified", "Ignore"]);

function isValidSnapshot(labels: ConfirmedLayerLabel[]): boolean {
  return labels.length >= 1 && labels.length <= 30 && labels.every((layer) =>
    typeof layer.name === "string" && layer.name.length <= 100 &&
    typeof layer.machineLabel === "string" && layer.machineLabel.length <= 100 &&
    typeof layer.finalLabel === "string" && ALLOWED_LABELS.has(layer.finalLabel) &&
    typeof layer.decision === "string" && layer.decision.length <= 20,
  );
}

export async function POST(request: Request) {
  let actor: string;
  try {
    actor = await requireSessionEmail();
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body.labelsConfirmed) return NextResponse.json({ error: "Layer labels must be confirmed before generation." }, { status: 409 });
  if (!Array.isArray(body.layerLabels) || !isValidSnapshot(body.layerLabels)) return NextResponse.json({ error: "A valid confirmed object snapshot is required." }, { status: 400 });
  const requestedTargets = [...new Set(body.targetIds ?? [])];
  const known = await listGenerationTargets();
  const targets = requestedTargets.map((id) => known.find((target) => target.id === id)).filter((target) => target !== undefined);
  if (targets.length !== 1 || targets.length !== requestedTargets.length) return NextResponse.json({ error: "Select exactly one valid target size per experiment." }, { status: 400 });

  try {
    if (body.jobId && body.assetId) {
      if (body.externalProcessingConsent !== true) return NextResponse.json({ error: "Explicit consent is required before sending this Drive source to OpenAI Image Edit." }, { status: 409 });
      const [job, asset] = await Promise.all([getJob(body.jobId), getAsset(body.assetId)]);
      if (!job || !asset || asset.jobId !== job.id) return NextResponse.json({ error: "Drive source was not found." }, { status: 404 });
      const preview = await getAssetPreview(asset);
      if (!preview.ok) return NextResponse.json({ error: preview.reason }, { status: 422 });
      const recipe = await resolvePromptRecipe(job.clientIndustry, job.creativeFormat);
      return NextResponse.json(await generateDriveCandidate({ labels: body.layerLabels, target: targets[0], actor, sourceName: asset.filename, source: preview.buffer, recipe, externalProcessingConsent: true }));
    }
    if (!body.sourceAsset || !(body.sourceAsset in NARAKA_SOURCES)) return NextResponse.json({ error: "A valid source asset is required." }, { status: 400 });
    return NextResponse.json(await generateNarakaCandidates(body.layerLabels, targets, actor, body.sourceAsset as NarakaSourceId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed." }, { status: 500 });
  }
}
