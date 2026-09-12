# Creative Resize Platform — 專案 CLAUDE.md

Internal Designer workbench，implements the plan in:

- `Obsidian Vault/02 - Work/Creative Asset Automation/27 PRD - Designer Creative Resize Platform.md`
- `Obsidian Vault/02 - Work/Creative Asset Automation/28 Technical Plan - Designer Creative Resize Platform.md`

Those two docs are the source of truth for anything not covered here. This repo
is Phase 0 (Foundations) only — see README "What's real vs. what's stubbed".

## 架構決定（已定案，不要重新討論）

- **單一 Next.js 16 app**，不是獨立 Python FastAPI service。PSD/AI parsing 與
  video compression 走 `scripts/` 底下的 Python CLI script，由 Node
  `child_process` 呼叫——一個 deployable unit，一個 Cloud Run service。
- **Postgres，不是 Google Sheets**（跟 `ai-tool-hub` 不同，那邊是 `lib/sheets.ts`）。
  Data model 有 ~14 張互相 join 的表（prompt version history／generation run
  lineage／gap matrix／audit log），Sheets 撐不住。
- **`node:20-slim`，不是 `node:20-alpine`**（Docker 最終 stage）。理由：
  `psd-tools` 在 Alpine 上 pip install 有 musl/wheel 相容性問題。

## Must-have specs 一定要從 DB 讀，不准寫死

`spec_dimensions`（join 過 `spec_versions`，依 job 的 target placement 過濾）是
must-have 尺寸的唯一來源。`lib/gap.ts` 的 `checkGap()` 吃 `SpecDimension[]`
參數，不讀任何 module-level 常數；生成路徑的 target 一律走
`lib/specs.ts` 的 `listGenerationTargets()`。**`NARAKA_TARGETS` 與 Workspace 頁面那份
14 筆清單已經刪掉了，不要再加回來**——它們就是重犯下面這個錯，而且真的已經跟
seed 的 13 筆對不上。provisional 讀 `must_have_level` 欄位，不要寫
`if (targetId === "960x640")`。**不要再犯 `gap_validation.py` 那個錯**——
它把 `BANNER_MUST_HAVE` 寫死成 6 個尺寸的 module constant，結果基準改成
12+1 個之後這支程式碼默默過期，沒有任何機制會提醒你去改它。新功能要查
must-have 一律 query `spec_dimensions`，不要在 TS/Python 裡建常數表。

## Recipe 規則一律從 `recipe_rules` 讀，不准手改 `prompt_versions`

`recipe_rules` 是 authoring surface（一條規則一列，帶 `why`／`applies_to`／
`enforcement`）。`prompt_versions` 仍然存在，但從 v10 起是**生成物**——
`scripts/render_recipe_version.py` 從規則列 render 出來，因為 run 必須 snapshot
它當下拿到的文字。要改規則就改 rule row 再重新 render，**不要編輯 version row**。

理由跟上面 `BANNER_MUST_HAVE` 是同一個：v1..v9 長到 ~4200 字卻只有 18 條規則，
因為那六個散文欄位不是六種內容，是同一條規則的四個面向（陳述／怎麼做／不要做／
怎麼檢查），所以每條被寫 3-5 次。加 v9 那一條新規則要動 10 個地方。

- **`enforcement = validator:<name>` 的規則不要再寫進 prompt。** 讓 run fail 比
  請模型遵守嚴格得多。`validators` 表登記每支的 entrypoint；沒有程式碼的一律
  `status='declared'`，**不要為了讓 gate 全綠而加永遠 pass 的 stub**。
- **兩個 pipeline 共用這張表，靠 `applies_to.surface` 分**。skill 路徑（`resolve_prompt.py`）
  用 aspect class（matte／portrait／square／landscape）解析；生成路徑
  （`lib/recipe-rules.ts`）用 layout family（5 段比例）＋ 已確認的 role 解析，
  額外吃 `layoutFamily`／`roles`／`minAspectRatio` 三個 key。**兩套比例分類法的邊界
  是真的不同，不要為了統一而合併**——合了會默默改掉既有 target 拿到的規則。
  規則列寫 `"surface": "generate"` 就只給生成路徑，沒寫就只給 skill 路徑。
  生成路徑的 18 條在 `db/seed_recipe_rules_generation.sql`，掛在 General recipe 底下
  （沒有一條是 gaming 專屬）。
- 單次 run 的 prompt 用 `scripts/resolve_prompt.py --target WxH --traits …` 依
  aspect class 與素材 traits 篩選，不要送整份（實測 260-299 字 vs 4200 字）。
- 產圖的一方要輸出 manifest（見 `scripts/validator_lib.py` 的 docstring），
  `scripts/validate_all.py` 才能把 validators 當一道 gate 跑。

## 尺寸資料在哪

- `db/seed_rtb_banner_native.sql`：RTB Banner（10 個 required + `960x640`
  provisional）＋ RTB Native（2 個 required），逐條註明來源（17 Ref 章節）。
- 新增 placement／channel（Kakao／Naver／GAI…）：新增一筆 `spec_versions` +
  對應的 `spec_dimensions`，不要塞進既有的 spec_version 裡混著放——每個
  size 都要清楚帶著自己的 placement/channel 標籤，同一個 WxH 在不同
  placement 各自有效就各自存一筆。

## Ported logic 的來源

`lib/classify.ts` / `lib/gap.ts` / `lib/retention.ts` 是從
`Obsidian Vault/.../Creative Asset Automation/classifier/*.py` 逐函式港口過來的
（camelCase 化，行為保持一致）。改動這些檔案前，先看對應的 `.py`
原始檔的 docstring——很多分支背後有真實票號驗證過的理由，不是隨手寫的規則。

## Phase 進度

Phase 0（Foundations）＋ Phase 1（Read-only Workbench）已完成。**Prompt Lab、
AI redesign（OpenAI 呼叫）、Generation Review 也已經做進來了**——`/workspace`
是完整的 Vision 盤點 → Designer 確認 label → Image Edit → compositor → adopt/reject
路徑，見 README「What's real vs. what's stubbed」。`lib/routing.ts` 仍只做顯示。
`manual_compliance`／`blocked_safezone` 這兩個 route 依然刻意不實作（沒有
icon/CTA/safe-zone 偵測邏輯），不要加一個永遠 pass 的假 stub。

## 生成路徑的三條硬規則

- **付費呼叫一定要留稽核列。** `logGenerationRun` 是唯一 `required=true` 的
  logger，Sheet 沒設定就 throw。**不要把它包進任何會吞例外的 try**——已經出過
  兩次事：包進 cache 偵測的 try 會讓快取命中重新付費，包進 API try 會讓稽核壞掉
  默默降級成 fallback 圖。
- **必要角色放不下就擋，不要默默丟。** compositor（`compose_extreme_layout.py`）
  沒有 zone 的 required role 一律 `SystemExit`；optional 才可以省略，而且要寫進
  回傳的 `omitted`。TS 那份 zone 表（`COMPOSITOR_ZONE_ROLES`）是為了在付錢前就擋下來，
  靠 `--describe` 的測試防止兩邊 drift——**改一邊一定要改另一邊**。
- **縮圖用 LANCZOS，放大才用 NEAREST**（`resample_for()`）。全部用 NEAREST 會把
  分級標章的說明文字打散成色塊，這是實際比對過的，不是理論。

## Out of scope（不要在這個 repo 加）

Deterministic 執行（真的 resize/crop-fill/video compression 寫回 Drive）與
Analytics 仍不在範圍內。真的要動工前先讀 28 Technical Plan §19 的分階段計畫。
