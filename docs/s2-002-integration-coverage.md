# S2-002 critical integration test coverage

**Story:** S2-002 (#53) | **Rules:** S2-BR-001 to S2-BR-014, S2-BR-022 to S2-BR-030 |
**New suite:** `tests/unit/services/reviews/summary-qa-dataset.integration.test.ts` |
**New helper:** `tests/helpers/summary-qa-bridge.ts`

## Why this suite exists

The summary (S2-006) and Q&A (S2-010/S2-011) paths were each well tested on their own, and areas
1, 3, 4 and 5 of the story (loading persisted reviews, the Q&A dataset, ownership before
retrieval, target switching) were already covered by S2-003, S2-010, S2-016, S2-017, S2-018 and
S2-019. The gap was the boundary **between** the two paths: nothing proved that the summary a
user sees and the dataset Q&A sends to the model are built from the same persisted rows, that
skipped records stay out of both, or that a failed or empty target is handled the same way on
both.

The new suite runs both paths with their real production code over one set of persisted rows:

- **Summary:** the real `GET /api/analysis-targets/[targetId]/review-summary` route,
  `requireApiUser`, `getOwnedTargetOrThrow`, `getReviewSummary`, `createSupabaseReviewStore`
  and `getLatestAttempt`.
- **Q&A:** the S2-003 harness (`setupQaTestHarness`) with the real `answerQuestion`,
  `buildReviewDatasetContext`, S2-013 prompt and S2-011 reply validation. The model is the
  harness's scripted fake.
- **Ingestion:** the real `reconcileIngestion` and `normalizeBatch` for the skipped-record tests.

Only infrastructure is faked. No live network is used (the S2-003 network guard is installed),
no `OPENAI_API_KEY` is needed and no paid call can run.

## The summary bridge

The S2-003 fake Supabase serves auth and the `analysis_targets` and `reviews` tables only.
`tests/helpers/summary-qa-bridge.ts` wraps the client the fake returns, without modifying it,
and adds just what the summary and ingestion paths need over the **same** `fake.tables` rows:

| Added piece                                       | Mirrors (source of truth)                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `rpc("get_review_summary")`                       | `supabase/migrations/20261113000000_create_review_summary.sql`, verified by `tests/db/review-summary.test.sql`              |
| `latest_ingestion_attempts`, `ingestion_attempts` | The ingestion-attempt view and table, verified by `tests/db/ingestion-attempts.test.sql`                                    |
| emulated `writer.finish`                          | `finish_ingestion_attempt` in `20261107030000_bound_ingestion_completions.sql`, verified by `tests/db/ingestion-*.test.sql` |

The emulated `writer.finish` mirrors the SQL write path covered by `tests/db`: ownership of the
attempt and target, idempotence after a terminal state, accepted terminal error codes only, no
reviews saved for a failed attempt, and exactly the normalized rows inserted on success. It does
not replace those database tests. Tests assert against **hand-computed constants** from
`tests/fixtures/qa/datasets.ts` (for example `mixedRatings`: 5 reviews, average 3), never against
values the bridge computes.

## Traceability

"New" rows are in `tests/unit/services/reviews/summary-qa-dataset.integration.test.ts`.

| Rule                                                               | Coverage                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-BR-001 summary identifies its target                            | Existing: `review-summary/route.test.ts` "returns the authenticated owner's exact summary with private no-store caching"; `services/qa/target-switching.production.test.ts` "switches real summary-route aggregates with Q&A evidence…". New: every summary assertion checks `targetId`.                                                                                     |
| S2-BR-002 summary computed from app data, not an LLM               | Existing: `services/reviews/review-summary.test.ts` "uses the exact database aggregate instead of loading full reviews". New: "S2-BR-002: the summary is a database aggregate, never a model call or a review-text read".                                                                                                                                                    |
| S2-BR-003 / 004 only successfully ingested reviews are counted     | Existing: `tests/db/review-summary.test.sql`; `ingestion-lifecycle.test.ts` "retrieves by stored owner, target and job and atomically finishes verified reviews". New: "a partly rejected batch: summary and Q&A both see only the 3 saved reviews; skippedCount reports 4".                                                                                                 |
| S2-BR-005 success / failure / partial distinguishable              | Existing: `components/ingestion/IngestionStatus.test.tsx`, `components/analysis-targets/IngestionPanel.test.tsx`, `ingestion/route.test.ts`. New (summary side): the all-rejected and provider-failed tests assert `ingestionStatus: "failed"`.                                                                                                                              |
| S2-BR-006 skipped / rejected records never appear as ingested      | Existing: `services/reviews/normalize.test.ts` "keeps valid records and reports rejected ones with their index". New: "a partly rejected batch…" (rejected markers absent from the model request, `skippedCount` 4) and "S2-BR-025: an all-rejected batch fails ingestion…".                                                                                                 |
| S2-BR-007 summary represents the Q&A dataset                       | Existing (partial): `services/qa/target-switching.production.test.ts` "switches real summary-route aggregates…". New: "%s: summary count and average equal the Q&A evidence set" (mixedRatings 5/3, restaurantA 4/4, targetA 3/11⁄3, targetB 2/3) and "mixedRatings: Q&A evidence carries exactly the five persisted review IDs".                                            |
| S2-BR-008 Q&A available from the target workspace                  | UI/e2e (S2-009): `components/reviews/ReviewQuestions.test.tsx` "submits a trimmed question with the active target and displays the answer"; `tests/e2e/auth/review-questions.spec.ts` "asks from the active workspace, shows processing and resets after switching targets".                                                                                                 |
| S2-BR-009 Q&A uses only the active target's reviews                | Existing: `qa-harness/real-pipeline.integration.test.ts` "verifies the session, checks ownership, then reads only the active target's reviews"; `services/qa/review-context-pipeline.integration.test.ts`. New: journey test asserts exact review IDs per step.                                                                                                              |
| S2-BR-010 / 011 insufficient evidence is communicated              | Existing: `services/qa/insufficient-evidence.test.ts` "returns an insufficient_evidence reply that states the limitation, with no citations"; golden cases in `qa-harness/golden-cases.test.ts`.                                                                                                                                                                             |
| S2-BR-012 context method is an architectural decision              | Design decision, documented in `docs/s2-010-review-context.md` ("Scope and architectural decision"; strategy `all-persisted-reviews`). Not a runtime behavior to test.                                                                                                                                                                                                       |
| S2-BR-013 no vector DB / RAG required                              | Design decision, documented in `docs/s2-010-review-context.md`. New suite confirms the bounded complete-dataset behavior at its limit (see the 101-review test).                                                                                                                                                                                                             |
| S2-BR-014 active target stays visible                              | Existing: `app/analysis-targets/workspace.test.tsx`; `app/analysis-targets/target-switching.production.test.tsx` "switches the actual workspace label, review list and question target together". New: answers carry the active `targetId` in the journey test.                                                                                                              |
| S2-BR-022 only the authenticated user's data enters AI context     | Existing: `real-pipeline.integration.test.ts` "denies User A User B's target before any review read or model call"; `services/ai/cross-user-ai-context-route.test.ts`; `stale-context.integration.test.ts`. New: "summary and Q&A deny User B's target exactly like a missing one, with no reads and no model call"; "signed out: summary is 401 and Q&A is AUTH_REQUIRED…". |
| S2-BR-023 target change changes the Q&A dataset                    | Existing: `services/qa/target-switching.production.test.ts`, `qa-harness/stale-context.integration.test.ts` "uses fresh active-target evidence on A -> B -> A…". New: "A -> B -> A: each step returns only the active target's summary and Q&A dataset, one model call per question".                                                                                        |
| S2-BR-024 previous target's reviews do not remain active           | Existing: as S2-BR-023, plus `real-pipeline.integration.test.ts` "A → B → A sends only the active target each time". New: journey test asserts no request contains the other target's marker, ID or review IDs, and per-target ingestion status / skipped count switch too.                                                                                                  |
| S2-BR-025 a target with no ingested reviews gives no normal answer | Existing: `review-context-pipeline.integration.test.ts` "prevents provider invocation for an empty dataset"; `app/analysis-targets/target-switching.production.test.tsx` "shows empty B summary and disables Q&A after leaving populated A". New: "never-ingested empty target…", "provider-failed ingestion target…", "S2-BR-025: an all-rejected batch fails ingestion…".  |
| S2-BR-026 Sprint 1 ownership rules remain authoritative            | Existing: `services/analysis-targets/target-ownership.test.ts`; `tests/db/cross-user-*.test.sql`. New: the foreign-target test runs the real S1 guard on both paths; no new ownership logic is introduced.                                                                                                                                                                   |
| S2-BR-027 Q&A tests are deterministic                              | Existing harness tests: `qa-harness/determinism.test.ts` "produces identical requests, replies and errors across 5 full golden-suite runs"; `qa-harness/network-guard.test.ts`. New suite uses the same harness, fixed fixtures and no clock, and was run 3× (see PR evidence).                                                                                              |
| S2-BR-028 Q&A behavior evaluated against a fixed set               | S2-004 evaluation set: `tests/fixtures/scope-guard-evaluation.ts`, `tests/unit/fixtures/scope-guard-evaluation.test.ts`, `docs/scope-guard-evaluation.md`.                                                                                                                                                                                                                   |
| S2-BR-029 no live provider calls in tests                          | Existing: `qa-harness/determinism.test.ts` "runs the whole suite with the network blocked and no provider credentials". New suite runs under the same guard.                                                                                                                                                                                                                 |
| S2-BR-030 tests verify behavior, not exact wording                 | Existing: harness assertions (`tests/helpers/qa-harness/assertions.ts`) check outcomes, citations and error codes. New suite asserts counts, IDs, outcomes and error codes only.                                                                                                                                                                                             |

## Findings for owners

1. **Over-budget targets (S2-006 / S2-010 owners).** The summary counts every persisted review,
   but Q&A refuses with `REVIEW_CONTEXT_TOO_LARGE` above `MAX_CONTEXT_REVIEWS` (100). A user can
   see "101 reviews" next to a Q&A refusal. The new test pins the safety property (true count in
   the summary, no answer from a partial subset, no model call) and is labelled **current
   behavior; owners may change the refusal rule**. No production code was changed.
2. **S2-003 fake Supabase** has no RPC or ingestion-attempt support, so suites that need the
   summary have each stubbed it separately (e.g. `services/qa/target-switching.production.test.ts`
   mocks `getLatestAttempt` to `null`). The new bridge is a separate file; folding it into the
   harness is a possible follow-up for the harness owner.

## Follow-ups owned elsewhere

- **S2-008 (Bansi):** "adding or removing a persisted review changes the summary". Deliberately
  not written here.
- **UI-level target switch:** already covered by S2-017/S2-018 in
  `tests/unit/app/analysis-targets/target-switching.production.test.tsx` and
  `tests/e2e/auth/{switch-target,target-context-switching,stale-review-context}.spec.ts`. No new UI
  test was needed.
