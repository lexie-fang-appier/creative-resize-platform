# Creative Resize Platform

Internal Designer workbench: paste a client's Google Drive folder, the
platform scans what's in it, figures out which of the client's required ad
sizes are already covered, and routes every gap to either an automatic fix
or an AI-assisted redesign candidate that a Designer reviews before
anything ships. Nothing is ever auto-published — every AI output is a
candidate the Designer explicitly approves or rejects.

**Status: working prototype, not yet in production use.** The full flow
below runs end-to-end against real Google Drive data. The two things that
are still manual rather than automated are called out explicitly in
"Known limitations" — most importantly, **there is no image-generation API
wired up yet**, so the actual redesign work is done by a person (via Claude
Code) reading the platform's own generated brief, not by a model.

Source of truth for anything not covered here (Phase 2+ deterministic
execution, Analytics, SSO, client-facing self-service):
- `Obsidian Vault/02 - Work/Creative Asset Automation/27 PRD - Designer Creative Resize Platform.md`
- `Obsidian Vault/02 - Work/Creative Asset Automation/28 Technical Plan - Designer Creative Resize Platform.md`

---

## How it works

```
Create Job → Scan Drive → Asset Inventory → Group assets by content
  → Coverage & Gap Matrix (per group) → Generate → Review (Approve/Reject)
```

**1. Create a Job** — paste a Drive folder URL, pick client/industry/ad
solution/channel/format, check which placements you're targeting (Banner,
Native, ...). The platform checks real Drive read access immediately and
blocks the job if it can't get in, rather than discovering that later.
Industry, placements, and ad-solution/channel options are all read from the
database, not hardcoded — the dropdown you see is exactly what's seeded in
`spec_dimensions` / `industries`.

**2. Scan** — a real, recursive Drive listing (skips `Done`/`Resize`
subfolders, which routinely hold already-shipped creative that would
otherwise contaminate the source pool). Each file is probed by format:
images get their pixel dimensions, video gets duration/resolution via
`ffprobe`, PSD/AI get canvas size and a layer manifest via `psd-tools`/`pypdf`.
Files download 4-at-a-time — the real bottleneck we measured is Drive
download throughput, not local processing.

**3. Asset Inventory** — every scanned file, with format/dimensions/file
size/PSD layer info. Click a row to expand a live preview in place: JPG/PNG
stream directly, PSD gets downloaded and flattened on the spot. AI files and
video don't have a preview yet (see limitations).

**4. Group assets by content** — check a set of assets and give them a name.
**This step is manual on purpose.** A client's folder routinely holds several
distinct creative concepts that happen to share some pixel sizes (this
repo's own test data has three: `MOX Invest-v1_*`, `MOXPlus_*`, and
`MOXINVEST_PM_banner_*`, all with overlapping 300x250/300x600-ish sizes but
almost certainly three different shoots). The platform never guesses which
assets belong together from filenames — same principle as not letting it
guess campaign intent from file dimensions.

**5. Coverage & Gap Matrix — one per group** — for each group's target
placements, the platform pulls every required size from the versioned spec
table and decides, size by size, using only that group's own assets:

| Found | Route |
|---|---|
| Exact pixel match | `ready_to_use` |
| Near-perfect aspect ratio | `eligible_scale` |
| Aspect ratio close enough with some cropping | `eligible_crop_fill` |
| No good raster match, but a PSD with named layers (Logo/CTA/Headline...) | `eligible_psd_redesign` |
| PSD exists but layers are unnamed (`圖層 1`, `圖層 2`) | `manual_rearrange` |
| Nothing usable | `blocked_no_usable_source` |

This step is pure rule evaluation — no AI call, fully deterministic,
re-runs identically every time. Video files are never matched against these
targets regardless of how well the pixel dimensions line up (Banner/Native
are static-image placements; a video "fitting" one was a real bug, now
fixed).

**6. Generate** — appears only on rows with an AI-assisted route
(`eligible_scale`/`eligible_crop_fill`/`eligible_psd_redesign`/
`video_compression`) that have a matched source. Clicking it:
- picks the most specific active Prompt Lab recipe for this job's
  industry + format (falls back to the "General — Cross-Industry Baseline"
  recipe if nothing more specific exists),
- composes one resolved prompt: global safety rules (never edit the logo,
  never rewrite copy, always needs Designer review, ...) + the recipe's
  industry/layout rules + the target size + this job's campaign instruction,
- saves it as a `queued` generation run. Repeating an identical request
  (same source + same target size + same prompt version) reuses the
  previous result instead of redoing the work.

**7. Processing a queued run — currently manual.** There is no image-gen API
key in this prototype, so nothing happens automatically after Generate. A
Designer asks Claude Code to process the queued run; Claude Code downloads
the actual source file, reads its layer structure, follows the resolved
prompt's rules, and produces a flattened PNG candidate by hand (the same
way the underlying redesign methodology was originally validated — see
16 Ref). This is real, deliberate work per case, not a canned script — see
"Known limitations" for what it would take to automate this step.

**8. Review** — each finished candidate can be Approved, or Rejected with a
reason (a genuine "can't articulate why" option is included on purpose,
since that's a real, recorded outcome in the underlying research, not
something to force into a false category). Decisions are stored for future
approval-rate analysis.

---

## Known limitations

Worth reading before evaluating this as more finished than it is.

- **No image-generation API is connected.** Generate only queues a job; a
  person does the actual redesign (step 7 above). This is the single
  biggest gap between "prototype" and "production tool."
- **Output is always a flattened PNG, never an editable PSD.** The
  PSD-manipulation library used throughout (`psd-tools`) can read and
  flatten layers but cannot reliably write a new PSD with edited layer
  positions back out — this was already established during the original
  research (no tool does "read PSD → move layers programmatically → save a
  valid new PSD" well). A true editable-PSD output would need Photoshop's
  own scripting (ExtendScript/UXP) running inside a real Photoshop
  instance, which is out of scope here. This doesn't block shipping —
  nothing in the client spec requires PSD as a delivery format — but it
  does mean a Designer can't hand-tweak a candidate in Photoshop, only
  regenerate it.
- **Nothing writes back to Google Drive.** Approved outputs are served from
  this app's own storage (`/api/outputs/...`), not copied into a
  draft/approved folder in the client's Drive as the long-term design calls
  for.
- **No authentication.** Every route is open; there's no login, no
  per-client access control.
- **No preview for `.ai` files or video** in the Asset Inventory — `.ai`
  flattening needs `pymupdf`, which isn't a dependency here (see 16 Ref for
  why that path has real ceilings); video thumbnailing isn't implemented.
- **Every "processing a queued run" outcome depends on whoever does it by
  hand** — two different sessions could reasonably produce different
  candidates for the same input. This is an accurate reflection of the
  underlying redesign methodology (documented as needing human judgment per
  case), not a bug to code around.

---

## Setup

```bash
npm install
pip install -r scripts/requirements.txt   # or: python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
docker compose up -d                      # local Postgres 16
DATABASE_URL=postgres://postgres:postgres@localhost:5432/creative_resize_dev bash db/migrate.sh
cp .env.example .env.local                # fill in real values to enable Drive/SSO
npm run dev
npm run test
```

Without `GOOGLE_SERVICE_ACCOUNT_JSON` set, Drive scanning automatically
falls back to sample ticket data (an amber banner always marks this state —
it's never silent). To scan a real folder: create a service account in the
`ad-creatives-auto` GCP project, share the target Drive folder with it
(Viewer is enough), and paste its key JSON into `.env.local`.

---

## What's built

| Area | Status |
|---|---|
| Job Create → Scan → Asset Inventory | Real. Real Drive integration with a dev-fixture fallback (always visibly flagged). |
| Asset grouping | Real. Manual, persisted (`asset_groups`/`asset_group_members`). |
| Coverage & Gap Matrix | Real, computed per group, deterministic, no AI. |
| Prompt Lab (`/prompts`) | Real. Recipe CRUD, versioning (one active version per recipe, enforced transactionally), diff, rollback, clone. |
| Generate (prompt resolution + queueing) | Real. Does not call any image-generation API — see Known limitations. |
| Designer Review (Approve/Reject) | Real, with a required rejection-reason taxonomy including "unspecified / overall impression". |
| Asset Inventory inline preview | Real for JPG/PNG/PSD; not implemented for `.ai`/video. |
| Deterministic execution (actual resize/crop/compress) | Not built — routes are decided, but nothing runs the resize itself yet. |
| OpenAI/other image-gen integration | Not built. |
| Google Workspace SSO | Config scaffolding only, not wired into any page. |
| Analytics dashboard | Not built. |

---

## Architecture decisions

- **Single Next.js 16 app, not a separate backend service.** PSD/AI parsing
  and video work run as Python CLI scripts under `scripts/`, invoked via
  Node `child_process` — one deployable unit.
- **Postgres, not Google Sheets** (unlike the sibling `ai-tool-hub` project)
  — the data model has too many relational tables (prompt version history,
  generation run lineage, gap matrix, review decisions) for Sheets to
  represent well.
- **Must-have sizes are entirely database-driven.** Nowhere in the code is
  there a hardcoded list of required creative sizes — they live in
  `spec_versions`/`spec_dimensions` and are looked up at request time. The
  original prototype this was ported from had exactly this kind of
  hardcoded constant go stale; don't reintroduce one.
- **Campaign context, industry, and content grouping are never guessed.**
  Placement targets, industry, and which assets belong to the same creative
  concept are all explicit Designer input — the platform doesn't infer any
  of them from filenames or file metadata.
- **`node:20-slim`, not `node:20-alpine`,** for the Docker runtime stage —
  `psd-tools` has known install friction on Alpine.

## Data model

Postgres, see `db/schema.sql` for the authoritative definitions and
`db/migrations/` for how it evolved. Rough shape:

```
clients ─< jobs ─< job_target_placements
                 ─< assets ─< asset_group_members >─ asset_groups
industries                  \
spec_versions ─< spec_dimensions        gap_matrix_entries
                                          (job_target_placement × spec_dimension × asset_group)
prompt_recipes ─< prompt_versions ─< target_prompt_assignment
generation_runs ─< review_decisions
```

## Repo layout

```
app/
  jobs/                        Job List, Job Create, Job Detail
    [id]/AssetInventoryTable.tsx, AssetPreviewRow.tsx    Asset grouping + inline preview
    [id]/generate-actions.ts, review-actions.ts, group-actions.ts
  prompts/                     Prompt Lab (list, create, recipe detail w/ versions+diff)
  api/assets/[id]/preview/     Serves an asset preview (real fetch or PSD flatten)
  api/outputs/[filename]/      Serves a generated candidate's output file
lib/
  drive.ts, drive-fixture.ts   Real Drive client + dev-fixture fallback (same interface)
  classify.ts, gap.ts, retention.ts, routing.ts   Deterministic classification/gap/routing logic
  jobs.ts, assets.ts, asset-groups.ts, specs.ts, gap-matrix.ts   Data access + orchestration
  prompts.ts, generation.ts, reviews.ts   Prompt Lab, Generate/queueing, Approve/Reject
  asset-preview.ts             Preview generation (Drive fetch / PSD flatten)
scripts/
  psd_probe.py                 Canvas size + layer manifest (used during scan)
  psd_preview.py                Flattened PNG preview (used by the preview API)
  video_compress.py            ffmpeg two-pass compression (not wired into any flow yet)
tests/                         vitest — real-ticket fixtures + routing unit tests
db/                            schema.sql, migrations/, seed data, migrate.sh
```
