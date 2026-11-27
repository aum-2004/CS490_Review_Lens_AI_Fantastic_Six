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

## PR #132 reviewer follow-up — 2026-11-27

The reviewer reproduced visually blank names containing U+034F (CGJ) and U+FE0F
(variation selector). Both are default-ignorable characters outside the `Cf`
category, so the old validator and database policy accepted them. New regressions
reproduced HTTP 200 from the rename API and a successful direct owner update.

The shared creation/rename validator now excludes Unicode
`Default_Ignorable_Code_Point`, `Cf`, and whitespace from its meaningful-content
test. This does not remove selectors or marks from a valid saved name. Positive
tests preserve decomposed accents, Devanagari, CJK variation sequences, emoji
presentation selectors, and existing ZWJ/ZWNJ names.

Apply `supabase/migrations/20261127000000_reject_invisible_only_analysis_names.sql`
after both preceding rename migrations. It updates only the rename RLS policy,
keeping ownership and unsafe-character checks while adding the equivalent content
test through explicit Unicode 17.0 ranges. Earlier applied migrations remain
unchanged; no existing rows are rewritten. This migration has not been applied
to shared Supabase by the agent.

Regressions cover the reported characters, whitespace/joiner mixtures,
supplementary variation selectors, Hangul fillers, and Mongolian selectors in
validation and direct authenticated database updates. Creation and rename APIs
reject unusable names before persistence. The browser test also verifies inline
rejection and saves a visible accented/emoji name without changing its selectors.

CI checks are run locally. Hosted CI for the changed code requires a push; the
no-push instruction remains in force. No hosted-CI success is claimed.

Review transcript: [melissa / Codex](../ai-transcripts/2026-11-27_melissa_S3-002_review_codex.md).

Final local results: **115 unit suites / 2,119 tests**, **9 production browser
tests**, and the full PostgreSQL security/concurrency suite passed. Lint,
typecheck, formatting, production build, and migration-version checks passed.
Changed-line coverage passed at **100% (416/416)** against local `origin/main`,
and **100% (4/4)** for the reviewer fix against starting HEAD `de2ecd6`.
