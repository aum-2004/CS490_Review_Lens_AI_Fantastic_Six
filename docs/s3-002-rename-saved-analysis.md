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

Melissa confirmed that these three rename migrations are already applied to shared
Supabase:

1. `20261125000100_allow_owned_analysis_rename.sql`
2. `20261125010000_validate_owned_analysis_rename.sql`
3. `20261127000000_reject_invisible_only_analysis_names.sql`

Her read-only query of `supabase_migrations.schema_migrations`, filtering those
versions and the former `20261125000000` version, returned **Success. No Rows
returned**. The applied rename work therefore needs history reconciliation, not
new timestamps or replay. This is user-confirmed shared state; the agent has not
connected to the shared database or repaired its history.

The database owner should inspect the complete migration list for the intended
project, mark the three verified-applied rename versions as applied using the
CLI's history-repair workflow, and check the migration list/dry run again before
`db push`. Do not treat version `20261125000000` as the renamed grant: that version
now belongs to main's quota migration, whose history needs separate verification.
Do not force replay of already-applied SQL just to bypass out-of-order checks.
See [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).

`20261127212801_enforce_trimmed_analysis_names.sql` is a **new, pending forward
migration**, later than `20261127120000`. It adds canonical trimming, including
Unicode boundary whitespace, while retaining ownership and existing safety rules.
Apply it normally after the existing history has been reconciled; it was not part
of Melissa's earlier confirmation. It rewrites no names or history rows.

The initial grant now drops its policy if it exists before creating it, allowing
chronological replay of the rename chain. Do not replay that initial owner-only
policy alone over the hardened shared policy; the later hardening files must
follow it. Tests replay the initial grant twice and then the complete hardening
chain. The agent applied migrations only in disposable local test databases.

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

## CI migration collision — 2026-11-27

PR #132's application and database checks both stopped at migration-version
validation after main added `20261125000000_increase_review_question_quota.sql`.
That version collided with the initial rename grant. Renamed the grant to
`20261125000100_allow_owned_analysis_rename.sql`, keeping its SQL byte-for-byte
equivalent after newline normalization and preserving policy creation order.
The already-applied rename SQL does not need to be rerun because of this rename.

Merged main through `a507ba1` locally and verified the combined tree: migration
validation, lint, typecheck, formatting, production build, **117 unit suites /
2,187 tests**, and the full PostgreSQL **16.16** database suite passed, including
quota, deduplication, migration cleanup, and rename/Unicode regressions. The
changed-code coverage gate passed without altering thresholds. Shared Supabase
was untouched; hosted CI requires publishing the resulting local merge commit.

CI investigation transcript: [melissa / Codex](../ai-transcripts/2026-11-27_melissa_S3-002_ci_codex.md).

## Security/DB reviewer follow-up — 2026-11-27

Added the requested `DROP POLICY IF EXISTS` before initial policy creation, with
regressions replaying the initial grant twice and the subsequent hardening chain.
The shared history query and applied status are recorded in Database handoff
above; no shared history repair or timestamp changes were performed.

The rename endpoint requires `application/json` and bounds the raw body at 4,096
bytes using the existing questions-route streaming helper. Wrong media types
return 415; oversized declared or actual bodies return 413 before persistence.
Tests cover missing/understated Content-Length, cancellation, UTF-8 bytes, the
exact boundary, malformed JSON, and safe stream errors. The existing owner filter,
404 shape, name validation, and client late-response guard remain intact.

The pending forward trimming migration preserves all prior RLS checks and tests
both ASCII and Unicode boundary whitespace. It is after `20261127120000` and does
not rename the already-applied migrations or rewrite stored names.

Final local validation: **117 suites / 2,198 unit tests**, **9 production browser
tests**, full PostgreSQL **16.16** security/concurrency/migration tests, lint,
typecheck, formatting, production build, and unique migration versions passed.
Changed-line coverage passed at **100% (431/431)** against local `origin/main`
and **100% (21/21)** for this review update against starting HEAD `2b84ed2`.
No push, shared SQL/history write, hosted CI run, or remote PR merge was performed.
The requested merge priority is #132 before #134 and #137.

Review transcript: [melissa / Codex](../ai-transcripts/2026-11-27_melissa_S3-002_db_review_codex.md).
