import type { AssetRow } from "./assets";

export interface SourceAssetCandidate extends AssetRow {
  sourceScore: number;
  sourceReason: string;
}

const SUPPORTED_SOURCE_FORMATS = new Set(["PSD", "PNG", "JPG"]);
const OUTPUT_NAME_PATTERN = /(?:^|[_\- ])(?:resize|resized|output|generated|candidate|v\d+prompt)(?:[_\- .]|$)|\b\d{2,4}x\d{2,4}\b/i;
const ORIGINAL_NAME_PATTERN = /(?:^|[_\- ])(?:original|source|master|key.?art|kv)(?:[_\- .]|$)/i;

export function rankSourceAssets(assets: AssetRow[]): SourceAssetCandidate[] {
  return assets
    .filter((asset) => !asset.scanError && asset.format && SUPPORTED_SOURCE_FORMATS.has(asset.format))
    .map((asset) => {
      let sourceScore = asset.format === "PSD" ? 100 : 50;
      if (asset.redesignEligible) sourceScore += 30;
      if (ORIGINAL_NAME_PATTERN.test(asset.filename)) sourceScore += 20;
      if (OUTPUT_NAME_PATTERN.test(asset.filename)) sourceScore -= 40;
      const width = asset.psdCanvasW ?? asset.width ?? 0;
      const height = asset.psdCanvasH ?? asset.height ?? 0;
      if (width * height >= 1_000_000) sourceScore += 10;
      const sourceReason = asset.format === "PSD"
        ? asset.redesignEligible ? "PSD with reusable named layers" : "PSD source"
        : "High-resolution flattened source";
      return { ...asset, sourceScore, sourceReason };
    })
    .sort((a, b) => b.sourceScore - a.sourceScore || a.filename.localeCompare(b.filename));
}
