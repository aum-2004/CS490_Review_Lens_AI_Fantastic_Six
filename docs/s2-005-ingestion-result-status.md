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
claimed by this local verification. No push, PR, or commit was made.

AI assistance: OpenAI Codex. Session record:
`ai-transcripts/2026-11-12_codex_S2-005_codex.md`.
