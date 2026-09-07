/**
 * Produces a previewable image (Buffer + content-type) for one scanned
 * asset, for the Asset Inventory's click-to-expand preview. Real Drive
 * fetch only — dev-fixture assets have no real Drive file behind them (see
 * lib/drive.ts's isFixtureMode()), so this always reports unavailable for
 * those rather than fabricating a placeholder image.
 *
 * Scope, deliberately not more: JPG/PNG stream the original file directly.
 * PSD gets flattened via scripts/psd_preview.py (psd-tools composite()).
 * AI/MP4/GIF are NOT previewable here — .ai needs pymupdf (not a dependency,
 * see 16 Ref's findings on why), video needs a frame-extraction step nothing
 * in this repo does yet (video_compress.py compresses, it doesn't thumbnail).
 * Returning a clear "not available" reason for those is correct scope, not
 * a gap to silently paper over with a generic icon that implies more than
 * is true.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { downloadBuffer, downloadToTemp, getDriveClient, isFixtureMode } from "./drive";

const execFileAsync = promisify(execFile);

export interface AssetPreview {
  ok: true;
  buffer: Buffer;
  contentType: string;
}

export interface AssetPreviewUnavailable {
  ok: false;
  reason: string;
}

const PREVIEWABLE_IMAGE_MIME: Record<string, string> = {
  JPG: "image/jpeg",
  PNG: "image/png",
  GIF: "image/gif",
};

export async function getAssetPreview(asset: {
  format: string | null;
  mimeType: string | null;
  driveFileId: string;
}): Promise<AssetPreview | AssetPreviewUnavailable> {
  if (isFixtureMode()) {
    return { ok: false, reason: "Dev fixture mode — this asset has no real Drive file to preview." };
  }
  if (!asset.format) {
    return { ok: false, reason: "Unknown format." };
  }

  const contentType = PREVIEWABLE_IMAGE_MIME[asset.format];
  if (contentType) {
    const drive = getDriveClient();
    const buffer = await downloadBuffer(drive, asset.driveFileId);
    return { ok: true, buffer, contentType };
  }

  if (asset.format === "PSD") {
    const drive = getDriveClient();
    const tmp = await downloadToTemp(drive, asset.driveFileId, "preview-source.psd");
    const outPath = path.join(os.tmpdir(), `crp-preview-${asset.driveFileId}.png`);
    try {
      const { stdout } = await execFileAsync("python3", [path.join(process.cwd(), "scripts", "psd_preview.py"), tmp, outPath]);
      const result = JSON.parse(stdout) as { ok: boolean; error?: string };
      if (!result.ok) {
        return { ok: false, reason: `PSD preview failed: ${result.error}` };
      }
      const buffer = await fs.readFile(outPath);
      return { ok: true, buffer, contentType: "image/png" };
    } catch (err) {
      return { ok: false, reason: `PSD preview failed: ${err instanceof Error ? err.message : String(err)}` };
    } finally {
      await fs.rm(tmp, { force: true });
      await fs.rm(outPath, { force: true });
    }
  }

  return { ok: false, reason: `No preview available for ${asset.format} yet.` };
}
