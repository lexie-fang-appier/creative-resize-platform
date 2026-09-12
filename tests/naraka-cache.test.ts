import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(async () => undefined),
  logGenerationRun: vi.fn(async () => undefined),
}));

vi.mock("node:fs/promises", () => {
  const fsMock = {
    access: mocks.access,
    readFile: vi.fn(async () => Buffer.from("source-bytes")),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
  };
  return { ...fsMock, default: fsMock };
});

vi.mock("../lib/sheets-log", () => ({ logGenerationRun: mocks.logGenerationRun }));

// The rule set comes from recipe_rules; this suite is about the cache path, so
// it stands in a minimal one rather than requiring a database.
vi.mock("../lib/recipe-rules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/recipe-rules")>()),
  loadGenerationRules: async () => [
    { slug: "no-stretch", statement: "Never stretch.", why: null, layer: "global" as const, enforcement: "eye", appliesTo: { surface: "generate", layoutFamily: ["any"] } },
  ],
}));

const { generateNarakaCandidates } = await import("../lib/naraka-generation");

const LABELS = [
  { name: "Character", machineLabel: "Hero", finalLabel: "Hero", decision: "confirmed", importance: "required" as const },
];

function spyOnFetch() {
  return vi.spyOn(globalThis, "fetch");
}

describe("cache hits never reach the paid API", () => {
  let fetchSpy: ReturnType<typeof spyOnFetch>;

  beforeEach(() => {
    mocks.access.mockReset().mockResolvedValue(undefined); // the cached file exists
    mocks.logGenerationRun.mockReset().mockResolvedValue(undefined);
    fetchSpy = spyOnFetch();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("serves the cached candidate without calling the image API", async () => {
    const result = await generateNarakaCandidates(LABELS, ["500x500"], "designer@appier.com", "YJp814");

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].status).toBe("cache_hit");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not regenerate a cached candidate when the audit log throws", async () => {
    // logGenerationRun is the one required logger: it throws when the Sheet is
    // unconfigured. It used to share a try block with the existence check, so
    // this throw was read as a cache MISS and the run paid for the image again.
    mocks.logGenerationRun.mockRejectedValue(new Error("Google Sheet logging is required but not configured."));

    await expect(generateNarakaCandidates(LABELS, ["500x500"], "designer@appier.com", "YJp814")).rejects.toThrow(/required but not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
