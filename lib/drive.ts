/**
 * Google Drive read-only scan integration (28 Technical Plan §6/§7 Step 1).
 *
 * `DriveScanner` is the shared interface both this real client and
 * `lib/drive-fixture.ts`'s dev fallback implement, so swapping in real
 * credentials later requires zero UI/caller changes — see README "What's real
 * vs. what's stubbed" for why the fixture path exists at all (no
 * `GOOGLE_SERVICE_ACCOUNT_JSON` has been provisioned yet).
 *
 * Real behavior implemented here, per §6:
 * - service-account auth, drive.readonly scope only
 * - folder-URL -> folder-ID parsing
 * - recursive `files.list`, PATH-based exclusion of `Done`/`Resize` subfolders
 *   (07 Flow's documented finding: time-based exclusion was proven unreliable)
 * - `md5Checksum` as the content-hash (no download needed to detect "did this
 *   file change since the last scan")
 * - images probed via the `image-size` package; video via `ffprobe`
 *   (child_process); PSD/AI via the already-ported `scripts/psd_probe.py`
 * - per-asset `scan_error` on probe failure (missing ffprobe, corrupt file,
 *   etc.) rather than failing the whole scan — §13's asset-level error design
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { google, type drive_v3 } from "googleapis";
import imageSize from "image-size";
import { MIME_MAP } from "./classify";
import { DriveFixtureScanner } from "./drive-fixture";

const execFileAsync = promisify(execFile);

export interface ScannedAsset {
  driveFileId: string;
  filename: string;
  mimeType: string | null;
  format: string | null; // JPG/PNG/GIF/MP4/PSD/AI, per classify.ts's MIME_MAP
  width: number | null;
  height: number | null;
  fileSizeBytes: number | null;
  videoDurationSec: number | null;
  psdCanvasW: number | null;
  psdCanvasH: number | null;
  contentHash: string | null;
  isFlattened: boolean | null;
  hasMultipleArtboards: boolean | null;
  redesignEligible: boolean | null;
  scanError: string | null;
}

export interface AccessCheckResult {
  ok: boolean;
  error?: string;
  /** The folder's own Drive display name, when available — lets Job Create
   * default the Client field to it instead of requiring a manual typed name
   * for every job (see app/jobs/new/actions.ts). Fixture mode has no real
   * folder to name, so it returns null here, not a fabricated name. */
  folderName?: string | null;
}

export interface DriveScanner {
  /** Called at Job Create time (§6: "當場驗證") — must actually hit the Drive
   * API once in real mode, blocking Job creation on failure. Trivially
   * succeeds in fixture mode. */
  checkAccess(folderUrl: string): Promise<AccessCheckResult>;
  scanFolder(folderUrl: string): Promise<ScannedAsset[]>;
}

const EXCLUDED_FOLDER_NAME = /^(done|resize)$/i;

/** Minimal bounded-concurrency map — no new dependency for something this
 * small. Preserves input order in the output array regardless of completion
 * order (callers assume `results[i]` corresponds to `items[i]`). */
async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Accepts a full Drive folder URL (any of the common share-link shapes) or a
 * bare folder ID typed directly. Returns null if nothing recognizable found. */
export function parseFolderId(folderUrl: string): string | null {
  const trimmed = folderUrl.trim();
  const patterns = [/\/folders\/([a-zA-Z0-9_-]+)/, /[?&]id=([a-zA-Z0-9_-]+)/];
  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

export function mimeToFormat(mimeType: string | null | undefined): string | null {
  if (!mimeType) return null;
  return MIME_MAP[mimeType] ?? null;
}

function isImageMime(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png" || mime === "image/gif";
}
function isPsdOrAiMime(mime: string): boolean {
  return mime === "image/vnd.adobe.photoshop" || mime === "image/x-photoshop" || mime === "application/postscript";
}

/** True whenever there's no real Drive service-account credential — the
 * condition the whole app uses to decide fixture vs. real, and to drive the
 * "dev fixture mode" banner in the UI. Must never be silent (see README). */
export function isFixtureMode(): boolean {
  return !process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

export function getDriveScanner(): DriveScanner {
  return isFixtureMode() ? new DriveFixtureScanner() : new RealDriveScanner();
}

// ---------------------------------------------------------------------------
// Real implementation
// ---------------------------------------------------------------------------

function getAuth() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set — real Drive scanning is unavailable.");
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

export function getDriveClient(): drive_v3.Drive {
  return google.drive({ version: "v3", auth: getAuth() as unknown as string });
}

interface DriveFileNode {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  md5Checksum?: string;
}

async function listFilesRecursive(drive: drive_v3.Drive, folderId: string): Promise<DriveFileNode[]> {
  const out: DriveFileNode[] = [];
  let pageToken: string | undefined;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, md5Checksum)",
      pageToken,
      pageSize: 200,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      if (f.mimeType === "application/vnd.google-apps.folder") {
        if (EXCLUDED_FOLDER_NAME.test(f.name)) continue; // path-based Done/Resize exclusion, not time-based
        out.push(...(await listFilesRecursive(drive, f.id)));
      } else {
        out.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size ?? undefined, md5Checksum: f.md5Checksum ?? undefined });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

// Exported (was private) so lib/asset-preview.ts can reuse the same auth +
// download path instead of duplicating Drive client setup.
export async function downloadBuffer(drive: drive_v3.Drive, fileId: string): Promise<Buffer> {
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
  return Buffer.from(res.data as ArrayBuffer);
}

export async function downloadToTemp(drive: drive_v3.Drive, fileId: string, filename: string): Promise<string> {
  const buf = await downloadBuffer(drive, fileId);
  const tmp = path.join(os.tmpdir(), `crp-scan-${fileId}-${path.basename(filename)}`);
  await fs.writeFile(tmp, buf);
  return tmp;
}

/** Best-effort GIF multi-frame detection by counting Image Descriptor blocks
 * (0x2C) in the GIF stream. Not a full GIF89a parser — good enough to flag
 * "probably animated" for the `unsupported_format` route without pulling in a
 * dedicated GIF-parsing dependency for a format MVP explicitly excludes. */
function countGifImageDescriptors(buf: Buffer): number {
  let count = 0;
  for (let i = 13; i < buf.length; i++) {
    if (buf[i] === 0x2c) count++;
  }
  return count;
}

async function ffprobeVideo(filePath: string): Promise<{ durationSec: number; width: number | null; height: number | null }> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-show_entries", "format=duration",
    "-of", "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  return {
    durationSec: parsed.format?.duration ? Number(parsed.format.duration) : NaN,
    width: stream?.width ?? null,
    height: stream?.height ?? null,
  };
}

interface PsdProbeResult {
  source_type?: "psd" | "ai";
  error?: string;
  canvas?: { width: number; height: number };
  artboards?: Array<{ artboard_index: number; width: number; height: number }>;
  elements?: Array<{ name?: string | null; error?: string }>;
}

function hasSemanticLayerNames(elements: PsdProbeResult["elements"]): boolean {
  if (!elements || elements.length === 0) return false;
  if (elements.length === 1 && elements[0].error) return false;
  const genericName = /^(圖層|layer)\s*\d*$/i;
  return elements.some((el) => el.name && el.name.trim() !== "" && !genericName.test(el.name.trim()));
}

async function psdProbe(filePath: string): Promise<PsdProbeResult> {
  const scriptPath = path.join(process.cwd(), "scripts", "psd_probe.py");
  const { stdout } = await execFileAsync("python3", [scriptPath, filePath]);
  return JSON.parse(stdout) as PsdProbeResult;
}

async function probeFile(drive: drive_v3.Drive, f: DriveFileNode): Promise<ScannedAsset> {
  const base: ScannedAsset = {
    driveFileId: f.id,
    filename: f.name,
    mimeType: f.mimeType,
    format: mimeToFormat(f.mimeType),
    width: null,
    height: null,
    fileSizeBytes: f.size ? Number(f.size) : null,
    videoDurationSec: null,
    psdCanvasW: null,
    psdCanvasH: null,
    contentHash: f.md5Checksum ?? null,
    isFlattened: null,
    hasMultipleArtboards: null,
    redesignEligible: null,
    scanError: null,
  };

  try {
    if (isImageMime(f.mimeType)) {
      const buf = await downloadBuffer(drive, f.id);
      const dim = imageSize(buf);
      base.width = dim.width ?? null;
      base.height = dim.height ?? null;
      base.isFlattened = true;
      if (f.mimeType === "image/gif") {
        base.hasMultipleArtboards = false;
        (base as ScannedAsset & { isMultiFrameGif?: boolean }).isMultiFrameGif = countGifImageDescriptors(buf) > 1;
      }
    } else if (f.mimeType === "video/mp4") {
      const tmp = await downloadToTemp(drive, f.id, f.name);
      try {
        const probe = await ffprobeVideo(tmp);
        base.videoDurationSec = Number.isFinite(probe.durationSec) ? probe.durationSec : null;
        base.width = probe.width;
        base.height = probe.height;
        base.isFlattened = true;
      } finally {
        await fs.rm(tmp, { force: true });
      }
    } else if (isPsdOrAiMime(f.mimeType)) {
      const tmp = await downloadToTemp(drive, f.id, f.name);
      try {
        const probe = await psdProbe(tmp);
        if (probe.error) {
          base.scanError = probe.error;
        } else if (probe.source_type === "psd" && probe.canvas) {
          base.width = probe.canvas.width;
          base.height = probe.canvas.height;
          base.psdCanvasW = probe.canvas.width;
          base.psdCanvasH = probe.canvas.height;
          base.isFlattened = false;
          base.hasMultipleArtboards = false;
          base.redesignEligible = hasSemanticLayerNames(probe.elements);
        } else if (probe.source_type === "ai" && probe.artboards?.length) {
          const first = probe.artboards[0];
          base.width = first.width;
          base.height = first.height;
          base.psdCanvasW = first.width;
          base.psdCanvasH = first.height;
          base.isFlattened = false;
          base.hasMultipleArtboards = probe.artboards.length > 1;
          base.redesignEligible = false; // .ai has no layer manifest — MVP unsupported_format regardless
        }
      } finally {
        await fs.rm(tmp, { force: true });
      }
    }
  } catch (err: unknown) {
    // Asset-level failure, per §13 — never let one bad file fail the whole job.
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      base.scanError = `Required tool not installed on this machine: ${err.message}`;
    } else {
      base.scanError = err instanceof Error ? err.message : String(err);
    }
  }

  return base;
}

export class RealDriveScanner implements DriveScanner {
  async checkAccess(folderUrl: string): Promise<AccessCheckResult> {
    const folderId = parseFolderId(folderUrl);
    if (!folderId) {
      return { ok: false, error: "Could not parse a Drive folder ID out of this URL." };
    }
    try {
      // NOTE: this must be files.get on the folder itself, not files.list with
      // a `'<id>' in parents` query. The Drive API does not error a parents-scoped
      // list query when the caller has no visibility into the parent folder at
      // all — it just returns an empty result, indistinguishable from "folder is
      // genuinely empty". That made this check pass unconditionally regardless of
      // real access, discovered 2026-09-07 when a real unshared folder produced a
      // silently-empty scan_error job instead of a blocked Job Create with a clear
      // reason. files.get 404s cleanly when the service account can't see the
      // folder, which is the actual access signal we need.
      const drive = getDriveClient();
      const res = await drive.files.get({ fileId: folderId, fields: "id,name,mimeType" });
      if (res.data.mimeType !== "application/vnd.google-apps.folder") {
        return { ok: false, error: "This ID is not a folder." };
      }
      return { ok: true, folderName: res.data.name ?? null };
    } catch (err: unknown) {
      const status = (err as { code?: number; response?: { status?: number } })?.code
        ?? (err as { response?: { status?: number } })?.response?.status;
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Drive folder access check failed (${status ?? "error"}): ${message}` };
    }
  }

  async scanFolder(folderUrl: string): Promise<ScannedAsset[]> {
    const folderId = parseFolderId(folderUrl);
    if (!folderId) throw new Error("Could not parse a Drive folder ID out of this URL.");
    const drive = getDriveClient();
    const files = await listFilesRecursive(drive, folderId);
    // Found 2026-09-07 against a real 10-file/~200MB folder: probeFile()'s
    // Drive download is the bottleneck (one file measured at 64s for 19.8MB,
    // ~300KB/s — the actual psd_probe.py parse of that same file took 342ms,
    // not the bottleneck at all). Processing sequentially meant a real
    // Designer-sized folder blocked the single synchronous Job Create request
    // for 10+ minutes with zero progress feedback. A proper fix is Phase 2's
    // async job queue (§5) — this is a bounded stopgap for Phase 1: bound
    // concurrency (Drive quotas + this box's bandwidth are the real ceiling,
    // not something to fix by adding more parallelism than that) rather than
    // fully serializing every file's download.
    return runWithConcurrency(files, 4, (f) => probeFile(drive, f));
  }
}
