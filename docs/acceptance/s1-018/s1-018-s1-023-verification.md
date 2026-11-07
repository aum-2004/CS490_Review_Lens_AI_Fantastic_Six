# S1-018 / S1-023 local verification

## Latest normal-review follow-up to 40af2a3

629 unit tests / 47 suites and all nine SQL files plus the two-session concurrency
test across six migrations passed. PostgreSQL 18 accepted dense metadata with
16,306 bytes of compact JSON and over 16 KiB of jsonb::text, atomically saving the
review and finalizing the attempt. The app retains its 16 KiB compact metadata
limit; new migration 030000 allows 32 KiB of PostgreSQL-rendered metadata.

Independent SQL failures cover review_url (2,049), source_review_id (257) and
review_date (65), with accepted 2,048/256/64-character boundaries and valid timestamp
parsing. App tests reject review_url (2,049) and reviewer_name (201), accepting their
2,048/200 boundaries. Removing each of these five guards causes its respective
test failure. Restoring the old 16 KiB SQL metadata threshold also fails the dense
success case. The restored cross-user getExtractedReviews assertion passes.

The original AI dialogue is retained in the continuation transcript and must be
included in the next commit. Fresh CI, normal approval and independent §7 security
approval must apply to the final published head. No commit, push, GitHub change,
hosted migration, paid call or live provider storage was performed. Keep Refs #18
and Refs #23 until hosted verification. Previous checkpoints follow.

## Latest §7 re-review follow-up to 40af2a3

The real PostgreSQL 18 suite passed all nine SQL files across six migrations and
the new two-session owner-budget test. The test holds reservation five open on
one target, observes reservation six waiting on the owner advisory lock in another
session, then commits five and requires INGESTION_START_LIMIT. A separate baseline
passed; removing the advisory lock caused the expected sixth-reservation failure.
The CI database runner now includes this test. Existing 010000 is byte-for-byte
restored to e69f084, with completion limits in new migration 030000 so existing
databases receive the replacement function. The limits SQL suite executes only
after the ordered migrations and verifies independent count/size/field rejection.

625 unit tests / 47 suites, lint, typecheck, formatting and production build passed.
Flat/nested provider and persistence-boundary tests verify businessName, googleId
and locationLink NUL cleaning. The streaming test is finite (2 MiB + 1 byte), with
no prefetch so cancellation is observable. The earlier browser pass of 22 tests is
historical evidence; this server-only correction did not rerun browsers.

A streamed-byte-guard mutation was rejected by an assertion in approximately two
seconds (a 20-second outer bound ensured timeout would count as a failure of the
probe). The final expanded lifecycle suite passed all 42 tests. A direct byte
comparison confirms 010000 exactly matches the file at e69f084.

The local PostgreSQL tools were installed in WSL for these throwaway database
tests; no project dependency or hosted database changed. No paid calls, real
provider storage, commit, push or GitHub edit. The local PR description and reply
are ready to copy. Fresh PostgreSQL 16 CI and independent §7 re-review remain
required. The per-account cap does not provide a global budget; the team must
record its global spend-control decision before enabling ingestion. Live flags
remain off; issue closure awaits hosted verification.

## Latest §7 security follow-up to e69f084

625 tests across 47 Jest suites, all 22 Edge browser tests, all nine SQL files across
five migrations, lint, formatting, typecheck and production build passed locally.
Private server configuration identifiers were absent from browser-delivered JS.
The isolated PGlite mutation baseline passed; all eight weakened variants failed:
browser deletion restriction, each attempt/parent owner predicate in both expiry
RPCs, owner reservation cap, completion review count and completion JSON byte cap.
Existing tests also cover authenticated denial of operator-note columns.

New SQL coverage proves uncertain/succeeded targets cannot be deleted by owners,
audit/review rows survive, expiry RPCs reject foreign owners, owner budgets are
isolated and age out after 24 hours, and oversized completions insert no partial
reviews. Unit coverage exercises actual streamed-body limits, malformed/lying
lengths, provider business-name NUL cleaning, safe cap mapping, retained accepted
job holds and disabled refresh before database/provider work.

All provider responses were synthetic. No paid job, real provider storage, hosted
migration, commit, push or GitHub edit was performed. Local PGlite verification does
not replace native PostgreSQL CI. The next published head needs fresh CI and §7
security re-review, with all three ingestion migrations, recovery configuration and
recorded storage approval required before live use. Keep Refs #18 / Refs #23 until
hosted verification. See docs/pr-48-security-review-response.md for the local reply.

Original verification: 2026-11-06, America/New_York. Branch: `s1-018`.
PR #48 baseline: implementation `0558509`, published; CI #112 was independently
verified green through GitHub's check-runs API, including PostgreSQL. Main through S1-015 `e8839ef` was then integrated
in merge commit `366dc01`. Follow-up results are recorded below; historical counts
are retained as checkpoints rather than claims about the corrected head's remote CI.

Current local review target: `e5ce0c3`, which commits the review corrections and
creation/workspace integration. References below to uncommitted fixes describe the
earlier implementation checkpoint. Current-head remote CI and publication were
not inspected in this latest review, and no GitHub operations were performed.

## Checks

- Jest: 42 suites, 541 tests passed after integrating merged S1-019 commit `0388c43`.
- TypeScript: `npm run typecheck` passed.
- ESLint: `npm run lint` passed.
- Prettier: `npm run format:check` passed.
- Browser regression: 20 tests passed with installed Microsoft Edge using
  `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e:auth` (PowerShell env syntax locally).
- SQL: the auth shim, all three migrations and all six SQL test files passed in
  isolated PGlite PostgreSQL. The runner strips only psql meta-command lines before
  execution. Native PostgreSQL 16 remains the required CI database job.
- Production build: `npm run build` passed, including the workspace and ingestion
  status/reconciliation routes. Network access was needed for Inter.

## Evidence and limits

The follow-up regressions verify approval withdrawal/restoration without another
paid submission; stale unbound expiry after binding; binding retry without another
provider start; late authenticated callback recovery; duplicate terminal callbacks;
spoofed/tampered callback rejection; and hiding prior success during a pending start.
The callback tests verify both correlation and native provider body signatures.
See `docs/s1-023-job-recovery.md` for configuration and operator recovery steps.

`desktop.png` and `mobile.png` show the workspace at 1280px and 375px.
`url-provenance.png` shows the completed URL-job identity disclosure. Images were
visually inspected; responsive overflow is also asserted by the browser test. A
Next.js development indicator may appear in these development-server captures.

Browser tests use real Next.js/auth/Supabase SDK requests against the local fixture.
The fixture supplies persisted synthetic reviews and owner-scoped attempt states;
it is not deployed application code. Service/route tests inject verified synthetic
provider results. SQL tests exercise the actual RPCs and RLS, including transaction
rollback, idempotent finalization, blocked uncertain starts, read-only browser
privileges, cross-user denial, source-URL completion with explicit provider-resolved
provenance, and configured-identity mismatch. Returned URL identities are not promoted
to target configuration and are not described as independent proof of a URL match.

No paid provider extraction or real-review persistence was performed. Both live
gates remain disabled by default; no storage-terms approval is asserted. No hosted
database migration was applied. S1-019's source-URL submission service is integrated
with the reserved, owner-scoped S1-023 lifecycle. Its latest nested identity checks
and regression tests are retained.

The local branch was fast-forwarded to merged S1-019 commit `0388c43`; existing
018/023 working changes were restored and adjusted, with their safety stash retained.
That initial local verification preceded implementation commit `0558509` and PR #48.
The requested subsequent main integration created merge commit `366dc01`; the
review fixes remain subsequent working changes, with no push by this agent.
Teammate/security re-review, human acceptance and fresh CI for the corrected head
remain acceptance steps before merge. Hosted verification remains required before
issue closure; use Refs #18 and Refs #23. Local checks do not replace these steps.

## Final UI and transcript follow-up

Review text, reviewer names and ingestion prose now use `max-w-prose`, including
the provider-identity disclosure. Long names still wrap within the mobile card.
The refreshed screenshots were visually inspected after this change.

After the width change, all 541 tests / 42 Jest suites, all seven workspace browser
tests, formatting, lint, typecheck and production build passed. The earlier full
20-test browser run and six SQL-file run remain the integration baseline; no
database behavior changed in this follow-up.

The original user/assistant messages were recovered from this task's local session
log and retained, after redaction screening, in
[the original-message transcript](../../../ai-transcripts/2026-11-06_codex_S1-018-S1-023_original.md).
It includes the scope changes, failed approaches and corrections as originally
communicated, and the final follow-up. Earlier continuation records are historical
supporting records, not substitutes for that transcript. Link the original-message
transcript in the PR; author review of its contents remains required.

## PR #48 corrections and S1-015 integration — 2026-11-07

- Main through `e8839ef` merged into s1-018 as `366dc01`; the test-fixture conflict
  was resolved by retaining creation inserts and ingestion-status reads. Local
  review changes were safety-stashed, restored and remain uncommitted.
- Corrected-head local checks: 600 tests across 45 Jest suites, all 22 Edge browser
  tests, all seven SQL test files and all four migrations, lint, formatting,
  typecheck and production build passed.
- New regression coverage proves no second paid start after lookup 401/402/403,
  missing key, invalid JSON, 404 or 502 and successful recovery of the same job;
  no re-ingestion after success; pending/404 deadline handling; rejection versus
  uncertain submission; and evidence-based operator release.
- SQL mutation probes rejected removal of the reservation owner check, each finish
  owner predicate, Place ID mismatch check and explicit service-role read grant.
  The final SQL suite also checks expiry at finalization, direct expiry of an old
  pending job, preservation of young/terminal jobs, unchanged reviews and restricted
  operator RPC privileges.
- Creation now routes to the owned workspace with created=1 and confirmation.
  Browser tests verify two successive creations, refresh, empty persisted reviews,
  explicit card state, navigation reset and a 120-character mobile title. The
  creation marker cannot disclose an unavailable target. S1-017 badge integration
  remains owner-scoped and unavailable status is not misrepresented.
- The first combined browser run found an outdated Start ingestion assertion on
  succeeded targets and a confirmation locator matching hidden same-user history.
  Updated the expected completed control and scoped the notice to the visible main.
  The full 22-test rerun passed. No application failure was hidden by those changes.
- No paid calls, real provider content, hosted migration or push. Updated PR text
  uses Refs #18 / Refs #23 and documents owner-visible job IDs accurately. Fresh
  CI for the published corrected head and normal/section 7 security re-review are
  still required; green baseline CI is not presented as verification of local fixes.
- PR #48's description was updated and read back successfully, with Refs #18 /
  Refs #23, corrected evidence and owner-visible job-ID wording, and an explicit
  warning that the code fixes/main merge remain local. The remote head remains
  `0558509`; no push or review request was performed.

See [final scope review](../../s1-018-s1-023-final-review.md),
[replacement PR text](../../pr-48-description.md), and the
[original-message review continuation](../../../ai-transcripts/2026-11-07_codex_S1-018-S1-023_review-integration.md).

## Final form-spacing alignment

At the user's request, the remaining S1-015 form-spacing discrepancy is resolved.
TargetForm uses space-y-4 between fields and grid gap-1.5 within all three field
groups, matching UI/UX sections 3.2 and 7.3. The PR description and final review
mark the finding resolved, without changing historical original dialogue.

Verification after the spacing change: all 28 TargetForm unit tests passed;
the existing Edge mobile creation test with a 120-character title passed and
confirmed no document overflow; focused ESLint and formatting passed. The earlier
full 600-unit / 22-browser / seven-SQL results remain the integration baseline.
No GitHub access, edit, push, commit, hosted migration or provider operation was
performed. The final spacing correction and documentation updates remain local.

## Review of 4e0ff89 — privacy, notice, badge and polling corrections

Latest local follow-up: 608 unit tests / 46 suites; all 22 local Edge browser
tests; all eight SQL files with four migrations; lint, formatting, typecheck and
production build passed. A focused lifecycle rerun passed all 39 tests after
asserting account/configuration feedback does not blame the source.

The SQL privacy suite executes denied owner reads of operator fields and successful
service-role/allowed-column/status-view reads. Mutation baseline passes; removing
the expired-hold index predicate, operator status predicate, whole operator state
guard or authenticated table-wide SELECT revoke causes failure as intended.

Browser regressions verify one workspace badge, disabled collection copy without
start invitations, creation-marker consumption, no notice replay after reload,
normal creation/navigation and mobile wrapping. Unit tests also verify preservation
of unrelated query/hash data, notice removal on completion and bounded polling
recovery without a new submission. Screenshots were refreshed after the UI changes.

Three historical transcript files have local-user paths redacted and trailing
whitespace normalized. The transcript comparison applies these documented privacy
and formatting replacements to the source messages. The PR description and review
response were prepared locally; no remote-head CI result is asserted and no
GitHub operation was performed. No commit, push, hosted migration, real provider
storage or paid extraction. See docs/pr-48-review-response.md for the draft reply.
