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
參數，不讀任何 module-level 常數。**不要再犯 `gap_validation.py` 那個錯**——
它把 `BANNER_MUST_HAVE` 寫死成 6 個尺寸的 module constant，結果基準改成
12+1 個之後這支程式碼默默過期，沒有任何機制會提醒你去改它。新功能要查
must-have 一律 query `spec_dimensions`，不要在 TS/Python 裡建常數表。

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

Phase 0（Foundations）＋ Phase 1（Read-only Workbench：Job Create／Drive
Scan／Asset Inventory／Coverage & Gap Matrix／Routing 顯示）已完成，見
README「What's real vs. what's stubbed」。`lib/routing.ts` 只做顯示，不執行
任何 resize／crop／OpenAI 呼叫——那是 Phase 2/3。`manual_compliance`／
`blocked_safezone` 這兩個 route 這個 phase 刻意不實作（沒有 icon/CTA/safe-zone
偵測邏輯），不要加一個永遠 pass 的假 stub。

## Out of scope（不要在這個 repo 加）

Deterministic 執行（真的 resize/crop-fill/video compression 寫回 Drive）、
Prompt Lab、AI redesign（OpenAI 呼叫）、Generation Review、Analytics 這些是
Phase 2+，不屬於目前已完成的範圍。真的要動工前先讀 28 Technical Plan §19
的分階段計畫。
