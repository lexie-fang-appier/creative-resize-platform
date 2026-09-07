-- Seed: RTB Banner + RTB Native must-have spec, from
-- "17 Ref - Client Ad Spec Sheet 2026.md" §一 (2026-09-07 must-have 名單擴充).
--
-- device_scope for the 10 Banner sizes is derived from §二 2-1's per-row
-- PC+Mobile / MB Only / PC Only columns (⦿ = must have), not assumed:
--   in both MB Only and PC Only lists  -> pc_mobile  (600x500, 1456x180, 672x560)
--   in MB Only list only               -> mobile_only (640x100, 640x960, 500x500, 640x200)
--   in PC Only list only               -> pc_only    (600x1200, 320x1200, 1940x500)
--
-- 960x640 has NO corresponding row in §二 2-1's 13-row detail table at all (that's
-- exactly why it's provisional, not required — see 17 Ref's "已知落差" note) — so
-- there is no source data to derive its device_scope from. Left at the schema
-- default 'pc_mobile'; this is a judgment call, flagged in README, not a fact
-- read from the doc.

do $$
declare
  banner_spec_id uuid;
  native_spec_id uuid;
begin
  insert into spec_versions (ad_solution, channel, placement, creative_format, source_doc, version, notes)
  values (
    'RTB', 'Global', 'Banner', 'Banner', '17 Ref', 1,
    '17 Ref §一 2026-09-07 must-have 名單擴充（12 core 之 10 個 Banner）＋ §二 2-1 逐列裝置欄位拆分'
  )
  returning id into banner_spec_id;

  insert into spec_versions (ad_solution, channel, placement, creative_format, source_doc, version, notes)
  values (
    'RTB', 'Global', 'Native', 'Native', '17 Ref', 1,
    '17 Ref §一 Native must-have：160x160 App Icon ＋ 1200x627 主視覺'
  )
  returning id into native_spec_id;

  insert into spec_dimensions (spec_version_id, width, height, device_scope, must_have_level, notes) values
    (banner_spec_id, 600, 500, 'pc_mobile', 'required', null),
    (banner_spec_id, 640, 100, 'mobile_only', 'required', null),
    (banner_spec_id, 640, 960, 'mobile_only', 'required', null),
    (banner_spec_id, 1456, 180, 'pc_mobile', 'required', null),
    (banner_spec_id, 672, 560, 'pc_mobile', 'required', null),
    (banner_spec_id, 600, 1200, 'pc_only', 'required', null),
    (banner_spec_id, 320, 1200, 'pc_only', 'required', null),
    (banner_spec_id, 500, 500, 'mobile_only', 'required', null),
    (banner_spec_id, 1940, 500, 'pc_only', 'required', null),
    (banner_spec_id, 640, 200, 'mobile_only', 'required', null),
    (
      banner_spec_id, 960, 640, 'pc_mobile', 'provisional',
      '查無 17 Ref §二 2-1 詳細表對應列，來源僅 Aibid 摘要頁——待確認是否 required'
    );

  insert into spec_dimensions (spec_version_id, width, height, device_scope, must_have_level, notes) values
    (native_spec_id, 1200, 627, 'pc_mobile', 'required', null),
    (native_spec_id, 160, 160, 'pc_mobile', 'required', null);
end $$;
