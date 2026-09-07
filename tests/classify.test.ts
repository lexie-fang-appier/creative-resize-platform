/**
 * Ported from classifier/test_classifier.py — same real-ticket fixture metadata
 * and expected outputs (not invented), proving the TS port behaves identically to
 * the validated Python prototype.
 */
import { describe, expect, it } from "vitest";
import { classifyAsset } from "../lib/classify";

describe("classifyAsset — Part A: 17 種正例（純規則引擎，應 100% 符合規格表）", () => {
  it("banner", () => {
    const r = classifyAsset({ mime: "image/png", width: 300, height: 250, fileSizeBytes: 100_000 });
    expect(r.detectedGroup).toBe("banner");
    expect(r.confidence).toBe("unique");
  });

  it("fb_banner", () => {
    const r = classifyAsset({
      mime: "image/png", width: 500, height: 500, fileSizeBytes: 200_000, hasAdsContent: true,
    });
    expect(r.detectedGroup).toBe("fb_banner");
    expect(r.confidence).toBe("unique");
  });

  it("dynamic_video", () => {
    const r = classifyAsset({ hasVideo: true, hasEndCard: true, durationSec: 30 });
    expect(r.detectedGroup).toBe("dynamic_video");
    expect(r.confidence).toBe("unique");
  });

  it("ortb_video", () => {
    const r = classifyAsset({ hasVideo: true, hasEndCard: true, hasIcon: true, hasTextGroup: true });
    expect(r.detectedGroup).toBe("ortb_video");
    expect(r.confidence).toBe("unique");
  });

  it("google_native_video", () => {
    const r = classifyAsset({
      hasVideo: true, hasEndCard: true, hasIcon: true, hasTextGroup: true, hasExtraImageField: true,
    });
    expect(r.detectedGroup).toBe("google_native_video");
    expect(r.confidence).toBe("unique");
  });

  it("fb_video", () => {
    const r = classifyAsset({ hasVideo: true, hasThumbnail: true, hasAdsContent: true });
    expect(r.detectedGroup).toBe("fb_video");
    expect(r.confidence).toBe("unique");
  });

  it("kakao_native_video", () => {
    const r = classifyAsset({ hasVideo: true, hasThumbnail: true, hasIcon: true, hasTextGroup: true });
    expect(r.detectedGroup).toBe("kakao_native_video");
    expect(r.confidence).toBe("unique");
  });

  it("richmedia", () => {
    const r = classifyAsset({ hasRichmediaInfo: true });
    expect(r.detectedGroup).toBe("richmedia");
    expect(r.confidence).toBe("unique");
  });

  it("fb_carousel", () => {
    const r = classifyAsset({ hasImagesArray: true, imagesCount: 3, hasAdsContent: true });
    expect(r.detectedGroup).toBe("fb_carousel");
    expect(r.confidence).toBe("unique");
  });
});

describe("classifyAsset — 4 對 ambiguous edge case（應 100% 標 ambiguous，不能硬猜）", () => {
  it("native (1200x627)", () => {
    const r = classifyAsset({ mime: "image/jpeg", width: 1200, height: 627, hasIcon: true, hasTextGroup: true });
    expect(r.confidence).toBe("ambiguous_requires_campaign_context");
    expect(r.ambiguousGroup).toBe("native_pair");
  });

  it("dynamic_native (1200x1200)", () => {
    const r = classifyAsset({ mime: "image/jpeg", width: 1200, height: 1200, hasIcon: true, hasTextGroup: true });
    expect(r.confidence).toBe("ambiguous_requires_campaign_context");
    expect(r.ambiguousGroup).toBe("native_pair");
  });

  it("kakao_static (1200x600)", () => {
    const r = classifyAsset({ mime: "image/jpeg", width: 1200, height: 600, hasIcon: true, hasTextGroup: true });
    expect(r.confidence).toBe("ambiguous_requires_campaign_context");
    expect(r.ambiguousGroup).toBe("kakao_native_pair");
  });

  it("kakao/naver 1029x258 PNG", () => {
    const r = classifyAsset({ mime: "image/png", width: 1029, height: 258, fileSizeBytes: 250_000 });
    expect(r.confidence).toBe("ambiguous_requires_campaign_context");
    expect(r.ambiguousGroup).toBe("kakao_bizboard_pair|naver_smart_channel_pair");
  });
});

describe("classifyAsset — Part B: CAM-406076 真實 8 個檔（08 Plan §7-1 人工結果核對）", () => {
  const moxbankFiles: Array<{ name: string; mime: string; width: number; height: number; fileSizeBytes: number }> = [
    { name: "MOX Invest-v1_300x250.jpg", mime: "image/jpeg", width: 300, height: 250, fileSizeBytes: 82834 },
    { name: "MOX Invest-v1_300x600.jpg", mime: "image/jpeg", width: 300, height: 600, fileSizeBytes: 148878 },
    { name: "MOX Invest-v1_300x300.jpg", mime: "image/jpeg", width: 300, height: 300, fileSizeBytes: 93712 },
    { name: "MOX Invest-v1_320x320.jpg", mime: "image/jpeg", width: 320, height: 320, fileSizeBytes: 105757 },
    { name: "MOXPlus_300x250.jpg", mime: "image/png", width: 300, height: 250, fileSizeBytes: 60625 },
    { name: "MOXPlus_300x600.jpg", mime: "image/png", width: 300, height: 600, fileSizeBytes: 92566 },
    { name: "MOXINVEST_PM_banner_300x600_v2.jpg", mime: "image/jpeg", width: 300, height: 600, fileSizeBytes: 96051 },
    { name: "MOXINVEST_PM_banner_320x320_v2.jpg", mime: "image/jpeg", width: 320, height: 320, fileSizeBytes: 65463 },
  ];

  const expectedManual: Record<string, "pass" | "fail"> = {
    "MOX Invest-v1_300x250.jpg": "pass", "MOX Invest-v1_300x600.jpg": "pass",
    "MOX Invest-v1_300x300.jpg": "fail", "MOX Invest-v1_320x320.jpg": "fail",
    "MOXPlus_300x250.jpg": "pass", "MOXPlus_300x600.jpg": "pass",
    "MOXINVEST_PM_banner_300x600_v2.jpg": "pass", "MOXINVEST_PM_banner_320x320_v2.jpg": "fail",
  };

  for (const f of moxbankFiles) {
    it(`${f.name} matches manual verdict`, () => {
      const r = classifyAsset(f);
      const verdict = r.validated?.verdict ?? "n/a";
      expect(verdict).toBe(expectedManual[f.name]);
    });
  }
});

describe("classifyAsset — Part C: CAM-405006 真實 Kakao bizboard vs Naver smart channel", () => {
  // 這 2 個檔名在 Drive 上同時出現在 kakao_bizboard/ 和 naver_smartchannel/ 兩個資料夾裡，
  // 檔案本身完全一樣（同尺寸同 mime）——這是「純看素材分不出來」的真實案例，不是理論 edge case。
  const kakaoNaverFiles = [
    { name: "kakao_bizboard/travel-troaming.png", mime: "image/png", width: 1029, height: 258, fileSizeBytes: 169407 },
    { name: "kakao_bizboard/roaming-data-16gb-renew.png", mime: "image/png", width: 1029, height: 258, fileSizeBytes: 87382 },
    { name: "naver_smartchannel/travel-troaming.png", mime: "image/png", width: 1029, height: 258, fileSizeBytes: 42555 },
    { name: "naver_smartchannel/roaming-data-16gb-renew.png", mime: "image/png", width: 1029, height: 258, fileSizeBytes: 25003 },
  ];

  for (const f of kakaoNaverFiles) {
    it(`${f.name} is correctly flagged ambiguous`, () => {
      const r = classifyAsset(f);
      expect(r.confidence).toBe("ambiguous_requires_campaign_context");
    });
  }
});

describe("classifyAsset — Part E: PSD/AI 尺寸判斷", () => {
  // 幾何數字取自 probe_source.py 對真實下載檔案的輸出 — fixture 數字，不重新內嵌客戶原始檔案本體。
  const taobaoPsd = [
    { name: "04-1.psd", mime: "image/vnd.adobe.photoshop", width: 1080, height: 1350 },
    { name: "04-1(同02-2).psd", mime: "image/vnd.adobe.photoshop", width: 1080, height: 1080 },
    { name: "05-1.psd", mime: "image/vnd.adobe.photoshop", width: 1080, height: 1350 },
    { name: "05-2.psd", mime: "image/vnd.adobe.photoshop", width: 1080, height: 1351 },
  ];

  for (const f of taobaoPsd) {
    it(`${f.name} is unresolved with no size matches`, () => {
      const r = classifyAsset(f);
      expect(r.confidence).toBe("unresolved");
      expect(r.sourceSizeMatches).toBeUndefined();
    });
  }

  const lotteAiArtboards = [
    { idx: 0, width: 1200, height: 628 }, { idx: 1, width: 1200, height: 1200 },
    { idx: 2, width: 960, height: 1200 }, { idx: 3, width: 961, height: 451 },
    { idx: 4, width: 800, height: 450 }, { idx: 5, width: 800, height: 1200 },
    { idx: 6, width: 970, height: 250 }, { idx: 7, width: 640, height: 320 },
    { idx: 8, width: 850, height: 1300 },
  ];
  // 2026-09-02 更正：只命中 banner enum、沒有其他規則重疊時，直接給
  // confidence=unique_pending_conversion，detected_group='banner'。命中 native/kakao
  // 相關規則的（或跟 banner 重疊）維持 unresolved。
  const expectLotte: Record<number, string> = {
    0: "unresolved", 1: "unresolved", 2: "unresolved", 3: "unresolved", 4: "unresolved",
    5: "unresolved", 6: "unique_pending_conversion", 7: "unique_pending_conversion", 8: "unresolved",
  };

  for (const ab of lotteAiArtboards) {
    it(`AI artboard #${ab.idx} (${ab.width}x${ab.height}) matches expected confidence`, () => {
      const r = classifyAsset({ mime: "application/postscript", width: ab.width, height: ab.height });
      expect(r.confidence).toBe(expectLotte[ab.idx]);
    });
  }
});

describe("classifyAsset — Part D: CAM-401655 真實 video（client 原始素材，非生成結果）", () => {
  // 客戶直接給的原始影片，endCard/icon 都還沒做 — 分類器應正確回報 unresolved，不硬猜。
  const sofybeVideo = [
    { name: "098824_0021sec_horizontal.mp4", mime: "video/mp4", hasVideo: true, width: 1920, height: 1080, durationSec: 20.6, fileSizeBytes: 26560358 },
    { name: "098824_0021sec_vertical.mp4", mime: "video/mp4", hasVideo: true, width: 1080, height: 1920, durationSec: 20.6, fileSizeBytes: 26469632 },
  ];

  for (const f of sofybeVideo) {
    it(`${f.name} reports unresolved without guessing`, () => {
      const r = classifyAsset(f);
      expect(r.detectedGroup).toBeNull();
      expect(r.confidence).toBe("unresolved");
    });
  }
});
