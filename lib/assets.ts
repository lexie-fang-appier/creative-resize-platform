/**
 * `assets` table data access — stores whatever `DriveScanner#scanFolder()`
 * returned (real or dev-fixture, see lib/drive.ts), one row per scanned file.
 */
import { query } from "./db";
import type { ScannedAsset } from "./drive";

export interface AssetRow {
  id: string;
  jobId: string;
  driveFileId: string;
  filename: string;
  mimeType: string | null;
  format: string | null;
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
  createdAt: string;
}

export async function insertScannedAssets(jobId: string, assets: ScannedAsset[]): Promise<AssetRow[]> {
  const inserted: AssetRow[] = [];
  for (const a of assets) {
    const [row] = await query<AssetRow>(
      `insert into assets
         (job_id, drive_file_id, filename, mime_type, format, width, height,
          file_size_bytes, video_duration_sec, psd_canvas_w, psd_canvas_h,
          content_hash, is_flattened, has_multiple_artboards, redesign_eligible, scan_error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning id, job_id as "jobId", drive_file_id as "driveFileId", filename,
                 mime_type as "mimeType", format, width, height,
                 file_size_bytes as "fileSizeBytes", video_duration_sec as "videoDurationSec",
                 psd_canvas_w as "psdCanvasW", psd_canvas_h as "psdCanvasH",
                 content_hash as "contentHash", is_flattened as "isFlattened",
                 has_multiple_artboards as "hasMultipleArtboards",
                 redesign_eligible as "redesignEligible", scan_error as "scanError",
                 created_at as "createdAt"`,
      [
        jobId,
        a.driveFileId,
        a.filename,
        a.mimeType,
        a.format,
        a.width,
        a.height,
        a.fileSizeBytes,
        a.videoDurationSec,
        a.psdCanvasW,
        a.psdCanvasH,
        a.contentHash,
        a.isFlattened,
        a.hasMultipleArtboards,
        a.redesignEligible,
        a.scanError,
      ],
    );
    inserted.push(row);
  }
  return inserted;
}

export async function listAssetsForJob(jobId: string): Promise<AssetRow[]> {
  return query<AssetRow>(
    `select id, job_id as "jobId", drive_file_id as "driveFileId", filename,
            mime_type as "mimeType", format, width, height,
            file_size_bytes as "fileSizeBytes", video_duration_sec as "videoDurationSec",
            psd_canvas_w as "psdCanvasW", psd_canvas_h as "psdCanvasH",
            content_hash as "contentHash", is_flattened as "isFlattened",
            has_multiple_artboards as "hasMultipleArtboards",
            redesign_eligible as "redesignEligible", scan_error as "scanError",
            created_at as "createdAt"
     from assets
     where job_id = $1
     order by filename`,
    [jobId],
  );
}
