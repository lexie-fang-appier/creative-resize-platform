/**
 * Ported from classifier/classify.py (11 Ref - Classification Decision Tree).
 * Pure rule engine, metadata-only, no LLM — a pure function of an asset-metadata
 * object. Same shape of inputs/outputs as the Python version, field names translated
 * snake_case -> camelCase per TS convention. Behavior kept identical, including the
 * deliberately-designed `ambiguous_requires_campaign_context` confidence level and
 * the PSD/AI canvas-size-based `unique_pending_conversion` signal.
 */
import {
  AMBIGUOUS_GROUP_CANDIDATES,
  BANNER_ENUM,
  KAKAO_NATIVE_CONST,
  KAKAO_NAVER_BIZBOARD_CONST,
  NATIVE_ENUM,
  UI_CATEGORIES,
} from "./spec-matrix";

export const MIME_MAP: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
  "image/png": "PNG",
  "image/gif": "GIF",
  "video/mp4": "MP4",
  "text/html": "HTML5",
  "image/vnd.adobe.photoshop": "PSD",
  "image/x-photoshop": "PSD",
  "application/postscript": "AI",
};

export interface AssetMetadata {
  mime?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  durationSec?: number;
  hasVideo?: boolean;
  hasRichmediaInfo?: boolean;
  hasImagesArray?: boolean;
  imagesCount?: number;
  hasIcon?: boolean;
  hasTextGroup?: boolean;
  hasAdsContent?: boolean;
  hasEndCard?: boolean;
  hasThumbnail?: boolean;
  hasExtraImageField?: boolean;
}

export interface ClassificationResult {
  detectedGroup: string | null;
  confidence: string;
  dimension: string | null;
  mime: string;
  fileSizeBytes?: number;
  ambiguousGroup?: string;
  note?: string;
  validated?: { ruleCode: string; verdict: "pass" | "fail" };
  sourceSizeMatches?: string[];
  uiCategory?: string | string[];
  possibleUiCategories?: string[];
  artboardIndex?: number;
}

/**
 * Which schema dimension rules a raw (width, height) hits, regardless of mime —
 * used for PSD/AI source files, which are never a delivery format themselves but
 * whose *current* canvas/artboard size may already equal one. Returns a list of
 * (human-readable label, rule-key) pairs, empty if none.
 */
function sizeMatches(dim: string): Array<[string, string]> {
  const hits: Array<[string, string]> = [];
  if (BANNER_ENUM.has(dim)) hits.push([`banner enum（${dim}）`, "banner"]);
  if (NATIVE_ENUM.has(dim)) hits.push([`native／dynamic_native enum（${dim}）`, "native"]);
  if (KAKAO_NATIVE_CONST.has(dim)) hits.push([`kakao_static／dynamic const（${dim}）`, "kakao_native"]);
  if (KAKAO_NAVER_BIZBOARD_CONST.has(dim)) {
    hits.push([`kakao_bizboard／naver_smart_channel const（${dim}）`, "bizboard"]);
  }
  return hits;
}

const RULE_TO_UI_CATEGORIES: Record<string, string[]> = {
  banner: ["Banner"],
  native: ["Native", "Dynamic Native"],
  kakao_native: ["Native", "Dynamic Native"],
  bizboard: ["Native", "Dynamic Native"],
};

function uiCategoriesForDim(dim: string): string[] {
  const cats = new Set<string>();
  for (const [, rule] of sizeMatches(dim)) {
    for (const c of RULE_TO_UI_CATEGORIES[rule]) cats.add(c);
  }
  return [...cats].sort();
}

/**
 * Single UI category when detectedGroup is a known CPM type; a list of candidates
 * when ambiguous (e.g. native_pair -> Native 或 Dynamic Native, the platform axis
 * Kakao/Naver doesn't change the UI category, only the static/dynamic axis does).
 */
function uiCategory(
  detectedGroup: string | null,
  ambiguousGroup: string | undefined,
): string | string[] | undefined {
  if (ambiguousGroup) {
    const candidates = AMBIGUOUS_GROUP_CANDIDATES[ambiguousGroup] ?? [];
    const cats = [...new Set(candidates.filter((c) => c in UI_CATEGORIES).map((c) => UI_CATEGORIES[c]))].sort();
    return cats.length ? cats : undefined;
  }
  if (detectedGroup && detectedGroup in UI_CATEGORIES) return UI_CATEGORIES[detectedGroup];
  return undefined;
}

function dim(asset: AssetMetadata): string {
  return `${asset.width}x${asset.height}`;
}

function mimeLabel(asset: AssetMetadata): string {
  return MIME_MAP[asset.mime ?? ""] ?? asset.mime ?? "";
}

export function classifyAsset(asset: AssetMetadata): ClassificationResult {
  // 2-1 資產主體欄位探測
  if (asset.hasVideo) return classifyVideo(asset);
  if (asset.hasRichmediaInfo) return buildResult("richmedia", "unique", asset);
  if (asset.hasImagesArray) return classifyCarousel(asset);
  if (asset.width && asset.height) return classifyImage(asset);
  return buildResult(null, "unresolved", asset, { note: "沒有任何可辨識的資產主體欄位" });
}

// 2-2 video 分支
function classifyVideo(asset: AssetMetadata): ClassificationResult {
  if (asset.hasEndCard) {
    if (asset.hasIcon && asset.hasTextGroup) {
      if (asset.hasExtraImageField) return buildResult("google_native_video", "unique", asset);
      return buildResult("ortb_video", "unique", asset);
    }
    return buildResult("dynamic_video", "unique", asset, {
      note: "duration 必須落在 30<=d<31，見 spec-matrix",
    });
  }
  if (asset.hasThumbnail) {
    if (asset.hasAdsContent) return buildResult("fb_video", "unique", asset);
    if (asset.hasIcon && asset.hasTextGroup) return buildResult("kakao_native_video", "unique", asset);
  }
  // 2026-09-02 更正：缺 endCard 是常態，不是「素材卡住」——多數客戶給的是原始長片，
  // endCard 本來就要等後製才有；icon 缺的話多半是 AM 用 app id 自動抓，不是 Design
  // Team 要處理的重排工作。這裡只代表「目前的 metadata 不足以定位到 17 種 schema
  // 裡的哪一種」，不代表這支素材有問題或需要人工介入。
  return buildResult(null, "unresolved", asset, {
    note:
      "video 但缺 endCard/thumbnail 訊號，目前無法定位到 5 種 video schema 的哪一種——" +
      "這是常態（endCard 通常後製才有），不是素材卡住；icon 若缺，多半是 AM 用 app id " +
      "自動抓，不是 Design Team 的重排工作",
  });
}

function classifyCarousel(asset: AssetMetadata): ClassificationResult {
  const n = asset.imagesCount ?? 0;
  if (asset.hasAdsContent && n >= 2 && n <= 10) return buildResult("fb_carousel", "unique", asset);
  return buildResult(null, "unresolved", asset, {
    note: "images[] 但不符 fb_carousel 條件（張數/adsContent）",
  });
}

// 2-3 image 分支
function classifyImage(asset: AssetMetadata): ClassificationResult {
  const d = dim(asset);
  const mime = mimeLabel(asset);

  if (asset.hasIcon && asset.hasTextGroup) {
    if (d === "1200x627" || d === "600x360" || d === "1200x1200") {
      // 2-4：native / dynamic_native 純看素材分不出來
      return buildResult("native_or_dynamic_native", "ambiguous_requires_campaign_context", asset, {
        ambiguousGroup: "native_pair",
      });
    }
    if (d === "1200x600") {
      return buildResult("kakao_static_or_dynamic", "ambiguous_requires_campaign_context", asset, {
        ambiguousGroup: "kakao_native_pair",
      });
    }
    return buildResult(null, "unresolved", asset, {
      note: `有 icon+文字組但尺寸 ${d} 不落在 native/kakao_static 任一 enum`,
    });
  }

  if (asset.hasAdsContent) {
    if (mime === "JPG" || mime === "PNG") return buildResult("fb_banner", "unique", asset);
    return buildResult(null, "unresolved", asset, { note: "有 adsContent 但 mime 不是 JPG/PNG" });
  }

  if (d === "1029x258" && mime === "PNG") {
    // 2-4：kakao_bizboard vs naver_smart_channel 需要「平台」context，且各自內部
    // static/dynamic 又需要「投放類型」context —— 兩層都缺，光看 fileSize 硬上限
    // 猜不出來（那是驗證用的上限，不是分類訊號）。
    return buildResult(
      "kakao_bizboard_or_naver_smart_channel",
      "ambiguous_requires_campaign_context",
      asset,
      {
        ambiguousGroup: "kakao_bizboard_pair|naver_smart_channel_pair",
        note:
          "需要平台(Kakao/Naver)＋投放類型(static/dynamic)兩層 context，" +
          "fileSize 硬上限(300KB/150KB)是驗證規則不是分類訊號",
      },
    );
  }

  if (mime === "JPG" || mime === "PNG" || mime === "GIF") {
    const inEnum = BANNER_ENUM.has(d);
    return buildResult("banner", "unique", asset, {
      validationFail: inEnum ? undefined : "dimension_not_in_enum",
    });
  }

  if (mime === "PSD" || mime === "AI") {
    // PSD/AI 是分層原始檔，不是任何一種交付格式——沒轉檔之前不會直接「是」某個
    // delivery type。但尺寸本身能不能定案，要看命中的規則是不是唯一：
    //   - 只命中 banner enum：沒有其他規則重疊，也沒有 icon/adsContent 訊號可推翻，
    //     唯一合理結論就是「flatten 後會是 banner」——直接給答案，不用假裝不知道。
    //   - 命中 native/kakao_native/bizboard（或跟 banner 重疊）：是否有 icon+文字組、
    //     是哪個平台、static 還是 dynamic，這些都要開檔看圖層或問 campaign context
    //     才知道，尺寸本身解不掉，維持 unresolved。
    const hitPairs = sizeMatches(d);
    const rules = new Set(hitPairs.map(([, rule]) => rule));
    const labels = hitPairs.map(([label]) => label);

    if (rules.size === 1 && rules.has("banner")) {
      const note =
        `來源是 ${mime}，目前尺寸 ${d} 只命中 banner enum、沒有其他規則重疊——` +
        `沒有 icon/adsContent 等訊號能推翻它，flatten 轉存成 JPG/PNG/GIF 後幾乎` +
        `可以確定會是 banner，只是還沒真的轉檔，不算已交付`;
      const r = buildResult("banner", "unique_pending_conversion", asset, { note });
      r.sourceSizeMatches = labels;
      return r;
    }

    let note: string;
    let possibleCats: string[] | undefined;
    if (labels.length) {
      possibleCats = uiCategoriesForDim(d);
      note =
        `來源是 ${mime}，本身不是交付格式，不會被分類成 delivery type。` +
        `但目前尺寸 ${d} 已經命中：${labels.join("、")}——這裡沒辦法只看尺寸定案，` +
        `還要知道有沒有 icon/文字組、是哪個平台、static 還是 dynamic` +
        `（可能的 UI 分類：${possibleCats.join("／")}）`;
    } else {
      note = `來源是 ${mime}，目前尺寸 ${d} 不落在任何已知 enum/const 內——跟 must-have 尺寸都對不上，仍需要真正的 resize/重排`;
    }
    const r = buildResult(null, "unresolved", asset, {
      note,
      sourceSizeMatches: labels.length ? labels : undefined,
    });
    if (possibleCats) r.possibleUiCategories = possibleCats;
    return r;
  }

  return buildResult(null, "unresolved", asset, { note: `image 但 mime=${mime} 不在已知格式內` });
}

function buildResult(
  detectedGroup: string | null,
  confidence: string,
  asset: AssetMetadata,
  opts: {
    ambiguousGroup?: string;
    note?: string;
    validationFail?: string;
    sourceSizeMatches?: string[];
  } = {},
): ClassificationResult {
  const { ambiguousGroup, note, validationFail, sourceSizeMatches } = opts;
  const out: ClassificationResult = {
    detectedGroup,
    confidence,
    dimension: asset.width ? dim(asset) : null,
    mime: mimeLabel(asset),
    fileSizeBytes: asset.fileSizeBytes,
  };
  if (ambiguousGroup) out.ambiguousGroup = ambiguousGroup;
  if (note) out.note = note;
  if (validationFail) {
    out.validated = { ruleCode: validationFail, verdict: "fail" };
  } else if (detectedGroup === "banner") {
    out.validated = { ruleCode: "dimension_in_enum", verdict: "pass" };
  }
  if (sourceSizeMatches) out.sourceSizeMatches = sourceSizeMatches;
  const cat = uiCategory(detectedGroup, ambiguousGroup);
  if (cat) out.uiCategory = cat;
  return out;
}
