
❯ Implement S2-002 (Add Critical Integration Test Coverage, issue #53) for
  ReviewLens AI. Branch feature/s2-002-critical-integration-tests (from
  origin/main, 5f865ce). Don't modify production code or teammates' files.
  Don't edit tests/unit/services/qa/review-context-pipeline.integration.test.ts
  (PR #94 touches it) or src/services/qa/review-context.ts /
  entity-platform-refusal.integration.test.ts (PR #95 touches them). Create new
  files only.

  Story: integration tests for boundaries where independently correct
  components could still fail when combined: (1) loading persisted reviews, (2)
  computing a summary from persisted data, (3) passing the correct dataset
  into Q&A, (4) ownership before retrieval, (5) switching target retrieves
  different data. Rules S2-BR-001..014, 022..030 (summary identifies its target
  and is computed from app data, not an LLM; counts only successfully ingested
  reviews; skipped/rejected records never counted as ingested; summary
  represents the same dataset Q&A uses (007); Q&A uses only the active target's
  reviews; insufficient evidence is communicated; only the authenticated
  user's data enters AI context; target change changes and clears context;
  empty target gives no normal answer; Sprint 1 ownership stays authoritative;
  Q&A tests are deterministic and verify behavior, not exact wording).

  Stack: Next.js + React + TypeScript, Jest 30 (testMatch
  tests/unit/**/*.test.{ts,tsx}), Supabase.

  Known state: areas 1, 3, 4, 5 are already covered by
  real-pipeline.integration.test.ts,
  review-context-pipeline.integration.test.ts,
  cross-user-ai-context-route.test.ts, target-switching.production.test.ts,
  stale-context.integration.test.ts, tests/db/*.test.sql. Area 2 is partial:
  S2-006's summary service/route exist; S2-008's "adding/removing a persisted
  review changes the summary" is Bansi's story, do NOT write that test.
  Update: main (5f865ce) now also contains S2-017 (#91), S2-018 (#93) and
  S2-019 (#92) with their tests (e.g. target-switching.production.test.ts,
  stale-context.integration.test.ts). Count those as existing coverage in the
  gap matrix. A UI-level target-switch test is optional, and only if the matrix
  shows it uncovered.

  ## Step 0 (no code yet)
  1. Read those existing tests, the review-summary service and route, and the
  S2-003 harness (fake-supabase, setupQaTestHarness, tests/fixtures/qa).
  2. Produce a rule-to-test gap matrix for S2-BR-001..014 and 022..030. Only
  uncovered cross-boundary behavior gets new tests.
  3. Propose a plan and WAIT for my approval.

  ## Requirements after approval
  New file(s) named *.integration.test.ts under tests/unit/, reusing the
  existing fake Supabase and harness (no live network, no OPENAI_API_KEY, no
  paid calls). Cover at least:
  - Summary and Q&A context built from the SAME persisted rows agree on review
  count and dataset identity (S2-BR-007), including exact counts/ratings from a
  known fixture.
  - Skipped/rejected/unprocessable records appear in neither the summary count
  nor the Q&A context (S2-BR-006).
  - Full journey: user A signed in -> summary and Q&A for target A -> switch to
  target B -> summary and Q&A for B contain nothing from A; and A->B->A
  returns only the active target each time (S2-BR-022..024).
  - Another user's target: summary and Q&A both denied before any review read
  (S2-BR-022, 026).
  - Empty or failed-ingestion target: no normal summary values and no grounded
  answer, model never called (S2-BR-025).
  - Negative/edge cases; no skipped or todo tests.
  Also add docs/s2-002-integration-coverage.md with a traceability table: S2-BR
  id -> existing or new test file and test name, and note the S2-008
  add/remove case and any UI-level target-switch case as follow-ups owned
  elsewhere.

  ## Process
  Small local commits, do NOT push. Run format:check, lint, typecheck, npm
  test, build, npm run coverage:changed, and the new suite 3x; show output. End
  with a PR description draft (Refs #53, Test Evidence, AI-use statement,
  findings for owners).

  Start with Step 0 only.
  DO NOT PUSH OR COMMIT, OR CHANGE ANY PR

⏺ I'll start Step 0 by reading the existing tests and harness.

  Read 2 files, ran 1 shell command (ctrl+o to expand)

⏺ Now the harness.

  Searched for 2 patterns, read 1 file, ran 3 shell commands (ctrl+o to expand)

⏺ Still in Step 0: I've read the summary/Q&A services and the harness. Next I'm
  checking the existing summary, skipped-record and stale-context tests and the
  fixtures, then I'll write the gap matrix.

  Searched for 2 patterns, ran 4 shell commands (ctrl+o to expand)

⏺ Nearly done reading — checking the summary SQL's exact aggregate semantics,
  then I'll write up the matrix and plan.

  Listed 1 directory, ran 1 shell command (ctrl+o to expand)

⏺ Step 0 is done. I haven't written any code, created any files, committed
  anything or touched any PR.

  What I read

  - Summary path: the route review-summary/route.ts checks the user
    (requireApiUser), then target ownership (getOwnedTargetOrThrow), then calls
    getReviewSummary. That runs the get_review_summary database function
    (count(*) and avg(rating) in Postgres, with its own auth.uid() ownership
    check) and then getLatestAttempt (reads the latest_ingestion_attempts view
    for status and skipped count). No model is involved.
  - Q&A path: answerQuestion uses buildReviewDatasetContext. That re-checks the
    session and ownership, reads the reviews table, and fails closed on an empty
    target, a malformed row, more than 100 reviews, or a row-count mismatch.
  - Ingestion: reconcileIngestion → normalizeBatch → writer.finish(rows,
    skippedCount). Skipped count = records the provider skipped + records
    rejected during normalization.
  - The S2-003 fake Supabase only serves auth plus the analysis_targets and
    reviews tables. It has no RPCs (including get_review_summary) and no
    ingestion-attempt views. That's why target-switching.production.test.ts
    writes its own summary stub and mocks getLatestAttempt to always return
    null.
  - A UI-level switch test already exists: target-switching.production.test.tsx
    (tests/unit/app/analysis-targets/target-switching.production.test.tsx)
    covers summary and Q&A switching A→B→A, an empty B, and a failed B. The e2e
    specs switch-target, target-context-switching and stale-review-context add
    more. So no new UI test is needed.

  Gap matrix

  ⚠️ The repo only has the full text for rules 001, 005–007 and 022–024. For
  002–004, 008–013, 025–026 and 027–030 I mapped from your paraphrase. Please
  confirm or paste the real text.

  Rule: 001
  Meaning (short): Summary names its target
  Existing coverage: route test; target-switching.production.test.ts
    (data.targetId on each switch); UI test
  Cross-boundary gap?: No
  ────────────────────────────────────────
  Rule: 002
  Meaning (short): Summary comes from app data, not an LLM
  Existing coverage: review-summary.test.ts ("exact database aggregate")
  Cross-boundary gap?: Small: nothing checks the model is never called while a
    summary is produced alongside Q&A
  ────────────────────────────────────────
  Rule: 003–004
  Meaning (short): Only successfully ingested reviews are counted
  Existing coverage: review-summary.test.sql, ingestion-lifecycle.test.ts
  (finish
    gets only normalized rows)
  Cross-boundary gap?: Yes: nothing runs provider batch → normalize → save →
    summary and Q&A
  ────────────────────────────────────────
  Rule: 005
  Meaning (short): User can tell success, failure and partial apart
  Existing coverage: IngestionStatus / IngestionPanel / ingestion route tests
  Cross-boundary gap?: No
  ────────────────────────────────────────
  Rule: 006
  Meaning (short): Skipped/rejected records never appear as ingested
  Existing coverage: normalize.test.ts, lifecycle skipped count, panel copy
  Cross-boundary gap?: Yes: nothing shows rejected records are missing from both

    the summary count and the Q&A context while skippedCount reports them
  ────────────────────────────────────────
  Rule: 007
  Meaning (short): Summary = the dataset Q&A uses
  Existing coverage: target-switching.production.test.ts (stubbed summary over
    the same rows; ingestion status mocked to null; Q&A review count never
    compared to summary)
  Cross-boundary gap?: Yes: no exact comparison of count, average and review IDs

    on one known fixture
  ────────────────────────────────────────
  Rule: 008–009
  Meaning (short): Q&A uses only the active target
  Existing coverage: real-pipeline, review-context-pipeline, stale-context,
    cross-user route
  Cross-boundary gap?: No
  ────────────────────────────────────────
  Rule: 010–011
  Meaning (short): Insufficient evidence is communicated
  Existing coverage: insufficient-evidence.test.ts, golden cases
  Cross-boundary gap?: No
  ────────────────────────────────────────
  Rule: 012–013
  Meaning (short): (assumed: answer grounding/citations)
  Existing coverage: answer-question, qa-response, foreign-citation tests
  Cross-boundary gap?: No (please confirm)
  ────────────────────────────────────────
  Rule: 014
  Meaning (short): Target stays visible
  Existing coverage: workspace and UI switching tests; answers carry the target
    ID
  Cross-boundary gap?: No
  ────────────────────────────────────────
  Rule: 022
  Meaning (short): Only the signed-in user's data enters AI context
  Existing coverage: real-pipeline cross-user, cross-user route, stale-context;
    summary-side foreign target returns 404 (stubbed)
  Cross-boundary gap?: Partial: nothing denies one foreign target on both paths
    with zero reads of reviews, the aggregate and ingestion attempts, under real

    auth
  ────────────────────────────────────────
  Rule: 023–024
  Meaning (short): Switching target changes and clears context
  Existing coverage: target-switching.production.test.ts, stale-context,
    real-pipeline A→B→A, UI test
  Cross-boundary gap?: Partial: ingestion status and skipped count per target
    never switch (mocked null); summary-vs-Q&A agreement is never checked at
  each
     step
  ────────────────────────────────────────
  Rule: 025
  Meaning (short): Empty target gets no normal answer
  Existing coverage: review-context-pipeline (empty), target-switching (empty),
    UI empty-B
  Cross-boundary gap?: Yes: nothing pairs summary (0 / null) with Q&A
    NO_REVIEW_DATA on the same target, and nothing covers a failed-ingestion
    target
  ────────────────────────────────────────
  Rule: 026
  Meaning (short): Sprint 1 ownership stays authoritative
  Existing coverage: ownership tests, tests/db/* RLS/RPC SQL tests
  Cross-boundary gap?: No (new tests reuse the real guard)
  ────────────────────────────────────────
  Rule: 027–030
  Meaning (short): Q&A tests are deterministic and check behavior, not wording
  Existing coverage: harness determinism/network-guard tests, changed-coverage
  Cross-boundary gap?: No; the new tests follow these rules

  Proposed plan

  New files only:

  1. tests/helpers/summary-qa-bridge.ts — a test-only add-on to the existing
     fake Supabase. The fake has no summary function or ingestion-attempt views,
     so this serves them from the same in-memory tables:
     - It wraps the client returned by fake.client(). analysis_targets, reviews
       and auth still go through the existing fake unchanged.
     - It adds rpc("get_review_summary"), which mirrors the SQL: signed-in user
       must own the target or it fails, then count(*) and avg(rating) over
       fake.tables.reviews.
     - It adds latest_ingestion_attempts and ingestion_attempts from a
       test-owned attempts table.
     - It provides an emulated writer.finish that writes the normalized rows
       into fake.tables.reviews and records the attempt.
     - It logs every request it serves so tests can assert "no read happened".

     The real SQL is still covered by tests/db/review-summary.test.sql.
  2. tests/unit/services/reviews/summary-qa-dataset.integration.test.ts — the
     real summary route plus the harness qa.ask (real answerQuestion and context
     builder, fake model, network blocked):
     - 007, exact fixture: for mixedRatings (ratings 1–5) the summary returns
       count 5 and average 3. The Q&A request has exactly the same 5 review IDs
       and the same ratings (average 3). Repeated for restaurantA. The model is
       called only by Q&A, never by the summary (002).
     - 006 / 003–004, ingestion through to both paths: run the real
       reconcileIngestion with a synthetic batch: 3 valid records, 2 invalid
       (blank text, rating 7) and 1 the provider skipped. Then:
       - summary returns count 3, skipped count 3, status succeeded;
       - the Q&A context holds exactly the 3 saved reviews, and none of the
         rejected records' markers appear anywhere in the model request.
     - Journey (022–024): user A asks for summary and Q&A on A, then B, then A
       again. At each step:
       - summary count equals the Q&A evidence count;
       - status and skipped count belong to the active target;
       - none of the other target's IDs or text appear;
       - exactly one model call per question.
     - Foreign target (022, 026): user A asks for user B's target. The summary
       returns 404 and Q&A returns TargetNotFound. There are zero reads of
       reviews, the summary function or ingestion attempts, and no model call.
       The response is identical to a missing target ID.
     - 025:
       - empty target: summary returns 0 / null average, Q&A returns
         NO_REVIEW_DATA, no model call;
       - failed-ingestion target (all records rejected, so NO_REVIEWS): summary
         returns failed with count 0, Q&A returns no answer, no model call.
     - Edge cases:
       - signed out: summary returns 401 and Q&A returns AUTH_REQUIRED, with no
         table reads;
       - over-budget target (101 rows): the summary reports 101, but Q&A refuses
         with REVIEW_CONTEXT_TOO_LARGE rather than answering from a subset;
       - summary function fails: the summary returns 500, never zeroes.
     - No add/remove-review test (that belongs to S2-008).
     - No skip or todo tests.
  3. docs/s2-002-integration-coverage.md — table mapping each rule to its
     existing or new test file and test name. Follow-ups: S2-008 add/remove
     (Bansi), and a note that UI switching is already covered by S2-017/018.

  Then: separate small local commits (no push), the full check list (format,
  lint, typecheck, test, build, coverage:changed, new suite 3×), and a PR
  description draft.

  Findings for the owners

  1. Fake Supabase (S2-003): it has no RPC or ingestion-attempt-view support,
     which pushes each test to write its own stub. I'll keep the bridge in a new
     file rather than change the harness.
  2. target-switching.production.test.ts: it mocks getLatestAttempt to null, so
     switching ingestion status and skipped count per target isn't tested at the
     service level. The new journey test covers it.
  3. Possible 007 mismatch by design: the summary counts every saved row, but
     Q&A fails closed above 100 reviews or on a malformed row. Users could see
     "150 reviews" next to a Q&A refusal. I'll pin down the refusal behavior and
     flag it to the S2-006/S2-010 owners; I won't change production code.

  Two things I need from you:
  1. Approve the plan, or give changes.
  2. Confirm the rule mapping for 002–004, 008–013 and 027–030, or paste their
     text.

❯ Plan approved with changes:
  1. In the summary bridge, never derive expected values from the bridge's own
  output. Use hand-computed constants from the fixtures (e.g. 5 reviews,
  average 3). Add a comment pointing to tests/db/review-summary.test.sql as the
  source of truth for the real SQL.
  2. For the 101-review case, assert the safety property (no answer from a
  partial subset, no model call, summary still reports the true count) and
  label it "current behavior; owners may change the refusal rule". Report it as
  a finding, don't change production code.
  3. Document in the traceability table: 008 = UI/e2e (S2-009); 012/013 =
  design decisions, cite the S2-010 docs; 027 = existing harness tests; 028 =
  S2-004 evaluation set. Rule text: 012 "context method is an architectural
  decision", 013 "no vector DB/RAG required"; 025 "target with no ingested
  reviews gives no normal answer"; 026 "Sprint 1 ownership rules remain
  authoritative".
  4. Journey test: assert exactly one model call per question and that no
  request contains markers from the other target.
  5. Note in the docs that the emulated writer.finish mirrors the SQL write
  path covered by tests/db.
     New files only. Small local commits, don't push. Proceed.
     DO NOT COMMIT OR PUSH OR CHANGE OTHER PR

⏺ Understood. Your message says not to commit, so I'll leave every change
  uncommitted in the working tree (that overrides "small local commits" in the
  paste). Starting with the fixtures and model-request shapes.

  Ran 2 shell commands (ctrl+o to expand)

⏺ Fixtures check out: mixedRatings gives count 5 and average 3. I'm now checking
  the shapes needed for reconcileIngestion and the SQL for the finish write.
  · summary

  Searched for 1 pattern, ran 4 shell commands (ctrl+o to expand)

⏺ I have what I need. Writing the bridge helper. It wraps the existing fake's
  client and adds only the summary function, the attempt views and an emulated
  finish.

⏺ Write(tests/helpers/summary-qa-bridge.ts)
  ⎿  Wrote 296 lines to tests/helpers/summary-qa-bridge.ts
       1 import { createClient, type SupabaseClient } from "@supabase/sup
         abase-js";
       2
       3 import { createSupabaseServerClient } from "@/lib/supabase/serve
         r";
       4 import type { IngestionAttemptRow } from "@/services/ingestion/i
         ngestion-attempt-repository";
       5 import type { IngestionDependencies } from "@/services/ingestion
         /ingestion-lifecycle";
       6
     … +290 lines (ctrl+o to expand)

⏺ Now the integration test file.

⏺ Write(tests/unit/services/reviews/summary-qa-dataset.integration.test.ts)
  ⎿  Wrote 435 lines to
     tests/unit/services/reviews/summary-qa-dataset.integration.test.ts
      1 /** @jest-environment node */
      2 jest.mock("server-only", () => ({}));
      3 jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerC
        lient: jest.fn() }));
      4 jest.mock("next/server", () => ({
      5   ...jest.requireActual("next/server"),
      6   connection: jest.fn(async () => {}),
      7 }));
      8
      9 import { NextRequest } from "next/server";
     … +426 lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

⏺ All 15 tests pass on the first run, and I'm next checking they can fail by
  briefly breaking production files one at a time and restoring each with git
  checkout. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ All four mutations were caught, and every production file is back as it was
  (git status shows only my two new files). Now the traceability doc. First I'll
  pull exact test names to cite.

  Ran 1 shell command (ctrl+o to expand)

⏺ Write(docs/s2-002-integration-coverage.md)
  ⎿  Wrote 96 lines to docs/s2-002-integration-coverage.md
       1 # S2-002 critical integration test coverage
       2
       3 **Story:** S2-002 (#53) | **Rules:** S2-BR-001 to S2-BR-014, S2-
         BR-022 to S2-BR-030 |
       4 **New suite:** `tests/unit/services/reviews/summary-qa-dataset.i
         ntegration.test.ts` |
       5 **New helper:** `tests/helpers/summary-qa-bridge.ts`
       6
       7 ## Why this suite exists
       8
     … +88 lines (ctrl+o to expand)

⏺ Doc written. Now formatting my three files and running the full check list.

⏺ Bash(npx prettier --write tests/helpers/summary-qa-bridge.ts
      tests/unit/services/reviews/summary-qa-dataset.integration.test.ts
      docs/s2-002-integration-coverage.md &…)
  ⎿  Updated docs/s2-002-integration-coverage.md (+28 -28)
      33  `tests/helpers/summary-qa-bridge.ts` wraps the client the fake 
          returns, without modifying it,
      34  and adds just what the summary and ingestion paths need over th
          e **same** `fake.tables` rows:
      35  
      36 -| Added piece                                        | Mirrors 
         -(source of truth)                                              
         -                                                  |            
      37 -| -------------------------------------------------- | --------
         ----------------------------------------------------------------
         -------------------------------------------------- |            
      38 -| `rpc("get_review_summary")`                        | `supabas
         -e/migrations/20261113000000_create_review_summary.sql`, verifie
         -d by `tests/db/review-summary.test.sql`           |            
      39 -| `latest_ingestion_attempts`, `ingestion_attempts`  | The inge
         -stion-attempt view and table, verified by `tests/db/ingestion-a
         -ttempts.test.sql`                                 |            
      40 -| emulated `writer.finish`                           | `finish_
         -ingestion_attempt` in `20261107030000_bound_ingestion_completio
         -ns.sql`, verified by `tests/db/ingestion-*.test.sql` |         
      36 +| Added piece                                       | Mirrors (
         +source of truth)                                               
         +                                                    |          
      37 +| ------------------------------------------------- | ---------
         +---------------------------------------------------------------
         +--------------------------------------------------- |          
      38 +| `rpc("get_review_summary")`                       | `supabase
         +/migrations/20261113000000_create_review_summary.sql`, verified
         + by `tests/db/review-summary.test.sql`              |          
      39 +| `latest_ingestion_attempts`, `ingestion_attempts` | The inges
         +tion-attempt view and table, verified by `tests/db/ingestion-at
         +tempts.test.sql`                                    |          
      40 +| emulated `writer.finish`                          | `finish_i
         +ngestion_attempt` in `20261107030000_bound_ingestion_completion
         +s.sql`, verified by `tests/db/ingestion-*.test.sql` |          
      41  
      42  The emulated `writer.finish` mirrors the SQL write path covered
           by `tests/db`: ownership of the
      43  attempt and target, idempotence after a terminal state, accepte
          d terminal error codes only, no
     ...
      50  
      51  "New" rows are in `tests/unit/services/reviews/summary-qa-datas
          et.integration.test.ts`.
      52  
      53 -| Rule                                                         
         -                | Coverage                                     
         -                                                               
         -                                                               
         -                                                               
         -                                                               
         -                                                               
         -  |                                                            
      54 -| -------------------------------------------------------------
         ---------------- | ---------------------------------------------
         ----------------------------------------------------------------
         ----------------------------------------------------------------
         ----------------------------------------------------------------
         ----------------------------------------------------------------
         ----------------------------------------------------------------
         -- |                                                            
      55 -| S2-BR-001 summary identifies its target                      
         -                | Existing: `review-summary/route.test.ts` "ret
         -urns the authenticated owner's exact summary with private no-st
         -ore caching"; `services/qa/target-switching.production.test.ts`
         - "switches real summary-route aggregates with Q&A evidence…". N
         -ew: every summary assertion checks `targetId`.                 
         -                                                               
         -     |                                                         
      56 -| S2-BR-002 summary computed from app data, not an LLM         
         -                | Existing: `services/reviews/review-summary.te
         -st.ts` "uses the exact database aggregate instead of loading fu
         -ll reviews". New: "S2-BR-002: the summary is a database aggrega
         -te, never a model call or a review-text read".                 
         -                                                               
         -                                                               
         -    |                                                          
      57 -| S2-BR-003 / 004 only successfully ingested reviews are counte
         -d               | Existing: `tests/db/review-summary.test.sql`;
         - `ingestion-lifecycle.test.ts` "retrieves by stored owner, targ
         -et and job and atomically finishes verified reviews". New: "a p
         -artly rejected batch: summary and Q&A both see only the 3 saved
         - reviews; skippedCount reports 4".                             
         -                                                               
         -    |                                                          
      58 -| S2-BR-005 success / failure / partial distinguishable        
         -                | Existing: `components/ingestion/IngestionStat
         -us.test.tsx`, `components/analysis-targets/IngestionPanel.test.
         -tsx`, `ingestion/route.test.ts`. New (summary side): the all-re
         -jected and provider-failed tests assert `ingestionStatus: "fail
         -ed"`.                                                          
         -                                                               
         -    |                                                          
      59 -| S2-BR-006 skipped / rejected records never appear as ingested
         -                | Existing: `services/reviews/normalize.test.ts
         -` "keeps valid records and reports rejected ones with their ind
         -ex". New: "a partly rejected batch…" (rejected markers absent f
         -rom the model request, `skippedCount` 4) and "S2-BR-025: an all
         --rejected batch fails ingestion…".                             
         -                                                               
         -       |                                                       
      60 -| S2-BR-007 summary represents the Q&A dataset                 
         -                | Existing (partial): `services/qa/target-switc
         -hing.production.test.ts` "switches real summary-route aggregate
         -s…". New: "%s: summary count and average equal the Q&A evidence
         - set" (mixedRatings 5/3, restaurantA 4/4, targetA 3/11⁄3, targe
         -tB 2/3) and "mixedRatings: Q&A evidence carries exactly the fiv
         -e persisted review IDs".                                       
         -   |                                                           
      61 -| S2-BR-008 Q&A available from the target workspace            
         -                | UI/e2e (S2-009): `components/reviews/ReviewQu
         -estions.test.tsx` "submits a trimmed question with the active t
         -arget and displays the answer"; `tests/e2e/auth/review-question
         -s.spec.ts` "asks from the active workspace, shows processing an
         -d resets after switching targets".                             
         -                                                               
         -     |                                                         
      62 -| S2-BR-009 Q&A uses only the active target's reviews          
         -                | Existing: `qa-harness/real-pipeline.integrati
         -on.test.ts` "verifies the session, checks ownership, then reads
         - only the active target's reviews"; `services/qa/review-context
         --pipeline.integration.test.ts`. New: journey test asserts exact
         - review IDs per step.                                          
         -                                                               
         -    |                                                          
      63 -| S2-BR-010 / 011 insufficient evidence is communicated        
         -                | Existing: `services/qa/insufficient-evidence.
         -test.ts` "returns an insufficient_evidence reply that states th
         -e limitation, with no citations"; golden cases in `qa-harness/g
         -olden-cases.test.ts`.                                          
         -                                                               
         -                                                               
         -   |                                                           
      64 -| S2-BR-012 context method is an architectural decision        
         -                | Design decision, documented in `docs/s2-010-r
         -eview-context.md` ("Scope and architectural decision"; strategy
         - `all-persisted-reviews`). Not a runtime behavior to test.     
         -                                                               
         -                                                               
         -                                                               
         -  |                                                            
      65 -| S2-BR-013 no vector DB / RAG required                        
         -                | Design decision, documented in `docs/s2-010-r
         -eview-context.md`. New suite confirms the bounded complete-data
         -set behavior at its limit (see the 101-review test).           
         -                                                               
         -                                                               
         -                                                               
         - |                                                             
      66 -| S2-BR-014 active target stays visible                        
         -                | Existing: `app/analysis-targets/workspace.tes
         -t.tsx`; `app/analysis-targets/target-switching.production.test.
         -tsx` "switches the actual workspace label, review list and ques
         -tion target together". New: answers carry the active `targetId`
         - in the journey test.                                          
         -                                                               
         -   |                                                           
      67 -| S2-BR-022 only the authenticated user's data enters AI contex
         -t               | Existing: `real-pipeline.integration.test.ts`
         - "denies User A User B's target before any review read or model
         - call"; `services/ai/cross-user-ai-context-route.test.ts`; `sta
         -le-context.integration.test.ts`. New: "summary and Q&A deny Use
         -r B's target exactly like a missing one, with no reads and no m
         -odel call"; "signed out: summary is 401 and Q&A is AUTH_REQUIRE
         -D…". |                                                         
      68 -| S2-BR-023 target change changes the Q&A dataset              
         -                | Existing: `services/qa/target-switching.produ
         -ction.test.ts`, `qa-harness/stale-context.integration.test.ts` 
         -"uses fresh active-target evidence on A -> B -> A…". New: "A ->
         - B -> A: each step returns only the active target's summary and
         - Q&A dataset, one model call per question".                    
         -                                                               
         -   |                                                           
      69 -| S2-BR-024 previous target's reviews do not remain active     
         -                | Existing: as S2-BR-023, plus `real-pipeline.i
         -ntegration.test.ts` "A → B → A sends only the active target eac
         -h time". New: journey test asserts no request contains the othe
         -r target's marker, ID or review IDs, and per-target ingestion s
         -tatus / skipped count switch too.                              
         -                                                               
         -   |                                                           
      70 -| S2-BR-025 a target with no ingested reviews gives no normal a
         -nswer           | Existing: `review-context-pipeline.integratio
         -n.test.ts` "prevents provider invocation for an empty dataset";
         - `app/analysis-targets/target-switching.production.test.tsx` "s
         -hows empty B summary and disables Q&A after leaving populated A
         -". New: "never-ingested empty target…", "provider-failed ingest
         -ion target…", "S2-BR-025: an all-rejected batch fails ingestion
         -…".   |                                                        
      71 -| S2-BR-026 Sprint 1 ownership rules remain authoritative      
         -                | Existing: `services/analysis-targets/target-o
         -wnership.test.ts`; `tests/db/cross-user-*.test.sql`. New: the f
         -oreign-target test runs the real S1 guard on both paths; no new
         - ownership logic is introduced.                                
         -                                                               
         -                                                               
         -   |                                                           
      72 -| S2-BR-027 Q&A tests are deterministic                        
         -                | Existing harness tests: `qa-harness/determini
         -sm.test.ts` "produces identical requests, replies and errors ac
         -ross 5 full golden-suite runs"; `qa-harness/network-guard.test.
         -ts`. New suite uses the same harness, fixed fixtures and no clo
         -ck, and was run 3× (see PR evidence).                          
         -                                                               
         -    |                                                          
      73 -| S2-BR-028 Q&A behavior evaluated against a fixed set         
         -                | S2-004 evaluation set: `tests/fixtures/scope-
         -guard-evaluation.ts`, `tests/unit/fixtures/scope-guard-evaluati
         -on.test.ts`, `docs/scope-guard-evaluation.md`.                 
         -                                                               
         -                                                               
         -                                                               
         -   |                                                           
     … 28 more lines (ctrl+o to expand)
  ⎿  Updated tests/helpers/summary-qa-bridge.ts (+13 -3)
      29  const SUMMARY_RPC = "get_review_summary";
      30  const ATTEMPT_RELATIONS = new Set(["latest_ingestion_attempts",
           "ingestion_attempts"]);
      31  /** Error codes `finish_ingestion_attempt` accepts as terminal 
          for a bound job. */
      32 -const TERMINAL_ERROR_CODES = new Set(["INGESTION_FAILED", "SOUR
         -CE_IDENTITY_UNVERIFIED", "NO_REVIEWS"]);                       
      32 +const TERMINAL_ERROR_CODES = new Set([                         
      33 +  "INGESTION_FAILED",                                          
      34 +  "SOURCE_IDENTITY_UNVERIFIED",                                
      35 +  "NO_REVIEWS",                                                
      36 +]);                                                            
      37  
      38  export interface BridgeRequest {
      39    readonly resource: string;
     ...
      48    readonly requests: readonly BridgeRequest[];
      49    /** A session-scoped client like `createSupabaseServerClient(
          )`, for direct service calls. */
      50    client(): SupabaseClient;
      47 -  addAttempt(overrides: Partial<IngestionAttemptRow> & Pick<Ing
         -estionAttemptRow, "analysis_target_id" | "owner_id">): Ingestio
         -nAttemptRow;                                                   
      51 +  addAttempt(                                                  
      52 +    overrides: Partial<IngestionAttemptRow> &                  
      53 +      Pick<IngestionAttemptRow, "analysis_target_id" | "owner_i
         +d">,                                                           
      54 +  ): IngestionAttemptRow;                                      
      55    /** Makes the summary RPC fail with this HTTP status (undefin
          ed to clear). */
      56    failSummary(status: number | undefined): void;
      57    /** Emulated attempt writer for `reconcileIngestion`. Only `e
          xpireBound` and `finish` are used. */
     ...
      90            .p_target_id;
      91          requests.push({ resource: `rpc:${SUMMARY_RPC}`, actorId
          , targetId });
      92          if (summaryFailure !== undefined) {
      86 -          return json({ message: "SUMMARY_BRIDGE_PRIVATE_DB_DIA
         -GNOSTIC" }, { status: summaryFailure });                       
      93 +          return json(                                         
      94 +            { message: "SUMMARY_BRIDGE_PRIVATE_DB_DIAGNOSTIC" }
         +,                                                              
      95 +            { status: summaryFailure },                        
      96 +          );                                                   
      97          }
      98          // Mirrors: auth.uid() must own the target, else P0002 
          'Target unavailable'.
      99          if (!ownsTarget(actorId, targetId)) {
  ⎿  Updated
     tests/unit/services/reviews/summary-qa-dataset.integration.test.ts (+7
     -2)
      202  
      203    it("a partly rejected batch: summary and Q&A both see only t
           he 3 saved reviews; skippedCount reports 4", async () => {
      204      // 3 valid + 3 rejected by normalization + 1 skipped by th
           e provider = 3 saved, 4 skipped.
      205 -    const ingestion = await ingest([VALID[0], REJECTED[0], VAL
          -ID[1], REJECTED[1], VALID[2], REJECTED[2]], 1);               
      205 +    const ingestion = await ingest(                           
      206 +      [VALID[0], REJECTED[0], VALID[1], REJECTED[1], VALID[2],
          + REJECTED[2]],                                                
      207 +      1,                                                      
      208 +    );                                                        
      209      expect(ingestion).toMatchObject({ state: "succeeded", save
           dCount: 3, skippedCount: 4 });
      210  
      211      const summary = await getSummary(emptyTarget.target.id);
     ...
      245        skippedCount: 3,
      246      });
      247      expectRefused(await qa().ask(emptyTarget.target.id, "How i
           s breakfast?"), "noReviewData");
      245 -    expect(qa().supabase.tables.reviews.some((r) => r.analysis
          -_target_id === emptyTarget.target.id)).toBe(false);           
      248 +    expect(                                                   
      249 +      qa().supabase.tables.reviews.some((r) => r.analysis_targ
          +et_id === emptyTarget.target.id),                             
      250 +    ).toBe(false);                                            
      251    });
      252  });
      253  
  ⎿  (files that changed while this command ran, by the command or by
     another process; a convenience view, not a review or audit of the
     command)
  ⎿  (timeout 6m 40s)

⏺ Format, lint and typecheck all clean (the file changes were just Prettier).
  Running the full test suite, coverage:changed and build next.

  Ran 1 shell command (ctrl+o to expand)

⏺ Two suites failed that look unrelated to my files. Checking why:

  Ran 2 shell commands (ctrl+o to expand)

⏺ Both failures come from the local environment, not from S2-002: this machine
  runs Node v23.10.0 where the project requires 24, and node_modules has stock
  deepmerge 4.3.1 instead of the patched vendor copy. I'm running
  coverage:changed, build and the new suite three times next without
  reinstalling or switching Node. · summary

  Ran 3 shell commands (ctrl+o to expand)

⏺ S2-002 is implemented as three new uncommitted files: the 15 new tests pass on
  all three runs. Nothing is committed or pushed, no PR was touched, and no
  production or teammate file changed (git status shows only my three files).

  - summary-qa-dataset.integration.test.ts
    (tests/unit/services/reviews/summary-qa-dataset.integration.test.ts) — the
    15 new tests.
  - summary-qa-bridge.ts (tests/helpers/summary-qa-bridge.ts) — a test helper
    that wraps the existing fake Supabase client without modifying it. It adds
    only the summary database function, the ingestion-attempt reads and an
    emulated writer.finish, all over the same in-memory rows Q&A reads.
  - s2-002-integration-coverage.md (docs/s2-002-integration-coverage.md) — the
    rule-to-test table, findings and follow-ups.

  All five of your changes are in. Expected values are hand-computed constants,
  the bridge points to tests/db as the source of truth, the 101-review test is
  labelled "current behavior; owners may change the refusal rule", the table
  uses your mapping for 008/012/013/025–028, and the journey test asserts one
  model call per question and no cross-target markers.

  Proof the tests can fail: I briefly changed four production behaviors, one at
  a time, and restored each with git checkout straight after. Each change made
  at least one new test fail:
  - dropping the rejected records from the skipped count;
  - saving raw records instead of normalized ones;
  - removing the summary's ownership checks;
  - letting the summary read another target's ingestion attempt.

  Check results

  ┌────────────────────────┬─────────────────────────────────────────────────┐
  │         Check          │                     Result                      │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ format:check           │ ✅ all files formatted                          │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ lint                   │ ✅ no output                                    │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ typecheck              │ ✅                                              │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ build                  │ ✅ exit 0                                       │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ new suite ×3           │ ✅ 15/15 each run; no skip, todo or only        │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ coverage:changed:check │ ✅ "No coverable changed source lines. Nothing  │
  │                        │ to gate. PASS" (only test files changed)        │
  ├────────────────────────┼─────────────────────────────────────────────────┤
  │ npm test               │ ⚠️ 1583 passed, 6 failed in 2 suites, caused by │
  │                        │  this machine's setup                           │
  └────────────────────────┴─────────────────────────────────────────────────┘

  The two failing suites don't touch my files:
  - migration-versions.test.ts fails because this machine runs Node v23.10.0,
    but package.json requires >=24. The extra warning Node 23 prints breaks the
    test's empty-stderr check.
  - deepmerge.test.ts fails because the installed deepmerge is the stock 4.3.1,
    not the patched vendor/deepmerge-patched (4.3.1+reviewlens.1). It looks like
    a stale install.

  The likely fix is Node 24 plus a fresh npm ci. I didn't do either without
  asking. The coverage:changed npm script stops at those same failures, so I ran
  its check step on its own.

  I filled in rule text for 029 ("no live provider calls") and 030 ("behavior,
  not wording") from your earlier summary, because their exact text isn't in the
  repo. Please correct the table if it's wrong.

  PR description draft

  Written for: CS490 teammates reviewing the S2-002 PR.

  ## S2-002: Add critical integration test coverage

  Refs #53

  ### What
  Adds cross-boundary tests between the S2-006 review summary and the
  S2-010/S2-011 Q&A pipeline. Both run their real production code over one set
  of persisted rows. New files only; no production or existing test files
  changed.

  - `tests/unit/services/reviews/summary-qa-dataset.integration.test.ts`: 15
  tests
  - `tests/helpers/summary-qa-bridge.ts`: wraps the S2-003 fake Supabase client
  without modifying it. Adds `get_review_summary`, the ingestion-attempt reads
  and an emulated `finish_ingestion_attempt`, all over the same `fake.tables`
  rows. Mirrors SQL verified by `tests/db/review-summary.test.sql` and
  `tests/db/ingestion-*.test.sql`.
  - `docs/s2-002-integration-coverage.md`: rule-to-test traceability for
  S2-BR-001..014 and 022..030

  ### Coverage added
  - **S2-BR-007:** summary count and average equal the Q&A evidence set, using
  hand-computed fixture values (mixedRatings 5/3, restaurantA 4/4, targetA
  3/11⁄3, targetB 2/3) and exact review IDs.
  - **S2-BR-003/004/006:** real `reconcileIngestion` with 3 valid records, 3
  rejected and 1 provider-skipped. Summary shows 3 reviews and 4 skipped; Q&A
  gets exactly the 3 saved reviews and no rejected record.
  - **S2-BR-022–024:** A → B → A journey. Summary and Q&A switch together,
  including ingestion status and skipped count. One model call per question; no
  request contains the other target's data.
  - **S2-BR-022/026:** another user's target is denied on both paths, identical
  to a missing target. No review, aggregate or ingestion-attempt read; no model
  call.
  - **S2-BR-025:** empty, provider-failed and all-rejected targets. The summary
  shows zero reviews and no average; Q&A returns `NO_REVIEW_DATA` without
  calling the model.
  - **Edge cases:** signed out (401 / `AUTH_REQUIRED`, no reads); 101 reviews
  (summary shows the true count, Q&A refuses instead of answering from a
  subset); summary aggregate failure (safe 500, never zeros).

  ### Test Evidence
  - `format:check`, `lint`, `typecheck`, `build`: pass
  - New suite run 3×: 15/15 each run
  - `coverage:changed:check`: PASS (no coverable changed source lines)
  - `npm test`: 1583 passed. 6 failures in `migration-versions.test.ts` and
  `deepmerge.test.ts` come from the local environment (Node 23 < required 24;
  stale install without the vendored deepmerge patch) and are unrelated to this
  change.
  - Mutation check: four temporary production mutations (skipped count,
  raw-record persistence, summary ownership, ingestion-attempt target filter)
  each failed at least one new test. All were reverted.

  ### Findings for owners
  1. **S2-006 / S2-010:** the summary counts every persisted review, but Q&A
  refuses above 100 (`REVIEW_CONTEXT_TOO_LARGE`), so a user can see "101
  reviews" next to a Q&A refusal. The test pins the current safe behavior and is
  labelled as changeable.
  2. **S2-003 harness:** the fake Supabase has no RPC or ingestion-attempt
  support, so suites stub the summary separately (e.g.
  `target-switching.production.test.ts` mocks `getLatestAttempt` to `null`).
  Folding the bridge into the harness is a possible follow-up.

  ### Follow-ups owned elsewhere
  - S2-008 (Bansi): adding or removing a persisted review changes the summary.
  Intentionally not written here.
  - UI-level target switch: already covered by S2-017/S2-018
  (`target-switching.production.test.tsx`, e2e switch specs).

  ### AI use
  Claude Code (Claude Opus 5.5) analyzed the existing coverage, drafted the gap
  matrix, and wrote the tests, bridge helper and documentation under my
  direction. I reviewed the plan before any code was written. Mutation checks
  confirmed the tests fail when the protected behavior breaks.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  When you want to commit, tell me and I'll split it into small local commits,
  without pushing.
❯ export /ai-transcripts/2026-11-16_deep_S2-002_claude-code.md

  Listed 1 directory (ctrl+o to expand)

⏺ The repo keeps transcripts in ai-transcripts/, and this session's log is
  9d08a86f….jsonl. Next I'm checking the team's format and redaction rules.

  Ran 1 shell command (ctrl+o to expand)

⏺ Opus 5.5's safeguards stopped the response above · continuing once
  with that noted

⏺ API Error: Opus 5.5's safeguards flagged this message
  (https://www.anthropic.com/legal/aup). This sometimes happens with
  safe, normal conversations. Claude Code can't respond to this message
  with Opus 5.5.

  Try rephrasing the request in a new session or change your model.

  Learn more: https://support.claude.com/en/articles/8106465

  Details: `[reasoning_extraction]`

  Request ID: req_011Ch6sm52yR1vYmj5KXskDj

  Message ID: msg_011Ch6sm5KLNJgqzZrjxgvx9