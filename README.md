# Creative Resize Platform

Internal Designer workbench for scanning client Google Drive folders, computing
must-have creative-size coverage against versioned specs, and running
deterministic / OpenAI-assisted resize with Designer review.

**This is a Phase 0 (Foundations) scaffold.** No product UI is built here — see
"What's real vs. what's stubbed" below. Source of truth for everything this
scaffold doesn't cover (Phase 1+ UI, routing, Prompt Lab, etc.):

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
| `scripts/psd_probe.py`, `scripts/video_compress.py` | **Ported, not yet exercised end-to-end in this repo.** Syntax-valid; no PSD/video file has actually been run through them here (would need `psd-tools`/`ffmpeg` installed and a real test asset). |
| Google Drive / OpenAI / Google Workspace SSO | **Config scaffolding only.** `.env.example` placeholders, `lib/auth.ts` config stub, no live calls anywhere in this repo. |
| Next.js app (`app/`) | **Skeleton only.** `app/page.tsx` is a placeholder, `app/api/health` is a trivial healthcheck. No Job Create / Asset Inventory / Gap Matrix / Prompt Lab UI — that's Phase 1+. |

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

## Repo layout

```
app/                       Next.js App Router skeleton (placeholder page, /api/health)
lib/                       auth.ts, db.ts, classify.ts, gap.ts, retention.ts, spec-matrix.ts
tests/                     vitest — real-ticket fixtures ported from classifier/test_*.py
db/                        schema.sql, seed_rtb_banner_native.sql, migrate.sh
scripts/                   psd_probe.py, video_compress.py, requirements.txt (Python CLI, invoked via child_process)
docker-compose.yml         local Postgres 16 for dev
Dockerfile                 multi-stage build -> node:20-slim runtime w/ python3+ffmpeg
```
