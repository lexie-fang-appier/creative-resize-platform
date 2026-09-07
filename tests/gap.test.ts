/**
 * Ported from classifier/test_gap_retention.py — same real CAM-ticket fixture
 * values (from the 2026-09-03 100-ticket sample), proving the parameterized TS
 * `checkGap()` behaves identically to the original hardcoded Python functions
 * when given an equivalent must-have set.
 *
 * gap_validation.py's BANNER_MUST_HAVE / NATIVE_MUST_HAVE were hardcoded module
 * constants (17 Ref's OLD 6-size Aibid must-have list, since superseded by the
 * 12-core+provisional list — see db/seed_rtb_banner_native.sql for the current,
 * database-driven set). This test recreates that same 6+2 set as SpecDimension[]
 * fixtures purely to prove `checkGap()`'s set-arithmetic/normalization logic is
 * unchanged from the prototype — it is NOT asserting that 6/2 is today's real
 * must-have count (it isn't; see the seed file for that).
 */
import { describe, expect, it } from "vitest";
import { checkGap, checkVideoGap, checkLayeredSourceRequirement, gapBucket, SpecDimension } from "../lib/gap";
import { computeRoute, bestRouteForTarget, R0, R1, R2, R3, R4 } from "../lib/retention";

const OLD_BANNER_MUST_HAVE: SpecDimension[] = [
  { width: 640, height: 960, mustHaveLevel: "required" },
  { width: 960, height: 640, mustHaveLevel: "required" },
  { width: 600, height: 500, mustHaveLevel: "required" },
  { width: 640, height: 100, mustHaveLevel: "required" },
  { width: 640, height: 200, mustHaveLevel: "required" },
  { width: 672, height: 560, mustHaveLevel: "required" },
];

const OLD_NATIVE_MUST_HAVE: SpecDimension[] = [
  { width: 160, height: 160, mustHaveLevel: "required" },
  { width: 1200, height: 627, mustHaveLevel: "required" },
];

describe("checkGap — Part A: real ticket regressions", () => {
  it("CAM-406076 Mox Bank: inventory sizes normalize to 4/6 hit", () => {
    const r = checkGap(
      "RTB Banner",
      [[300, 250], [320, 100], [320, 480], [320, 50], [480, 320]],
      OLD_BANNER_MUST_HAVE,
    );
    expect(r.mustHaveHit).toBe(4);
    expect(gapBucket(r)).toBe("部分缺must-have(1%-99%)");
  });

  it("CAM-406365 HK ticket: normalized hit=2", () => {
    const r = checkGap(
      "RTB Banner",
      [[300, 600], [320, 100], [320, 250], [320, 480], [480, 320]],
      OLD_BANNER_MUST_HAVE,
    );
    expect(r.mustHaveHit).toBe(2);
  });

  it("CAM-406125 Taobao KR: already-creative-side sizes hit 3/6", () => {
    const r = checkGap("RTB Banner", [[600, 500], [640, 960], [672, 560], [600, 1200]], OLD_BANNER_MUST_HAVE);
    expect(r.mustHaveHit).toBe(3);
  });

  it("mixed FB+RTB ticket: must-have fully hit, FB sizes excluded and not double-counted", () => {
    const r = checkGap(
      "RTB Banner",
      [
        [640, 960], [960, 640], [600, 500], [640, 100], [640, 200], [672, 560],
        [1080, 1080], [1200, 628], [300, 250], [320, 480],
      ],
      OLD_BANNER_MUST_HAVE,
    );
    expect(r.mustHaveHit).toBe(6);
    expect(r.fbSizesExcluded).toEqual(
      expect.arrayContaining([
        [1080, 1080],
        [1200, 628],
      ]),
    );
    expect(r.fbSizesExcluded).toHaveLength(2);
    expect(r.hasExtraBeyondMustHave).toBe(true);
  });

  it("RTB Native: icon+main both present hits 2/2", () => {
    const r = checkGap("RTB Native", [[160, 160], [1200, 627]], OLD_NATIVE_MUST_HAVE);
    expect(r.mustHaveHit).toBe(2);
  });

  it("RTB Video: both orientations present", () => {
    const r = checkVideoGap([[1920, 1080], [1080, 1920]]);
    expect([r.hasHoriz, r.hasVert]).toEqual([true, true]);
  });

  it("RTB Video: missing vertical", () => {
    const r = checkVideoGap([[1920, 1080]]);
    expect(r.missing).toEqual(["9:16 直式"]);
  });
});

describe("retention — Part B: 07 Flow §10-1/§10-3 worked examples", () => {
  it("square source -> 320x50 ultra-wide target is R4", () => {
    const [route] = computeRoute([1080, 1080], [320, 50]);
    expect(route).toBe(R4);
  });

  it("portrait source -> 320x480 portrait target is auto-ish (R0/R2)", () => {
    const [route] = computeRoute([1080, 1350], [320, 480]);
    expect([R0, R2]).toContain(route);
  });

  it("1200x628 source -> 1200x627 target is R0 (near-identical ratio)", () => {
    const [route, pct] = computeRoute([1200, 628], [1200, 627]);
    expect(route).toBe(R0);
    expect(pct).toBeGreaterThanOrEqual(99);
  });

  it("landscape source -> portrait target is R1 (orientation flip)", () => {
    const [route] = computeRoute([1920, 1080], [640, 960]);
    expect(route).toBe(R1);
  });

  it("bestRouteForTarget prefers the portrait source", () => {
    const best = bestRouteForTarget([[1080, 1080], [1080, 1350], [1920, 1080]], [320, 480]);
    expect(best?.[2]).toEqual([1080, 1350]);
  });
});

describe("checkLayeredSourceRequirement — Part C: 2026-09-04 scope (R0 only)", () => {
  it("R0, has PSD/AI -> not blocked", () => {
    expect(checkLayeredSourceRequirement(true, "R0")).toBeNull();
  });
  it("R0, no PSD/AI, super-res+OCR not run -> blocked", () => {
    expect(checkLayeredSourceRequirement(false, "R0")).toBe("blocked_no_layered_source");
  });
  it("R0, no PSD/AI, super-res+OCR passed -> not blocked", () => {
    expect(checkLayeredSourceRequirement(false, "R0", true)).toBeNull();
  });
  it("R0, no PSD/AI, super-res+OCR failed -> blocked", () => {
    expect(checkLayeredSourceRequirement(false, "R0", false)).toBe("blocked_no_layered_source");
  });
  it("R2 (crop-fill), no PSD/AI -> gate doesn't apply", () => {
    expect(checkLayeredSourceRequirement(false, "R2")).toBeNull();
  });
  it("R4 (manual_rearrange), no PSD/AI -> gate doesn't apply", () => {
    expect(checkLayeredSourceRequirement(false, "R4")).toBeNull();
  });
});
