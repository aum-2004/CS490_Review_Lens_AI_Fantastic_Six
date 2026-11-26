# S3-005 — Delete an Owned Analysis

Issue: #111. Baseline: `3538ea9f` (main, including S3-013). Author: Shawn.

## Behavior and persistence decision

The owned workspace offers **Delete analysis**. A native modal names the analysis, explains
irreversibility and audit retention, and initially focuses Cancel. Cancel and Escape do not send
a request. Confirmation makes one DELETE request; failures keep the dialog available for retry
and show a fixed safe message. Successful deletion makes a full navigation to My Targets so
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

- **Melissa / S3-002 (#132):** Both stories add a workspace management action and a parent target
  route. Merge both PATCH and DELETE exports; preserve both Rename and Delete actions in the
  PageHeader action area. Do not replace either feature with the other.
- **Deep / refresh:** `ingestion_attempts.analysis_target_id` is nullable only for retained audit
  rows after parent deletion. The row type and callback read handle this explicitly. Preserve
  parent ownership checks on refresh/bind/completion and never promote a detached attempt.
- **Aryan / Save As and history:** Copies need their own review rows/identity so deleting one
  cannot remove the other's data. New history tables must define their target FK deletion policy.
- Migration version `20261126000000` is independent of the existing quota/rename version collision.
  Recheck all pending versions and remote migration history before deployment.

## Deployment and acceptance

No hosted migration or provider configuration is changed by this work. Deploy the reviewed
migration before exposing the delete UI; the old app tolerates the schema change because live
target attempts remain attached. A new app against an unmigrated database fails safely when the
RPC is unavailable. Do not restore raw table DELETE privileges as a workaround.

Required human checks before final acceptance:

1. Apply only the reviewed pending migration through the team's authorized deployment process.
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

The resolution is local pending authorization to push the updated branch. Normal/security
reviews, authorized migration deployment and human acceptance remain required.
