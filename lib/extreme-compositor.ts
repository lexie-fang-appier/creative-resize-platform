import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ConfirmedLayerLabel, LayoutFamily } from "./naraka-generation";
import type { NarakaSourceId } from "./creative-analysis";

const execFileAsync = promisify(execFile);

export const EXTREME_COMPOSITOR_VERSION = "layer-compositor-v3";
export const WIDE_OVERLAY_VERSION = "wide-protected-overlay-v4";

export type ExtremeLayerRole = "Hero" | "Headline" | "Supporting copy" | "Brand logo" | "Platform marks" | "CTA" | "Compliance" | "Supporting visual" | "Decorative";

export interface ExtremeLayerAsset {
  id: string;
  role: ExtremeLayerRole;
  file: string;
  required: boolean;
  z: number;
  approvalStatus?: "approved" | "experimental";
}

export interface ExtremeLayerManifest {
  sourceAsset: NarakaSourceId;
  sourceWidth: number;
  sourceHeight: number;
  layers: ExtremeLayerAsset[];
}

export type CompositorFamily = "ultra_landscape" | "ultra_portrait" | "wide_landscape";

/** Mirrors the zone tables in scripts/compose_extreme_layout.py. Kept in sync by
 * tests/extreme-compositor.test.ts, which reads the script's own --describe
 * output rather than trusting this copy. */
export const COMPOSITOR_ZONE_ROLES: Record<CompositorFamily, readonly ExtremeLayerRole[]> = {
  ultra_landscape: ["Brand logo", "Hero", "Headline", "Supporting copy", "CTA", "Compliance"],
  ultra_portrait: ["Brand logo", "Hero", "Headline", "Supporting copy", "CTA", "Compliance"],
  wide_landscape: ["Brand logo", "Headline", "Supporting copy", "CTA", "Platform marks", "Compliance", "Supporting visual"],
};

/** Roles the image model paints into the plate, so having no overlay slot for
 * them is correct rather than a loss. */
export const MODEL_PAINTED_ROLES: readonly ExtremeLayerRole[] = ["Hero", "Decorative"];

/** Required layers this family has nowhere to put. The compositor exits on these,
 * but it only runs after the plate has been bought — checking here means the
 * target routes to the Designer before anything is paid for. */
export function unplaceableRequiredRoles(manifest: ExtremeLayerManifest, family: CompositorFamily): ExtremeLayerRole[] {
  const placeable = new Set<string>([...COMPOSITOR_ZONE_ROLES[family], ...MODEL_PAINTED_ROLES, "Background"]);
  return [...new Set(manifest.layers.filter((layer) => layer.required && !placeable.has(layer.role)).map((layer) => layer.role))];
}

export function requiresExtremeCompositor(width: number, height: number): boolean {
  const ratio = width / height;
  return ratio > 4 || ratio < 1 / 3;
}

export function suggestWideTextRatio(width: number, height: number): number {
  const shortEdge = Math.min(width, height);
  const ratio = 0.28 + Math.log2(Math.max(shortEdge, 100) / 100) * 0.035;
  return Math.round(Math.min(0.38, Math.max(0.30, ratio)) * 1000) / 1000;
}

export function requiredExtremeRoles(labels: ConfirmedLayerLabel[]): ExtremeLayerRole[] {
  const active = new Set(labels.filter((layer) => layer.finalLabel !== "Ignore").map((layer) => layer.finalLabel));
  return (["Hero", "Headline", "Brand logo", "CTA", "Compliance"] as ExtremeLayerRole[]).filter((role) => active.has(role));
}

export function missingExtremeRoles(labels: ConfirmedLayerLabel[], manifest: ExtremeLayerManifest): ExtremeLayerRole[] {
  const available = new Set(manifest.layers.filter((layer) => layer.approvalStatus !== "experimental").map((layer) => layer.role));
  return requiredExtremeRoles(labels).filter((role) => !available.has(role));
}

export function extremeManifestPath(sourceAsset: NarakaSourceId): string {
  return path.join(process.cwd(), "public", "examples", "naraka", "layers", sourceAsset, "manifest.json");
}

export async function loadExtremeLayerManifest(sourceAsset: NarakaSourceId): Promise<ExtremeLayerManifest | null> {
  try {
    return JSON.parse(await fs.readFile(extremeManifestPath(sourceAsset), "utf8")) as ExtremeLayerManifest;
  } catch {
    return null;
  }
}

export function buildExtremeBackgroundPrompt(sourceAsset: NarakaSourceId, family: Extract<LayoutFamily, "ultra_landscape" | "ultra_portrait">): string {
  return [
    `Create a clean, object-free background plate derived from the supplied ${sourceAsset} key art for an ${family} advertising canvas.`,
    "Extend the original painted environment, lighting, texture, gradients, and color palette naturally across the entire canvas.",
    "Remove every person, logo, word, letter, number, CTA, badge, gameplay inset, frame, and foreground ornament.",
    "Do not add replacement objects. Do not leave silhouettes, duplicated fragments, text-shaped marks, or flat single-color padding.",
    "Return one full-bleed background plate only. Original foreground pixels will be composited separately.",
  ].join("\n\n");
}

export function missingWideOverlayRoles(labels: ConfirmedLayerLabel[], manifest: ExtremeLayerManifest): ExtremeLayerRole[] {
  const overlayRoles = new Set<ExtremeLayerRole>(["Brand logo", "Headline", "Supporting copy", "CTA", "Compliance", "Platform marks", "Supporting visual"]);
  const required = [...new Set(labels
    .filter((layer) => layer.finalLabel !== "Ignore" && layer.importance === "required" && overlayRoles.has(layer.finalLabel as ExtremeLayerRole))
    .map((layer) => layer.finalLabel as ExtremeLayerRole))];
  const available = new Set(manifest.layers.filter((layer) => layer.approvalStatus !== "experimental").map((layer) => layer.role));
  return required.filter((role) => !available.has(role));
}

export function buildWideBasePrompt(sourceAsset: NarakaSourceId, manifest?: ExtremeLayerManifest): string {
  const hasSupportingVisuals = manifest?.layers.some((layer) => layer.role === "Supporting visual") ?? false;
  const overlayInventory = [...new Set((manifest?.layers ?? []).filter((layer) => layer.approvalStatus !== "experimental").map((layer) => layer.role))];
  return [
    `Recompose the supplied ${sourceAsset} key art as a wide 3:1 working-canvas scene that will be cropped to the final banner ratio.`,
    "Keep the hero's complete face, head details, torso, and primary silhouette inside the central horizontal band.",
    `Do not render any gameplay screenshot, gameplay frame, brand logo, headline, supporting copy, date, CTA, platform mark, compliance badge, letter, word, or number. Protected source overlays${overlayInventory.length ? ` (${overlayInventory.join(", ")})` : ""} will be proportionally composited after the crop.`,
    hasSupportingVisuals
      ? "Reserve the left 38% as low-detail painted background for protected copy overlays, the center 32% for the hero, and the right 30% as low-detail background for supporting visual overlays. Keep the top 12% and bottom 12% as continuous background-only trim zones."
      : "Reserve the left 45% as low-detail painted background for protected copy overlays and use the remaining center-right region for the complete hero and continuous source environment. Keep the top 12% and bottom 12% as continuous background-only trim zones.",
    "Preserve the source art direction, character identity, palette, and lighting. Return one full-bleed scene plate only.",
  ].join("\n\n");
}

export async function composeExtremeLayout(params: {
  backgroundPath: string;
  manifestPath: string;
  outputPath: string;
  width: number;
  height: number;
  family: Extract<LayoutFamily, "ultra_landscape" | "ultra_portrait"> | "wide_landscape";
  suggestedTextRatio?: number;
}): Promise<void> {
  const args = [
    path.join(process.cwd(), "scripts", "compose_extreme_layout.py"),
    params.backgroundPath,
    params.manifestPath,
    params.outputPath,
    String(params.width),
    String(params.height),
    params.family,
  ];
  if (params.suggestedTextRatio !== undefined) args.push(String(params.suggestedTextRatio));
  await execFileAsync("python3", args);
}
