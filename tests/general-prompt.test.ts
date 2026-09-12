import { describe, expect, it } from "vitest";
import { BUILT_IN_GENERAL_RECIPE, composeResolvedPrompt } from "../lib/generation";

describe("General prompt fallback", () => {
  it("has a stable version and preserves universal creative constraints", () => {
    const prompt = composeResolvedPrompt(BUILT_IN_GENERAL_RECIPE, { width: 600, height: 500, deviceScope: "pc_mobile", mustHaveLevel: "required" }, null);
    expect(BUILT_IN_GENERAL_RECIPE.versionId).toBe("general-builtin-v1");
    expect(prompt).toContain("General");
    expect(prompt).toContain("exact visible copy");
    expect(prompt).toContain("600x500");
  });
});
