/**
 * Ported from classifier/gap_validation.py (17 Ref §一/§2-1). Set-arithmetic
 * gap-checking for banner/native/video must-have coverage.
 *
 * Architectural change from the prototype: gap_validation.py had a hardcoded
 * `BANNER_MUST_HAVE = {...6 tuples...}` / `NATIVE_MUST_HAVE` module constant. This
 * platform's whole point (see 28 Technical Plan §18-2) is that must-have sizes are
 * NOT a code constant — they are looked up from the `spec_dimensions` table (joined
 * through `spec_versions`, filtered by the job's target placement) and passed in.
 * `checkGap()` below therefore takes a `SpecDimension[]` parameter instead of
 * reading a hardcoded list internally; callers are responsible for having already
 * filtered spec_dimensions to the right placement/spec_version before calling.
 *
 * Two corrections carried over from the original prototype's docstring, preserved
 * here because they came from running the original against 100 real CAM tickets
 * (2026-09-03 session) and are not obvious from the set arithmetic alone:
 *
 * 1. Inventory-vs-creative unit mismatch. 17 Ref §2-1: JPG/PNG/GIF banner delivery
 *    is always the DOUBLED creative size, not the ad-slot (inventory) size an AM
 *    often quotes on a ticket (customer says "300x250", the actual deliverable is
 *    600x500). Checking raw ticket sizes against the must-have list without this
 *    mapping undercounts coverage — 35/59 tickets that looked like "0% coverage"
 *    turned out to have 3-5/6 once normalized. `INVENTORY_TO_CREATIVE` is a stable
 *    doubling-rule mapping (not a must-have list), so it stays a code constant.
 *
 * 2. FB-scope sizes must be excluded before the must-have check. This MVP's Gap
 *    Matrix covers RTB only; FB Banner/Carousel/Video is out of scope (business-
 *    priority hold, not a technical blocker). Real tickets routinely bundle an FB
 *    deliverable (1080x1080 / 1200x628) alongside genuine RTB asks in the same
 *    ticket — the fix is size-level exclusion, not dropping the ticket.
 */

export interface SpecDimension {
  width: number;
  height: number;
  deviceScope?: string;
  mustHaveLevel: "required" | "provisional" | "good_to_have" | string;
  notes?: string | null;
}

export type SizeTuple = [number, number];

function sizeKey([w, h]: SizeTuple): string {
  return `${w}x${h}`;
}

// 17 Ref §2-1: inventory (ad-slot) size -> creative (delivery) size, JPG/PNG/GIF
// doubling rule.
export const INVENTORY_TO_CREATIVE: Record<string, SizeTuple> = {
  "300x250": [600, 500], "320x50": [640, 100], "320x480": [640, 960],
  "728x90": [1456, 180], "336x280": [672, 560], "300x600": [600, 1200],
  "160x600": [320, 1200], "250x250": [500, 500], "970x250": [1940, 500],
  "320x100": [640, 200], "120x600": [240, 1200], "970x90": [1940, 180],
  "200x200": [400, 400],
};

// Sizes belonging to out-of-scope FB placements (17 Ref §七). Excluded from the
// must-have check at the SIZE level — the job/ticket itself stays in scope.
export const FB_OUT_OF_SCOPE_SIZES = new Set<string>(["1080x1080", "1200x628"]);

/** Any inventory-side size also contributes its creative equivalent, so the
 * must-have check works whichever unit the job happened to quote. */
export function normalizeSizes(sizes: SizeTuple[]): Set<string> {
  const out = new Set<string>(sizes.map(sizeKey));
  for (const s of sizes) {
    const key = sizeKey(s);
    if (key in INVENTORY_TO_CREATIVE) out.add(sizeKey(INVENTORY_TO_CREATIVE[key]));
  }
  return out;
}

export function splitFbSizes(sizes: SizeTuple[]): { inScope: SizeTuple[]; fbFound: SizeTuple[] } {
  const inScope: SizeTuple[] = [];
  const fbFound: SizeTuple[] = [];
  for (const s of sizes) {
    (FB_OUT_OF_SCOPE_SIZES.has(sizeKey(s)) ? fbFound : inScope).push(s);
  }
  return { inScope, fbFound };
}

export interface GapResult {
  category: string;
  mustHaveTotal: number;
  mustHaveHit: number;
  missing: SizeTuple[];
  hitSizes: SizeTuple[];
  inScopeSizeCount: number;
  fbSizesExcluded: SizeTuple[];
  coveragePct: number;
  hasExtraBeyondMustHave: boolean;
}

/**
 * Generic must-have gap check, parameterized by `specDimensions` (already
 * placement-filtered — e.g. all rows for the job's target RTB Banner placement).
 * Only rows with mustHaveLevel === 'required' count toward the must-have set;
 * provisional/good_to_have rows are informational and excluded here (mirrors
 * 17 Ref's `pending_spec_confirmation` treatment for 960x640).
 */
export function checkGap(
  category: string,
  requestedSizes: SizeTuple[],
  specDimensions: SpecDimension[],
): GapResult {
  const mustHave = new Set(
    specDimensions.filter((d) => d.mustHaveLevel === "required").map((d) => sizeKey([d.width, d.height])),
  );
  const mustHaveTuples = new Map<string, SizeTuple>(
    specDimensions
      .filter((d) => d.mustHaveLevel === "required")
      .map((d) => [sizeKey([d.width, d.height]), [d.width, d.height]]),
  );

  const { inScope, fbFound } = splitFbSizes(requestedSizes);
  const normalized = normalizeSizes(inScope);

  const hitKeys = [...normalized].filter((k) => mustHave.has(k));
  const missingKeys = [...mustHave].filter((k) => !normalized.has(k));

  const hitSizes = hitKeys.map((k) => mustHaveTuples.get(k)!).sort(sortTuples);
  const missing = missingKeys.map((k) => mustHaveTuples.get(k)!).sort(sortTuples);

  const mustHaveTotal = mustHave.size;
  const mustHaveHit = hitKeys.length;

  return {
    category,
    mustHaveTotal,
    mustHaveHit,
    missing,
    hitSizes,
    inScopeSizeCount: inScope.length,
    fbSizesExcluded: fbFound,
    coveragePct: mustHaveTotal === 0 ? 0 : Math.round((mustHaveHit / mustHaveTotal) * 100),
    hasExtraBeyondMustHave: inScope.length > hitKeys.length && mustHaveHit === mustHaveTotal,
  };
}

function sortTuples(a: SizeTuple, b: SizeTuple): number {
  return a[0] - b[0] || a[1] - b[1];
}

export interface VideoGapResult {
  category: "RTB Video";
  mustHaveTotal: 2;
  mustHaveHit: number;
  missing: string[];
  coveragePct: number;
  hasHoriz: boolean;
  hasVert: boolean;
}

/** E-VIDEO-ORIENT (17 Ref §一): need both 16:9-ish (landscape) and 9:16-ish
 * (portrait) orientations. Orientation, not exact aspect ratio, is what's checked. */
export function checkVideoGap(sourceVideoSizes: SizeTuple[]): VideoGapResult {
  const hasHoriz = sourceVideoSizes.some(([w, h]) => w > h);
  const hasVert = sourceVideoSizes.some(([w, h]) => h > w);
  const hit = (hasHoriz ? 1 : 0) + (hasVert ? 1 : 0);
  const missing: string[] = [];
  if (!hasHoriz) missing.push("16:9 橫式");
  if (!hasVert) missing.push("9:16 直式");
  return {
    category: "RTB Video",
    mustHaveTotal: 2,
    mustHaveHit: hit,
    missing,
    coveragePct: Math.round((hit / 2) * 100),
    hasHoriz,
    hasVert,
  };
}

/**
 * `blocked_no_layered_source` gate — scope set 2026-09-04, ported verbatim from
 * gap_validation.py's check_layered_source_requirement(). Applies to
 * `eligible_scale` (R0) ONLY:
 *
 * 1. First pass: require .psd/.ai for ALL resize processing — reasoning was that
 *    neither retention.ts's math nor Appier's own Creative Advisor can invent
 *    detail a flattened jpg/png doesn't have.
 * 2. Refined same day: crop-fill (R2/eligible_crop_fill) doesn't need this gate at
 *    all — that bucket's problem is "crop in the right place" (Creative Advisor's
 *    job), not a resolution problem, and Creative Advisor's own API contract only
 *    ever takes flattened jpg/png/mp4 anyway (never .psd/.ai).
 * 3. For R0 specifically: no .psd/.ai is no longer an automatic block — AI
 *    super-resolution is tried first, gated by an OCR text-consistency check
 *    (extracted text before/after upscale must match, since a super-res model can
 *    plausibly alter character shapes without visibly looking wrong). Only block
 *    if that check fails or hasn't been run yet.
 * 4. manual_rearrange never reaches this function — it's already routed to Design
 *    Team regardless of source-file availability.
 *
 * Known gap (not yet fixed): `hasPsdOrAi` only checks file *existence*, not
 * whether the flattened composite's actual pixel resolution is high enough to
 * matter. This should eventually take the probed native resolution and compare it
 * against the target size, not just a boolean "file exists" flag.
 */
export function checkLayeredSourceRequirement(
  hasPsdOrAi: boolean,
  route: string = "R0",
  superResOcrPassed: boolean | null = null,
): string | null {
  if (route !== "R0") return null;
  if (hasPsdOrAi) return null;
  if (superResOcrPassed) return null;
  return "blocked_no_layered_source";
}

/** Classify a checkGap()/checkVideoGap() result into the reporting buckets used
 * against the 100-ticket sample: 完全缺 / 部分缺 / 剛好等於 / 已有但還要更多. */
export function gapBucket(result: { mustHaveHit: number; mustHaveTotal: number; inScopeSizeCount?: number }): string {
  const { mustHaveHit: hit, mustHaveTotal: total } = result;
  if (hit === 0) return "完全缺must-have(0%命中)";
  if (hit < total) return "部分缺must-have(1%-99%)";
  const inScope = result.inScopeSizeCount ?? total;
  if (inScope === total) return "剛好等於must-have(100%,不需要更多)";
  return "已有must-have但還要更多size(100%+)";
}
