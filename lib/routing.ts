/**
 * Route / reason-code decisions for one Gap Matrix cell (target spec_dimension
 * x job's scanned assets). Reconciled route list from 28 Technical Plan §12,
 * scoped to what's honestly determinable from Phase 0/1 signals — see the
 * per-branch comments below for exactly which of §12's 11 codes this module
 * emits and why two of them are deliberately never emitted.
 *
 * This module is pure (no DB access) — callers (`lib/gap-matrix.ts`) are
 * responsible for building `RoutingAsset[]` from `assets` rows plus a
 * `classifyAsset()` call, same separation `lib/gap.ts` already uses.
 */
import { classifyAsset } from "./classify";
import { bestRouteForTarget, R0, R1, R2, R3, R4, type WH } from "./retention";

export type Route =
  | "ready_to_use"
  | "eligible_scale"
  | "eligible_crop_fill"
  | "eligible_psd_redesign"
  | "video_compression"
  | "manual_rearrange"
  | "blocked_missing_context"
  | "blocked_no_usable_source"
  | "unsupported_format";
// NOT implemented this phase, and deliberately never emitted by this module:
// `manual_compliance` and `blocked_safezone` both require icon/CTA/end-card/
// safe-zone pixel-level detection, which no code in this repo does (that's
// real computer-vision-ish work, out of Phase 1 scope — see README). Do not
// add a stub branch here that always "passes" a check that was never run.

export interface RoutingTarget {
  width: number;
  height: number;
}

export interface RoutingAsset {
  id: string;
  format: string | null; // "JPG" | "PNG" | "GIF" | "MP4" | "PSD" | "AI" | ...
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  videoDurationSec: number | null;
  redesignEligible: boolean | null;
  isMultiFrameGif?: boolean | null;
  scanError?: string | null;
  /** Confidence from classify.ts, if the caller ran it for this asset. Only
   * `ambiguous_requires_campaign_context` changes routing behavior here. */
  classificationConfidence?: string | null;
}

export interface RoutingResult {
  route: Route;
  reasonCode: string;
  matchedAssetId: string | null;
  missingComponents: string[];
}

// 17 Ref §一 / scripts/video_compress.py: MP4, <25MB, ideally <=15s else <=30s.
// 30s is the hard ceiling used here (matches video_compress.py's docstring).
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;
const VIDEO_MAX_DURATION_SEC = 30;

const RASTER_OR_VIDEO_FORMATS = new Set(["JPG", "PNG", "GIF", "MP4"]);

function isAmbiguous(a: RoutingAsset): boolean {
  return a.classificationConfidence === "ambiguous_requires_campaign_context";
}

function targetLabel(t: RoutingTarget): string {
  return `${t.width}x${t.height}`;
}

function videoSpecViolation(a: RoutingAsset): string | null {
  const overSize = a.fileSizeBytes != null && a.fileSizeBytes > VIDEO_MAX_BYTES;
  const overDuration = a.videoDurationSec != null && a.videoDurationSec > VIDEO_MAX_DURATION_SEC;
  if (overSize && overDuration) return "video_exceeds_size_and_duration";
  if (overSize) return "video_exceeds_file_size";
  if (overDuration) return "video_exceeds_duration";
  return null;
}

/**
 * Decide the route for one target dimension given every asset scanned for the
 * job. See the module docstring for scope. `assets` should already exclude
 * nothing — scan_error assets are filtered out here (they're not usable
 * sources), matching §13's "asset-level error, not job-level" design.
 */
export function routeTarget(target: RoutingTarget, assets: RoutingAsset[]): RoutingResult {
  if (assets.length === 0) {
    return {
      route: "blocked_no_usable_source",
      reasonCode: "no_assets_scanned",
      matchedAssetId: null,
      missingComponents: [targetLabel(target)],
    };
  }

  const usable = assets.filter((a) => !a.scanError);
  if (usable.length === 0) {
    return {
      route: "blocked_no_usable_source",
      reasonCode: "all_scanned_assets_errored",
      matchedAssetId: null,
      missingComponents: [targetLabel(target)],
    };
  }

  // 1. Exact dimension match on an existing raster/video asset -> ready_to_use.
  // Multi-frame GIFs are excluded even on an exact pixel match — MVP doesn't
  // support GIF redesign/delivery validation (unsupported_format applies
  // regardless of whether the dimensions happen to line up).
  const exact = usable.find(
    (a) =>
      a.width === target.width &&
      a.height === target.height &&
      a.format &&
      RASTER_OR_VIDEO_FORMATS.has(a.format) &&
      !a.isMultiFrameGif,
  );
  if (exact) {
    if (isAmbiguous(exact)) {
      return {
        route: "blocked_missing_context",
        reasonCode: "ambiguous_requires_campaign_context",
        matchedAssetId: exact.id,
        missingComponents: [],
      };
    }
    return { route: "ready_to_use", reasonCode: "exact_dimension_match", matchedAssetId: exact.id, missingComponents: [] };
  }

  // 2/3. Generic raster/video retention-bucket scaling (lib/retention.ts,
  // ported from retention.py — R0-R4 geometric ratio-retention buckets). AI
  // and multi-frame GIF sources are excluded here on purpose: they fall
  // through to step 6 (unsupported_format) instead of being scaled like a
  // normal raster.
  //
  // Video-specific override: a video that would otherwise be R0/R2/R3 (i.e.
  // actually a good geometric match for this target) but violates the
  // file-size/duration spec routes to `video_compression` instead of
  // eligible_scale/eligible_crop_fill. Deliberately NOT a coarse "orientation
  // matches" check (landscape-vs-landscape) as 28 Technical Plan §12's prose
  // literally reads — a first pass built exactly that and a live E2E run
  // (this repo's dev-fixture pool has two long-form SofyBe source videos)
  // immediately showed it swallowing every Banner/Native target, including a
  // 500x500 square banner matched against a 1920x1080 16:9 video, because
  // both merely have width>=height. Scoping the override to R0/R2/R3 (i.e.
  // the video must actually be geometrically close to the target, not just
  // "not portrait when target isn't portrait") is what §12 clearly *means*
  // ("orientation matches" as shorthand for "is a plausible source"), not
  // what it literally says — flagged here as a correction, not a silent
  // reinterpretation.
  const dimensioned = usable.filter(
    (a) => a.width != null && a.height != null && a.format !== "AI" && !a.isMultiFrameGif && a.format !== "PSD",
  );
  let fallbackNeedsDesigner: { assetId: string; route: string } | null = null;
  if (dimensioned.length > 0) {
    const best = bestRouteForTarget(
      dimensioned.map((a) => [a.width!, a.height!] as WH),
      [target.width, target.height],
    );
    if (best) {
      const [route, pct, sourceWH] = best;
      const matched = dimensioned.find((a) => a.width === sourceWH[0] && a.height === sourceWH[1])!;
      const videoIssue = matched.format === "MP4" ? videoSpecViolation(matched) : null;

      if (route === R0 || route === R2 || route === R3) {
        if (isAmbiguous(matched)) {
          return { route: "blocked_missing_context", reasonCode: "ambiguous_requires_campaign_context", matchedAssetId: matched.id, missingComponents: [] };
        }
        if (videoIssue) {
          return { route: "video_compression", reasonCode: videoIssue, matchedAssetId: matched.id, missingComponents: [] };
        }
        if (route === R0) {
          return { route: "eligible_scale", reasonCode: `retention_${pct}pct_R0`, matchedAssetId: matched.id, missingComponents: [] };
        }
        return { route: "eligible_crop_fill", reasonCode: `retention_${pct}pct_${route === R2 ? "R2" : "R3"}`, matchedAssetId: matched.id, missingComponents: [] };
      }
      // R1 (orientation flip — 07 Flow: "一定要設計師重排" regardless of retention %)
      // or R4 (heavy crop). retention.ts's own NEEDS_DESIGNER set groups these
      // two together deliberately (see retention.ts docstring) — deviates from
      // this platform's routing-table draft, which grouped R1 with R2/R3 under
      // eligible_crop_fill; kept consistent with the already-validated ported
      // logic instead of relitigating it (see CLAUDE.md). Before falling back
      // to manual_rearrange, check whether a PSD source could offer a better
      // AI-redesign alternative (step 4) — a poor raster match doesn't rule
      // that out.
      fallbackNeedsDesigner = { assetId: matched.id, route: route === R1 ? "orientation_flip_R1" : `retention_${pct}pct_R4` };
    }
  }

  // 4. No good raster/video match (or none at all) — check PSD source
  // eligibility for AI redesign.
  const psdSources = usable.filter((a) => a.format === "PSD");
  if (psdSources.length > 0) {
    const eligible = psdSources.find((a) => a.redesignEligible === true);
    if (eligible) {
      return { route: "eligible_psd_redesign", reasonCode: "psd_semantic_layers_available", matchedAssetId: eligible.id, missingComponents: [] };
    }
    return {
      route: "manual_rearrange",
      reasonCode: "psd_no_semantic_layers",
      matchedAssetId: psdSources[0].id,
      missingComponents: ["semantic layer names (logo/CTA/hero)"],
    };
  }

  // 5. No PSD, but a raster/video match existed at R1/R4 -> fall back to that
  // geometric verdict.
  if (fallbackNeedsDesigner) {
    return { route: "manual_rearrange", reasonCode: fallbackNeedsDesigner.route, matchedAssetId: fallbackNeedsDesigner.assetId, missingComponents: [] };
  }

  // 6. Only unsupported-format sources remain (.ai, multi-frame GIF) and
  // nothing else claimed a route above.
  const unsupported = usable.find((a) => a.format === "AI" || a.isMultiFrameGif);
  if (unsupported) {
    return {
      route: "unsupported_format",
      reasonCode: unsupported.format === "AI" ? "ai_source_unsupported" : "multi_frame_gif_unsupported",
      matchedAssetId: unsupported.id,
      missingComponents: [],
    };
  }

  // 7. Assets exist for the job, but none of them are usable for this target.
  return {
    route: "blocked_no_usable_source",
    reasonCode: "no_usable_source_for_target",
    matchedAssetId: null,
    missingComponents: [targetLabel(target)],
  };
}

/** Convenience wrapper: run classify.ts on a scanned asset's basic metadata to
 * get the `classificationConfidence` signal routeTarget() consumes. Kept
 * separate from routeTarget() itself so the pure routing function stays easy
 * to unit-test without needing full classify.ts AssetMetadata shapes. */
export function classificationConfidenceFor(asset: { mimeType: string | null; width: number | null; height: number | null; fileSizeBytes: number | null }): string {
  const result = classifyAsset({
    mime: asset.mimeType ?? undefined,
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    fileSizeBytes: asset.fileSizeBytes ?? undefined,
  });
  return result.confidence;
}
