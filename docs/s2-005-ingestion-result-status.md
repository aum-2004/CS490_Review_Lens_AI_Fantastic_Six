# S2-005: Display ingestion result status

Issue: https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/56

Rules: S2-BR-001, S2-BR-005 through S2-BR-007.

The active target's workspace header and ingestion card use the shared
`IngestionStatus` badge, as do target cards. Labels distinguish Not ingested,
Ingesting, Ingested, Partially ingested, Failed, and Status unavailable.

The existing Sprint 1 lifecycle already persists successful and failed attempts,
polls asynchronous collection, and preserves saved reviews on failure. These
behaviors did not need replacement. A completed attempt with skipped records is
persisted as `succeeded` with a nonzero `skipped_count`; the shared badge now labels
that result Partially ingested. Failure and processing take precedence over any
skipped count. The ingestion card explains that only saved reviews enter the
target's dataset, alongside the existing saved/skipped counts.

Status still comes from the authenticated target's persisted ingestion summary,
never from review-row presence. A missing status remains unavailable. Partial
completion retains the existing protection against another collection request.
No schema, provider, authorization, Q&A, or rating-summary changes are needed.

## Test evidence

- `npm test -- --coverage`: 48 suites, 661 tests passed.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, and
  `npm run build`: passed. The build required network access for the existing
  Google Fonts Inter download after the sandboxed attempt failed.
- The workspace browser suite exercises reload, active target switching,
  success, partial completion, failure with previously saved reviews, unavailable
  status, and ownership/session regressions against the local persisted-data
  fixture. It uses the production build:
  `PLAYWRIGHT_AUTH_SERVER=production npm run test:e2e:auth -- tests/e2e/auth/target-workspace.spec.ts`
  (set the environment variable using the syntax for your shell).
  All 8 tests passed against the production build in 15.5 seconds. Sandboxed runs
  hung during server teardown; the unrestricted rerun exited successfully.
- Partial-result screenshots at 1280px and 375px were visually inspected; the
  browser checks horizontal overflow at both widths. Screenshots are generated
  under ignored `test-results/`.
- Unit tests verify processing-to-partial and processing-to-failed transitions,
  badge consistency, skipped records excluded from the saved count, and persisted
  operation status taking precedence over empty or existing review rows.
- Comparing the source diff to Jest's LCOV report found all 29 measurable added
  source lines covered. This is local evidence, not a new CI coverage gate.

CI, teammate review, and the separate S2-001 changed-code coverage gate are not
claimed by this local verification. The initial implementation was left local;
the PR #81 review follow-up below is retained in a local commit without pushing.

## PR #81 review corrections

- The shared badge requires an explicit `skippedCount`. Missing, negative,
  fractional, or non-finite counts display **Status unavailable**, including
  malformed runtime data that bypasses TypeScript. No missing count defaults to
  complete success.
- A Jest regression checks that the target-card summary loader selects
  `skipped_count` and maps a persisted value of 2 to `skippedCount: 2`, independently
  of Playwright.
- Partial completion uses an amber `warning` theme token in light and dark modes,
  distinct from processing blue. The state table and semantic-color guidance in
  `UI_UX_Standards.md` and the ingestion description in `src/services/README.md`
  document the distinction.
- The session record below replaces the prior summary with recorded conversation
  and tool exchanges, with local user-directory paths redacted. Internal
  instructions/reasoning and binary image payloads are excluded.

The reviewer reported no security issues at `338ecd4`; these changes address
status robustness, unit-test coverage, visual clarity, and transcript retention.
Hosted Supabase verification and fresh remote CI remain unverified locally.

The authoritative supplied `Sprint 2 Stories.txt` states these applicable rules
(quoted here so the reviewer can inspect the wording without a local file path):

- **S2-BR-001:** The application must clearly identify the AnalysisTarget represented by an ingestion summary.
- **S2-BR-005:** The user must be able to distinguish successful, failed, and partial ingestion when the implementation supports partial success.
- **S2-BR-006:** Rejected, skipped, or unprocessable records must not silently appear as successfully ingested reviews.
- **S2-BR-007:** The ingestion summary must represent the dataset that will be used by the Q&A workflow.

Review follow-up validation: all 671 unit tests passed across 48 suites, and all
8 workspace browser tests passed against the
production build, including a dark-mode screenshot. Light/dark mobile screenshots
were visually inspected. Amber text on the badge's 10% tint has calculated contrast
ratios of 6.07:1 (light) and 9.83:1 (dark card). Lint, format, typecheck, and build
passed. No hosted Supabase operations or live provider calls were performed.

AI assistance: OpenAI Codex. Session record:
`ai-transcripts/2026-11-12_ms-00star_S2-005_codex.md`.
