# S3-002 — Rename a Saved Analysis (#108)

An authenticated owner can open a saved analysis, choose **Rename analysis**, edit
its name, and select **Save name**. Cancel discards the edit. The workspace title,
breadcrumb, switcher, and saved-analysis rail show the saved name after refresh.
The analysis keeps its identity, source URL, place reference, ingestion state,
reviews, and current Q&A state (S3-BR-001 through S3-BR-004).

## Implementation and security

- `PATCH /api/analysis-targets/[targetId]` authenticates before validation or writes.
  Its session-scoped Supabase update filters by both target ID and verified owner.
  Missing and foreign analyses return the same safe 404 response.
- Creation and rename share `validateAnalysisNameInput`: trim whitespace, reject
  blank/invisible-only names, malformed Unicode, unsafe control characters, and
  names over 120 Unicode characters. Additional submitted fields are ignored.
- The repository sends exactly `.update({ name })`. It constructs no SQL strings,
  dynamic SQL identifiers, or user-controlled query expressions. SQL-looking names
  remain literal data; React renders names as text. Validation is independent of
  SQL injection protection: legitimate apostrophes are allowed.
- The migration grants authenticated users `UPDATE (name)` only. RLS checks the
  owner for both the existing and resulting row. There is no table-wide update
  grant and no new privileged client, RPC, or dependency.
- A follow-up policy migration also validates direct Data API updates. It rejects
  control characters, unnormalized format characters, and whitespace/format-only
  names, while preserving usable multilingual/emoji names with ZWJ/ZWNJ. The
  existing database length and NOT NULL constraints remain authoritative.
- The form uses the shared Form/Input/Button components and React Hook Form. It
  retains failed input, associates inline errors with the field, focuses invalid
  input, blocks duplicate submissions, shows progress/success, and aborts stale
  browser work when leaving the page. A refresh preserves unaffected Q&A state.
  Validation reruns on change/blur after the first failed submit; successful saves
  restore keyboard focus once the trigger is enabled. Each retained workspace uses
  unique form/help IDs.

## Database handoff

Apply both migrations in order through the team's normal migration process:

1. `supabase/migrations/20261125000000_allow_owned_analysis_rename.sql` grants
   name-only updates with owner RLS. The user reports already applying this one.
2. `supabase/migrations/20261125010000_validate_owned_analysis_rename.sql` tightens
   that policy to prevent direct-write name-validation bypasses found in review.
   **This follow-up still needs to be applied to shared Supabase.**

Neither migration rewrites stored data. Do not rerun the initial create-policy
migration if it is already applied; run the follow-up policy alteration only.
Existing migrations remain unchanged. Do not apply the test auth shim to Supabase.
This task applied migrations only to disposable local test databases.

## Verification

- Unit regressions: **112 suites, 2,080 tests passed**, including Q&A orchestration,
  scope guards, cross-user isolation, new rename route/client/form tests, validation,
  duplicate submits, and safe failures.
- Full PostgreSQL suite passed against temporary local databases, including real
  owner/foreign/anonymous privileges, source and review preservation, literal
  SQL-looking names, ingestion concurrency, and paid Q&A quota concurrency.
- Lint, typecheck, formatting, build, and migration-version validation passed.
- Changed-line coverage passed at **100%** against the task's starting HEAD.
- Production browser regressions: **17 passed**, including rename, saved analyses,
  target lists/creation, and target switching. Rename preserves the source,
  review content, existing Q&A answer, and draft. Reload/sign-in persistence,
  cross-user rejection, and mobile overflow checks passed. Desktop/mobile
  screenshots were visually inspected.

## Pre-PR functionality and security review

Reproduced and fixed a direct Supabase update that bypassed API validation and
stored an unusable name. Added RLS checks in a separate migration because the
initial migration was already applied. Reproduced and fixed lost focus after a
successful save, missing live revalidation, and duplicate IDs in retained forms.
Regression tests demonstrate each failure before its correction.

Expanded security tests cover literal SQL-looking names, escaped HTML-looking
names, failed-save retry without diagnostic leakage, Unicode boundaries, every
non-NUL C0/C1 control, protected database columns, and browser history. SQL
snapshots verify that source/identity, reviews, ingestion state, and Q&A quota
records remain unchanged. Current Q&A answer/draft preservation is browser-tested;
persistent Q&A history remains outside this story.

The shared Supabase state was not independently inspected. The user reported
applying the initial migration manually; the review migration is tested locally.
Final review coverage: **100% (412/412 changed lines)** against starting HEAD.
All 17 browser regressions passed, including Back to the previously rendered
target list and Forward to the renamed workspace. The final PostgreSQL run also
passed the expanded ingestion and Q&A quota snapshot assertions.

No push, shared database migration, deployment, or CI run was performed.

AI session: [melissa / Codex](../ai-transcripts/2026-11-25_melissa_S3-002_codex.md).
