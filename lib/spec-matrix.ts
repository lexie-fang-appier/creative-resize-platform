/**
 * Ported from classifier/spec_matrix.json (11 Ref - Classification Decision Tree §二 /
 * 10 Ref - Creative Types §三 附錄). This is the CPM *classification* enum/const data
 * (56 legal banner sizes, native/kakao/bizboard consts, UI category labels) used by
 * classify.ts's decision tree — a different, more stable concept than the *must-have*
 * gap list in gap.ts, which per the platform's design (see lib/gap.ts) is database-
 * driven via `spec_dimensions`, not a hardcoded constant. This enum data is kept as a
 * code constant because it mirrors the original prototype's spec_matrix.json 1:1 and
 * is not itself a must-have list.
 */

export const BANNER_ENUM_STANDARD = [
  "120x600", "160x600", "200x200", "240x320", "250x250", "300x50", "300x100",
  "300x150", "300x250", "300x600", "320x50", "320x100", "320x160", "320x250",
  "320x480", "320x568", "336x280", "468x60", "480x320", "568x320", "728x90",
  "768x1024", "970x90", "970x250", "1024x768", "1200x627", "1280x720", "720x1280",
];

export const BANNER_ENUM_DOUBLE_SIZE = [
  "240x1200", "320x1200", "400x400", "480x640", "500x500", "600x100", "600x200",
  "600x300", "600x500", "600x1200", "640x100", "640x200", "640x320", "640x500",
  "640x960", "640x1136", "672x560", "936x120", "960x640", "1136x640", "1456x180",
  "1536x2048", "1940x180", "1940x500", "2048x1536", "2400x1254", "2560x1440", "1440x2560",
];

export const BANNER_ENUM = new Set([...BANNER_ENUM_STANDARD, ...BANNER_ENUM_DOUBLE_SIZE]);

export const NATIVE_ENUM = new Set(["1200x627", "600x360", "1200x1200"]);
export const KAKAO_NATIVE_CONST = new Set(["1200x600"]);
export const KAKAO_NAVER_BIZBOARD_CONST = new Set(["1029x258"]);

// 19 Ref - Creative 3.0 UI Categories：客戶端會看到的分類，比 17 種 CPM schema 粗。
export const UI_CATEGORIES: Record<string, string> = {
  banner: "Banner",
  fb_banner: "FB: Banner",
  fb_video: "FB: Video",
  fb_carousel: "FB: Carousel",
  richmedia: "Richmedia",
  dynamic_video: "Dynamic Video",
  ortb_video: "Video",
  kakao_video: "Video",
  google_native_video: "Native Video",
  samsung_native_video: "Native Video",
  kakao_native_video: "Native Video",
  kakao_dynamic_native_video: "Dynamic Native Video",
  native: "Native",
  kakao_static_native: "Native",
  kakao_static_bizboard: "Native",
  naver_static_smart_channel: "Native",
  dynamic_native: "Dynamic Native",
  kakao_dynamic_native: "Dynamic Native",
  kakao_dynamic_bizboard: "Dynamic Native",
  naver_dynamic_smart_channel: "Dynamic Native",
  kakao_static: "Native",
  kakao_dynamic: "Dynamic Native",
};

export const AMBIGUOUS_GROUP_CANDIDATES: Record<string, string[]> = {
  native_pair: ["native", "dynamic_native"],
  kakao_native_pair: ["kakao_static", "kakao_dynamic"],
  "kakao_bizboard_pair|naver_smart_channel_pair": [
    "kakao_static_bizboard", "kakao_dynamic_bizboard",
    "naver_static_smart_channel", "naver_dynamic_smart_channel",
  ],
};
