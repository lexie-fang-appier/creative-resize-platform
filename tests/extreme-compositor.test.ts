import { describe, expect, it } from "vitest";
import { buildExtremeBackgroundPrompt, buildWideBasePrompt, missingExtremeRoles, missingWideOverlayRoles, requiresExtremeCompositor, suggestWideTextRatio, type ExtremeLayerManifest } from "../lib/extreme-compositor";

const manifest: ExtremeLayerManifest = {
  sourceAsset: "YJp810",
  sourceWidth: 1080,
  sourceHeight: 1350,
  layers: [
    { id: "logo", role: "Brand logo", file: "logo.png", required: true, z: 1 },
    { id: "headline", role: "Headline", file: "headline.png", required: true, z: 2 },
    { id: "supporting-copy", role: "Supporting copy", file: "supporting-copy.png", required: true, z: 3 },
    { id: "cta", role: "CTA", file: "cta.png", required: true, z: 4 },
    { id: "compliance", role: "Compliance", file: "compliance.png", required: true, z: 5 },
    { id: "platform", role: "Platform marks", file: "platform.png", required: true, z: 6 },
  ],
};

describe("extreme-ratio compositor routing", () => {
  it("only routes ratios beyond the configured boundaries", () => {
    expect(requiresExtremeCompositor(1456, 180)).toBe(true);
    expect(requiresExtremeCompositor(320, 1200)).toBe(true);
    expect(requiresExtremeCompositor(1940, 500)).toBe(false);
    expect(requiresExtremeCompositor(970, 250)).toBe(false);
    expect(requiresExtremeCompositor(640, 200)).toBe(false);
    expect(requiresExtremeCompositor(600, 200)).toBe(false);
    expect(requiresExtremeCompositor(600, 1200)).toBe(false);
  });

  it("blocks composition when a protected transparent Hero asset is missing", () => {
    const labels = [
      { name: "Hero", machineLabel: "Hero", finalLabel: "Hero", decision: "confirmed" },
      { name: "Logo", machineLabel: "Brand logo", finalLabel: "Brand logo", decision: "confirmed" },
      { name: "Headline", machineLabel: "Headline", finalLabel: "Headline", decision: "confirmed" },
      { name: "CTA", machineLabel: "CTA", finalLabel: "CTA", decision: "confirmed" },
      { name: "15+", machineLabel: "Compliance", finalLabel: "Compliance", decision: "confirmed" },
    ];
    expect(missingExtremeRoles(labels, manifest)).toEqual(["Hero"]);
  });

  it("does not treat an experimental segmentation as Designer-approved", () => {
    const withExperimentalHero: ExtremeLayerManifest = {
      ...manifest,
      layers: [...manifest.layers, { id: "hero-v1", role: "Hero", file: "hero-v1.png", required: true, z: 1, approvalStatus: "experimental" }],
    };
    const labels = [{ name: "Hero", machineLabel: "Hero", finalLabel: "Hero", decision: "confirmed" }];
    expect(missingExtremeRoles(labels, withExperimentalHero)).toEqual(["Hero"]);
  });

  it("asks the Image API for a background plate, never regenerated foreground", () => {
    const prompt = buildExtremeBackgroundPrompt("YJp810", "ultra_landscape");
    expect(prompt).toContain("object-free background plate");
    expect(prompt).toContain("Remove every person, logo, word");
    expect(prompt).toContain("flat single-color padding");
  });

  it("requires every protected wide-banner overlay and omits them from the scene prompt", () => {
    const labels = manifest.layers.map((layer) => ({ name: layer.id, machineLabel: layer.role, finalLabel: layer.role, decision: "confirmed", importance: "required" as const }));
    expect(missingWideOverlayRoles(labels, manifest)).toEqual([]);
    expect(missingWideOverlayRoles(labels, { ...manifest, layers: manifest.layers.filter((layer) => layer.role !== "Compliance") })).toEqual(["Compliance"]);
    const prompt = buildWideBasePrompt("YJp810", manifest);
    expect(prompt).toContain("Brand logo, Headline, Supporting copy");
    expect(prompt).toContain("Do not render any gameplay screenshot");
    expect(prompt).toContain("Protected source overlays");
  });

  it("does not invent CTA, platform, or gameplay slots when the source has none", () => {
    const minimal = { ...manifest, sourceAsset: "YJp814" as const, layers: manifest.layers.filter((layer) => ["Brand logo", "Headline", "Supporting copy", "Compliance"].includes(layer.role)) };
    const labels = minimal.layers.map((layer) => ({ name: layer.id, machineLabel: layer.role, finalLabel: layer.role, decision: "confirmed", importance: "required" as const }));
    expect(missingWideOverlayRoles(labels, minimal)).toEqual([]);
    expect(buildWideBasePrompt("YJp814", minimal)).toContain("remaining center-right region for the complete hero");
    expect(buildWideBasePrompt("YJp814", minimal)).not.toContain("right 30%");
  });

  it("derives a typography recommendation from the target short edge", () => {
    expect(suggestWideTextRatio(1940, 500)).toBe(0.361);
    expect(suggestWideTextRatio(970, 250)).toBe(0.326);
    expect(suggestWideTextRatio(640, 200)).toBe(0.315);
  });
});
