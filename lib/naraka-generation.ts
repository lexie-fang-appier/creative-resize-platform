import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { logGenerationRun } from "./sheets-log";
import { NARAKA_SOURCES, sourcePath, type NarakaSourceId } from "./creative-analysis";
import type { RecipeMatch } from "./generation";
import { GLOBAL_SAFETY_RULES } from "./prompts";
import { buildExtremeBackgroundPrompt, buildWideBasePrompt, composeExtremeLayout, EXTREME_COMPOSITOR_VERSION, extremeManifestPath, loadExtremeLayerManifest, missingExtremeRoles, missingWideOverlayRoles, requiresExtremeCompositor, suggestWideTextRatio, unplaceableRequiredRoles, WIDE_OVERLAY_VERSION } from "./extreme-compositor";

const execFileAsync = promisify(execFile);

export const NARAKA_PROMPT_VERSION = "naraka-resolved-v13";
export const DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst";
const FINALIZATION_VERSION = "contain-edge-align-v2";

export const NARAKA_TARGETS = {
  "600x500": { width: 600, height: 500 },
  "640x100": { width: 640, height: 100 },
  "640x960": { width: 640, height: 960 },
  "1456x180": { width: 1456, height: 180 },
  "672x560": { width: 672, height: 560 },
  "600x1200": { width: 600, height: 1200 },
  "320x1200": { width: 320, height: 1200 },
  "500x500": { width: 500, height: 500 },
  "1940x500": { width: 1940, height: 500 },
  "640x200": { width: 640, height: 200 },
  "1200x627": { width: 1200, height: 627 },
  "160x160": { width: 160, height: 160 },
  "960x640": { width: 960, height: 640 },
  "970x250": { width: 970, height: 250 },
  "300x600": { width: 300, height: 600 },
  "320x480": { width: 320, height: 480 },
  "300x250": { width: 300, height: 250 },
  "320x50": { width: 320, height: 50 },
} as const;

export type NarakaTargetId = keyof typeof NARAKA_TARGETS;
export type LayoutFamily = "ultra_landscape" | "landscape" | "standard" | "portrait" | "ultra_portrait";
export type ImageQuality = "low" | "medium" | "high" | "xhigh" | "max";
const ALLOWED_MODELS = new Set(["gpt-image-2.5-sunburst", "gpt-image-2.5-flare"]);
const ALLOWED_QUALITIES = new Set<ImageQuality>(["low", "medium", "high", "xhigh", "max"]);

export function resolveLayoutFamily(width: number, height: number): LayoutFamily {
  const ratio = width / height;
  if (ratio > 4) return "ultra_landscape";
  if (ratio > 2) return "landscape";
  if (ratio < 1 / 3) return "ultra_portrait";
  if (ratio < 0.7) return "portrait";
  return "standard";
}

export interface ConfirmedLayerLabel {
  name: string;
  machineLabel: string;
  finalLabel: string;
  decision: string;
  importance?: string;
  resizeBehavior?: string;
  visibleText?: string;
  bbox?: { x: number; y: number; width: number; height: number };
}

export interface GenerationPreflightResult {
  status: "ready" | "ready_with_warnings" | "pass_to_designer";
  ruleCodes: string[];
  reasons: string[];
}

export interface BlockedGenerationTarget extends GenerationPreflightResult {
  id: NarakaTargetId;
}

export interface GenerationCandidate {
  id: NarakaTargetId;
  src: string;
  status: "in_review" | "deterministic_fallback" | "cache_hit";
  model: string;
  quality: ImageQuality;
  promptVersion: string;
  prompt: string;
  resolvedRules: string[];
  preflightWarnings: string[];
  suggestedTextRatio: number | null;
  requestId: string | null;
}

export interface NarakaGenerationResult {
  runId: string;
  mode: "openai" | "deterministic_fallback" | "mixed" | "cache" | "pass_to_designer";
  candidates: GenerationCandidate[];
  blocked: BlockedGenerationTarget[];
  warning: string | null;
}

export function validateGenerationFeasibility(targetId: NarakaTargetId, labels: ConfirmedLayerLabel[]): GenerationPreflightResult {
  const target = NARAKA_TARGETS[targetId];
  const aspectRatio = Math.max(target.width, target.height) / Math.min(target.width, target.height);
  const active = labels.filter((layer) => layer.finalLabel !== "Ignore");
  const required = active.filter((layer) => layer.importance === "required");
  const protectedForeground = required.filter((layer) => !["Background", "Decorative"].includes(layer.finalLabel));
  const roles = new Set(active.map((layer) => layer.finalLabel));
  const requiredRoles = new Set(required.map((layer) => layer.finalLabel));
  const ruleCodes: string[] = [];
  const reasons: string[] = [];
  let hasBlockingFailure = false;

  const hasHero = requiredRoles.has("Hero") || roles.has("Hero");
  const hasProtectedCopy = ["Headline", "Supporting copy", "CTA"].some((role) => requiredRoles.has(role));
  const hasProtectedBrand = requiredRoles.has("Brand logo") || requiredRoles.has("Compliance");

  if (targetId === "960x640") {
    ruleCodes.push("pending_spec_confirmation");
    reasons.push("960x640 is provisional. This candidate is experimental and must not be counted as a required deliverable until the spec owner confirms it.");
  }
  if (targetId === "160x160" && !roles.has("App icon")) {
    hasBlockingFailure = true;
    ruleCodes.push("dedicated_app_icon_source_required");
    reasons.push("Native 160x160 requires a dedicated App icon object; the full key art or brand wordmark must not be reduced into an app icon.");
  }

  if (Math.min(target.width, target.height) < 64 && protectedForeground.length >= 3) {
    ruleCodes.push("insufficient_short_edge");
    reasons.push(`The ${Math.min(target.width, target.height)}px short edge cannot keep ${protectedForeground.length} required foreground objects legible without shrinking or omission.`);
  }
  if (aspectRatio > 5 && hasHero && hasProtectedCopy && hasProtectedBrand) {
    ruleCodes.push("required_object_capacity_conflict");
    reasons.push("The extreme aspect ratio cannot fit the required hero, copy, and brand/compliance objects while preserving identity and readability.");
  }

  if (hasBlockingFailure) return { status: "pass_to_designer", ruleCodes, reasons };
  if (ruleCodes.length) return { status: "ready_with_warnings", ruleCodes, reasons };
  return { status: "ready", ruleCodes: [], reasons: [] };
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function leastCommonMultiple(a: number, b: number): number {
  return (a * b) / greatestCommonDivisor(a, b);
}

export function planApiCanvas(width: number, height: number): { width: number; height: number; size: string; requiresCrop: boolean } {
  const ratio = width / height;
  const minimumPixels = 655_360;
  if (ratio > 3) return { width: 2880, height: 960, size: "2880x960", requiresCrop: true };
  if (ratio < 1 / 3) return { width: 960, height: 2880, size: "960x2880", requiresCrop: true };

  const targetGcd = greatestCommonDivisor(width, height);
  const ratioWidth = width / targetGcd;
  const ratioHeight = height / targetGcd;
  const multiplierStep = leastCommonMultiple(16 / greatestCommonDivisor(ratioWidth, 16), 16 / greatestCommonDivisor(ratioHeight, 16));
  const minimumMultiplier = Math.sqrt(minimumPixels / (ratioWidth * ratioHeight));
  const multiplier = Math.max(multiplierStep, Math.ceil(minimumMultiplier / multiplierStep) * multiplierStep);
  const apiWidth = ratioWidth * multiplier;
  const apiHeight = ratioHeight * multiplier;
  if (apiWidth > 3840 || apiHeight > 3840 || apiWidth * apiHeight > 8_294_400) {
    const scale = Math.max(1, Math.sqrt(minimumPixels / (width * height)));
    const fallbackWidth = Math.max(16, Math.min(3840, Math.round((width * scale) / 16) * 16));
    const fallbackHeight = Math.max(16, Math.min(3840, Math.round((height * scale) / 16) * 16));
    if (fallbackWidth * fallbackHeight < minimumPixels || fallbackWidth * fallbackHeight > 8_294_400) {
      throw new Error(`Target ${width}x${height} cannot be mapped into the Image API canvas constraints.`);
    }
    return { width: fallbackWidth, height: fallbackHeight, size: `${fallbackWidth}x${fallbackHeight}`, requiresCrop: true };
  }
  return { width: apiWidth, height: apiHeight, size: `${apiWidth}x${apiHeight}`, requiresCrop: apiWidth !== width || apiHeight !== height };
}

export function planFinalCrop(width: number, height: number, canvas: ReturnType<typeof planApiCanvas>): { x: number; y: number; width: number; height: number } {
  const family = resolveLayoutFamily(width, height);
  if (family === "ultra_landscape" || family === "ultra_portrait") return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const targetRatio = width / height;
  const canvasRatio = canvas.width / canvas.height;
  if (Math.abs(targetRatio - canvasRatio) < 0.0001) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (targetRatio > canvasRatio) {
    const cropHeight = Math.max(1, Math.round(canvas.width / targetRatio));
    return { x: 0, y: Math.floor((canvas.height - cropHeight) / 2), width: canvas.width, height: cropHeight };
  }
  const cropWidth = Math.max(1, Math.round(canvas.height * targetRatio));
  return { x: Math.floor((canvas.width - cropWidth) / 2), y: 0, width: cropWidth, height: canvas.height };
}

export function createLabelSnapshotHash(labels: ConfirmedLayerLabel[]): string {
  return createHash("sha256").update(JSON.stringify(labels)).digest("hex");
}

export function resolvePromptRules(targetId: NarakaTargetId, labels: ConfirmedLayerLabel[]): string[] {
  const target = NARAKA_TARGETS[targetId];
  const ratio = target.width / target.height;
  const activeLabels = new Set(labels.filter((layer) => layer.finalLabel !== "Ignore").map((layer) => layer.finalLabel));
  const rules = ["preserve-brand-and-visible-copy", "protect-required-objects", "no-stretch"];
  const family = resolveLayoutFamily(target.width, target.height);
  if (family === "ultra_landscape") rules.push("extreme-layer-compositor", "background-outpaint-only", "ultra-landscape-zones", "optional-elements-omit-first");
  else if (family === "landscape") {
    rules.push("landscape-safe-zone", "horizontal-copy-row");
    if (ratio > 3) rules.push("wide-landscape-crop-safe-band", "wide-protected-layer-overlay");
  }
  else if (family === "ultra_portrait") rules.push("extreme-layer-compositor", "background-outpaint-only", "ultra-portrait-zones", "optional-elements-omit-first");
  else if (family === "portrait") rules.push("portrait-hero-center", "stack-copy-with-clear-separation");
  else rules.push("balanced-recomposition");
  if (activeLabels.has("Compliance")) rules.push("keep-compliance-in-source-corner");
  if (activeLabels.has("Brand logo")) rules.push("keep-logo-legible");
  if (activeLabels.has("Hero")) rules.push("keep-hero-identity-area-visible");
  return rules;
}

function buildPrompt(sourceAsset: NarakaSourceId, targetId: NarakaTargetId, labels: ConfirmedLayerLabel[], apiCanvas: ReturnType<typeof planApiCanvas>): { prompt: string; resolvedRules: string[] } {
  const target = NARAKA_TARGETS[targetId];
  const layoutFamily = resolveLayoutFamily(target.width, target.height);
  const suggestedTextRatio = layoutFamily === "landscape" && target.width / target.height > 3 ? suggestWideTextRatio(target.width, target.height) : null;
  const crop = planFinalCrop(target.width, target.height, apiCanvas);
  const resolvedRules = resolvePromptRules(targetId, labels);
  const inventory = labels.filter((layer) => layer.finalLabel !== "Ignore").map((layer) => `${layer.name}: ${layer.finalLabel}${layer.importance ? ` (${layer.importance}, ${layer.resizeBehavior ?? "preserve"})` : ""}`).join("; ");
  const ruleText: Record<string, string> = {
    "preserve-brand-and-visible-copy": "Preserve the same brand identity and exact visible copy; do not invent, translate, rewrite, or omit text.",
    "protect-required-objects": "Keep every required object visible and separated from other solid object mass.",
    "no-stretch": "Never stretch or squeeze people, logos, or typography.",
    "extreme-layer-compositor": "Generate only the background with the Image API, then place approved transparent original-pixel layers with the deterministic compositor.",
    "background-outpaint-only": "Outpaint the source environment across the full canvas without flat-color padding or regenerated foreground objects.",
    "ultra-landscape-zones": "Use one compact horizontal row across the working canvas: brand at the left, compact hero next, headline/copy/CTA next, and the complete compliance badge at the outer-right corner. Keep the outer background simple so it can be extended without repeating objects.",
    "landscape-safe-zone": "Keep all required content inside the final extraction region and use a horizontal visual hierarchy.",
    "horizontal-copy-row": "Use a horizontal copy row rather than a tall text stack.",
    "wide-landscape-crop-safe-band": "The Image API working canvas is taller than the delivered banner. Keep the top 12% and bottom 12% completely free of logos, people, copy, CTA, platform marks, compliance, and decorative frames. Place every required object's complete bounds inside the central 76% horizontal band; only continuous painted background may enter the trim zones.",
    "wide-protected-layer-overlay": "Generate the hero and scene plate without protected foreground content, apply the final crop, then place only the original PSD layers present in the confirmed inventory inside deterministic safe zones. Never invent a missing CTA, platform mark, gameplay frame, or other object.",
    "ultra-portrait-zones": "Use a top-to-bottom composition across the working canvas: brand at top, complete hero identity area in the middle, headline/copy/CTA below, and the complete compliance badge at the outer-bottom corner. Keep the outer background simple so it can be extended without repeating objects.",
    "optional-elements-omit-first": "If space is limited, omit optional decorative or supporting visual elements before shrinking, cropping, obstructing, or omitting any required element.",
    "portrait-hero-center": "Center the hero's visual body mass in the portrait frame and keep the identity area visible.",
    "stack-copy-with-clear-separation": "Stack copy only where it remains readable and clearly separated from the hero.",
    "balanced-recomposition": "Recompose the inventory with balanced visual hierarchy for the target ratio.",
    "keep-compliance-in-source-corner": "Compliance is a hard constraint. Keep the entire compliance badge visible in a corner: uncropped, unobstructed, undistorted, and with its complete border and contents intact. It may remain small, but no part may leave the canvas.",
    "keep-logo-legible": "Keep the brand logo complete and legible.",
    "keep-hero-identity-area-visible": "Keep the hero's complete face, head details, and primary silhouette visible.",
  };
  const prompt = [
    `Edit the supplied ${sourceAsset} NARAKA key art into one production advertising candidate.`,
    `Confirmed layer inventory: ${inventory}.`,
    `Layout family: ${layoutFamily}. Compose for final target ${target.width}x${target.height} on API working canvas ${apiCanvas.size}.`,
    ...(suggestedTextRatio === null ? [] : [`Typography recommendation: target Headline height ${Math.round(suggestedTextRatio * 100)}% of the final canvas height. Scale Headline, supporting copy, and CTA uniformly from their original PSD layers; treat this as a recommendation bounded by safe-zone fit, not a fixed per-size constant.`]),
    layoutFamily === "ultra_landscape" || layoutFamily === "ultra_portrait"
      ? `Use the Image API only to create a full-bleed object-free background plate. Then resize and reposition approved transparent original-pixel layers on the exact ${target.width}x${target.height} canvas. Do not crop protected objects, regenerate text, or use flat-color padding.`
      : `FINAL EXTRACTION REGION on the working canvas is x=${crop.x}, y=${crop.y}, width=${crop.width}, height=${crop.height}. Every required object's complete visible bounds must remain inside this region. Pixels outside it are working margin and will not appear in the delivered image.`,
    ...resolvedRules.map((ruleId) => `[${ruleId}] ${ruleText[ruleId]}`),
    layoutFamily === "ultra_landscape" || layoutFamily === "ultra_portrait"
      ? "Return the deterministic layer-compositor result as one review candidate."
      : "Return one flattened candidate image only. This candidate still requires Designer review.",
  ].join("\n\n");
  return { prompt, resolvedRules };
}

class ImageApiError extends Error {
  code: string;
  requestId: string | null;

  constructor(message: string, code: string, requestId: string | null) {
    super(message);
    this.code = code;
    this.requestId = requestId;
  }
}

function configuredApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "replace-me") return null;
  return key;
}

async function callImageEdit(params: { source: Buffer; prompt: string; size: string; model: string; quality: ImageQuality }): Promise<{ image: Buffer; requestId: string | null; usage: unknown }> {
  const apiKey = configuredApiKey();
  if (!apiKey) throw new ImageApiError("OPENAI_API_KEY is missing or still a placeholder.", "invalid_api_key_placeholder", null);

  const form = new FormData();
  form.set("model", params.model);
  form.set("image[]", new Blob([new Uint8Array(params.source)], { type: "image/png" }), "naraka-source.png");
  form.set("prompt", params.prompt);
  form.set("size", params.size);
  form.set("quality", params.quality);
  form.set("output_format", "png");
  form.set("moderation", "auto");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(150_000),
  });
  const requestId = response.headers.get("x-request-id");
  const payload = await response.json() as { data?: Array<{ b64_json?: string }>; usage?: unknown; error?: { code?: string; message?: string; type?: string } };
  if (!response.ok || !payload.data?.[0]?.b64_json) {
    throw new ImageApiError(payload.error?.message ?? `Image API returned HTTP ${response.status}.`, payload.error?.code ?? payload.error?.type ?? `http_${response.status}`, requestId);
  }
  return { image: Buffer.from(payload.data[0].b64_json, "base64"), requestId, usage: payload.usage ?? null };
}

async function finalizeImage(input: Buffer, outputPath: string, width: number, height: number, mode: "crop" | "contain_edge_extend" | "background_cover" = "crop"): Promise<void> {
  const temporaryPath = `${outputPath}.source.png`;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(temporaryPath, input);
  try {
    await execFileAsync("python3", [path.join(process.cwd(), "scripts", "finalize_generated_image.py"), temporaryPath, outputPath, String(width), String(height), mode]);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

/** Existence check only. Kept separate from logging on purpose: when the two
 * shared one try block, a throwing log made a cache HIT look like a cache miss
 * and the run paid for the image again. */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeError(err: unknown): { code: string; message: string; requestId: string | null } {
  if (err instanceof ImageApiError) return { code: err.code, message: err.message.slice(0, 500), requestId: err.requestId };
  if (err instanceof Error) return { code: "generation_error", message: err.message.slice(0, 500), requestId: null };
  return { code: "generation_error", message: String(err).slice(0, 500), requestId: null };
}

export async function generateNarakaCandidates(labels: ConfirmedLayerLabel[], targetIds: NarakaTargetId[], actor: string, sourceAsset: NarakaSourceId = "YJp813"): Promise<NarakaGenerationResult> {
  const runId = randomUUID();
  if (!(sourceAsset in NARAKA_SOURCES)) throw new Error("Unsupported NARAKA source asset.");
  const source = await fs.readFile(sourcePath(sourceAsset));
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const labelSnapshotHash = createLabelSnapshotHash(labels);
  const requestedModel = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_IMAGE_MODEL;
  const requestedQuality = (process.env.OPENAI_IMAGE_QUALITY?.trim() || "low") as ImageQuality;
  const quality = ALLOWED_QUALITIES.has(requestedQuality) ? requestedQuality : "low";
  const candidates: GenerationCandidate[] = [];
  const blocked: BlockedGenerationTarget[] = [];
  const errors: string[] = [];

  for (const targetId of targetIds) {
    const started = Date.now();
    const target = NARAKA_TARGETS[targetId];
    const layoutFamily = resolveLayoutFamily(target.width, target.height);
    const extremeFamily = layoutFamily === "ultra_landscape" || layoutFamily === "ultra_portrait" ? layoutFamily : null;
    const useExtremeCompositor = requiresExtremeCompositor(target.width, target.height);
    const useWideProtectedOverlay = layoutFamily === "landscape" && target.width / target.height > 3;
    const suggestedTextRatio = useWideProtectedOverlay ? suggestWideTextRatio(target.width, target.height) : null;
    const finalizationMode = "crop" as const;
    const preflight = validateGenerationFeasibility(targetId, labels);
    if (preflight.status === "pass_to_designer") {
      blocked.push({ id: targetId, ...preflight });
      await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "preflight", status: "pass_to_designer", model: "not_called", quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey: "not_created", requestId: null, processingTimeMs: Date.now() - started, apiCostUsd: 0, outputUri: null, errorCode: preflight.ruleCodes.join(","), errorMessage: preflight.reasons.join(" "), actor, labelSnapshotHash, usageJson: null });
      continue;
    }
    const extremeManifest = useExtremeCompositor || useWideProtectedOverlay ? await loadExtremeLayerManifest(sourceAsset) : null;
    const missingRoles = extremeManifest ? missingExtremeRoles(labels, extremeManifest) : [];
    if (useExtremeCompositor && (!extremeManifest || !extremeFamily || missingRoles.length > 0)) {
      const ruleCodes = !extremeManifest ? ["extreme_layer_manifest_required"] : ["transparent_layer_assets_required"];
      const reasons = !extremeManifest
        ? [`${sourceAsset} does not have an extracted transparent-layer manifest for extreme-ratio composition.`]
        : [`Extreme-ratio composition requires approved transparent assets for: ${missingRoles.join(", ")}.`];
      blocked.push({ id: targetId, status: "pass_to_designer", ruleCodes, reasons });
      await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "preflight", status: "pass_to_designer", model: "not_called", quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey: "not_created", requestId: null, processingTimeMs: Date.now() - started, apiCostUsd: 0, outputUri: null, errorCode: ruleCodes.join(","), errorMessage: reasons.join(" "), actor, labelSnapshotHash, usageJson: null });
      continue;
    }
    // A required layer the target's layout has no zone for is a loss, not a
    // degradation: the compositor exits on it, but only after the plate has
    // been paid for. Catch it here instead.
    const compositorFamily = extremeFamily ?? (useWideProtectedOverlay ? "wide_landscape" as const : null);
    if (compositorFamily && extremeManifest) {
      const unplaceable = unplaceableRequiredRoles(extremeManifest, compositorFamily);
      if (unplaceable.length > 0) {
        const ruleCodes = ["required_role_has_no_layout_zone"];
        const reasons = [`The ${compositorFamily} layout has no zone for required ${unplaceable.join(", ")}; this target cannot be composed without dropping it.`];
        blocked.push({ id: targetId, status: "pass_to_designer", ruleCodes, reasons });
        await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "preflight", status: "pass_to_designer", model: "not_called", quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey: "not_created", requestId: null, processingTimeMs: Date.now() - started, apiCostUsd: 0, outputUri: null, errorCode: ruleCodes.join(","), errorMessage: reasons.join(" "), actor, labelSnapshotHash, usageJson: null });
        continue;
      }
    }
    const missingWideRoles = useWideProtectedOverlay && extremeManifest ? missingWideOverlayRoles(labels, extremeManifest) : [];
    if (useWideProtectedOverlay && (!extremeManifest || missingWideRoles.length > 0)) {
      const ruleCodes = ["wide_protected_layers_required"];
      const reasons = !extremeManifest
        ? [`${sourceAsset} does not have a protected PSD-layer manifest for wide-banner composition.`]
        : [`Wide-banner composition requires approved original layers for: ${missingWideRoles.join(", ")}.`];
      blocked.push({ id: targetId, status: "pass_to_designer", ruleCodes, reasons });
      await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "preflight", status: "pass_to_designer", model: "not_called", quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey: "not_created", requestId: null, processingTimeMs: Date.now() - started, apiCostUsd: 0, outputUri: null, errorCode: ruleCodes.join(","), errorMessage: reasons.join(" "), actor, labelSnapshotHash, usageJson: null });
      continue;
    }
    const apiCanvas = planApiCanvas(target.width, target.height);
    const resolved = buildPrompt(sourceAsset, targetId, labels, apiCanvas);
    const resolvedRules = resolved.resolvedRules;
    const prompt = preflight.status === "ready_with_warnings"
      ? `${resolved.prompt}\n\n[preflight-review-warning] Attempt a candidate for human evaluation. Do not omit, crop, obstruct, or distort required objects to make the composition fit. Known risks: ${preflight.reasons.join(" ")}`
      : resolved.prompt;
    const apiPrompt = useWideProtectedOverlay ? buildWideBasePrompt(sourceAsset, extremeManifest ?? undefined) : extremeFamily ? buildExtremeBackgroundPrompt(sourceAsset, extremeFamily) : prompt;
    const pipelineVersion = useWideProtectedOverlay ? WIDE_OVERLAY_VERSION : extremeFamily ? EXTREME_COMPOSITOR_VERSION : FINALIZATION_VERSION;
    const cacheKey = createHash("sha256").update([sourceHash, labelSnapshotHash, targetId, apiCanvas.size, finalizationMode, pipelineVersion, model, quality, NARAKA_PROMPT_VERSION].join("|")).digest("hex");
    const filename = `${cacheKey}-${targetId}.png`;
    const outputPath = path.join(process.cwd(), "outputs", "naraka-mvp", filename);
    const outputUri = `/api/workspace/outputs/${filename}`;
    const fallbackFilename = `fallback-${sourceHash.slice(0, 16)}-${targetId}.png`;
    const fallbackOutputPath = path.join(process.cwd(), "outputs", "naraka-mvp", fallbackFilename);
    const fallbackOutputUri = `/api/workspace/outputs/${fallbackFilename}`;

    // A cache miss is expected and is not logged as an error.
    if (await fileExists(outputPath)) {
      candidates.push({ id: targetId, src: outputUri, status: "cache_hit", model, quality, promptVersion: NARAKA_PROMPT_VERSION, prompt, resolvedRules, preflightWarnings: preflight.reasons, suggestedTextRatio, requestId: null });
      await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "generation", status: "cache_hit", model, quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey, requestId: null, processingTimeMs: Date.now() - started, apiCostUsd: null, outputUri, errorCode: null, errorMessage: null, actor, labelSnapshotHash, usageJson: null });
      continue;
    }

    try {
      await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "generation", status: "generation_started", model, quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey, requestId: null, processingTimeMs: 0, apiCostUsd: null, outputUri: null, errorCode: null, errorMessage: null, actor, labelSnapshotHash, usageJson: null });
      const result = await callImageEdit({ source, prompt: apiPrompt, size: apiCanvas.size, model, quality });
      if (extremeFamily && extremeManifest) {
        const backgroundPath = `${outputPath}.background.png`;
        try {
          await finalizeImage(result.image, backgroundPath, target.width, target.height, "background_cover");
          await composeExtremeLayout({ backgroundPath, manifestPath: extremeManifestPath(sourceAsset), outputPath, width: target.width, height: target.height, family: extremeFamily });
        } finally {
          await fs.rm(backgroundPath, { force: true });
        }
      } else if (useWideProtectedOverlay && extremeManifest) {
        const basePath = `${outputPath}.base.png`;
        try {
          await finalizeImage(result.image, basePath, target.width, target.height, "crop");
          await composeExtremeLayout({ backgroundPath: basePath, manifestPath: extremeManifestPath(sourceAsset), outputPath, width: target.width, height: target.height, family: "wide_landscape", suggestedTextRatio: suggestedTextRatio ?? undefined });
        } finally {
          await fs.rm(basePath, { force: true });
        }
      } else {
        await finalizeImage(result.image, outputPath, target.width, target.height, finalizationMode);
      }
      candidates.push({ id: targetId, src: outputUri, status: "in_review", model, quality, promptVersion: NARAKA_PROMPT_VERSION, prompt, resolvedRules, preflightWarnings: preflight.reasons, suggestedTextRatio, requestId: result.requestId });
      await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "generation", status: "in_review", model, quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey, requestId: result.requestId, processingTimeMs: Date.now() - started, apiCostUsd: null, outputUri, errorCode: null, errorMessage: null, actor, labelSnapshotHash, usageJson: result.usage ? JSON.stringify(result.usage) : null });
    } catch (err) {
      const failure = safeError(err);
      if (useExtremeCompositor || useWideProtectedOverlay) {
        const ruleCodes = [useWideProtectedOverlay ? "wide_protected_overlay_failed" : "extreme_compositor_failed"];
        const reasons = [`Scene generation or deterministic protected-layer composition failed: ${failure.message}`];
        blocked.push({ id: targetId, status: "pass_to_designer", ruleCodes, reasons });
        await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "generation", status: "pass_to_designer", model, quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey, requestId: failure.requestId, processingTimeMs: Date.now() - started, apiCostUsd: null, outputUri: null, errorCode: failure.code, errorMessage: failure.message, actor, labelSnapshotHash, usageJson: null });
        continue;
      }
      errors.push(`${targetId}: ${failure.code}`);
      await finalizeImage(source, fallbackOutputPath, target.width, target.height, finalizationMode);
      candidates.push({ id: targetId, src: fallbackOutputUri, status: "deterministic_fallback", model, quality, promptVersion: NARAKA_PROMPT_VERSION, prompt, resolvedRules, preflightWarnings: preflight.reasons, suggestedTextRatio, requestId: failure.requestId });
      await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset, targetSize: targetId, phase: "generation", status: "deterministic_fallback", model, quality, promptVersion: NARAKA_PROMPT_VERSION, cacheKey, requestId: failure.requestId, processingTimeMs: Date.now() - started, apiCostUsd: null, outputUri: fallbackOutputUri, errorCode: failure.code, errorMessage: failure.message, actor, labelSnapshotHash, usageJson: null });
    }
  }

  if (blocked.length === targetIds.length) return { runId, mode: "pass_to_designer", candidates, blocked, warning: null };
  const fallbackCount = candidates.filter((candidate) => candidate.status === "deterministic_fallback").length;
  const cacheCount = candidates.filter((candidate) => candidate.status === "cache_hit").length;
  const mode = fallbackCount === candidates.length ? "deterministic_fallback" : cacheCount === candidates.length ? "cache" : fallbackCount > 0 ? "mixed" : "openai";
  return { runId, mode, candidates, blocked, warning: errors.length ? `API fallback used (${errors.join(", ")}).` : null };
}

export async function generateDriveCandidate(params: {
  labels: ConfirmedLayerLabel[];
  targetId: NarakaTargetId;
  actor: string;
  sourceName: string;
  source: Buffer;
  recipe: RecipeMatch;
  externalProcessingConsent: true;
}): Promise<NarakaGenerationResult> {
  if (params.externalProcessingConsent !== true) throw new Error("Explicit consent is required before sending a Drive source to OpenAI Image Edit.");
  const { labels, targetId, actor, sourceName, source, recipe } = params;
  const runId = randomUUID();
  const started = Date.now();
  const target = NARAKA_TARGETS[targetId];
  const ratio = Math.max(target.width / target.height, target.height / target.width);
  const requestedQuality = (process.env.OPENAI_IMAGE_QUALITY?.trim() || "low") as ImageQuality;
  const quality = ALLOWED_QUALITIES.has(requestedQuality) ? requestedQuality : "low";
  const requestedModel = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_IMAGE_MODEL;
  const labelSnapshotHash = createLabelSnapshotHash(labels);
  const preflight = validateGenerationFeasibility(targetId, labels);

  if (preflight.status === "pass_to_designer" || ratio > 3) {
    const ruleCodes = preflight.status === "pass_to_designer" ? preflight.ruleCodes : ["drive_protected_layers_required"];
    const reasons = preflight.status === "pass_to_designer" ? preflight.reasons : ["This extreme-ratio Drive source requires extracted protected layers before generation; flattened Image Edit is not allowed to redraw or crop required objects."];
    await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset: sourceName, targetSize: targetId, phase: "preflight", status: "pass_to_designer", model: "not_called", quality, promptVersion: recipe.versionId, cacheKey: "not_created", requestId: null, processingTimeMs: Date.now() - started, apiCostUsd: 0, outputUri: null, errorCode: ruleCodes.join(","), errorMessage: reasons.join(" "), actor, labelSnapshotHash, usageJson: null });
    return { runId, mode: "pass_to_designer", candidates: [], blocked: [{ id: targetId, status: "pass_to_designer", ruleCodes, reasons }], warning: null };
  }

  const apiCanvas = planApiCanvas(target.width, target.height);
  const inventory = labels.filter((layer) => layer.finalLabel !== "Ignore").map((layer) => `${layer.name}: ${layer.finalLabel}${layer.importance ? ` (${layer.importance})` : ""}`).join("; ");
  const resolvedRules = ["general-recipe", ...resolvePromptRules(targetId, labels)];
  const prompt = [
    `Prompt recipe: ${recipe.recipeName} (${recipe.versionId}).`,
    `Global safety rules: ${GLOBAL_SAFETY_RULES}`,
    recipe.industryRules ? `Industry rules: ${recipe.industryRules}` : null,
    recipe.layoutRules ? `Layout rules: ${recipe.layoutRules}` : null,
    `Base prompt: ${recipe.basePrompt}`,
    recipe.requiredElements.length ? `Required elements: ${recipe.requiredElements.join(", ")}` : null,
    recipe.forbiddenChanges.length ? `Forbidden changes: ${recipe.forbiddenChanges.join(", ")}` : null,
    `Confirmed visible-object inventory: ${inventory}.`,
    `Produce one ${target.width}x${target.height} review candidate on working canvas ${apiCanvas.size}. Keep every required object complete and separated. Do not invent source elements.`,
  ].filter(Boolean).join("\n\n");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const cacheKey = createHash("sha256").update([sourceHash, labelSnapshotHash, targetId, recipe.versionId, model, quality, FINALIZATION_VERSION].join("|")).digest("hex");
  const filename = `${cacheKey}-${targetId}.png`;
  const outputPath = path.join(process.cwd(), "outputs", "naraka-mvp", filename);
  const outputUri = `/api/workspace/outputs/${filename}`;

  // Cache miss: the consented API call below is the only paid path.
  if (await fileExists(outputPath)) {
    return { runId, mode: "cache", candidates: [{ id: targetId, src: outputUri, status: "cache_hit", model, quality, promptVersion: recipe.versionId, prompt, resolvedRules, preflightWarnings: preflight.reasons, suggestedTextRatio: null, requestId: null }], blocked: [], warning: null };
  }

  try {
    await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset: sourceName, targetSize: targetId, phase: "generation", status: "generation_started", model, quality, promptVersion: recipe.versionId, cacheKey, requestId: null, processingTimeMs: 0, apiCostUsd: null, outputUri: null, errorCode: null, errorMessage: null, actor, labelSnapshotHash, usageJson: null });
    const result = await callImageEdit({ source, prompt, size: apiCanvas.size, model, quality });
    await finalizeImage(result.image, outputPath, target.width, target.height, "crop");
    await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset: sourceName, targetSize: targetId, phase: "generation", status: "in_review", model, quality, promptVersion: recipe.versionId, cacheKey, requestId: result.requestId, processingTimeMs: Date.now() - started, apiCostUsd: null, outputUri, errorCode: null, errorMessage: null, actor, labelSnapshotHash, usageJson: result.usage ? JSON.stringify(result.usage) : null });
    return { runId, mode: "openai", candidates: [{ id: targetId, src: outputUri, status: "in_review", model, quality, promptVersion: recipe.versionId, prompt, resolvedRules, preflightWarnings: preflight.reasons, suggestedTextRatio: null, requestId: result.requestId }], blocked: [], warning: null };
  } catch (error) {
    const failure = safeError(error);
    const fallbackFilename = `fallback-${sourceHash.slice(0, 16)}-${targetId}.png`;
    const fallbackPath = path.join(process.cwd(), "outputs", "naraka-mvp", fallbackFilename);
    const fallbackUri = `/api/workspace/outputs/${fallbackFilename}`;
    await finalizeImage(source, fallbackPath, target.width, target.height, "crop");
    await logGenerationRun({ timestamp: new Date().toISOString(), runId, sourceAsset: sourceName, targetSize: targetId, phase: "generation", status: "deterministic_fallback", model, quality, promptVersion: recipe.versionId, cacheKey, requestId: failure.requestId, processingTimeMs: Date.now() - started, apiCostUsd: null, outputUri: fallbackUri, errorCode: failure.code, errorMessage: failure.message, actor, labelSnapshotHash, usageJson: null });
    return { runId, mode: "deterministic_fallback", candidates: [{ id: targetId, src: fallbackUri, status: "deterministic_fallback", model, quality, promptVersion: recipe.versionId, prompt, resolvedRules, preflightWarnings: preflight.reasons, suggestedTextRatio: null, requestId: failure.requestId }], blocked: [], warning: `API fallback used (${failure.code}).` };
  }
}
