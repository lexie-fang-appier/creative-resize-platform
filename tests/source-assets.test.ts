import { describe, expect, it } from "vitest";
import type { AssetRow } from "../lib/assets";
import { rankSourceAssets } from "../lib/source-assets";

function asset(overrides: Partial<AssetRow>): AssetRow {
  return {
    id: "asset", jobId: "job", driveFileId: "drive", filename: "source.png", mimeType: "image/png",
    format: "PNG", width: 1920, height: 1080, fileSizeBytes: 1, videoDurationSec: null, psdCanvasW: null,
    psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false,
    redesignEligible: false, scanError: null, createdAt: "2026-09-12", ...overrides,
  };
}

describe("source asset discovery", () => {
  it("ranks reusable PSD originals before flattened resize outputs", () => {
    const ranked = rankSourceAssets([
      asset({ id: "output", filename: "campaign_v7prompt_1940x500.png" }),
      asset({ id: "psd", filename: "campaign_master.psd", format: "PSD", mimeType: "image/x-photoshop", redesignEligible: true, isFlattened: false }),
    ]);
    expect(ranked.map((item) => item.id)).toEqual(["psd", "output"]);
  });

  it("excludes unsupported and failed files", () => {
    expect(rankSourceAssets([
      asset({ id: "video", format: "MP4" }),
      asset({ id: "failed", scanError: "probe failed" }),
    ])).toEqual([]);
  });
});
