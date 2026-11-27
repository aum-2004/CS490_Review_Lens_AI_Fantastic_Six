# Security/DB review follow-up — melissa — S3-002 / PR #132

Date: 2026-11-27. Tool: OpenAI Codex. Author: melissa.
Branch: `s3-002`; starting HEAD `2b84ed2`, clean working tree.
Text only, with no images or full local paths. No environment secrets were read.
Prior requirements, UI standards, and the no-push instruction remain in force.

## User

> Reviewer feedback, please address: "@MP Security/DB and functional review: the
> code looks good. Grants, RLS, the ownership check, the 404 handling and the
> late-response guard are all solid. Before I approve:
>
> 1. 20261125000100_allow_owned_analysis_rename.sql:4: add drop policy if exists
> analysis_targets_update_name_own on public.analysis_targets; before create
> policy. As written, it fails if the policy already exists from the manual apply.
> 2. Which rename migrations are already applied to the shared Supabase, and are
> they recorded in schema_migrations? 000100 and 010000 are dated before main's
> 20261126120000, so db push will refuse them. If they aren't applied yet, rename
> them to after 20261127120000. If they are, tell me so we can repair the history
> instead.
>
> Optional nits:
> - [targetId]/route.ts:15: require application/json and cap the body size before
> request.json(), like the questions route does.
> - 20261127000000…sql:9: add and name = btrim(name) so direct database writes match
> the app's trimming.
>
> No migration version collisions. Merge before #134, which adds the same
> route.ts, and before #137."
>
> all supabase migrations have been applied to the database

## Assistant

I’ll use your confirmation that all rename migrations are already applied, make
the initial policy migration safe to rerun, and address the request-validation and
trimming nits. I’ll inspect the available migration-history tooling, but won’t
change shared Supabase or push anything.

## User

> Please make a followup message to the reviewer once done including what has
> been addressed and answering their questions.

## Assistant

I’ll draft the reviewer follow-up here when the checks finish. Your confirmation
answers which migrations were applied; I still need to distinguish that from
whether Supabase recorded them in `schema_migrations`, since running SQL manually
does not establish the history state.

## Read-only history clarification

No Supabase CLI executable, linked project configuration, or database connector
was available. Did not read credentials or attempt a shared database connection.
Asked the user to run this read-only query:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261125000000', '20261125000100', '20261125010000', '20261127000000')
ORDER BY version;
```

The first answer was `"now rows"`. Asked whether that meant "no rows" rather than
assuming a production-history state from a typo. The user clarified:

> I ran "SELECT version, name
> FROM supabase_migrations.schema_migrations
> WHERE version IN ('20261125000000', '20261125000100', '20261125010000', '20261127000000')
> ORDER BY version;" in the SQL editor and it returned "Success. No Rows returned"

Consulted the official Supabase migration-repair reference. Applied SQL and history
records are distinct; the reviewer/database owner should reconcile verified
applied versions as applied, not replay them or move their timestamps. Did not
perform repair, mark a migration reverted, or write shared history. The old
colliding `20261125000000` version now belongs to main's quota migration and must
not be treated as rename history.

## Assistant

Confirmed: you’ve applied the rename SQL, but the history query returned no
matching rows. I’ll keep those migration versions and document that the reviewer
should repair their history entries rather than rename or replay them. The new
trimming rule will go in a separate forward migration, since the earlier SQL is
already applied.

## Accepted implementation and tests

- Added the requested `DROP POLICY IF EXISTS` before the initial policy creation.
  Database regressions replay that file twice with an existing policy, then replay
  the complete hardening chain before checking ownership and name validation.
- Kept the three confirmed-applied versions unchanged:
  `20261125000100`, `20261125010000`, `20261127000000`.
- Added `20261127212801_enforce_trimmed_analysis_names.sql`, after the reviewer's
  cutoff. It enforces `name = btrim(name)` and the equivalent explicit JavaScript
  Unicode trim character set, retaining the existing owner, unsafe-character,
  invisible-only, emoji, and multilingual rules. It changes policy only and
  rewrites neither stored names nor history. This new migration is pending
  application after history reconciliation, not included in the earlier manual
  application confirmation.
- PATCH now requires `application/json` (415 for other types) and uses the same
  bounded streaming JSON helper as questions, with a 4,096-byte cap (413 above
  it). Authentication still runs first; ownership, 404s, and the late-response
  client guard remain unchanged. Input-stream failures return safe errors.
- Unit regressions cover missing/incorrect media types, JSON charset acceptance,
  declared and actual limits, absent/understated Content-Length, cancellation,
  exact byte boundary, multibyte bytes, malformed JSON, and broken streams. The
  focused rename route suite passed **41 tests**.
- Database tests also reject ASCII/Unicode boundary spaces in direct updates,
  retain valid Unicode names, and preserve source/review/ingestion/Q&A snapshots.

## Assistant

The policy replay and trimming regressions passed on PostgreSQL 16, and the
bounded-JSON request tests passed. I’ve kept the three applied migration versions
and added a later migration for trimming, so no history repair or SQL replay has
been performed on shared Supabase.

I’m finishing the full regression run and the reviewer reply.

## Validation and handoff

The full disposable PostgreSQL 16 suite passed, including policy replay, trimming,
Unicode, owner isolation, source/dataset preservation, quotas, deduplication, and
concurrency. Lint, typecheck, formatting, migration-version checks, and production
build passed. Full unit coverage and browser regressions are recorded after they
finish. Temporary normalized shell copies and a dedicated test cluster are used
only locally; the test cluster is stopped/dropped by cleanup.

Updated the implementation guide with the confirmed applied/unrecorded status,
history-repair handoff, and pending forward trimming migration. The reviewer reply
will be drafted in chat, not posted automatically. Noted the requested merge order
before #134 and #137; no remote merge, push, history repair, or shared SQL action
was performed. This transcript includes melissa and no images/full local paths.

## Assistant

All 9 browser regressions passed, including rename, saved analyses, ownership,
and Q&A preservation. The history status is now documented as **applied but
unrecorded**; the reviewer reply will name the three versions needing repair and
distinguish the new trimming migration that is still pending.

## Assistant

The request tests cover absent or understated `Content-Length`, multibyte UTF-8
bodies, and the exact size boundary. They confirm rejection before database
access. The migration test also replays the initial policy twice and restores the
full hardening chain, exercising the manual-apply case.

## Assistant

All checks passed: 2,198 unit tests, 9 browser regressions, the full PostgreSQL 16
suite, build, lint, typecheck, formatting, and migration validation. Changed-line
coverage is 100%.

I’m recording the final results, then I’ll provide the reviewer reply with the
applied-but-unrecorded history status and the pending trimming migration called
out explicitly.

## Final local results

- Full unit/coverage suite: **117 suites, 2,198 tests passed**, exit 0.
- **9 production browser tests passed**. Full PostgreSQL **16.16** suite passed,
  including policy replay, ASCII/Unicode trimming, invisible-name and multilingual
  cases, grants, owner isolation, saved data integrity, quotas, and deduplication.
- Lint, typecheck, formatting, production build, and migration-version checks
  passed. No version collisions. Coverage gates passed at **100% (431/431)**
  against local `origin/main`, and **100% (21/21)** for this update against HEAD.
- Stopped only the two local browser test servers started for this run. The
  temporary PostgreSQL cluster was stopped/dropped by its cleanup trap. Removed
  the six temporary normalized runner files; no tracked runner was modified.
- An attempted final documentation patch had a nonmatching context line and made
  no changes. Inspected both file endings and reapplied the append with the exact
  context. No implementation or test result was affected.
- Kept existing applied versions; no history repair or shared SQL execution was
  performed. The new trimming migration remains pending proper application after
  history reconciliation. Nothing was pushed or remotely merged; hosted CI for
  these local changes has not run. The reviewer follow-up is delivered in chat
  only, not sent automatically or saved as a separate PR-message file.
