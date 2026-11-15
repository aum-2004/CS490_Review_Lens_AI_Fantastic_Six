# S2-020 functionality and security review

Reviewed on 2026-11-15 against issue #71, S2-BR-007, S2-BR-010,
S2-BR-011, S2-BR-025, the supplied requirements, and UI/UX standards.
This was a separate review pass over the implementation and its surrounding
boundaries; AI review does not replace the required teammate approval.

## Finding addressed

**P2 — Successful ingestion with no saved rows gave an unusable next step.**
`ProtectedTargetWorkspace` used the generic “Complete ingestion” instruction when
the last attempt succeeded but saved reviews were empty. The ingestion panel
disables further collection for completed attempts, so users could not follow that
instruction. The message now explains the mismatch and asks users to reload and
contact the project team if reviews remain missing. Q&A stays disabled.

The regression assertion was run before the fix: both complete and partial-success
cases failed with the old message. The corrected message covers both cases without
changing ingestion permissions or enabling another collection attempt.

## Functionality examined

- Empty, failed, processing, completed-but-empty, and review-load failure states.
- Saved reviews preserved after a later failed ingestion; persisted status alone
  never enables questions when no saved rows exist.
- Visible disabled controls with accessible explanations, question validation,
  pending submission protection, cancellation, late responses, and stale answers
  when switching targets or review availability changes.
- Ingestion polling refreshes server data on completion; questions become available
  when the refreshed workspace has saved reviews.
- Direct API calls receive HTTP 409 `NO_REVIEW_DATA` with no normal-answer payload.
  General-knowledge instructions do not alter that behavior.

## Security examined

- Authentication is verified on both workspace rendering and API access. The
  questions route checks parent ownership before reading input; the context
  builder independently rechecks identity and ownership before reading reviews.
- Review reads use the session-scoped Supabase client, a target filter, and existing
  ownership-based RLS. No service-role access or authorization changes were added.
  Existing missing/foreign/malformed-target and cross-user regression tests remain
  part of full-suite verification.
- Browser ownership, target, review, and context claims are stripped by the question
  schema; only the validated question is used. Added an empty-target integration
  test with forged evidence, another target ID, an owner ID, and a claimed available
  dataset. It still returns `NO_REVIEW_DATA`, consumes no quota, and calls no model.
- Context construction reads fresh persisted reviews on every question; exact-count,
  size, evidence validity, duplicate-ID, and wrong-target checks fail closed.
  The prompt builder also refuses an empty dataset. Prior-target context and general
  knowledge cannot fill an empty dataset.
- Quota reservation and both provider endpoints occur only after valid context and
  prompt construction. Empty-target regression tests assert no quota reservation,
  token-count request, or generation request.
- User-controlled names and answers render as React text. Unavailable messages are
  application-authored strings. API errors use safe local translations and private,
  no-store responses; logging records categories rather than reviews or raw errors.
- The change adds no endpoint, dependency, migration, secret, or persistence write.

No remaining functionality or security issue requiring a change was found in the
reviewed S2-020 scope. Verification uses synthetic fixtures and deterministic model
boundaries. Live provider behavior and deployed database configuration were not
audited or changed.

## Final verification

- Full deterministic suite: 82 suites, 1,514 tests passed; 94.12% line coverage.
- Changed-code gate against the starting HEAD: 29/29 changed source lines covered,
  100%; all 16 changed branch outcomes covered.
- Five review-question browser tests passed against the final production build,
  using the local auth/data fixture, including desktop/mobile empty states and a
  direct HTTP 409 rejection. Test-runner teardown required stopping only its own
  fixture/server processes after the cases completed; exit code was 0.
- Lint, typecheck, repository formatting, production build, and diff whitespace
  checks passed.

No remaining blocking findings in the reviewed scope. No commit or push performed.
