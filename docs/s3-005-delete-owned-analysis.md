# S3-005 — Delete an Owned Analysis

Issue: #111. Baseline: `3538ea9f` (main, including S3-013). Author: Shawn.

## Behavior and persistence decision

The owned workspace offers **Delete analysis**. A native modal names the analysis, explains
irreversibility and audit retention, and initially focuses Cancel. Cancel and Escape do not send
a request. Confirmation makes one DELETE request; failures keep the dialog available for retry
and show a fixed safe message. A 404 also returns to My Targets because the analysis is no longer
available; it does not display a deletion-success claim or parse the error body. Successful deletion makes a full navigation to My Targets so
Next's preserved workspaces, answers and sidebar state are discarded. Browser-history access
to the deleted URL must still pass the server ownership check and cannot retrieve its data.

Proposed S3-BR-008 persistence design, subject to normal and independent security review:

| Data                          | Deletion behavior                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Owned `analysis_targets` row  | Permanently deleted by a narrow authenticated RPC                                                                      |
| Associated `reviews`          | Deleted by the existing `ON DELETE CASCADE` FK                                                                         |
| `ingestion_attempts`          | Retained for billing/safety; FK becomes null through `ON DELETE SET NULL`                                              |
| Paid Q&A reservations         | Retained; account-scoped, already independent of the target                                                            |
| Transient Q&A / sidebar state | Discarded by full navigation after success                                                                             |
| Future persisted Q&A history  | Not on this baseline; history owner must add a target FK with cascading deletion or an explicitly reviewed alternative |

Retained ingestion records include existing source/job snapshots; this is **not** an erasure of
every historical audit field. Existing RLS requires a live owned parent, so detached audits are
not readable by browser sessions. They still count toward the existing five-start rolling quota.
Deleting and recreating targets cannot refund ingestion or Q&A spending reservations. Account
deletion retains its existing owner-FK cascades.

## Security boundaries

- **S3-BR-007:** The DELETE handler verifies the current session and runs the existing owner-scoped
  lookup before attempting deletion. Missing, malformed and foreign IDs return the same 404.
- The body and query parameters cannot supply ownership or choose a different target.
- Cross-origin browser mutations are rejected; DELETE is not supported by ordinary HTML forms.
  Forwarded-host lists use only the first trimmed value, following Next's Server Actions convention.
  A later matching value cannot authorize a mismatched first host. The deployment proxy must replace
  untrusted incoming forwarded headers; this comparison does not authenticate a proxy.
- The session-scoped client calls `delete_owned_analysis(p_target_id)`; no service-role client or
  client-supplied owner is used. The database derives the owner from `auth.uid()` and checks it
  inside the DELETE statement, closing the lookup/write race.
- Direct table DELETE remains revoked. The RPC is granted only to authenticated sessions and
  fails without `auth.uid()`. It uses an empty search path and qualified table/function names.
- The target delete, review cascade and audit detachment are one database transaction.
- Detached attempts are unavailable to callback recovery. The database lifecycle functions also
  require a live owned target and reject late binding/completion after deletion.
- Responses are private/no-store; failures/logs do not include database diagnostics, user input
  or credentials. Target names remain escaped React text.
- Duplicate clicks are guarded synchronously. Hidden/unmounted workspaces abort their request
  and ignore late success, so old deletion responses cannot navigate a newly active workspace.
  Aborting a browser request does not promise to cancel a database mutation already committed.

## Integration handoff

- **Melissa / S3-002 (#132):** Main `ba45c37a` is reconciled locally. The parent route exports both
  PATCH and DELETE, and the workspace preserves both Rename and Delete controls. The shared
  browser fixture preserves rename handling, original review text and the dedicated deletion
  dataset. The deletion browser scenario renames its target first and confirms the new name in
  the destructive dialog before deleting it.
- **Deep / refresh:** `ingestion_attempts.analysis_target_id` is nullable only for retained audit
  rows after parent deletion. The row type and callback read handle this explicitly. Preserve
  parent ownership checks on refresh/bind/completion and never promote a detached attempt.
- **Aryan / Save As and history:** Copies need their own review rows/identity so deleting one
  cannot remove the other's data. New history tables must define their target FK deletion policy.
- Deletion version `20261126000000` and audit-reconciliation version `20261126010000` precede
  rename versions reported as already recorded remotely. Their availability locally does not
  establish that a normal migration push can apply them in order. Follow the deployment review below.

## Deployment and acceptance

No hosted migration or provider configuration is changed by this work. Deploy the reviewed
migration before exposing the delete UI; the old app tolerates the schema change because live
target attempts remain attached. A new app against an unmigrated database fails safely when the
RPC is unavailable. Do not restore raw table DELETE privileges as a workaround.

Before an authorized hosted deployment:

1. Capture the shared project's recorded migration versions/names with `supabase migration list`
   or a read-only query of `supabase_migrations.schema_migrations`. Ask the operators separately
   about SQL Editor changes, which might not have been recorded in that table.
2. Compare that history with all pending repository migrations, including quota, deduplication,
   deletion and audit reconciliation. The deletion migration must precede audit reconciliation.
   If either deletion migration is unapplied and older than the remote head, obtain a reviewed
   forward-version change or an explicitly approved out-of-order deployment plan. Do not rename
   an already applied migration or repair history merely to silence a mismatch.
3. Review the linked CLI's dry-run output and record the exact intended migration list before
   applying it. Do not use an unreviewed blanket push or assume it deploys only S3-005. Preserve
   the Q&A-disabled rollout sequence in `docs/s3-qa-quota-30.md` if quota changes are pending.
4. Apply the approved database changes before exposing deletion controls, then perform authorized
   two-user deletion, retained-audit/quota and late-callback checks. Record the deployed application
   and migration versions. No shared-project history, dry run or hosted acceptance is claimed here.

### Pause/rollback and retained audits

This feature has no deletion environment toggle. An authorized operator can pause all
authenticated deletion (including direct Data API RPC calls) by revoking EXECUTE on
`public.delete_owned_analysis(uuid)` from `authenticated`. Existing API calls then fail safely.
Remove the Delete action through a reviewed deployment if rolling back its UI. Retain the
nullable-audit/callback handling and schema while detached rows exist. Re-enabling RPC execution
requires an approved grant and a recorded deployment decision. These are runbook instructions;
no hosted grants or deployments have been changed here.

Do not blindly reverse the migration: retained null-FK audit rows prevent restoring NOT NULL,
and changing the FK back to cascade would erase audit/usage records on later deletions.
Application rollback does not restore deleted analyses/reviews. Any data recovery needs the
team's authorized backup/recovery process and a review of ownership and associations.

There is currently **no automatic audit purge or retention expiry**. The rolling 24-hour quota
window is not an audit deletion policy. Team sign-off must acknowledge retained source/job
snapshots, restricted access and the absence of an automatic cleanup schedule; a later retention
policy needs its own review. Never remove a recent reservation to make a failed job retryable.

The existing `resolve_ingestion_no_job` operator function still requires a live parent.
The separate forward migration `20261126010000_reconcile_detached_ingestion_audits.sql` adds
`reconcile_detached_ingestion_attempt(attempt_id, owner_id, evidence_reference)` for service-role
operators only. It accepts only detached records with the recorded owner, locks the row, and
records `resolution_reference` and `resolved_at`. It leaves status, error code, job IDs, snapshots,
reservation timestamps and quota unchanged, including for processing jobs. This records an
operator's reconciliation evidence; it does not assert that a provider completed or refunded a job.
Ordinary bind/completion parent checks remain unchanged and detached jobs cannot resume.

An authorized operator must first independently confirm the provider/billing disposition and
record it in the restricted incident process. Pass only that ticket/reference (1–500 characters),
not credentials or provider payloads, using the team's approved administrative tooling. No browser
endpoint or new service-key configuration is introduced. A repeat with the same trimmed reference
returns the existing record unchanged; a different reference is rejected to preserve the audit.
Inspect retained job/owner/quota fields afterward. Neither function verifies the ticket's contents;
the operator is responsible for that evidence. Deploy only after review and team retention sign-off.

Required human checks before final acceptance:

1. Apply the reviewed pending deletion and detached-audit migrations in timestamp order through
   the team's authorized deployment process. Check remote history first; do not reapply recorded versions.
2. With disposable owned data, Cancel, then delete an analysis with saved reviews; verify it is
   absent after reload and direct retrieval is denied. Do not test on valuable shared data.
3. With another account, verify deletion is denied and both datasets remain intact.
4. Inspect retained audit/quota behavior using approved read-only checks; do not start paid jobs.
5. Obtain normal and independent authorization/database security review, passing CI (including
   PostgreSQL and concurrency jobs), and final author/manual acceptance before closing #111.

## Verification record

Final local source snapshot:

| Check                                                             | Result                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Full Jest coverage                                                | 112 suites / 2,086 tests passed; no skips                                                                                |
| Overall line/statement coverage                                   | 96.17%; branches 93.81%; functions 95.32%                                                                                |
| Changed-code gate                                                 | Passed: 230/230 changed source lines; 73/74 branch outcomes                                                              |
| Production build                                                  | Passed, including TypeScript; 12/12 static pages                                                                         |
| ESLint, source/test formatting, whitespace and migration versions | Passed                                                                                                                   |
| New production browser scenario                                   | Passed: confirmation, cancel/Escape, safe failure/retry, two accounts, deletion, reload, direct denial and mobile layout |
| Full production auth/workspace browser suite                      | 42 passed / 2 known baseline failures, described below                                                                   |
| Database assertions                                               | All 10 migrations and all 13 SQL assertion files passed in disposable PGlite 0.6.0                                       |

SQL verification includes actual roles, RLS, functions, review cascade, retained quotas and late
callback/completion denial. This is local WASM PostgreSQL execution, not hosted Supabase
acceptance or the two-session shell concurrency runner. A separate test helper needed nullable
audit handling; typecheck and existing summary/Q&A integration tests pass with that adjustment.

Two unchanged scenarios at `tests/e2e/auth/analysis-targets.spec.ts:99` and `:177` still expect the
old `Target created. You can now start ingestion.` banner. The created workspace opens correctly.
These failures were independently reproduced during S3-014 verification on unchanged main
`24f083fb`; the creation form/notice and these test files are unchanged through this baseline
`3538ea9f`. They were not weakened or silently repaired in S3-005. The complete browser suite is
not reported as green.

The first deletion browser runs caught an overly strict internal-Origin comparison. It was
corrected to compare browser Origin to Host/forwarded Host, matching Next's documented pattern,
with malformed, foreign and forwarded-host regression cases. Two browser-test-only corrections
account for document replacement discarding the response body and the sidebar rendering an
empty region instead of a navigation list after the final analysis is removed. Final checks
assert HTTP success, actual navigation, empty state and unavailable direct retrieval.

Mobile/desktop dialog screenshots are kept in the isolated checkout's ignored `test-results`
directory and were visually inspected on mobile. No screenshots/traces/generated reports are
included in the repository changes.

Two in-memory SQL mutations were caught independently: removing the RPC owner predicate fails
the foreign-user assertion; replacing audit detachment with cascade fails the retained-budget
assertion. Neither mutation was written into the repository migration.

No paid provider calls, real credentials or shared Supabase writes were used. PGlite was installed
in a temporary tools directory with install scripts disabled; it is not a project dependency.

AI assistance: OpenAI Codex. The complete available task dialogue/tool records are retained in
`ai-transcripts/2026-11-26_shawn_S3-005_codex.md`, with privacy redactions and a stated cutoff.

## Main reconciliation after S3-014 merged

Merged main `afa7e1bd` (S3-014 / #133) into S3-005 locally. The only merge conflict was in
`tests/fixtures/auth-provider.mjs`: both stories added dedicated fixture declarations in the
same locations. The resolution retains both accounts, both target datasets, all seven
supporting-review rows and the deletion RPC fixture. The supporting account remains at index 6;
the deletion account is appended afterward and its target uses an explicit owner UUID.
Existing accounts' records and counts are unchanged. No deletion API/service, migration,
authorization or spending-limit logic was changed by this resolution.

Post-resolution checks:

- Full Jest: 114 suites / 2,097 tests passed; no skips.
- Production build (including TypeScript), ESLint and migration version checks passed.
- Ten production browser tests passed together: S3-005 deletion, S3-014 supporting-review
  expansion, and the existing target-workspace security/status cases.
- Both stories' source and tests were loaded together; neither side was discarded to resolve
  the conflict. The full auth browser suite was not repeated for this fixture-only resolution;
  the two previously documented creation-banner failures remain tracked.
- The original coverage results above describe the original S3-005 implementation. This
  reconciliation does not claim a fresh coverage run; new-head GitHub CI must run after push.

The resolution was pushed as `16743902` after the author's authorization. CI #289 passed on that
head. Deep recorded functional and security/DB PASS findings in a PR comment. Team retention
sign-off and another reviewer for the normal review under the project's two-reviewer security
process remain pending; GitHub currently shows no formal approval reviews. Authorized migration
deployment and human acceptance are not claimed by those automated results.

## Deep review follow-ups — November 27 (local, not pushed)

- Added the service-role-only detached audit reconciliation function in a separate forward
  migration. Evidence is immutable after recording; the job state and usage reservation are
  preserved. No hosted migration was applied.
- DELETE 404 returns to My Targets without parsing the body or reporting deletion success.
  Hidden/restored workspaces ignore late 404 responses as well as late success responses.
- Forwarded-host parsing uses the first trimmed value. Tests reject empty/invalid first values
  and a matching second value when the first does not match Origin.
- The rollback and retention runbook above explicitly describes retained snapshots, absence of
  an automatic purge, deployment order and administrative evidence handling.

Verification for these follow-ups:

- Full Jest without coverage instrumentation: 114 suites / 2,107 tests passed; no skips.
- Focused Jest: 48 tests passed. Both changed application files have 100% line/statement coverage;
  combined branch coverage is 98.41%. This is focused coverage, not a new repository-wide percentage.
- Production browser tests: both deletion scenarios passed, including an empty-body 404. The first
  new browser run used the coffee-shop fixture ID while expecting the bakery heading; correcting
  that test ID resolved the failure without production changes.
- All 11 migrations and all 14 SQL assertion files passed in disposable PGlite. The new assertions
  cover privileges, missing/foreign/attached records, bounded evidence, unchanged lifecycle fields,
  immutable/idempotent reconciliation, retained quota and denied late binding.
- Four in-memory SQL mutations were caught: missing owner filter, missing detached-only filter,
  changed reservation timestamp and browser EXECUTE permission. No mutated SQL was deployed.
- ESLint, production build (including TypeScript), targeted formatting, migration-version checks
  and whitespace checks passed. A fresh complete coverage attempt consumed prolonged CPU without
  producing results and was stopped; the focused coverage result above does not replace it.

Team S3-BR-008 sign-off, current-head reviews/CI and authorized hosted acceptance remain required.
The two baseline creation-banner failures are tracked by PR #139, which updates only those test
assertions. That PR is not merged into this branch; do not describe the complete browser suite as
green until the correction is merged or verified as an explicitly identified temporary combination.

## Reconciliation with current main — November 28 (local)

Main `ba45c37a` is included through local merge commit `de9b4e9a`. The three conflicts were resolved
without discarding either story: PATCH/DELETE share the target route, both management controls
render, and the fixture keeps original review evidence after rename plus the dedicated deletion
account. The saved review follow-ups were restored afterward; their original stash remains intact.

S3-011's fake completion writer now rejects a null parent before merging rows. Previously its
non-null target parameter caused TypeScript to fail after combining the two stories, and the fake
writer could fabricate a successful completion for a detached audit. The added regression checks
that rejection leaves both stored reviews and the reservation unchanged. Temporarily removing
the null-parent guard makes that regression fail; restoring it passes. Production SQL already
requires a live owned parent, so this fixes test compatibility without loosening that boundary.

Verification of the reconciled source snapshot:

- Full Jest: **119 suites / 2,252 tests passed**, no skips.
- Focused rename/delete/workspace/deduplication tests: **150 passed**.
- Production browser: **13 passed** together across deletion, rename, supporting reviews and
  workspace behavior. Deletion explicitly renames its target first, preserves its review text,
  checks the renamed confirmation, and verifies removal. This is not a full authentication-suite run.
- Production build, including TypeScript, ESLint, repository formatting, migration-version and
  source/test/documentation whitespace checks passed.
- Focused route/UI coverage: **100% statements and lines (263/263), 76/77 branches**. This includes
  PATCH and DELETE and is not a fresh repository-wide coverage percentage.
- Deletion, detached reconciliation, Q&A quota, ingestion safety/budget and review-security SQL
  assertions passed after applying the local migration chain in disposable PGlite. Its PostgreSQL
  19 parser required an **in-memory quoting workaround** for the pre-existing S3-011 `merge_action`
  identifier. No repository SQL was changed for that workaround. These results do not certify the
  unmodified migration chain on hosted PostgreSQL or replace CI's PostgreSQL/concurrency checks.

No shared Supabase changes, provider calls or GitHub writes were performed. Current-head remote CI,
re-review, team retention sign-off and the authorized deployment/acceptance plan remain outstanding.
