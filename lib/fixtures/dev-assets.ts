/**
 * Dev-fixture Drive-scan fallback dataset.
 *
 * Used by `lib/drive-fixture.ts` when `GOOGLE_SERVICE_ACCOUNT_JSON` is not set
 * (no live Drive credentials exist yet — see README "What's real vs. stubbed").
 * Every value below is ported verbatim from the real-ticket metadata dicts in
 * `Obsidian Vault/.../Creative Asset Automation/classifier/test_classifier.py`
 * (the same fixtures `tests/classify.test.ts` already reuses) — nothing here is
 * invented. Where the original Python fixture didn't carry a field this schema
 * needs (fileSizeBytes for the Cascade Mart PSDs, a display filename for the Lotte AI
 * artboards), it is left `null` / synthesized and called out below rather than
 * guessed — see the per-block comments.
 *
 * This file represents one static "scanned folder" — `scanFolder()` in
 * `lib/drive-fixture.ts` returns this list regardless of the folder URL typed
 * into the Job Create form, since there is no real folder to distinguish.
 */
import type { ScannedAsset } from "../drive";

let n = 0;
const nextId = () => `fixture-${String(++n).padStart(2, "0")}`;

// ---------------------------------------------------------------------------
// CAM-100004 — Ridgeline Bank, 8 real files (test_classifier.py Part B). Real
// filename/mime/width/height/fileSizeBytes; these are ticket INVENTORY sizes
// (e.g. 300x250), not yet doubled to the RTB creative sizes gap.ts expects —
// left as-is, exactly as scanned, per gap.ts's own documented normalization
// design (doubling happens at gap-check time, not at scan time).
// ---------------------------------------------------------------------------
const ridgelineBank: ScannedAsset[] = [
  { driveFileId: nextId(), filename: "Ridgeline Invest-v1_300x250.jpg", mimeType: "image/jpeg", format: "JPG", width: 300, height: 250, fileSizeBytes: 82834, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "Ridgeline Invest-v1_300x600.jpg", mimeType: "image/jpeg", format: "JPG", width: 300, height: 600, fileSizeBytes: 148878, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "Ridgeline Invest-v1_300x300.jpg", mimeType: "image/jpeg", format: "JPG", width: 300, height: 300, fileSizeBytes: 93712, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "Ridgeline Invest-v1_320x320.jpg", mimeType: "image/jpeg", format: "JPG", width: 320, height: 320, fileSizeBytes: 105757, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "RidgelinePlus_300x250.jpg", mimeType: "image/png", format: "PNG", width: 300, height: 250, fileSizeBytes: 60625, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "RidgelinePlus_300x600.jpg", mimeType: "image/png", format: "PNG", width: 300, height: 600, fileSizeBytes: 92566, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "RIDGELINE_PM_banner_300x600_v2.jpg", mimeType: "image/jpeg", format: "JPG", width: 300, height: 600, fileSizeBytes: 96051, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "RIDGELINE_PM_banner_320x320_v2.jpg", mimeType: "image/jpeg", format: "JPG", width: 320, height: 320, fileSizeBytes: 65463, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
];

// ---------------------------------------------------------------------------
// CAM-100002 — Kakao bizboard vs Naver smart channel, same 2 files appearing
// in both source subfolders (test_classifier.py Part C) — the real case
// classify.ts's 1029x258+PNG branch flags `ambiguous_requires_campaign_context`
// without needing icon/text-group signals, so this is the fixture path that
// actually exercises Phase 1's `blocked_missing_context` route in the live
// demo, not just in unit tests.
// ---------------------------------------------------------------------------
const kakaoNaverTroaming: ScannedAsset[] = [
  { driveFileId: nextId(), filename: "kakao_bizboard/travel-troaming.png", mimeType: "image/png", format: "PNG", width: 1029, height: 258, fileSizeBytes: 169407, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "kakao_bizboard/roaming-data-16gb-renew.png", mimeType: "image/png", format: "PNG", width: 1029, height: 258, fileSizeBytes: 87382, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "naver_smartchannel/travel-troaming.png", mimeType: "image/png", format: "PNG", width: 1029, height: 258, fileSizeBytes: 42555, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "naver_smartchannel/roaming-data-16gb-renew.png", mimeType: "image/png", format: "PNG", width: 1029, height: 258, fileSizeBytes: 25003, videoDurationSec: null, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
];

// ---------------------------------------------------------------------------
// Cascade Mart (test_classifier.py Part E) — 4 real PSD canvas sizes from
// probe_source.py's actual output. fileSizeBytes was never captured by the
// original Python fixture (classify.py doesn't need it for PSD) — left null,
// not guessed. redesignEligible is conservatively false: the original fixture
// only has canvas geometry, not a real extract_manifest.py layer-name dump, so
// there's no real "does this PSD have semantic layers" signal to port — see
// §13's documented fallback ("PSD 圖層名稱無語意 → redesign_eligible=false").
// ---------------------------------------------------------------------------
const cascadeMartPsd: ScannedAsset[] = [
  { driveFileId: nextId(), filename: "04-1.psd", mimeType: "image/vnd.adobe.photoshop", format: "PSD", width: 1080, height: 1350, fileSizeBytes: null, videoDurationSec: null, psdCanvasW: 1080, psdCanvasH: 1350, contentHash: null, isFlattened: false, hasMultipleArtboards: false, redesignEligible: false, scanError: null },
  { driveFileId: nextId(), filename: "04-1(同02-2).psd", mimeType: "image/vnd.adobe.photoshop", format: "PSD", width: 1080, height: 1080, fileSizeBytes: null, videoDurationSec: null, psdCanvasW: 1080, psdCanvasH: 1080, contentHash: null, isFlattened: false, hasMultipleArtboards: false, redesignEligible: false, scanError: null },
  { driveFileId: nextId(), filename: "05-1.psd", mimeType: "image/vnd.adobe.photoshop", format: "PSD", width: 1080, height: 1350, fileSizeBytes: null, videoDurationSec: null, psdCanvasW: 1080, psdCanvasH: 1350, contentHash: null, isFlattened: false, hasMultipleArtboards: false, redesignEligible: false, scanError: null },
  { driveFileId: nextId(), filename: "05-2.psd", mimeType: "image/vnd.adobe.photoshop", format: "PSD", width: 1080, height: 1351, fileSizeBytes: null, videoDurationSec: null, psdCanvasW: 1080, psdCanvasH: 1351, contentHash: null, isFlattened: false, hasMultipleArtboards: false, redesignEligible: false, scanError: null },
];

// ---------------------------------------------------------------------------
// Anchorline Bank .ai artboards (test_classifier.py Part E) — 9 real artboard
// widths/heights from probe_source.py's actual PDF MediaBox reads. The source
// Python fixture only tracked an artboard index, not a file/display name, and
// `assets` has one width/height per row (no array column for a multi-artboard
// file) — so each artboard is ported as its own row sharing a synthesized
// basename, flagged via hasMultipleArtboards=true. Dimensions are real;
// filenames and hasMultipleArtboards are inferred, not from the fixture.
// .ai is out of MVP scope per PRD — these exist to exercise `unsupported_format`.
// ---------------------------------------------------------------------------
const anchorlineAiArtboards: ScannedAsset[] = [
  { idx: 0, width: 1200, height: 628 },
  { idx: 1, width: 1200, height: 1200 },
  { idx: 2, width: 960, height: 1200 },
  { idx: 3, width: 961, height: 451 },
  { idx: 4, width: 800, height: 450 },
  { idx: 5, width: 800, height: 1200 },
  { idx: 6, width: 970, height: 250 },
  { idx: 7, width: 640, height: 320 },
  { idx: 8, width: 850, height: 1300 },
].map(
  (ab): ScannedAsset => ({
    driveFileId: nextId(),
    filename: `anchorline-bank-redesign.ai#artboard-${ab.idx}`,
    mimeType: "application/postscript",
    format: "AI",
    width: ab.width,
    height: ab.height,
    fileSizeBytes: null,
    videoDurationSec: null,
    psdCanvasW: ab.width,
    psdCanvasH: ab.height,
    contentHash: null,
    isFlattened: false,
    hasMultipleArtboards: true,
    redesignEligible: false,
    scanError: null,
  }),
);

// ---------------------------------------------------------------------------
// CAM-100001 — Vantel, 2 real client-provided source videos (test_classifier.py
// Part D). Real width/height/duration/fileSizeBytes.
// ---------------------------------------------------------------------------
const vantelVideo: ScannedAsset[] = [
  { driveFileId: nextId(), filename: "098824_0021sec_horizontal.mp4", mimeType: "video/mp4", format: "MP4", width: 1920, height: 1080, fileSizeBytes: 26560358, videoDurationSec: 20.6, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
  { driveFileId: nextId(), filename: "098824_0021sec_vertical.mp4", mimeType: "video/mp4", format: "MP4", width: 1080, height: 1920, fileSizeBytes: 26469632, videoDurationSec: 20.6, psdCanvasW: null, psdCanvasH: null, contentHash: null, isFlattened: true, hasMultipleArtboards: false, redesignEligible: null, scanError: null },
];

export const DEV_FIXTURE_ASSETS: ScannedAsset[] = [
  ...ridgelineBank,
  ...kakaoNaverTroaming,
  ...cascadeMartPsd,
  ...anchorlineAiArtboards,
  ...vantelVideo,
];
