/**
 * lib/routing.ts — one case per route value Phase 1 actually emits (see the
 * module docstring for why `manual_compliance` / `blocked_safezone` are
 * excluded). Fixture inputs here are synthetic (unlike lib/fixtures/dev-assets.ts,
 * which must port only real ticket values) — these are minimal shapes chosen
 * to isolate one branch at a time.
 */
import { describe, expect, it } from "vitest";
import { routeTarget, type RoutingAsset } from "../lib/routing";

describe("routeTarget", () => {
  it("exact dimension match -> ready_to_use", () => {
    const asset: RoutingAsset = { id: "a1", format: "JPG", width: 600, height: 500, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null };
    const r = routeTarget({ width: 600, height: 500 }, [asset]);
    expect(r.route).toBe("ready_to_use");
    expect(r.reasonCode).toBe("exact_dimension_match");
    expect(r.matchedAssetId).toBe("a1");
  });

  it("same aspect ratio, different pixel size (R0) -> eligible_scale", () => {
    const asset: RoutingAsset = { id: "a2", format: "JPG", width: 800, height: 1200, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null };
    const r = routeTarget({ width: 640, height: 960 }, [asset]); // same 2:3 ratio, not exact pixels
    expect(r.route).toBe("eligible_scale");
    expect(r.matchedAssetId).toBe("a2");
  });

  it("moderately different aspect ratio (R2, retention ~80%) -> eligible_crop_fill", () => {
    const asset: RoutingAsset = { id: "a3", format: "JPG", width: 1029, height: 258, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null };
    const r = routeTarget({ width: 640, height: 200 }, [asset]); // ratio 3.2 vs 3.988 -> ~80.2% retention
    expect(r.route).toBe("eligible_crop_fill");
    expect(r.matchedAssetId).toBe("a3");
  });

  it("no raster/video match, PSD source with semantic layers -> eligible_psd_redesign", () => {
    const asset: RoutingAsset = { id: "a4", format: "PSD", width: 1080, height: 1350, fileSizeBytes: null, videoDurationSec: null, redesignEligible: true };
    const r = routeTarget({ width: 1456, height: 180 }, [asset]);
    expect(r.route).toBe("eligible_psd_redesign");
    expect(r.matchedAssetId).toBe("a4");
  });

  // 2026-09-07: video_compression removed (see lib/routing.ts's Route type
  // comment) — a video is never a candidate source for a Banner/Native image
  // target now, no matter how good its geometric fit, since we don't process
  // video at all yet and a real bug showed unrelated videos "matching" static
  // slots. These two cases now correctly fall through to
  // blocked_no_usable_source instead of video_compression.
  it("video is never a candidate for an image target, even with a great geometric fit -> blocked_no_usable_source", () => {
    const asset: RoutingAsset = {
      id: "a5", format: "MP4", width: 1920, height: 1080, fileSizeBytes: 30_000_000, videoDurationSec: 20, redesignEligible: null,
    };
    const r = routeTarget({ width: 1280, height: 720 }, [asset]); // landscape target, landscape source
    expect(r.route).toBe("blocked_no_usable_source");
    expect(r.matchedAssetId).toBeNull();
  });

  it("video alongside a usable image source -> the image wins, video is ignored entirely", () => {
    const video: RoutingAsset = {
      id: "a5b", format: "MP4", width: 1080, height: 1920, fileSizeBytes: 5_000_000, videoDurationSec: 45, redesignEligible: null,
    };
    const image: RoutingAsset = {
      id: "a5c", format: "JPG", width: 620, height: 960, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null,
    };
    const r = routeTarget({ width: 640, height: 960 }, [video, image]);
    expect(r.route).toBe("eligible_crop_fill");
    expect(r.matchedAssetId).toBe("a5c");
  });

  it("heavy crop (R4), no PSD fallback -> manual_rearrange", () => {
    const asset: RoutingAsset = { id: "a6", format: "JPG", width: 1080, height: 1080, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null };
    const r = routeTarget({ width: 1456, height: 180 }, [asset]); // ratio 1.0 vs 8.09 -> deep in R4 territory
    expect(r.route).toBe("manual_rearrange");
    expect(r.reasonCode).toMatch(/R4/);
  });

  it("orientation flip (R1), no PSD fallback -> manual_rearrange", () => {
    const asset: RoutingAsset = { id: "a6b", format: "JPG", width: 1920, height: 1080, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null };
    const r = routeTarget({ width: 640, height: 960 }, [asset]); // landscape source, portrait target
    expect(r.route).toBe("manual_rearrange");
    expect(r.reasonCode).toBe("orientation_flip_R1");
  });

  it("PSD exists but has no semantic layers -> manual_rearrange", () => {
    const asset: RoutingAsset = { id: "a7", format: "PSD", width: 1080, height: 1350, fileSizeBytes: null, videoDurationSec: null, redesignEligible: false };
    const r = routeTarget({ width: 1456, height: 180 }, [asset]);
    expect(r.route).toBe("manual_rearrange");
    expect(r.reasonCode).toBe("psd_no_semantic_layers");
  });

  it("ambiguous classification on the best-matching asset -> blocked_missing_context", () => {
    const asset: RoutingAsset = {
      id: "a8", format: "PNG", width: 1029, height: 258, fileSizeBytes: 1000, videoDurationSec: null,
      redesignEligible: null, classificationConfidence: "ambiguous_requires_campaign_context",
    };
    const r = routeTarget({ width: 1029, height: 258 }, [asset]); // exact match, but ambiguous
    expect(r.route).toBe("blocked_missing_context");
    expect(r.matchedAssetId).toBe("a8");
  });

  it("no assets scanned at all -> blocked_no_usable_source", () => {
    const r = routeTarget({ width: 600, height: 500 }, []);
    expect(r.route).toBe("blocked_no_usable_source");
    expect(r.reasonCode).toBe("no_assets_scanned");
  });

  it("assets exist but all have scan_error -> blocked_no_usable_source", () => {
    const asset: RoutingAsset = { id: "a9", format: "JPG", width: 600, height: 500, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null, scanError: "download failed" };
    const r = routeTarget({ width: 600, height: 500 }, [asset]);
    expect(r.route).toBe("blocked_no_usable_source");
    expect(r.reasonCode).toBe("all_scanned_assets_errored");
  });

  it(".ai source, no other usable asset -> unsupported_format", () => {
    const asset: RoutingAsset = { id: "a10", format: "AI", width: 1200, height: 628, fileSizeBytes: null, videoDurationSec: null, redesignEligible: false };
    const r = routeTarget({ width: 600, height: 500 }, [asset]);
    expect(r.route).toBe("unsupported_format");
    expect(r.reasonCode).toBe("ai_source_unsupported");
  });

  it("multi-frame GIF, even at an exact pixel match, -> unsupported_format (not ready_to_use)", () => {
    const asset: RoutingAsset = {
      id: "a11", format: "GIF", width: 600, height: 500, fileSizeBytes: 1000, videoDurationSec: null,
      redesignEligible: null, isMultiFrameGif: true,
    };
    const r = routeTarget({ width: 600, height: 500 }, [asset]);
    expect(r.route).toBe("unsupported_format");
    expect(r.reasonCode).toBe("multi_frame_gif_unsupported");
  });

  it("R4 raster present AND an eligible PSD -> prefers eligible_psd_redesign over manual_rearrange", () => {
    const raster: RoutingAsset = { id: "a12r", format: "JPG", width: 1080, height: 1080, fileSizeBytes: 1000, videoDurationSec: null, redesignEligible: null };
    const psd: RoutingAsset = { id: "a12p", format: "PSD", width: 1080, height: 1350, fileSizeBytes: null, videoDurationSec: null, redesignEligible: true };
    const r = routeTarget({ width: 1456, height: 180 }, [raster, psd]);
    expect(r.route).toBe("eligible_psd_redesign");
    expect(r.matchedAssetId).toBe("a12p");
  });
});
