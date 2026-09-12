import { describe, expect, it } from "vitest";
import { createLabelSnapshotHash, planApiCanvas, planFinalCrop, resolveLayoutFamily, resolvePromptRules, validateGenerationFeasibility } from "../lib/naraka-generation";
import { readFileSync } from "node:fs";
import type { GenerationRule } from "../lib/recipe-rules";

// The seed file is the same text the database is loaded from, so these assertions
// run against the real rule set without needing a live database.
const RULES: GenerationRule[] = [...readFileSync("db/seed_recipe_rules_generation.sql", "utf8")
  .matchAll(/\(\s*'[0-9a-f-]{36}',\s*'([a-z-]+)',\s*'((?:[^']|'')*)',\s*(?:null|'(?:[^']|'')*'),\s*'(\{.*?\})'::jsonb,\s*'([a-z]+)',\s*'[a-z]+',\s*'([a-z]+)'/g)]
  .map((m) => ({ slug: m[1], statement: m[2].replace(/''/g, "'"), why: null, enforcement: m[4], layer: m[5] as GenerationRule["layer"], appliesTo: JSON.parse(m[3].replace(/''/g, "'")) }));

const slugs = (rules: { slug: string }[]) => rules.map((rule) => rule.slug);

describe("NARAKA Image API canvas planning", () => {
  it("maps an extreme target to the Image API supported 3:1 boundary", () => {
    expect(planApiCanvas(1456, 180)).toEqual({ width: 2880, height: 960, size: "2880x960", requiresCrop: true });
  });

  it("upscales small portrait placements above the API pixel floor", () => {
    const plan = planApiCanvas(300, 600);
    expect(plan.width % 16).toBe(0);
    expect(plan.height % 16).toBe(0);
    expect(plan.width * plan.height).toBeGreaterThanOrEqual(655_360);
    expect(plan.width / plan.height).toBe(0.5);
  });

  it("preserves the exact target ratio while mapping dimensions to multiples of 16", () => {
    expect(planApiCanvas(320, 480)).toEqual({ width: 672, height: 1008, size: "672x1008", requiresCrop: true });
  });

  it("creates stable hashes for the same confirmed layer snapshot", () => {
    const labels = [{ name: "繁中", machineLabel: "Brand logo", finalLabel: "Brand logo", decision: "confirmed" }];
    expect(createLabelSnapshotHash(labels)).toBe(createLabelSnapshotHash(labels));
  });

  it("resolves portrait and detected-object rules deterministically", () => {
    const rules = slugs(resolvePromptRules(RULES, "320x480", [
      { name: "Character", machineLabel: "Hero", finalLabel: "Hero", decision: "confirmed" },
      { name: "15+", machineLabel: "Compliance", finalLabel: "Compliance", decision: "confirmed" },
    ]));
    expect(rules).toContain("portrait-hero-center");
    expect(rules).toContain("keep-hero-identity-area-visible");
    expect(rules).toContain("keep-compliance-in-source-corner");
    expect(rules).not.toContain("horizontal-copy-row");
  });

  it("always resolves the complete compliance badge rule when compliance is present", () => {
    const rules = slugs(resolvePromptRules(RULES, "300x250", [
      { name: "Age badge", machineLabel: "Compliance", finalLabel: "Compliance", decision: "confirmed", importance: "required" },
    ]));
    expect(rules).toContain("keep-compliance-in-source-corner");
  });

  it("allows an extreme 320x50 composition as a warned experiment", () => {
    const result = validateGenerationFeasibility("320x50", [
      { name: "Character", machineLabel: "Hero", finalLabel: "Hero", decision: "confirmed", importance: "required" },
      { name: "Headline", machineLabel: "Headline", finalLabel: "Headline", decision: "confirmed", importance: "required" },
      { name: "Logo", machineLabel: "Brand logo", finalLabel: "Brand logo", decision: "confirmed", importance: "required" },
      { name: "15+", machineLabel: "Compliance", finalLabel: "Compliance", decision: "confirmed", importance: "required" },
    ]);
    expect(result.status).toBe("ready_with_warnings");
    expect(result.ruleCodes).toContain("insufficient_short_edge");
    expect(result.ruleCodes).toContain("required_object_capacity_conflict");
  });

  it("allows a standard portrait composition to proceed", () => {
    const result = validateGenerationFeasibility("320x480", [
      { name: "Character", machineLabel: "Hero", finalLabel: "Hero", decision: "confirmed", importance: "required" },
      { name: "Headline", machineLabel: "Headline", finalLabel: "Headline", decision: "confirmed", importance: "required" },
      { name: "Logo", machineLabel: "Brand logo", finalLabel: "Brand logo", decision: "confirmed", importance: "required" },
    ]);
    expect(result).toEqual({ status: "ready", ruleCodes: [], reasons: [] });
  });

  it("requires a dedicated App icon source for the Native 160x160 target", () => {
    const result = validateGenerationFeasibility("160x160", [
      { name: "Wordmark", machineLabel: "Brand logo", finalLabel: "Brand logo", decision: "confirmed", importance: "required" },
    ]);
    expect(result.status).toBe("pass_to_designer");
    expect(result.ruleCodes).toContain("dedicated_app_icon_source_required");
  });

  it("allows the provisional 960x640 target as a review-only experiment", () => {
    const result = validateGenerationFeasibility("960x640", [
      { name: "Hero", machineLabel: "Hero", finalLabel: "Hero", decision: "confirmed", importance: "required" },
    ]);
    expect(result.status).toBe("ready_with_warnings");
    expect(result.ruleCodes).toContain("pending_spec_confirmation");
  });

  it("uses a bounded near-ratio canvas when exact 16px ratio mapping is too large", () => {
    expect(planApiCanvas(1200, 627)).toEqual({ width: 1200, height: 624, size: "1200x624", requiresCrop: true });
  });

  it("routes extreme banner ratios to dedicated layout families", () => {
    expect(resolveLayoutFamily(1456, 180)).toBe("ultra_landscape");
    expect(resolveLayoutFamily(1940, 500)).toBe("landscape");
    expect(resolveLayoutFamily(640, 200)).toBe("landscape");
    expect(resolveLayoutFamily(600, 200)).toBe("landscape");
    expect(resolveLayoutFamily(320, 1200)).toBe("ultra_portrait");
  });

  it("calculates the exact final extraction region on the API canvas", () => {
    const wideCanvas = planApiCanvas(1456, 180);
    const tallCanvas = planApiCanvas(320, 1200);
    const wideCrop = planFinalCrop(1456, 180, wideCanvas);
    const tallCrop = planFinalCrop(320, 1200, tallCanvas);
    expect(wideCrop).toEqual({ x: 0, y: 0, width: wideCanvas.width, height: wideCanvas.height });
    expect(tallCrop).toEqual({ x: 0, y: 0, width: tallCanvas.width, height: tallCanvas.height });
  });

  it("adds zone and optional-first rules for extreme ratios", () => {
    expect(slugs(resolvePromptRules(RULES, "1456x180", []))).toContain("ultra-landscape-zones");
    expect(slugs(resolvePromptRules(RULES, "320x1200", []))).toContain("ultra-portrait-zones");
    expect(slugs(resolvePromptRules(RULES, "320x1200", []))).toContain("optional-elements-omit-first");
  });

  it("protects the final crop band for 3:1 to 4:1 landscape targets", () => {
    expect(slugs(resolvePromptRules(RULES, "1940x500", []))).toContain("wide-landscape-crop-safe-band");
    expect(slugs(resolvePromptRules(RULES, "640x200", []))).toContain("wide-landscape-crop-safe-band");
    expect(slugs(resolvePromptRules(RULES, "1200x627", []))).not.toContain("wide-landscape-crop-safe-band");
  });
});
