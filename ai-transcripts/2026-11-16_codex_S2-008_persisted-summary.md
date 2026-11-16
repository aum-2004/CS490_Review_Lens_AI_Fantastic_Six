# S2-008 — persisted summary boundary — recorded Codex session

Date: 2026-11-16
Tool: OpenAI Codex
Repository: `CS490_Review_Lens_AI_Fantastic_Six`
Story: S2-008 / GitHub Issue #59
Branch: `feature/S2-008-persisted-summary`

## User request

> Implement S2-008 so the review summary represents the same persisted review dataset used by
> Q&A. Review Issue #59 and the implementation on main; add meaningful insert/delete, target
> isolation, ownership, empty-data, and summary/Q&A boundary tests; preserve the summary RPC,
> RLS, authentication, ownership checks, and S2-010 size limits; update focused documentation;
> run focused and full validation; do not deploy, close the issue, merge, commit, push, or open a PR.

## Inspection and plan

The GitHub issue page was requested but was unavailable from the configured web cache. The local
repository references and current implementation were inspected instead. `getReviewSummary()`
already uses the PostgreSQL `get_review_summary()` aggregate after ownership verification, while
`buildReviewDatasetContext()` reloads all target-filtered persisted rows, requires exact complete
results, and fails closed above 100 reviews or 32 KiB. The existing SQL test covered aggregate
correctness, empty data, ownership, invoker security, and a 1,001-row no-truncation case, but did
not mutate rows after a baseline result or explicitly connect the summary and Q&A test boundaries.

Plan given before editing:

1. Extend the real PostgreSQL summary test for live insert/delete recalculation, target isolation,
   empty data, and cross-user denial.
2. Add a focused cross-service test for matching eligible persisted rows and the preserved Q&A size
   behavior.
3. Document the common persisted-data boundary without changing the production RPC or limits.

## Changes made

- Added insert-then-delete assertions to `tests/db/review-summary.test.sql`.
- Added `tests/unit/services/qa/review-summary-boundary.test.ts`, which composes the production
  context builder and summary service over the same persisted-row fixture. It verifies matching
  count/eligible IDs for a supported dataset and verifies that Q&A rejects an oversized dataset
  while the exact summary remains available.
- Added the S2-008 persisted-dataset boundary section to `docs/s2-006-review-summary.md`.
- Added this redacted session transcript.
- No migration, RPC, production service, security policy, or paid-provider configuration changed.

## Validation

- Focused Jest: **PASS — 4 suites, 68 tests**.
- Focused ESLint: **PASS**.
- Focused and full formatting checks: **PASS**.
- Full Jest: **1,517 passed; 25 failed**. Failures are unrelated environment/repository issues:
  coverage-policy tests cannot spawn Git (`EPERM`), and the migration CLI test detects pre-existing
  duplicate migration filenames.
- Full ESLint: **PASS**.
- Typecheck: route type generation passed, but the repository-wide compiler is blocked by existing
  duplicate `node_modules/@types/* 2` directories.
- Migration check: **FAIL** due to existing duplicate versions:
  `20261113000000_create_review_summary 2.sql` / `.sql` and
  `20261115043442_limit_paid_review_questions 2.sql` / `.sql`.
- Database tests: could not start because the shell environment has no accessible `node`/PostgreSQL
  executable path.
- Production build: blocked by the sandbox when Turbopack attempted to create a process/bind to a
  port while processing CSS. Earlier attempts also encountered the existing external Inter-font
  fetch restriction; no S2-008 code error was reported.
- Changed-code coverage gate: blocked by `spawnSync git EPERM`; the full coverage run generated
  77.57% overall coverage before reporting the same unrelated failures.
- `npm` commands were not executable in this environment, so equivalent direct Node entry points
  were used where available.

No commit, push, migration deployment, paid request, issue update, merge, or PR was performed.

## Accepted / changed / rejected

- **Accepted:** test and documentation evidence for the existing persisted-dataset design.
- **Changed:** only the SQL regression, focused boundary test, S2-008 documentation, and transcript.
- **Rejected:** production recalculation duplication, context truncation, migration edits, unrelated
  duplicate-file cleanup, paid AI requests, and external GitHub changes.
