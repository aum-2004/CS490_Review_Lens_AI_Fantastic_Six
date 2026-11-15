# S2-009 migration-version review fix — 2026-11-14

Author: melissa. AI assistance: Codex. Responds to the migration collision review
of PR #84 at `6a4e483`.

## Shared deployment state before rename

The user ran the requested read-only queries in the shared Supabase project and
reported no errors:

- `supabase_migrations.schema_migrations` returned **no rows** for version
  `20261113000000`, names containing `limit_paid_review_questions`, or names
  containing `review_summary`.
- `to_regclass('public.review_question_reservations')` returned **NULL**.
- `to_regprocedure('public.reserve_review_question()')` returned **NULL**.

This is user-supplied hosted evidence, not a claim that Codex accessed the shared
database. It supports treating the quota as unapplied/unrecorded, including no
manually installed quota table or function. No hosted SQL, migration history repair,
deployment or destructive database command was executed by Codex.

Renamed only the unapplied quota migration from the colliding version to
**`20261115043442_limit_paid_review_questions.sql`**. The version is a UTC timestamp
(the review work was still November 14 in America/New_York). The new prefix was
checked against local migrations and all fetched remote branch migration lists.
The SQL blob is unchanged: `3661b511b3a9408af26e2e89aa51497c3f9676ae`.
S2-006's **`20261113000000_create_review_summary.sql`** stays unchanged on its
branch (`533b78f`); no S2-006 source or migration was imported into this PR.

Do not repeat this rename blindly in another environment where the original
version was applied or recorded. Inspect that environment's history first and
coordinate an explicit history-preserving deployment plan with the team.

## Automatic version preflight

`npm run check:migrations` reads migration filenames, requires the
`YYYYMMDDHHMMSS_name.sql` format and rejects duplicate 14-digit versions even
when the descriptive suffix differs. An empty/unreadable directory fails closed.
It uses Node built-ins and adds no dependency or install script.

- Application CI runs the preflight explicitly.
- `tests/db/run.sh` runs it **before creating a database or executing SQL**.
  Database CI now explicitly installs Node 24 via the existing baseline setup.
- The validation logic is in a coverage-measured TypeScript module. A thin ESM
  entry point is exercised by real subprocess tests; no coverage policy changed.
- Twelve Jest cases include the exact original 006/009 filenames and verify that
  their combined directory exits 1 with both names/version in the error. Replacing
  only the quota version makes the same pair pass. Tests cover invalid names,
  empty/unreadable directories, ignored docs/directories, and the real CLI default.

The old quota filename remains only in the intentional collision regression and
historical AI transcripts. Active deployment references use the new filename.
This check catches collisions in the current/combined checkout; it cannot reserve
timestamps globally across unmerged branches or prove hosted migration history.

## Local validation

The full database/RLS suite was run in a disposable local PostgreSQL 18 database
with an exact temporary copy of S2-006's summary migration plus the renamed quota.
The copy's Git blob matched S2-006 and was removed afterward; the runner cleaned
up its disposable database. All SQL tests and both concurrency regressions passed,
including exactly five allowed/seven denied paid-Q&A reservations.

- **1,314 Jest tests / 72 suites passed**, including the 12 migration checker cases.
- Changed-code coverage passed: **542/549 lines (98.72%)**, migration validator
  **34/34 (100%)**, and changed Q&A service lines **33/33 (100%)**.
- Lint, typecheck, production build, formatting and whitespace checks passed.
- Database validation was repeated after converting the CLI to the repository's
  lint-compliant ESM style, again using the unchanged summary migration.
- No package version, lockfile, production Q&A source or SQL-content change.
  No live model request or hosted deployment was used. Current-head GitHub CI is
  checked after publishing; its remote result is not fabricated in this local record.

Keep **`QA_ENABLED=false`** until the renamed quota migration is deployed through
the team's approved workflow and hosted RPC/RLS checks pass. Request current-head
normal/security reconfirmation after the fix is pushed and its CI finishes.

Official guidance: [Supabase migration-order troubleshooting](https://supabase.com/docs/guides/deployment/branching/troubleshooting#migration-order-problems).
Original available dialogue (melissa; filesystem paths redacted):
`ai-transcripts/2026-11-14_melissa_S2-009_migration-versions_codex.md`.
