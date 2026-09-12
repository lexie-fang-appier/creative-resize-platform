/**
 * Dev-fixture fallback for `DriveScanner` (see `lib/drive.ts`). Active whenever
 * `GOOGLE_SERVICE_ACCOUNT_JSON` is unset — i.e. today, since no real Drive
 * credentials have been provisioned yet (see README "What's real vs. stubbed").
 *
 * Implements the exact same `DriveScanner` interface as `RealDriveScanner`, so
 * every caller (Job Create's access check, the scan step, the UI) is identical
 * either way — dropping in real credentials later requires zero code changes
 * here or in `app/`. The one thing this fallback must never do is scan
 * silently: `lib/drive.ts#isFixtureMode()` is what the UI checks to render the
 * "dev fixture mode" banner, independent of this class.
 */
import type { AccessCheckResult, DriveScanner, ScannedAsset } from "./drive";
import { DEV_FIXTURE_ASSETS } from "./fixtures/dev-assets";

export class DriveFixtureScanner implements DriveScanner {
  async checkAccess(_folderUrl: string): Promise<AccessCheckResult> {
    // Fixture mode has nothing to actually check against — trivially succeeds
    // so the rest of the Job Create -> Scan -> Gap Matrix flow stays clickable
    // without real credentials. The banner (isFixtureMode()) is what tells the
    // Designer this isn't a real access check.
    return { ok: true };
  }

  async scanFolder(_folderUrl: string): Promise<ScannedAsset[]> {
    // Ignores folderUrl entirely — there's no real folder to distinguish
    // between. Returns the same ported real-ticket dataset every time.
    return DEV_FIXTURE_ASSETS;
  }

  async scanFolderMetadata(_folderUrl: string): Promise<ScannedAsset[]> {
    return DEV_FIXTURE_ASSETS;
  }

  async probeAsset(asset: ScannedAsset): Promise<ScannedAsset> {
    return DEV_FIXTURE_ASSETS.find((candidate) => candidate.driveFileId === asset.driveFileId) ?? asset;
  }
}
