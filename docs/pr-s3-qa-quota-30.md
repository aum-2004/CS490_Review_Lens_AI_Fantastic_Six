# Sprint 3 Q&A quota delivery drafts

These drafts are prepared for publication after branch push authorization. A
connected GitHub issue search for `quota` in this repository returned no results
on 2026-11-25; no issue or pull request was created by this session.

## Issue draft

**Title:** Enhancement: Increase daily Q&A quota from 5 to 30

The existing five-attempt rolling Q&A quota is too restrictive for authenticated
users analyzing multiple businesses and was raised during the Sprint 2 demo.
Increase it to 30 attempts per account across all AnalysisTargets in a rolling
24-hour window without redesigning the Q&A system.

Acceptance criteria:

- Attempts 1 through 30 succeed and attempt 31 returns the existing safe quota
  error; the first and thirtieth reservations return 29 and 0 remaining.
- The existing authenticated identity, account-wide advisory lock, atomic
  reservation, rolling expiration, RLS, grants and no-refund policy are retained.
- Active UI and error copy state that each account can make 30 attempts within 24
  hours and failed answer-service attempts count.
- Deterministic unit, integration, database, concurrency and UI tests cover the
  new boundaries without paid API requests.
- A forward Supabase migration and coordinated, Q&A-disabled deployment sequence
  prevent incompatible application/database versions from consuming slots.
- Cost documentation notes the sixfold maximum increase, usage-dependent actual
  cost and absence of a global spending cap.

## Pull request draft

**Title:** Increase per-account Q&A quota from 5 to 30

### Summary and motivation

Raises the durable per-account Review Q&A allowance from five to 30 attempts in a
rolling 24-hour window so users can analyze multiple businesses. The rolling
window and existing failure-charging policy are unchanged.

### Backend, frontend and database

- Changes the server quota constant and validates remaining values from 0 through
  29, failing closed for 30, negative, fractional or malformed values.
- Updates active server, client and accessible UI copy to the 30-attempt policy.
- Adds `20261125000000_increase_review_question_quota.sql`, which replaces the
  existing RPC body without replacing its table or reservations. Attempts 1-30
  are accepted, attempt 31 is denied, and remaining values are 29 through 0.

### Security and cost controls

The migration retains `auth.uid()`, account-wide advisory locking, atomic inserts,
rolling expiration, `SECURITY DEFINER` with an empty search path, restricted table
access, RLS and authenticated-only execute permission. Failed provider attempts
remain charged. OpenAI provider/model, token and context budgets, prompt, scope
guards, citation validation, ownership and error conventions are unchanged. The
maximum permitted usage is six times higher; actual cost remains usage-dependent,
and this per-account quota is not a global spending cap.

### Test evidence

- Focused Jest: 135 tests passed across five matched suites; exact bracketed route
  suite: 19 tests passed.
- `npm run format:check`, `npm run check:migrations`, `npm run lint`,
  `npm run typecheck`, `npm test` (107 suites / 2,032 tests) and `npm run build`
  passed.
- Full instrumented Jest: 107 suites / 2,032 tests passed; overall line coverage
  95.55% (9,799/10,255).
- Changed-code gate: 100% (4/4) overall and 100% (2/2) in `src/services/qa/**`.
- `npm run test:db` could not run locally because `bash` is unavailable on PATH;
  the GitHub database migration/RLS/concurrency job must pass before merge.
- No live OpenAI, Outscraper or hosted Supabase request was made.

### Deployment coordination and limitations

Keep `QA_ENABLED=false`, deploy the compatible application, dry-run and apply the
reviewed migration, verify hosted migration/RLS behavior, then re-enable Q&A. The
old app fails closed on new remaining values after consuming a slot; the new app
against the old function remains limited to five. Full steps are in
`docs/s3-qa-quota-30.md`. Hosted migration, deployment and production changes are
not part of this PR session and require separate approval.

### AI assistance

Codex assisted with implementation and validation. Transcript:
`ai-transcripts/2026-11-25_neel-0064_S3-qa-quota_codex.md`.
