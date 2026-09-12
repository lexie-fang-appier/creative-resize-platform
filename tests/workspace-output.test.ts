import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isSafeWorkspaceOutputFilename, workspaceOutputTarget } from "../lib/workspace-output";

const HASH = "a".repeat(64);

describe("workspace output filename validation", () => {
  it("accepts newly registered must-have target sizes", () => {
    expect(workspaceOutputTarget(`${HASH}-600x1200.png`)).toBe("600x1200");
    expect(workspaceOutputTarget(`${HASH}-600x500.png`)).toBe("600x500");
    expect(workspaceOutputTarget(`${HASH}-1200x627.png`)).toBe("1200x627");
  });

  it("resolves the real generated files that previously rendered as broken images", () => {
    const filenames = [
      "99528c5c7cfb7a68f40e69f0e8557e84a6ae7c829216ed987d345041ea6cb9d3-600x1200.png",
      "e1314fa8e13d0a158386ce99f57e36146618fbe23dbbd19c452714976ef26bed-600x500.png",
    ];
    for (const filename of filenames) {
      expect(isSafeWorkspaceOutputFilename(filename)).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), "outputs", "naraka-mvp", filename))).toBe(true);
    }
  });

  it("accepts deterministic fallback output names", () => {
    expect(isSafeWorkspaceOutputFilename(`fallback-${"b".repeat(16)}-672x560.png`)).toBe(true);
  });

  it("rejects anything that is not this exact filename shape", () => {
    // A size this route has never heard of is not a safety problem — the shape
    // is. Requiring a known target here only coupled a static-file route to the
    // spec tables, so the check is now the pattern alone.
    expect(isSafeWorkspaceOutputFilename(`../${HASH}-600x500.png`)).toBe(false);
    expect(isSafeWorkspaceOutputFilename(`${HASH}/../600x500.png`)).toBe(false);
    expect(isSafeWorkspaceOutputFilename(`${HASH}-600x500.jpg`)).toBe(false);
    expect(isSafeWorkspaceOutputFilename(`${"a".repeat(63)}-600x500.png`)).toBe(false);
    expect(isSafeWorkspaceOutputFilename(`${HASH}-600x0.png`)).toBe(false);
  });
});
