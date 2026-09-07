# Creative Resize Platform

Internal Designer workbench for scanning client Google Drive folders, computing
must-have creative-size coverage against versioned specs, and running
deterministic / OpenAI-assisted resize with Designer review.

**Phase 0 (Foundations) + Phase 1 (Read-only Workbench) are built.** Job
Create → Drive Scan → Asset Inventory → Coverage & Gap Matrix → routing
display all work end-to-end (real Drive integration + a dev-fixture fallback,
see below). Deterministic/AI execution (Phase 2/3 — actual resize/crop/OpenAI
calls) is **not** built — see "What's real vs. what's stubbed" below. Source
of truth for everything not yet covered (Phase 2+ execution, Prompt Lab, etc.):

- `Obsidian Vault/02 - Work/Creative Asset Automation/27 PRD - Designer Creative Resize Platform.md`
- `Obsidian Vault/02 - Work/Creative Asset Automation/28 Technical Plan - Designer Creative Resize Platform.md`

## Setup

```bash
npm install
pip install -r scripts/requirements.txt   # or: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
docker compose up -d                      # local Postgres 16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/creative_resize_dev bash db/migrate.sh
cp .env.example .env.local                # fill in real values before wiring up SSO/Drive/OpenAI
npm run dev
npm run test
```

## What's real vs. what's stubbed

| Area | Status |
|---|---|
| DB schema (`db/schema.sql`) + seed (`db/seed_rtb_banner_native.sql`) | **Real.** Matches 28 Technical Plan §10 exactly; seed data read directly from 17 Ref, not guessed. |
| `lib/classify.ts`, `lib/gap.ts`, `lib/retention.ts` | **Real, tested.** Ported from the validated `classifier/` Python prototype; `tests/*.test.ts` reuse the prototype's real-ticket fixtures to prove behavioral equivalence. |
| `lib/routing.ts` | **Real, tested (Phase 1).** Implements 9 of §12's 11 routes from Phase 0/1 signals — see "What's NOT implemented" below for the 2 it deliberately never emits. |
| `lib/jobs.ts`, `lib/assets.ts`, `lib/specs.ts`, `lib/gap-matrix.ts` | **Real (Phase 1).** Job state machine (§11), asset persistence, DB-driven placement/spec queries, and the Coverage & Gap Matrix orchestration that ties routing.ts to real DB rows. |
| `lib/drive.ts` (real Google Drive client) | **Real code, unexercised.** googleapis Drive v3, service-account read-only auth, folder-URL parsing, recursive scan with path-based `Done`/`Resize` exclusion, `md5Checksum` hashing, `image-size`/`ffprobe`/`scripts/psd_probe.py` probing. Cannot be run today — no `GOOGLE_SERVICE_ACCOUNT_JSON` exists yet (see below). |
| `lib/drive-fixture.ts` + `lib/fixtures/dev-assets.ts` | **Real (Phase 1), the active path today.** Implements the same `DriveScanner` interface as `lib/drive.ts` using real ticket metadata ported from `classifier/test_classifier.py` (Mox Bank, Kakao/Naver Troaming, Taobao PSD, Lotte AI artboards, SofyBe video) — not invented data. Active automatically whenever `GOOGLE_SERVICE_ACCOUNT_JSON` is unset; the Job Detail page always shows an amber banner while this is true. |
| `scripts/psd_probe.py`, `scripts/video_compress.py` | **Ported.** `psd_probe.py` is now actually called by `lib/drive.ts`'s real scan path (unexercised, see above, since there are no live credentials to trigger it) via `child_process`. `video_compress.py` is still Phase 2 (execution) — not called anywhere yet. |
| Google Drive / OpenAI / Google Workspace SSO | **Drive: real client + dev-fixture fallback (Phase 1), see above. OpenAI / SSO: still config scaffolding only** — `.env.example` placeholders, `lib/auth.ts` config stub, no live OpenAI calls anywhere (that's Phase 3). |
| Next.js app (`app/`) | **Job List (`app/jobs`), Job Create (`app/jobs/new`), Job Detail w/ Asset Inventory + Coverage & Gap Matrix (`app/jobs/[id]`) are real (Phase 1).** No Prompt Lab / Generation Review / Analytics UI yet — that's Phase 3+. No auth gating on these routes (`lib/auth.ts` still isn't wired into any page). |

### What's NOT implemented (Phase 1 routing scope, flagged not faked)

`lib/routing.ts` never emits `manual_compliance` or `blocked_safezone` — both
require icon/CTA/end-card/safe-zone pixel-level detection, which no code in
this repo does (real computer-vision-ish work, explicitly out of Phase 1
scope). There is no stub that silently "passes" a compliance/safe-zone check
that was never run — the UI's Gap Matrix footnote says so, and the two routes
simply never appear as a value.

## Architecture decisions (do not relitigate without reading the vault docs first)

- **Single Next.js 16 app, not a separate Python FastAPI service.** PSD/AI parsing
  and video compression run as bundled Python CLI scripts under `scripts/`,
  invoked via Node `child_process` from the Next.js app — one deployable unit,
  one Cloud Run service. (The vault's Technical Plan sketches a two-service
  split; this repo deliberately does not follow that sketch — see the plan's
  own §5 "為什麼分兩個服務" reasoning, which this repo's simpler single-service
  approach supersedes for Phase 0.)
- **Postgres, not Google Sheets.** ai-tool-hub (`lib/sheets.ts`) uses Google
  Sheets as its datastore; this platform uses a real Postgres database instead,
  because the data model has ~14 relational tables with joins (prompt version
  history, generation run lineage, gap matrix, audit log) that Sheets can't
  represent well. This is a deliberate divergence from the sibling project's
  convention, not an oversight.
- **Must-have sizes are database-driven, never hardcoded.** The prototype's
  `gap_validation.py` had a hardcoded `BANNER_MUST_HAVE` constant that went
  stale (6 sizes vs. the current 12 core + 1 provisional). `lib/gap.ts`'s
  `checkGap()` takes a `SpecDimension[]` parameter (rows from `spec_dimensions`,
  already placement-filtered by the caller) instead of reading any constant
  internally. **Do not reintroduce a hardcoded must-have list in code.**
- **`node:20-slim`, not `node:20-alpine`, for the Docker runtime stage.**
  PSD/AI parsing needs `psd-tools`/`pypdf` and video compression needs `ffmpeg`
  — pip-installing `psd-tools` on Alpine has known musl/wheel friction that
  Debian-slim avoids. The `deps`/`builder` stages stay on `alpine`; only the
  final `runner` stage changed.

## Judgment calls made in this scaffold (flagged, not silently decided)

- **`960x640`'s `device_scope`** in the seed data has no source row to derive
  from — it's provisional precisely because 17 Ref §二 2-1's detail table has no
  matching entry for it at all. Left at the schema default `pc_mobile`; this is
  a placeholder pending owner confirmation of the size itself (see 17 Ref's
  "已知落差" note), not a fact read from the doc.
- **`lib/auth.ts`** reuses ai-tool-hub's `@appier.com` domain-restriction
  callback logic (worth reusing per the prompt) but drops its dev-credentials
  bypass provider — that's an ai-tool-hub-specific convenience not requested
  for this scaffold, and keeping it would mean carrying a second env var
  (`DEV_MOCK_EMAIL`) with no current purpose here.
- **`next.config.ts`** does not enable `reactCompiler: true` (which ai-tool-hub
  does, via a `babel-plugin-react-compiler` devDependency). Nothing in this
  scaffold depends on it and adding an experimental compiler flag to a Phase 0
  foundations scaffold seemed like unnecessary risk; easy to add later if the
  team standardizes on it.

**Phase 1 additions:**

- **`retention.ts`'s R1 stays `manual_rearrange`, not `eligible_crop_fill`.**
  28 Technical Plan §12's routing-table draft groups "R1–R3 → eligible_crop_fill",
  but `retention.ts`'s own docstring is explicit that R1 (orientation flip) "一定
  要設計師重排" regardless of retention %, and its `NEEDS_DESIGNER` set already
  groups R1 with R4. Kept consistent with the already-validated ported logic
  (per this repo's CLAUDE.md: don't relitigate ported logic without reason)
  instead of the routing-table draft, which looks like it merged R1 into the
  R2/R3 range by mistake. Flagging in case that reading is wrong.
- **Gap Matrix / job status recompute synchronously in one request**, including
  the Job Create server action's scan step. §5's async job-queue architecture
  (Cloud Tasks / Cloud Run Jobs) is real infrastructure this repo doesn't have
  yet — dev-fixture scanning and DB-only gap computation are fast enough that
  synchronous is a reasonable Phase 1 scope call; a real Drive scan with many
  large PSD/video files would need the queue before this holds up.
- **`createdBy` is a hardcoded `"dev-designer"` string** in the Job Create
  action — `lib/auth.ts` isn't wired into any page yet (see table above), so
  there's no real session to attribute the job to.
- **PSD `redesign_eligible` for the dev-fixture Taobao assets is `false`**,
  not because the real tickets proved no semantic layers exist, but because
  `test_classifier.py`'s fixture only ever captured canvas geometry, never a
  real `extract_manifest.py` layer-name dump — there's no real signal to port,
  so the conservative default from §13's error-handling table is used instead
  of guessing `true`.
- **Lotte's 9 real `.ai` artboards became 9 separate `assets` rows** sharing a
  synthesized basename (`lotte-bank-redesign.ai#artboard-N`) — the Phase 0
  schema's `assets` table has one width/height per row, no array column for a
  multi-artboard file. Dimensions are real (from `probe_source.py`'s actual
  output); the filenames and `hasMultipleArtboards=true` flag are inferred.
- **`asset_layers` is not populated** even on a real PSD scan — `lib/drive.ts`
  calls `psd_probe.py` for canvas size + a `redesign_eligible` boolean, but
  doesn't persist the per-layer manifest rows. Rendering layer crops into
  `render_crop_uri` is explicit Phase 3 work (§8/§17); storing the raw
  metadata a phase early would be easy to add but wasn't asked for here.

## Repo layout

```
app/                       Next.js App Router
  jobs/page.tsx               Job List
  jobs/new/{page,NewJobForm,actions}.tsx  Job Create (Drive access check -> create -> scan -> gap matrix -> redirect)
  jobs/[id]/page.tsx           Job Detail: fixture-mode banner, Asset Inventory, Coverage & Gap Matrix
lib/
  auth.ts, db.ts               Phase 0
  classify.ts, gap.ts, retention.ts, spec-matrix.ts   Phase 0, ported deterministic logic
  jobs.ts, assets.ts, specs.ts, gap-matrix.ts          Phase 1 data access + orchestration
  routing.ts                   Phase 1 route/reason-code decisions (pure, unit-tested)
  drive.ts                     Phase 1 real Drive client (googleapis) + DriveScanner interface
  drive-fixture.ts             Phase 1 dev-fixture DriveScanner fallback
  fixtures/dev-assets.ts       Real ticket metadata ported from classifier/test_classifier.py
  format.ts                    Small display-formatting helpers
tests/                     vitest — real-ticket fixtures ported from classifier/test_*.py + routing.test.ts
db/                        schema.sql, seed_rtb_banner_native.sql, migrate.sh
scripts/                   psd_probe.py, video_compress.py, requirements.txt (Python CLI, invoked via child_process)
docker-compose.yml         local Postgres 16 for dev
Dockerfile                 multi-stage build -> node:20-slim runtime w/ python3+ffmpeg
```
