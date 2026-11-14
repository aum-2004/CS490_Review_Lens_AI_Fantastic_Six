 ▐▛███▛█   Claude Code v2.1.318
▝▜██████▀  Opus 5.5 · Claude Pro
 ▝▝   ▝▝   ~/Desktop/CS490_Review_Lens_AI_Fantastic_Six

▎ [✻] [✻] [✻] · Share Claude Code and earn $10 in usage credits · /passes

❯ You are helping me implement story S2-003 — Deterministic Q&A Test Harness    
  for ReviewLens AI (NJIT CS 490 team project).                                 
                                                                                
  ## Stack                                                                      
  Next.js + React + TypeScript (server-side API routes), Supabase PostgreSQL +  
  Supabase Auth, OpenAI API, deployed on Vercel. CI runs on GitHub Actions with 
  branch protection.                                                            
                                                                                
  ## Goal                                                                       
  Build a test harness that lets us test the review Q&A feature with NO real    
  OpenAI calls, NO network, and NO live Supabase, so results are fully          
  deterministic and repeatable in CI.                                           
                                                                                
  ## Context                                                                    
  - Sprint 2 Q&A is built by teammates: Shawn (S2-010 review dataset context    
  builder, S2-018/019 context changes/staleness), Aryan (S2-013 system prompt,  
  S2-011 answers from evidence, S2-012 insufficient evidence), Neel (scope      
  guards, S2-014/015/016), Melissa (Q&A UI).                                    
  - Their code may not be merged yet. Do NOT modify files they own. Build       
  against interfaces and mocks, and make the harness easy to adopt once their   
  code lands.                                                                   
  - Other stories of mine (S2-001 coverage gate, S2-002 integration tests) will 
  reuse this harness, so design it to be reusable.                              
                                                                                
  ## Step 0 — Discover (do not write code yet)                                  
  1. Explore the repo: structure, existing test framework/config                
  (Jest/Vitest/Playwright?), test folder conventions, tsconfig paths,           
  package.json scripts, .github/workflows, any existing OpenAI client wrapper,  
  Supabase client usage, and any Q&A-related code or types already on main or   
  other branches.                                                               
  2. Read docs on AI-assisted development standards and the PR/testing          
  conventions in the repo and follow them.                                      
  3. Check if S2-003's acceptance criteria exist anywhere in the repo or docs.  
  If so, quote them. If not, propose acceptance criteria based on the goal      
  above.                                                                        
  4. Summarize findings and propose a short implementation plan: files to       
  create/modify, the harness API, test approach, dependencies/blockers on       
  teammates. WAIT for my approval before coding.                                
                                                                                
  ## Requirements (after I approve the plan)                                    
  1. **Deterministic fake LLM client**: implements the same interface the app   
  uses for OpenAI (introduce a thin interface/adapter only if none exists,      
  minimally invasive). Supports scripted responses keyed by prompt/question, a  
  default fallback, configurable errors/timeouts/empty responses, and records   
  every call (messages, system prompt, model, params) for assertions. Never     
  touches the network. Fails loudly if a test accidentally calls the real       
  client.                                                                       
  2. **Fixture review datasets**: small, typed, hand-written fixtures (e.g.     
  normal dataset, empty dataset, mixed ratings, dataset for Target A vs Target  
  B, duplicate/skipped records). Fixed IDs, dates, and ordering — no            
  randomness, no Date.now() dependence (use fake timers or injected clock).     
  3. **Golden Q&A cases**: a table-driven set of {question, dataset, expected   
  behavior} covering: answerable from reviews, insufficient evidence,           
  general-knowledge question, question about another entity/platform,           
  cross-user data leakage attempt, target switch, stale context. Assertions     
  target behavior and structure (grounding, refusal, context contents), not     
  exact LLM prose.                                                              
  4. **Context/prompt assertions**: helpers to assert the system prompt is      
  applied, only the active target's reviews are in context, and no other user's 
  data appears.                                                                 
  5. **Harness helpers**: a single setup function (e.g. createQaTestHarness({   
  fixtures, llmScript })) returning the fake client, the call log, and cleanup. 
  Reset state between tests.                                                    
  6. **Determinism proof**: a test that runs the same scenario multiple times   
  and asserts identical results, plus a check that the suite passes with        
  network access blocked.                                                       
  7. **Negative and edge cases**: malformed LLM output, empty question, very    
  long question, missing dataset, LLM error path.                               
  8. **Docs**: a short README section (where the harness lives, how to add a    
  golden case, how to script a fake response, how to run it).                   
  9. Add/confirm an npm script (e.g. `test:qa`) and make sure it runs in the    
  existing CI workflow without secrets.                                         
                                                                                
  ## Constraints                                                                
  - TypeScript strict, no `any` unless justified. Match existing lint/format    
  rules.                                                                        
  - No new dependencies unless clearly necessary; justify any you propose.      
  - Don't touch teammates' files; if an interface is missing, define it in a    
  clearly-labeled harness-owned file and flag it for team agreement.            
  - Work on a new branch `feat/s2-003-qa-test-harness`. Small, logical commits. 
                                                                                
  ## Verification before you say you're done                                    
  - Run lint, typecheck, and the full test suite; show the output.              
  - Run the harness tests 3x to confirm no flakiness.                           
  - Confirm no real network or env secrets are needed.                          
                                                                                
  ## Deliverables                                                               
  1. The code and tests above.                                                  
  2. A PR description: what/why, files changed, how to run, how teammates       
  should use the harness, open questions/blockers.                              
  3. A short summary of the interfaces teammates must agree on (so I can post   
  it to the team within 24 hours).                                              
  4. A transcript-friendly summary of the AI-assisted steps (our workflow       
  requires AI development transcripts).                                         
                                                                                
  Start with Step 0 only.                                                       
  DO NOT COMMIT OR PUSH ANYTHING OR CHANGE ANY OF MY TEAMMATES CODE, you can    
  deifnitely explore the repo                                                   

⏺ I'll start with Step 0 — read-only exploration.

  Searched for 1 pattern, ran 3 shell commands (ctrl+o to expand)

⏺ Key early finding: the S2-003 story text exists in Sprint2Issues.csv. Now the
  teammates' remote Q&A branches.

  Ran 1 shell command (ctrl+o to expand)

⏺ The integration branch has the real Q&A boundary. Reading its core files.

  Ran 4 shell commands (ctrl+o to expand)

⏺ The model seam already exists on the integration branch (QaModelCaller). Now
  Neel's S2-004/014/015/016 test foundations, which overlap with my scope.

  Ran 2 shell commands (ctrl+o to expand)

⏺ Now the team's process docs and the open PR status.

  Read 1 file, ran 7 shell commands (ctrl+o to expand)

⏺ I've finished Step 0. I only read files and refs: no code written, nothing
  committed or pushed, no teammate files touched, no branch created.

  Findings

  1. Repo and tooling
  - Tests: Jest 30 via next/jest (jest.config.ts), with testMatch: 
    tests/unit/**/*.test.{ts,tsx} and jsdom by default. Server tests opt into
    node with /** @jest-environment node */ and use jest.mock("server-only", () 
    => ({})). Playwright handles e2e and tests/db/run.sh handles the SQL/RLS
    tests.
  - Layout: test code lives in tests/unit/ (mirroring src/), tests/fixtures/
    and, from Neel, tests/helpers/. Jest does not pick up tests/integration/,
    even though the engineering standards list it.
  - Config: TS strict, @/* → src/*, ESLint 9 with next + prettier, and Prettier
    at 100 columns with double quotes.
  - CI: ci.yml runs format:check, lint, typecheck, npm test and build with no
    secrets. Any test under tests/unit/ already runs in CI.
  - Q&A code on main: none. There's no OpenAI wrapper and no src/services/qa/.
  - Node version: .nvmrc and engines require Node 24, but you have v23.10.0
    locally. That may cause warnings during verification.

  2. Teammate Q&A code (all in open, unmerged PRs)

  The model seam already exists, so I won't need to add an adapter. It's on
  integration/S2-010-S2-011-qa-context (PR #82, a draft stacked on #79, which is
  stacked on #76):
  - QaModelCaller = (request: QaModelRequest) => Promise<QaModelReply>, in
    Aryan's answer-question.ts.
  - QaModelRequest has { promptVersion, targetId, instructions, input, 
    reviewIds, estimatedInputTokens, maxOutputTokens }, in system-prompt.ts.
  - answerActiveTargetQuestion(targetId, question, { callModel }) is Shawn's
    binding. It always uses the real buildReviewDatasetContext. Its doc says
    outright: "For Neel/Deep's deterministic evaluations, replace only the model
    boundary."
  - createOpenAiQaModel({ fetcher, env }) is the second seam, for checking the
    real OpenAI request body (store: false, the instructions/input split, the
    JSON schema).
  - The context builder reads auth through getAuthenticatedUser() and Supabase
    through createSupabaseServerClient(). Shawn's test fakes Supabase with real
    supabase-js and an injected fetch, so no network is needed.
  - Neel's S2-016 doc (cross-user-ai-context-security.md) names "Deep's S2-003
    deterministic harness" as what captures the full model request. It also
    expects an echo-every-marker fake reply.
  - Fixtures I can reuse rather than duplicate: the S2-004 scope set on main
    (tests/fixtures/scope-guard-evaluation.ts) and the S2-016 cross-user fixture
    on Neel's branch.

  3. Process rules I'll follow (AI-Assisted-Development.md,
  engineering-standards.md)
  - OpenAI calls must be mocked in CI.
  - Cross-user tests must use User A and User B.
  - No new dependencies without justification.
  - The transcript goes in
    ai-transcripts/YYYY-MM-DD_<author>_S2-003_claude-code.md and is linked from
    the PR.
  - The PR links the issue (#54) and states that AI was used. The full DoD
    command set has to pass.

  4. Branch problem

  The current feature/s2-003-qa-test-harness (and the local S2-003) has no
  S2-003 work. It holds only a stale pre-squash S2-004 commit, f75df8f. Diffed
  against main, it would revert Neel's newer S2-004 changes. I'd create a fresh
  feat/s2-003-qa-test-harness from origin/main and leave the old branches alone.

  Acceptance criteria (issue #54, quoted)

  ▎ Outcome: The team can automatically test ReviewLens Q&A orchestration 
  ▎ without depending on unpredictable live-model output.
  ▎ …Tests should be able to verify:
  ▎ 1. Correct system instructions are supplied.
  ▎ 2. Correct review context is supplied.
  ▎ 3. Wrong-target reviews are not supplied.
  ▎ 4. Cross-user reviews are not supplied.
  ▎ 5. Application behavior is correct for controlled model responses.
  ▎
  ▎ The test architecture should not require developers to spend money on model 
  ▎ API calls every time CI runs.
  ▎ Rules: S2-BR-009 through S2-BR-014, S2-BR-022, S2-BR-027 through S2-BR-031

  The S2-BR rule texts aren't defined anywhere in the repo, only referenced. I'd
  add these proposed criteria based on your goal:
  - AC6: Running the same scenario repeatedly gives identical results and call
    logs.
  - AC7: The suite passes with network access blocked and without
    OPENAI_API_KEY, QA_ENABLED or any Supabase variables.
  - AC8: Any attempt to reach the real provider fails the test loudly.
  - AC9: Malformed, empty, error and timeout model replies, plus empty, very
    long or missing inputs, are covered.
  - AC10: The README documents how to add a golden case and script a reply.

  Proposed plan

  One limitation to agree on first: with a fake model, the reply's outcome is
  whatever the test scripts, so asserting it back would be circular. The golden
  cases therefore check what the app sends (system prompt, context, review IDs,
  no foreign markers) and how it handles each scripted reply. For example, an
  "answered" reply with no citations is rejected, a citation of a foreign review
  ID is rejected, and a decline has its citations stripped. Whether the model
  actually refuses a general-knowledge question needs a separate opt-in live
  evaluation, which is outside S2-003.

  Base branch. I recommend two PRs:
  - PR 1, based on main: the harness core and its self-tests. It imports none of
    the unmerged code, so it can merge now.
  - PR 2, stacked on #82: the golden suite that runs through the real pipeline.
    It is retargeted to main once #76, #79 and #82 merge.

  Files (all new and harness-owned, except the last two):

  Path: tests/helpers/qa-harness/contract.ts
  Purpose: Harness-owned copies of the QaModelCaller, QaModelRequest,
    QaModelReply and QaAnswer types, flagged for team agreement. PR 2 adds a
    compile-time check that they match the real types.
  ────────────────────────────────────────
  Path: tests/helpers/qa-harness/fake-model.ts
  Purpose: createFakeQaModel(): scripted rules matched by question, question
    substring, target or a predicate; dynamic replies such as "echo every
    marker"; a default fallback; error, timeout, empty and malformed replies; a
    record of every call.
  ────────────────────────────────────────
  Path: tests/helpers/qa-harness/fake-openai-fetch.ts
  Purpose: A fake fetcher that wraps replies in the Responses API envelope and
    records the outgoing body. Any other URL throws RealNetworkCallError.
  ────────────────────────────────────────
  Path: tests/helpers/qa-harness/fake-supabase.ts
  Purpose: An in-memory PostgREST fake built on real supabase-js with injected
    fetch, plus a fake verified session for User A or B. This generalises
  Shawn's
     pattern.
  ────────────────────────────────────────
  Path: tests/helpers/qa-harness/network-guard.ts
  Purpose: Blocks global fetch and net.Socket#connect, and strips QA and
  Supabase
    variables from process.env.
  ────────────────────────────────────────
  Path: tests/helpers/qa-harness/assertions.ts
  Purpose: expectSystemPromptApplied, expectContextOnlyForTarget,
    expectNoForeignData(markers, ids), expectGrounded and expectDeclined.
  ────────────────────────────────────────
  Path: tests/helpers/qa-harness/index.ts
  Purpose: createQaTestHarness({ fixtures, user, script }), which returns { 
    callModel, fetcher, calls, supabase, ask(targetId, q), reset, cleanup  }.
  ────────────────────────────────────────
  Path: tests/fixtures/qa/datasets.ts
  Purpose: Typed datasets with fixed IDs and dates: normal, empty, mixed
  ratings,
    Target A ("battery life") vs Target B ("customer service"), User B's private

    target, and duplicate or skipped rows. It reuses the S2-004 and S2-016
    fixtures where possible.
  ────────────────────────────────────────
  Path: tests/fixtures/qa/golden-cases.ts
  Purpose: A table of { id, question, dataset, user, script, expect } covering
    all seven scenarios you listed.
  ────────────────────────────────────────
  Path: tests/unit/qa-harness/*.test.ts
  Purpose: Self-tests for the harness plus the determinism proof: run 5 times,
    deep-equal the results, all with the network guard on.
  ────────────────────────────────────────
  Path: tests/unit/services/qa/golden-qa.test.ts (PR 2)
  Purpose: Runs each golden case through the real answerActiveTargetQuestion,
    including target-switch and stale-context sequences.
  ────────────────────────────────────────
  Path: package.json (mine to edit)
  Purpose: Adds "test:qa": "jest --runInBand tests/unit/qa-harness 
    tests/unit/services/qa".
  ────────────────────────────────────────
  Path: README section (shared file)
  Purpose: One additive section on the harness.

  CI. npm test already runs these suites, so no workflow change is strictly
  needed. If you want visible proof, I'd add one npm run test:qa step to ci.yml
  (that file came from my S1-007 work).

  Dependencies. None. Jest, supabase-js and Zod cover everything.

  Teammate interfaces the harness depends on (to raise with the team):
  1. Aryan: keep the QaModelCaller, QaModelRequest and QaModelReply shapes
     stable, plus QA_OUTCOMES and the reply JSON. The harness pulls the question
     out of the QUESTION (JSON string): block of input. I'd ask Aryan to export
     a parser for that block or add a question field to the request, so the
     harness doesn't break if the prompt format changes.
  2. Shawn: keep the callModel option on answerActiveTargetQuestion as the only
     test hook (it should never be able to override the context builder). Also
     keep the Supabase table and column names the builder queries. S2-018/019
     has no session coordinator yet, so I'd test stale context at the service
     level for now.
  3. Neel: map QA_OUTCOMES to the S2-004 category names in a harness adapter,
     not by renaming either side. S2-016 Phase 2 can use createQaTestHarness
     directly.
  4. Melissa: there's no Q&A route yet. Once it lands, the harness can drive it
     through the same callModel hook.

  Blockers: PR 2 waits for #76, #79 and #82 to merge. PR 1 has none.

  Decisions I need from you:
  - (a) The two-PR split above. The alternatives are one PR stacked on #82, or
    main-only with no real-pipeline tests.
  - (b) Whether to add the test:qa CI step.
  - (c) Whether I may create feat/s2-003-qa-test-harness from origin/main.
    Creating it is only a local branch, with no commit or push.

  I'll wait for your approval before writing any code.

❯ Approved with changes:                                                        
  - PR 1 (from origin/main) contains only: contract.ts, fake-model.ts,          
  network-guard.ts, assertions.ts, index.ts (model-level harness only),         
  fixtures/datasets, self-tests, determinism proof, test:qa script, README      
  section. Move fake-openai-fetch.ts and fake-supabase.ts to PR 2, since they   
  depend on unmerged code.                                                      
  - No ci.yml change.                                                           
  - Use branch feature/s2-003-qa-test-harness (already created from             
  origin/main, pushed, verified clean). Do not create another branch. Don't     
  push; I'll push myself.                                                       
  - Proceed with the harness-owned contract copies, flagged for team agreement. 
  - Work in small commits, run format:check, lint, typecheck, npm test, and     
  build before finishing, and write the transcript summary at the end.          
    Start implementing PR 1.                                                    
    DO NOT COMMIT OR PUSH ANYTHING OR CHANGE ANY OF MY TEAMMATES CODE, you can  
  deifnitely explore the repo                                                   

⏺ You asked for "small commits" in the pasted plan, but your own message says
  not to commit anything, so I'll follow that: changes stay uncommitted in the
  working tree. First, checking the branch.

  Ran 1 shell command (ctrl+o to expand)

⏺ Branch is at origin/main and clean. Reading the domain types and remaining
  fixture data I'll build on.

  Ran 1 shell command (ctrl+o to expand)

⏺ Branch confirmed at origin/main. Before writing, I'll check the error classes
  the real pipeline throws, so the harness expectations line up with them in PR
  2.

  Ran 1 shell command (ctrl+o to expand)

⏺ I'm starting with the harness-owned contract. It copies Aryan's and Shawn's
  types from PR #82 exactly, and every copied item is labelled for team
  agreement.

⏺ Write(tests/helpers/qa-harness/contract.ts)
  ⎿  Wrote 141 lines to tests/helpers/qa-harness/contract.ts
       1 /**
       2  * S2-003 harness-owned copy of the Q&A model-boundary contract.
       3  *
       4  * ┌────────────────────────────────────────────────────────────
         ──────────────────────────────┐
       5  * │ PENDING TEAM AGREEMENT. Nothing here is production code and
          nothing here is authoritative. │
       6  * └────────────────────────────────────────────────────────────
         ──────────────────────────────┘
       7  *
     … +134 lines (ctrl+o to expand)

⏺ Now the fake model:

⏺ Write(tests/helpers/qa-harness/fake-model.ts)
  ⎿  Wrote 277 lines to tests/helpers/qa-harness/fake-model.ts
       1 import {
       2   QA_INPUT_QUESTION_HEADER,
       3   type QaModelCaller,
       4   type QaModelReply,
       5   type QaModelReplyPayload,
       6   type QaModelRequest,
       7   type QaOutcome,
       8 } from "./contract";
       9 
      10 /**
     … +267 lines (ctrl+o to expand)

⏺ I'm moving on to the network guard, which blocks fetch, http/https and raw
  sockets, strips provider env vars, and logs every blocked attempt so cleanup
  can fail even if the error gets swallowed.

⏺ Write(tests/helpers/qa-harness/network-guard.ts)
  ⎿  Wrote 119 lines to tests/helpers/qa-harness/network-guard.ts
       1 import http from "node:http";
       2 import https from "node:https";
       3 import net from "node:net";
       4 
       5 /**
       6  * S2-003 network guard. While installed:
       7  *
       8  * - `globalThis.fetch`, `http(s).request/get`, and `net.Socket#
         connect` throw `RealNetworkCallError`.
       9  *   Every TCP client in Node (including undici/fetch and supaba
     … +111 lines (~4 KB) (ctrl+o to expand)

⏺ Update(tests/helpers/qa-harness/network-guard.ts)
  ⎿  Added 4 lines
      110        https.request = originals.httpsRequest;
      111        https.get = originals.httpsGet;
      112        net.Socket.prototype.connect = originals.socketConnect;
      113 +      // Drop anything a test set while guarded, then put back
          + the original values.                                         
      114 +      for (const key of Object.keys(process.env)) {           
      115 +        if (SCRUBBED_ENV_PATTERN.test(key)) delete process.env
          +[key];                                                        
      116 +      }                                                       
      117        for (const [key, value] of savedEnv) process.env[key] = 
           value;
      118        active = undefined;
      119      },

⏺ Network guard done. Now the fixture datasets: fixed IDs, dates and ordering,
  with no randomness or clock dependence. The normal dataset reuses Neel's
  S2-004 fixture as-is rather than copying it.

⏺ Write(tests/fixtures/qa/datasets.ts)
  ⎿  Wrote 193 lines to tests/fixtures/qa/datasets.ts
       1 import type { AnalysisTarget } from "@/services/analysis-targets
         /analysis-target-repository";
       2 import type { Review } from "@/services/reviews/review-service";
       3 
       4 import type { QaActor } from "../../helpers/qa-harness/contract"
         ;
       5 import { scopeGuardEvaluationFixture } from "../scope-guard-eval
         uation";
       6 
       7 /**
     … +186 lines (ctrl+o to expand)

⏺ Freezing would also freeze Neel's exported S2-004 objects as a side effect, so
  I'll clone them first:

⏺ Update(tests/fixtures/qa/datasets.ts)
  ⎿  Added 3 lines, removed 2 lines
      105    restaurantA: {
      106      key: "restaurantA",
      107      owner: userA,
      108 -    target: scopeGuardEvaluationFixture.activeTarget,         
      109 -    reviews: scopeGuardEvaluationFixture.persistedReviews,    
      108 +    // Cloned so freezing this dataset never changes the S2-00
          +4 fixture objects themselves.                                 
      109 +    target: structuredClone(scopeGuardEvaluationFixture.active
          +Target),                                                      
      110 +    reviews: structuredClone(scopeGuardEvaluationFixture.persi
          +stedReviews),                                                 
      111      markers: [],
      112      description: "Normal dataset. The S2-004 scope-guard targe
           t and its four reviews, unchanged.",
      113    },

⏺ Now the context, prompt and answer assertions. They throw
  QaHarnessAssertionError with specific messages instead of using Jest matchers,
  so the self-tests can show that each one fails on bad input.

⏺ Write(tests/helpers/qa-harness/assertions.ts)  ⎿  Wrote 211 lines to tests/helpers/qa-harness/assertions.ts
       1 import type { QaFixtureDataset } from "../../fixtures/qa/dataset
         s";
       2 import {
       3   isDeclineOutcome,
       4   QA_INPUT_QUESTION_HEADER,
       5   REVIEW_PLATFORM_LABELS,
       6   type QaAnswer,
       7   type QaDeclineOutcome,
       8   type QaModelRequest,
       9   type QaPipelineErrorShape,
     … +202 lines (ctrl+o to expand)

⏺ Next is the contract reference pipeline, which wasn't on the approved list and
  which I'll flag at the end; the golden cases need it on main for PR 1, and PR
  2 will swap in the real one via the same option.

⏺ Write(tests/helpers/qa-harness/reference-pipeline.ts)
  ⎿  Wrote 177 lines to tests/helpers/qa-harness/reference-pipeline.ts
       1 import type { QaFixtureDataset } from "../../fixtures/qa/dataset
         s";
       2 import {
       3   ESTIMATED_BYTES_PER_TOKEN,
       4   isDeclineOutcome,
       5   QA_INPUT_QUESTION_HEADER,
       6   QA_MAX_REQUEST_TOKENS,
       7   QA_OUTCOMES,
       8   QA_PIPELINE_ERRORS,
       9   QA_RESERVED_OUTPUT_TOKENS,
     … +168 lines (ctrl+o to expand)

⏺ Before the golden cases, I'm fixing the echo reply so it repeats only what the
  application supplied, and moving that helper into fake-model.ts.

⏺ Update(tests/helpers/qa-harness/fake-model.ts)
  ⎿  Added 6 lines
      118    }
      119  }
      120  
      121 +/** The user-turn input with the question block removed: every
          +thing the application supplied. */                            
      122 +export function applicationSuppliedInput(request: QaModelReque
          +st): string {                                                 
      123 +  const index = request.input.lastIndexOf(`\n${QA_INPUT_QUESTI
          +ON_HEADER}\n`);                                               
      124 +  return index === -1 ? request.input : request.input.slice(0,
          + index);                                                      
      125 +}                                                             
      126 +                                                              
      127  function matches(matcher: QaRequestMatcher, request: QaModelRe
           quest, question?: string): boolean {
      128    if (matcher.question !== undefined && question?.trim() !== m
           atcher.question.trim()) return false;
      129    if (

⏺ Update(tests/helpers/qa-harness/fake-model.ts)
  ⎿  Added 7 lines, removed 3 lines
      272      return { kind: "dynamic", respond } satisfies QaReplySpec;
      273    },
      274    /**
      275 -   * Adversarial echo: answers with the entire user-turn input
          - and cites every supplied review.                             
      276 -   * If any foreign data reached the model, it is now in the a
          -nswer too (S2-016 output check).                              
      275 +   * Adversarial echo: answers with everything the application
          + supplied (instructions plus review                           
      276 +   * dataset, but not the user's own question) and cites every
          + supplied review. If any foreign                              
      277 +   * data reached the model, it is now in the answer too (S2-0
          +16 output check).                                             
      278     */
      279    echoContext(): QaReplySpec {
      280      return reply.dynamic((request) =>
      280 -      reply.answered([...request.reviewIds], `ECHO ${request.i
          -nput}`),                                                      
      281 +      reply.answered(                                         
      282 +        [...request.reviewIds],                               
      283 +        `ECHO ${request.instructions}\n${applicationSuppliedIn
          +put(request)}`,                                               
      284 +      ),                                                      
      285      );
      286    },
      287  };

⏺ Update(tests/helpers/qa-harness/assertions.ts)
  ⎿  Added 3 lines, removed 2 lines
       1  import type { QaFixtureDataset } from "../../fixtures/qa/datase
          ts";
       2  import {
       3    isDeclineOutcome,
       4 -  QA_INPUT_QUESTION_HEADER,                                    
       4    REVIEW_PLATFORM_LABELS,
       5    type QaAnswer,
       6    type QaDeclineOutcome,
       7    type QaModelRequest,
       8    type QaPipelineErrorShape,
       9  } from "./contract";
      11 -import { extractQuestion } from "./fake-model";                
      10 +import { applicationSuppliedInput, extractQuestion } from "./fa
         +ke-model";                                                     
      11  
      12 +export { applicationSuppliedInput };                           
      13 +                                                               
      14  /**
      15   * S2-003 behaviour-level assertions for the Q&A model boundary
          . They inspect what was sent to the
      16   * model and the structure of what came back. They never compar
          e model prose.

⏺ Update(tests/helpers/qa-harness/assertions.ts)
  ⎿  Removed 6 lines
      27    throw new QaHarnessAssertionError(message);
      28  }
      29  
      30 -/** The user-turn input with the question block removed: everyt
         -hing the application supplied. */                              
      31 -export function applicationSuppliedInput(request: QaModelReques
         -t): string {                                                   
      32 -  const index = request.input.lastIndexOf(`\n${QA_INPUT_QUESTIO
         -N_HEADER}\n`);                                                 
      33 -  return index === -1 ? request.input : request.input.slice(0, 
         -index);                                                        
      34 -}                                                              
      35 -                                                               
      30  /**
      31   * S2-013: the system prompt is present, names the active targe
          t and platform, and keeps
      32   * untrusted content (review text and the user's question) out 
          of the system instructions.

⏺ Now the golden case table:

⏺ Write(tests/fixtures/qa/golden-cases.ts)
  ⎿  Wrote 420 lines to tests/fixtures/qa/golden-cases.ts
       1 import type { QaDeclineOutcome, QaPipelineErrorKey } from "../..
         /helpers/qa-harness/contract";
       2 import { reply, type QaReplySpec } from "../../helpers/qa-harnes
         s/fake-model";
       3 import { getQaDataset, QA_MISSING_TARGET_ID, type QaDatasetKey, 
         type QaUserKey } from "./datasets";
       4 
       5 /**
       6  * S2-003 golden Q&A cases.
       7  *
     … +413 lines (ctrl+o to expand)

⏺ Now the harness entry point, createQaTestHarness, plus the golden case runner:

⏺ Write(tests/helpers/qa-harness/index.ts)
  ⎿  Wrote 281 lines to tests/helpers/qa-harness/index.ts
       1 import {
       2   allQaDatasets,
       3   QA_USERS,
       4   type QaDatasetKey,
       5   type QaFixtureDataset,
       6 } from "../../fixtures/qa/datasets";
       7 import { goldenTargetId, type QaGoldenCase, type QaGoldenStep } 
         from "../../fixtures/qa/golden-cases";
       8 import {
       9   expectAnswerHasNoForeignData,
     … +272 lines (ctrl+o to expand)

⏺ Two fixes in what I just wrote. First, a failing golden step would be hidden
  if cleanup() also threw inside finally. Second, applicationSuppliedInput would
  be exported twice through export *.

⏺ Update(tests/helpers/qa-harness/index.ts)
  ⎿  Added 9 lines, removed 2 lines
      268          throw new QaHarnessAssertionError(`${goldenCase.id} st
           ep ${index + 1}: ${reason}`);
      269        }
      270      }
      271 -  } finally {                                                 
      272 -    harness.cleanup();                                        
      271 +  } catch (error) {                                           
      272 +    // Restore the network even on failure, but report the ste
          +p failure rather than cleanup's.                              
      273 +    try {                                                     
      274 +      harness.cleanup();                                      
      275 +    } catch {                                                 
      276 +      // The step failure above is the more useful report.    
      277 +    }                                                         
      278 +    throw error;                                              
      279    }
      280 +  harness.cleanup();                                          
      281    return runs;
      282  }
      283  

⏺ Update(tests/helpers/qa-harness/assertions.ts)
  ⎿  Removed 2 lines
       9  } from "./contract";
      10  import { applicationSuppliedInput, extractQuestion } from "./fa
          ke-model";
      11  
      12 -export { applicationSuppliedInput };                           
      13 -                                                               
      12  /**
      13   * S2-003 behaviour-level assertions for the Q&A model boundary
          . They inspect what was sent to the
      14   * model and the structure of what came back. They never compar
          e model prose.

⏺ Running a quick typecheck before writing the tests:

  Ran 1 shell command (ctrl+o to expand)

⏺ Update(tests/helpers/qa-harness/fake-model.ts)
  ⎿  Added 1 line, removed 1 line
      83    readonly request: Readonly<QaModelRequest>;
      84    readonly question: string | undefined;
      85    /** Name of the matched rule, `"fallback"`, or `undefined` wh
          en the call was unscripted. */
      86 -  readonly matchedRule: string | undefined;                    
      86 +  matchedRule: string | undefined;                             
      87    /** Set once the call settles. */
      88    outcome: QaCallOutcome | undefined;
      89  }

  Ran 1 shell command (ctrl+o to expand)

⏺ Typecheck is clean. Now the self-tests, starting with the fake model:

⏺ Write(tests/unit/qa-harness/fake-model.test.ts)
  ⎿  Wrote 204 lines to tests/unit/qa-harness/fake-model.test.ts
       1 /** @jest-environment node */
       2 
       3 import {
       4   createFakeQaModel,
       5   extractQuestion,
       6   FakeQaModelError,
       7   reply,
       8   UnscriptedQaModelCallError,
       9   type QaModelRequest,
      10 } from "../../helpers/qa-harness";
     … +194 lines (ctrl+o to expand)

⏺ Write(tests/unit/qa-harness/network-guard.test.ts)
  ⎿  Wrote 89 lines to tests/unit/qa-harness/network-guard.test.ts
       1 /** @jest-environment node */
       2 
       3 import http from "node:http";
       4 import https from "node:https";
       5 import net from "node:net";
       6 
       7 import { installNetworkGuard, RealNetworkCallError } from "../..
         /helpers/qa-harness";
       8 
       9 describe("installNetworkGuard", () => {
     … +80 lines (ctrl+o to expand)

⏺ Now the assertion self-tests. Each assertion has to pass on a correct request
  and fail on a broken one:

⏺ Write(tests/unit/qa-harness/assertions.test.ts)
  ⎿  Wrote 215 lines to tests/unit/qa-harness/assertions.test.ts
       1 /** @jest-environment node */
       2 
       3 import { getQaDataset } from "../../fixtures/qa/datasets";
       4 import {
       5   errorMatches,
       6   expectAnswerHasNoForeignData,
       7   expectContextOnlyForTarget,
       8   expectDeclined,
       9   expectErrorShape,
      10   expectGroundedAnswer,
     … +205 lines (ctrl+o to expand)

⏺ Now the fixture and golden-case integrity tests, the golden suite, and the
  mutation tests that show the runner catches broken pipelines:

⏺ Write(tests/unit/qa-harness/fixtures.test.ts)
  ⎿  Wrote 130 lines to tests/unit/qa-harness/fixtures.test.ts
       1 /** @jest-environment node */
       2 
       3 import { scopeGuardEvaluationFixture } from "../../fixtures/scop
         e-guard-evaluation";
       4 import {
       5   allQaDatasets,
       6   getQaDataset,
       7   QA_DATASET_KEYS,
       8   QA_DATASETS,
       9   QA_MISSING_TARGET_ID,
     … +121 lines (ctrl+o to expand)
⏺ Write(tests/unit/qa-harness/golden-cases.test.ts)
  ⎿  Wrote 139 lines to tests/unit/qa-harness/golden-cases.test.ts
       1 /** @jest-environment node */
       2 
       3 import { allQaDatasets, getQaDataset } from "../../fixtures/qa/d
         atasets";
       4 import { QA_GOLDEN_CASES, type QaGoldenCase } from "../../fixtur
         es/qa/golden-cases";
       5 import {
       6   createReferencePipeline,
       7   runGoldenCase,
       8   type QaModelRequest,
     … +131 lines (ctrl+o to expand)

⏺ Write(tests/unit/qa-harness/determinism.test.ts)
  ⎿  Wrote 81 lines to tests/unit/qa-harness/determinism.test.ts
       1 /** @jest-environment node */
       2 
       3 import { getQaDataset } from "../../fixtures/qa/datasets";
       4 import { QA_GOLDEN_CASES } from "../../fixtures/qa/golden-cases"
         ;
       5 import { createQaTestHarness, reply, runGoldenCase, type QaGolde
         nStepRun } from "../../helpers/qa-harness";
       6 
       7 /** Everything observable about a run, as plain data (error obje
         cts reduced to name and code). */
     … +74 lines (ctrl+o to expand)

⏺ Write(tests/unit/qa-harness/harness.test.ts)
  ⎿  Wrote 132 lines to tests/unit/qa-harness/harness.test.ts
       1 /** @jest-environment node */
       2 
       3 import { getQaDataset, QA_MISSING_TARGET_ID, QA_USERS } from "..
         /../fixtures/qa/datasets";
       4 import {
       5   createQaTestHarness,
       6   QaHarnessAssertionError,
       7   RealNetworkCallError,
       8   reply,
       9   useQaTestHarness,
     … +123 lines (ctrl+o to expand)

⏺ Two of the mutation pipelines need tightening. The stale-ID tamper has to
  touch only the Target B step, and the "ungrounded" pipeline should make one
  real model call and then skip validation.

⏺ Update(tests/unit/qa-harness/golden-cases.test.ts)
  ⎿  Added 5 lines, removed 1 line
      56      [
      57        "keeps the previous target's review IDs after a switch",
      58        "qa-target-switch-001",
      59 -      tamperRequest((request) => ({ ...request, reviewIds: [tar
         -getAReview.id, ...request.reviewIds] })),                      
      59 +      tamperRequest((request) =>                               
      60 +        request.targetId === getQaDataset("targetB").target.id 
      61 +          ? { ...request, reviewIds: [targetAReview.id, ...requ
         +est.reviewIds] }                                               
      62 +          : request,                                           
      63 +      ),                                                       
      64        /step 2: Request reviewIds/,
      65      ],
      66      [

⏺ Update(tests/unit/qa-harness/golden-cases.test.ts)
  ⎿  Added 22 lines, removed 16 lines
      104      [
      105        "returns ungrounded answers instead of rejecting them",
      106        "qa-output-invented-citation",
      107 -      async (input) => ({                                     
      108 -        outcome: "answered",                                  
      109 -        answer: "made up",                                    
      110 -        citedReviewIds: ["00000000-0000-4000-8000-000000009999
          -"],                                                           
      111 -        promptVersion: "broken",                              
      112 -        targetId: String(input.targetId),                     
      113 -        ...(await input.callModel({                           
      114 -          promptVersion: "broken",                            
      115 -          targetId: String(input.targetId),                   
      116 -          instructions: "",                                   
      117 -          input: "",                                          
      118 -          reviewIds: [],                                      
      119 -          estimatedInputTokens: 0,                            
      120 -          maxOutputTokens: 0,                                 
      121 -        }).then(() => ({}))),                                 
      122 -      }),                                                     
      107 +      // Sends a correct request, then returns the model's cit
          +ations without validating them.                               
      108 +      async (input) => {                                      
      109 +        let sent: QaModelRequest | undefined;                 
      110 +        await reference({                                     
      111 +          ...input,                                           
      112 +          callModel: async (request) => {                     
      113 +            sent = request;                                   
      114 +            await input.callModel(request);                   
      115 +            return {                                          
      116 +              text: JSON.stringify({ outcome: "answered", answ
          +er: "ok", citedReviewIds: [request.reviewIds[0]] }),          
      117 +            };                                                
      118 +          },                                                  
      119 +        });                                                   
      120 +        if (!sent) throw new Error("reference pipeline did not
          + call the model");                                            
      121 +        return {                                              
      122 +          outcome: "answered",                                
      123 +          answer: "made up",                                  
      124 +          citedReviewIds: ["00000000-0000-4000-8000-0000000099
          +99"],                                                         
      125 +          promptVersion: sent.promptVersion,                  
      126 +          targetId: sent.targetId,                            
      127 +        };                                                    
      128 +      },                                                      
      129        /qa-output-invented-citation step 1/,
      130      ],
      131      [

  Ran 1 shell command (ctrl+o to expand)

⏺ 90 of 91 tests pass; the remaining failure is cosmetic, since net.connect
  wraps its arguments in an array and the guard couldn't name the target. I'm
  fixing the description now.

⏺ Update(tests/helpers/qa-harness/network-guard.ts)
  ⎿  Added 2 lines
      39  }
      40  
      41  function describeTarget(value: unknown): string {
      42 +  // `net.connect()` hands Socket#connect its normalised argume
         +nts as `[options, callback]`.                                  
      43 +  if (Array.isArray(value)) return describeTarget(value[0]);   
      44    if (typeof value === "string") return value;
      45    if (value instanceof URL) return value.href;
      46    if (typeof value === "object" && value !== null) {

  Ran 1 shell command (ctrl+o to expand)

⏺ All 91 tests pass, and the mutation tests confirm the golden runner catches
  each kind of breakage. I'm now writing the test:qa script and the README
  section.

⏺ Update(package.json)
  ⎿  Added 1 line
      16      "test": "jest --runInBand",
      17      "test:watch": "jest --watch",
      18      "test:coverage": "jest --coverage --runInBand",
      19 +    "test:qa": "jest --runInBand tests/unit/qa-harness",       
      20      "test:e2e": "playwright test",
      21      "test:e2e:auth": "playwright test --config=playwright.auth.
          config.ts",
      22      "test:db": "bash tests/db/run.sh"

⏺ Update(README.md)
  ⎿  Added 1 line
      122  | `npm run test`          | Runs Jest unit and component tests
           ; no browser is required                                   |
      123  | `npm run test:watch`    | Re-runs relevant Jest tests while 
           files change                                               |
      124  | `npm run test:coverage` | Runs Jest and writes an HTML/text 
           coverage report to `coverage/`                             |
      125 +| `npm run test:qa`       | Runs only the deterministic Q&A ha
          +rness suites (no network, no OpenAI, no Supabase)          |  
      126  | `npm run test:e2e`      | Starts the app and runs Playwright
            tests in headless Chromium                                |
      127  | `npm run test:e2e:auth` | Runs authentication browser tests 
           against an isolated local test provider                    |
      128  | `npm run test:db`       | Applies `supabase/migrations/` to 
           a throwaway local PostgreSQL database and runs `tests/db/` |

⏺ Update(README.md)
  ⎿  Added 50 lines
      156  accounts nor live Supabase credentials are needed. Both suites
            can use an existing supported
      157  browser by setting `PLAYWRIGHT_CHANNEL` (for example, `msedge`
           ); otherwise they use bundled Chromium.
      158  
      159 +### Deterministic Q&A test harness (S2-003)                   
      160 +                                                              
      161 +Q&A tests never call OpenAI, the network, or a live Supabase p
          +roject. The harness swaps the model                           
      162 +seam (`QaModelCaller`) for a scripted fake, records every requ
          +est sent to it, and blocks all                                
      163 +network access while a test runs.                             
      164 +                                                              
      165 +| Path                                 | Contents             
          +                                                     |        
      166 +| ------------------------------------ | ---------------------
          +---------------------------------------------------- |        
      167 +| `tests/helpers/qa-harness/`          | Harness: fake model, 
          +network guard, assertions, golden-case runner        |        
      168 +| `tests/helpers/qa-harness/contract.ts` | Harness-owned copy 
          +of the S2-010/011/013 Q&A types (pending team agreement) |    
      169 +| `tests/fixtures/qa/datasets.ts`      | Synthetic datasets: n
          +ormal, empty, mixed ratings, Target A/B, User B, malformed row
          +s |                                                           
      170 +| `tests/fixtures/qa/golden-cases.ts`  | Table of golden Q&A c
          +ases                                                 |        
      171 +| `tests/unit/qa-harness/`             | Harness self-tests, g
          +olden-case suite, determinism proof                  |        
      172 +                                                              
      173 +Run it with `npm run test:qa`. It is also part of `npm test`, 
          +so CI runs it with no secrets.                                
      174 +                                                              
      175 +**Script a fake model reply.** Rules are checked in order; the
          + first match wins. Matchers:                                  
      176 +`question` (exact), `questionIncludes`, `targetId`, `predicate
          +`. A call that matches no rule fails                          
      177 +the test unless you set a `fallback`.                         
      178 +                                                              
      179 +```ts                                                         
      180 +import { reply, useQaTestHarness, expectGroundedAnswer } from 
          +"../../helpers/qa-harness";                                   
      181 +                                                              
      182 +const qa = useQaTestHarness({                                 
      183 +  script: [                                                   
      184 +    { when: { questionIncludes: "pizza" }, then: reply.answere
          +d([reviewId]) },                                              
      185 +    { when: { questionIncludes: "weather" }, then: reply.decli
          +ned("declined_general_knowledge") },                          
      186 +  ],                                                          
      187 +});                                                           
      188 +                                                              
      189 +it("answers from the reviews", async () => {                  
      190 +  const result = await qa().ask(targetId, "How is the pizza?")
          +;                                                             
      191 +  expectGroundedAnswer(result.ok ? result.answer : fail(), qa(
          +).model.lastCall().request);                                  
      192 +});                                                           
      193 +```                                                           
      194 +                                                              
      195 +Other replies: `reply.insufficientEvidence()`, `reply.raw("not
          + json")`, `reply.empty()`,                                    
      196 +`reply.providerError("MODEL_UNAVAILABLE")`, `reply.timeout(ms)
          +` (use Jest fake timers), and                                 
      197 +`reply.echoContext()`, which echoes everything the app sent so
          + leaks show up in the answer.                                 
      198 +                                                              
      199 +**Add a golden case.** Append an entry to `QA_GOLDEN_CASES` in
          + `tests/fixtures/qa/golden-cases.ts`                          
      200 +with one or more steps of `{ actor, target, question, reply, e
          +xpect }`. The runner automatically                            
      201 +checks the system prompt, that only the active target's review
          +s were sent, that no reviewer                                 
      202 +names were sent, and that no other dataset's data reached the 
          +request or the answer. Assertions                             
      203 +cover behaviour and structure, never exact model wording.     
      204 +                                                              
      205 +**Pipeline.** Until the S2-010/S2-011 Q&A services are merged,
          + golden cases run against a small                             
      206 +test-only _contract reference pipeline_ (`reference-pipeline.t
          +s`). When they are merged, pass the                           
      207 +real orchestration as `pipeline` so the same cases run against
          + production code.                                             
      208 +                                                              
      209  ### Run database tests
      210  
      211  `npm run test:db` checks the real schema and Row Level Securit
           y policies, not a mock. It creates a

⏺ The README example used Jest's fail(), which isn't available in this Jest
  version. Replacing it:

⏺ Update(README.md)
  ⎿  Added 2 lines, removed 1 line
      188  
      189  it("answers from the reviews", async () => {
      190    const result = await qa().ask(targetId, "How is the pizza?")
           ;
      191 -  expectGroundedAnswer(result.ok ? result.answer : fail(), qa(
          -).model.lastCall().request);                                  
      191 +  if (!result.ok) throw result.error;                         
      192 +  expectGroundedAnswer(result.answer, qa().model.lastCall().re
          +quest);                                                       
      193  });
      194  ```
      195  

⏺ Bash(npx prettier --write tests/helpers/qa-harness tests/fixtures/qa
      tests/unit/qa-harness README.md package.json >/dev/null && git status
      --short && echo "--- forma…)
  ⎿   M README.md
      M package.json
     ?? tests/fixtures/qa/
     … +19 lines (ctrl+o to expand)
  ⎿  Updated README.md (+7 -7)
      162  seam (`QaModelCaller`) for a scripted fake, records every requ
           est sent to it, and blocks all
      163  network access while a test runs.
      164  
      165 -| Path                                 | Contents             
          -                                                     |        
      166 -| ------------------------------------ | ---------------------
          ----------------------------------------------------- |        
      167 -| `tests/helpers/qa-harness/`          | Harness: fake model, 
          -network guard, assertions, golden-case runner        |        
      168 -| `tests/helpers/qa-harness/contract.ts` | Harness-owned copy 
          -of the S2-010/011/013 Q&A types (pending team agreement) |    
      169 -| `tests/fixtures/qa/datasets.ts`      | Synthetic datasets: n
          -ormal, empty, mixed ratings, Target A/B, User B, malformed row
          -s |                                                           
      170 -| `tests/fixtures/qa/golden-cases.ts`  | Table of golden Q&A c
          -ases                                                 |        
      171 -| `tests/unit/qa-harness/`             | Harness self-tests, g
          -olden-case suite, determinism proof                  |        
      165 +| Path                                   | Contents           
          +                                                              
          +    |                                                         
      166 +| -------------------------------------- | -------------------
          +--------------------------------------------------------------
          +--- |                                                         
      167 +| `tests/helpers/qa-harness/`            | Harness: fake model
          +, network guard, assertions, golden-case runner               
          +    |                                                         
      168 +| `tests/helpers/qa-harness/contract.ts` | Harness-owned copy 
          +of the S2-010/011/013 Q&A types (pending team agreement)      
          +    |                                                         
      169 +| `tests/fixtures/qa/datasets.ts`        | Synthetic datasets:
          + normal, empty, mixed ratings, Target A/B, User B, malformed r
          +ows |                                                         
      170 +| `tests/fixtures/qa/golden-cases.ts`    | Table of golden Q&A
          + cases                                                        
          +    |                                                         
      171 +| `tests/unit/qa-harness/`               | Harness self-tests,
          + golden-case suite, determinism proof                         
          +    |                                                         
      172  
      173  Run it with `npm run test:qa`. It is also part of `npm test`, 
           so CI runs it with no secrets.
      174  
  ⎿  Updated tests/fixtures/qa/datasets.ts (+105 -15)
      116      owner: userA,
      117      target: target(ids.mixedRatings, userA, "Mixed Ratings Cof
           fee"),
      118      reviews: [
      119 -      review("21000000-0000-4000-8000-000000000001", ids.mixed
          -Ratings, 1, "Cold espresso and a forty-minute wait. QA_MIXED_R
          -ATINGS_MARKER", 1),                                           
      120 -      review("21000000-0000-4000-8000-000000000002", ids.mixed
          -Ratings, 2, "Croissant was stale but the barista apologized.",
          - 2),                                                          
      121 -      review("21000000-0000-4000-8000-000000000003", ids.mixed
          -Ratings, 3, "Average latte, comfortable seating near the windo
          -w.", 3),                                                      
      122 -      review("21000000-0000-4000-8000-000000000004", ids.mixed
          -Ratings, 4, "Friendly staff and a good oat milk cortado.", 4),
      123 -      review("21000000-0000-4000-8000-000000000005", ids.mixed
          -Ratings, 5, "Best pour-over in the neighborhood, fast service.
          -", 5),                                                        
      119 +      review(                                                 
      120 +        "21000000-0000-4000-8000-000000000001",               
      121 +        ids.mixedRatings,                                     
      122 +        1,                                                    
      123 +        "Cold espresso and a forty-minute wait. QA_MIXED_RATIN
          +GS_MARKER",                                                   
      124 +        1,                                                    
      125 +      ),                                                      
      126 +      review(                                                 
      127 +        "21000000-0000-4000-8000-000000000002",               
      128 +        ids.mixedRatings,                                     
      129 +        2,                                                    
      130 +        "Croissant was stale but the barista apologized.",    
      131 +        2,                                                    
      132 +      ),                                                      
      133 +      review(                                                 
      134 +        "21000000-0000-4000-8000-000000000003",               
      135 +        ids.mixedRatings,                                     
      136 +        3,                                                    
      137 +        "Average latte, comfortable seating near the window.",
      138 +        3,                                                    
      139 +      ),                                                      
      140 +      review(                                                 
      141 +        "21000000-0000-4000-8000-000000000004",               
      142 +        ids.mixedRatings,                                     
      143 +        4,                                                    
      144 +        "Friendly staff and a good oat milk cortado.",        
      145 +        4,                                                    
      146 +      ),                                                      
      147 +      review(                                                 
      148 +        "21000000-0000-4000-8000-000000000005",               
      149 +        ids.mixedRatings,                                     
      150 +        5,                                                    
     … 112 more lines (ctrl+o to expand)
  ⎿  Updated tests/fixtures/qa/golden-cases.ts (+8 -1)
      255      id: "qa-edge-empty-question",
      256      scenario: "edge_input",
      257      title: "Whitespace-only question never reaches the model",
      258 -    steps: [{ actor: "userA", target: "restaurantA", question:
          - "   \n\t ", expect: notCalled("emptyQuestion") }],           
      258 +    steps: [                                                  
      259 +      {                                                       
      260 +        actor: "userA",                                       
      261 +        target: "restaurantA",                                
      262 +        question: "   \n\t ",                                 
      263 +        expect: notCalled("emptyQuestion"),                   
      264 +      },                                                      
      265 +    ],                                                        
      266    },
      267    {
      268      id: "qa-edge-long-question",
  ⎿  Updated tests/helpers/qa-harness/assertions.ts (+1 -4)
      84  }
      85  
      86  /** S2-013 data minimisation: reviewer names and source URLs ne
          ver reach the model. */
      87 -export function expectNoReviewerIdentity(                      
      88 -  request: QaModelRequest,                                     
      89 -  dataset: QaFixtureDataset,                                   
      90 -): void {                                                      
      87 +export function expectNoReviewerIdentity(request: QaModelReques
         +t, dataset: QaFixtureDataset): void {                          
      88    const haystack = `${request.instructions}\n${request.input}`;
      89    for (const review of dataset.reviews) {
      90      if (review.reviewerName && haystack.includes(review.reviewe
          rName)) {
  ⎿  Updated tests/helpers/qa-harness/index.ts (+17 -5)
       4    type QaDatasetKey,
       5    type QaFixtureDataset,
       6  } from "../../fixtures/qa/datasets";
       7 -import { goldenTargetId, type QaGoldenCase, type QaGoldenStep }
         - from "../../fixtures/qa/golden-cases";                        
       7 +import {                                                       
       8 +  goldenTargetId,                                              
       9 +  type QaGoldenCase,                                           
      10 +  type QaGoldenStep,                                           
      11 +} from "../../fixtures/qa/golden-cases";                       
      12  import {
      13    expectAnswerHasNoForeignData,
      14    expectContextOnlyForTarget,
     ...
       92  }
       93  
       94  function errorCode(error: unknown): string | undefined {
       91 -  return typeof error === "object" && error !== null && "code"
          - in error && typeof error.code === "string"                   
       95 +  return typeof error === "object" &&                         
       96 +    error !== null &&                                         
       97 +    "code" in error &&                                        
       98 +    typeof error.code === "string"                            
       99      ? error.code
      100      : undefined;
      101  }
     ...
      202  
      203    if (!shouldCall) {
      204      if (result.calls.length !== 0) {
      198 -      throw new QaHarnessAssertionError(`The model was called 
          -${result.calls.length} time(s); expected none.`);             
      205 +      throw new QaHarnessAssertionError(                      
      206 +        `The model was called ${result.calls.length} time(s); 
          +expected none.`,                                              
      207 +      );                                                      
      208      }
      209    } else {
      210      if (result.calls.length !== 1) {
      202 -      throw new QaHarnessAssertionError(`The model was called 
          -${result.calls.length} time(s); expected one.`);              
      211 +      throw new QaHarnessAssertionError(                      
      212 +        `The model was called ${result.calls.length} time(s); 
          +expected one.`,                                               
      213 +      );                                                      
      214      }
      215      if (step.target === "missing") {
      216        throw new QaHarnessAssertionError("A missing target can 
           never reach the model.");
     … 9 more lines (ctrl+o to expand)
  ⎿  … 7 more files changed

⏺ Prettier reformatted some files during my run, so those changes are expected.
  Lint found a real problem, since my Jest helper useQaTestHarness looks like a
  React hook, and I'm renaming it to setupQaTestHarness everywhere.

  Ran 1 shell command (ctrl+o to expand)

⏺ zsh didn't word-split the file list. Retrying with explicit paths:

⏺ Bash(F=(tests/helpers/qa-harness/index.ts
      tests/unit/qa-harness/assertions.test.ts
      tests/unit/qa-harness/harness.test.ts README.md) && sed -i ''
      's/useQaTestHarness/…)
  ⎿  > reviewlens-ai@0.1.0 lint
     > eslint .

     All matched files use Prettier code style!
  ⎿  Updated README.md (+2 -2)
      177  the test unless you set a `fallback`.
      178  
      179  ```ts
      180 -import { reply, useQaTestHarness, expectGroundedAnswer } from 
          -"../../helpers/qa-harness";                                   
      180 +import { reply, setupQaTestHarness, expectGroundedAnswer } fro
          +m "../../helpers/qa-harness";                                 
      181  
      182 -const qa = useQaTestHarness({                                 
      182 +const qa = setupQaTestHarness({                               
      183    script: [
      184      { when: { questionIncludes: "pizza" }, then: reply.answere
           d([reviewId]) },
      185      { when: { questionIncludes: "weather" }, then: reply.decli
           ned("declined_general_knowledge") },
  ⎿  Updated tests/helpers/qa-harness/index.ts (+4 -4)
      41   *   expectSystemPromptApplied(qa.model.lastCall().request, dat
          aset);
      42   *   qa.cleanup();
      43   *
      44 - * Or let Jest manage the lifecycle with `useQaTestHarness(...)
         -`.                                                             
      44 + * Or let Jest manage the lifecycle with `setupQaTestHarness(..
         +.)`.                                                           
      45   */
      46  
      47  export interface QaTestHarnessOptions {
     ...
      163  /**
      164   * Jest lifecycle helper: a fresh harness before each test and
            `cleanup()` after it.
      165   *
      166 - *   const qa = useQaTestHarness({ script: [...] });          
      166 + *   const qa = setupQaTestHarness({ script: [...] });        
      167   *   it("...", async () => { await qa().ask(...); });
      168   */
      169 -export function useQaTestHarness(                             
      169 +export function setupQaTestHarness(                           
      170    options: QaTestHarnessOptions | (() => QaTestHarnessOptions)
            = {},
      171  ): () => QaTestHarness {
      172    let current: QaTestHarness | undefined;
     ...
      179      harness?.cleanup();
      180    });
      181    return () => {
      182 -    if (!current) throw new Error("useQaTestHarness() is only 
          -available inside a test.");                                   
      182 +    if (!current) throw new Error("setupQaTestHarness() is onl
          +y available inside a test.");                                 
      183      return current;
      184    };
      185  }
  ⎿  Updated tests/unit/qa-harness/assertions.test.ts (+2 -2)
      15    QA_PIPELINE_ERRORS,
      16    QaHarnessAssertionError,
      17    reply,
      18 -  useQaTestHarness,                                            
      18 +  setupQaTestHarness,                                          
      19    type QaAnswer,
      20    type QaModelRequest,
      21  } from "../../helpers/qa-harness";
     ...
      24  const targetB = getQaDataset("targetB");
      25  const userBPrivate = getQaDataset("userBPrivate");
      26  
      27 -const qa = useQaTestHarness({ fallback: reply.answered([targetA
         -.reviews[0].id]) });                                           
      27 +const qa = setupQaTestHarness({ fallback: reply.answered([targe
         +tA.reviews[0].id]) });                                         
      28  
      29  async function validRequest(): Promise<QaModelRequest> {
      30    const result = await qa().ask(targetA.target.id, "What about 
          battery life?");
  ⎿  Updated tests/unit/qa-harness/harness.test.ts (+5 -5)
       6    QaHarnessAssertionError,
       7    RealNetworkCallError,
       8    reply,
       9 -  useQaTestHarness,                                            
       9 +  setupQaTestHarness,                                          
      10  } from "../../helpers/qa-harness";
      11  
      12  const restaurantA = getQaDataset("restaurantA");
     ...
      113    });
      114  });
      115  
      116 -describe("useQaTestHarness", () => {                          
      117 -  const qa = useQaTestHarness(() => ({                        
      116 +describe("setupQaTestHarness", () => {                        
      117 +  const qa = setupQaTestHarness(() => ({                      
      118      script: [
      119        {
      120          when: { targetId: restaurantA.target.id },
     ...
      134    });
      135  });
      136  
      137 -describe("useQaTestHarness outside a test", () => {           
      138 -  const qa = useQaTestHarness();                              
      137 +describe("setupQaTestHarness outside a test", () => {         
      138 +  const qa = setupQaTestHarness();                            
      139    it("is available inside the test body", () => {
      140      expect(qa().network.attempts).toEqual([]);
      141    });

⏺ Lint and format are clean. Now the full verification: typecheck, the whole
  Jest suite and the production build.

  Ran 2 shell commands (ctrl+o to expand)

⏺ Update(tests/unit/qa-harness/harness.test.ts)
  ⎿  Added 4 lines, removed 3 lines
      82      try {
      83        expect(harness.dataset("restaurantA")).toBe(restaurantA);
      84        expect(() => harness.dataset("targetA")).toThrow("not loa
          ded");
      85 -      expect((await harness.ask(getQaDataset("targetA").target.
         -id, "q")).errorName).toBe(                                     
      86 -        "TargetNotFoundError",                                 
      87 -      );                                                       
      85 +      expect(await harness.ask(getQaDataset("targetA").target.i
         +d, "q")).toMatchObject({                                       
      86 +        ok: false,                                             
      87 +        errorName: "TargetNotFoundError",                      
      88 +      });                                                      
      89      } finally {
      90        harness.cleanup();
      91      }

  Ran 1 shell command (ctrl+o to expand)

⏺ All five gates pass. Now the flakiness and no-secrets checks: three test:qa
  runs, then one run with a stripped environment (no .env.local values, no
  provider keys).

  Ran 1 shell command (ctrl+o to expand)
⏺ The results are stable across three runs, including a stripped environment,
  though next/jest still loads .env.local, so the network guard and the CI setup
  carry the isolation. I'm running the final scope check to confirm no teammate
  files changed.

  Ran 1 shell command (ctrl+o to expand)

⏺ Only new harness files and two additive edits so far, with HEAD still at
  c9dff9e and nothing committed. I'm filing the AI transcript summary under
  ai-transcripts/ and drafting the PR description and team post.

⏺ Write(ai-transcripts/2026-11-13_deep_S2-003_claude-code.md)
  ⎿  Wrote 90 lines to ai-transcripts/2026-11-13_deep_S2-003_claude-code.md
      1 # S2-003 Deterministic Q&A Test Harness — Claude Code session (PR
         1)
      2 
      3 - **Author:** Deep Shah
      4 - **Tool:** Claude Code (Claude Opus 5.5), VS Code extension
      5 - **Issue:** #54 (S2-003)
      6 - **Branch:** `feature/s2-003-qa-test-harness` (from `origin/main
        ` at `c9dff9e`)
      7 
      8 > This is a step summary. Per `docs/AI-Assisted-Development.md` §
     … +83 lines (~6 KB) (ctrl+o to expand)

  Made 1 scratchpad edit +106 (ctrl+o to expand)

⏺ One correction in the transcript: you recreated the branch, not me.

⏺ Update(ai-transcripts/2026-11-13_deep_S2-003_claude-code.md)
  ⎿  Added 1 line, removed 1 line
      29    (Shawn), S2-014/015/016 (Neel). Neel's S2-016 doc names "Deep
          's S2-003 harness" as the model-request
      30    capture point.
      31  - Found that the original local `feature/s2-003-qa-test-harness
          ` held only a stale pre-squash S2-004
      32 -  commit. I recreated it from `origin/main` myself before the c
         -oding phase.                                                   
      32 +  commit. I recreated it from `origin/main` myself (not the AI)
         + before the coding phase.                                      
      33  - Proposed acceptance criteria AC6–AC10 (determinism, offline, 
          loud failure on real calls, edge
      34    cases, docs) and a two-PR plan. Waited for approval.
      35  

  Ran 1 shell command (ctrl+o to expand)

⏺ PR 1 of the S2-003 Q&A harness is built and passing every check. Everything is
  uncommitted on feature/s2-003-qa-test-harness: no commits, no push, and no
  teammate files touched.

  Two departures from the plan:
  - Commits: the brief asked for "small commits", but you also said not to
    commit, so I didn't. Suggested commit split if you want it: contract + fake
    model + network guard → assertions + reference pipeline + entry point →
    fixtures + golden cases → tests → test:qa + README + transcript.
  - Extra file: I added reference-pipeline.ts, which wasn't on the approved
    list. Without it the golden cases can't run on main, because the real Q&A
    pipeline only exists in the unmerged PRs. It's a small test-only stand-in
    that follows the real pipeline's order of checks and error names, and PR 2
    swaps in answerActiveTargetQuestion through the pipeline option. If you'd
    rather drop it, the golden suite moves to PR 2.

  What's in it: 8 new harness/fixture files, 7 test files (91 tests), the
  test:qa script and an additive README section.
  - Fake model: returns scripted replies, records every request, fails loudly on
    any call nobody scripted, and can produce timeouts, errors, malformed or
    empty output, or an "echo everything" reply for leak tests.
  - Network guard: blocks every way out to the network and removes provider and
    Supabase env vars during each test. A blocked attempt fails the test even if
    the code swallowed the error.
  - Golden cases: 21 cases across 10 scenarios. Every step that calls the model
    also checks the system prompt, that only the active target's reviews were
    sent, that no reviewer names were sent, and that nothing from another
    dataset reached the request or the answer.
  - Mutation tests: 9 deliberately broken pipelines (cross-user leak, stale
    target IDs, missing prompt, unvalidated citations, and others). Each one is
    rejected with the expected failure, so the harness isn't passing everything
    blindly.

  As planned, a fake model only scripts what the model says. These tests check
  what the app sends and how it handles each reply; whether the real model
  refuses correctly still needs a separate live evaluation.

  Verification:

  ┌──────────────────────────────────────────────┬───────────────────────────┐
  │                    Check                     │          Result           │
  ├──────────────────────────────────────────────┼───────────────────────────┤
  │ format:check, lint, typecheck, build         │ pass                      │
  ├──────────────────────────────────────────────┼───────────────────────────┤
  │ npm test                                     │ 55 suites, 749 tests pass │
  ├──────────────────────────────────────────────┼───────────────────────────┤
  │ npm run test:qa, 3 runs                      │ 91/91 each time           │
  ├──────────────────────────────────────────────┼───────────────────────────┤
  │ test:qa with a stripped environment (env -i) │ 91/91                     │
  └──────────────────────────────────────────────┴───────────────────────────┘

  - .env.local: next/jest still loads it from disk locally, so the stripped run
    alone doesn't prove nothing local is used. The guard removes every provider
    and Supabase variable during each harness test, and a test checks that. CI
    has no .env.local.
  - Node version: I ran everything on Node 23.10, but .nvmrc pins 24, so CI will
    be the real check.

  Before you open the PR: the team's AI policy requires the full exported
  transcript, and the file I wrote is a step summary. Please append or link the
  full session export.

  Team post (written for your teammates; ready to paste):

  ▎ S2-003 harness: interfaces to agree on. Until #76/#79/#82 merge, the harness
  ▎ keeps its own copies of these in tests/helpers/qa-harness/contract.ts:
  ▎ 1. Aryan: keep QaModelCaller = (QaModelRequest) => Promise<QaModelReply>, 
  ▎ the QaModelRequest fields, QA_OUTCOMES, and the {outcome, answer, 
  ▎ citedReviewIds} reply stable. The harness reads the question from the 
  ▎ QUESTION (JSON string): block of input. Could S2-013 export a parser or add 
  ▎ a question field instead?
  ▎ 2. Shawn: keep answerActiveTargetQuestion(targetId, question, { callModel })
  ▎ with callModel as the only test override; never the context builder. The 
  ▎ error names/codes harness tests rely on: 
  ▎ TargetNotFoundError/TARGET_NOT_FOUND, 
  ▎ ReviewContextError/NO_REVIEW_DATA|REVIEW_CONTEXT_UNAVAILABLE.
  ▎ 3. Aryan: QaPromptError/EMPTY_QUESTION|REQUEST_TOO_LARGE, 
  ▎ QaResponseError/INVALID_MODEL_RESPONSE|UNGROUNDED_ANSWER, 
  ▎ QaModelError/<code>. Tests match on name + code, never message text.
  ▎ 4. Neel: for S2-016 Phase 2, use setupQaTestHarness + reply.echoContext() + 
  ▎ expectNoForeignData. Outcome ↔ S2-004 category mapping should live in a 
  ▎ harness adapter, not in renames.
  ▎ 5. Melissa: once the Q&A route exists, its tests can drive it through the 
  ▎ same callModel option.

  Files are in:
  - ai-transcripts/2026-11-13_deep_S2-003_claude-code.md
  - /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantast
    ic-Six/a6d9f398-b19c-4239-aed5-5578ba6f45c0/scratchpad/s2-003-pr1-descriptio
    n.md

❯ okay so the AI transcript is there in its directory can I open a PR now, yes  
  or no                                                                         

⏺ No, not yet. Three things are left:

  1. Commit and push. Nothing is committed, so the branch on GitHub is still
     just main and a PR would show no changes. Review the diff, commit it (in
     one commit or the split I suggested), then push.
  2. Full transcript. The file in ai-transcripts/ is the step summary I wrote.
     The team's AI policy says a summary doesn't replace the original
     conversation, so append or link the full exported session before the PR, or
     a reviewer could flag it.
  3. The extra file. Decide whether to keep reference-pipeline.ts, since it
     wasn't in the approved plan. If you keep it, the PR description already
     explains why.

  After those, yes. Open it against main, link #54, and paste the PR description
  from the scratchpad file.

❯ <ide_opened_file>The user opened the file /Users/deepshah/Desktop/CS490_Revie 
  w_Lens_AI_Fantastic_Six/tests/helpers/qa-harness/reference-pipeline.ts in the 
  IDE. This may or may not be related to the current task.</ide_opened_file>    

❯ okay commads to commit and push and ro create PR                              

⏺ Here are the commands to run yourself. I haven't run any of them. They split
  the work into four commits, push, and open the PR.

  1. Commit (four small commits)

  cd /Users/deepshah/Desktop/CS490_Review_Lens_AI_Fantastic_Six
  git status   # should show only the harness files, README.md, package.json, 
  and the transcript

  git add tests/helpers/qa-harness/contract.ts
  tests/helpers/qa-harness/fake-model.ts
  tests/helpers/qa-harness/network-guard.ts
  git commit -m "test(S2-003): add Q&A model contract, fake model, and network 
  guard

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  git add tests/helpers/qa-harness/assertions.ts
  tests/helpers/qa-harness/reference-pipeline.ts
  tests/helpers/qa-harness/index.ts tests/fixtures/qa/
  git commit -m "test(S2-003): add harness entry point, assertions, fixtures, 
  and golden cases

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  git add tests/unit/qa-harness/
  git commit -m "test(S2-003): add harness self-tests, golden suite, and 
  determinism proof

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  git add package.json README.md
  ai-transcripts/2026-11-13_deep_S2-003_claude-code.md
  git commit -m "docs(S2-003): add test:qa script, README harness section, and 
  AI transcript

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  2. Push

  git push origin feature/s2-003-qa-test-harness

  3. Create the PR

  gh pr create \
    --base main \
    --head feature/s2-003-qa-test-harness \
    --title "S2-003: Deterministic Q&A Test Harness (PR 1: model-level harness)"
  \
    --body-file
  /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantastic
  -Six/a6d9f398-b19c-4239-aed5-5578ba6f45c0/scratchpad/s2-003-pr1-description.md

  Add --draft if you want reviewers to see it before it's ready to merge. Then
  request a reviewer, either on GitHub or with gh pr edit --add-reviewer 
  <github-username>.

  Before step 1:
  - Full transcript: the team's AI policy needs the full exported session, not
    just my summary. Add it to the same ai-transcripts/ file, or as a second
    file, before the last commit, and git add it there.
  - Reference pipeline: if you decide to drop reference-pipeline.ts, tell me
    first. The golden-case tests depend on it, so they'd need changing.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % pwd                         
  /Users/deepshah/Desktop/CS490_Review_Lens_AI_Fantastic_Six                    
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status                  
  On branch feature/s2-003-qa-test-harness                                      
  Your branch is up to date with 'origin/feature/s2-003-qa-test-harness'.       
                                                                                
  Changes not staged for commit:                                                
    (use "git add <file>..." to update what will be committed)                  
    (use "git restore <file>..." to discard changes in working directory)       
          modified:   README.md                                                 
          modified:   package.json                                              
                                                                                
  Untracked files:                                                              
    (use "git add <file>..." to include in what will be committed)              
          ai-transcripts/2026-11-13_deep_S2-003_claude-code.md                  
          tests/fixtures/qa/                                                    
          tests/helpers/                                                        
          tests/unit/qa-harness/                                                
                                                                                
  no changes added to commit (use "git add" and/or "git commit -a")             
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             

⏺ That git status is what we expect: the two modified files, the transcript, and
  the three new test folders. tests/helpers/ shows as a whole folder because it
  didn't exist before, and it contains only qa-harness/. Nothing unexpected is
  staged or changed.

  You can run step 1 from my previous message: the four git add / git commit
  pairs, starting with:

  git add tests/helpers/qa-harness/contract.ts
  tests/helpers/qa-harness/fake-model.ts
  tests/helpers/qa-harness/network-guard.ts

  After the fourth commit, run this to check:

  git status          # should say "nothing to commit, working tree clean"
  git log --oneline -5  # should show your 4 new commits on top of c9dff9e

  Then push and create the PR as in steps 2 and 3. If you're still adding the
  full exported transcript, add it before the fourth commit so it goes in with
  the summary file.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status                  
  On branch feature/s2-003-qa-test-harness                                      
  Your branch is up to date with 'origin/feature/s2-003-qa-test-harness'.       
                                                                                
  Changes to be committed:                                                      
    (use "git restore --staged <file>..." to unstage)                           
          new file:   tests/helpers/qa-harness/contract.ts                      
          new file:   tests/helpers/qa-harness/fake-model.ts                    
          new file:   tests/helpers/qa-harness/network-guard.ts                 
                                                                                
  Changes not staged for commit:                                                
    (use "git add <file>..." to update what will be committed)                  
    (use "git restore <file>..." to discard changes in working directory)       
          modified:   README.md                                                 
          modified:   package.json                                              
                                                                                
  Untracked files:                                                              
    (use "git add <file>..." to include in what will be committed)              
          ai-transcripts/2026-11-13_deep_S2-003_claude-code.md                  
          tests/fixtures/qa/                                                    
          tests/helpers/qa-harness/assertions.ts                                
          tests/helpers/qa-harness/index.ts                                     
          tests/helpers/qa-harness/reference-pipeline.ts                        
          tests/unit/qa-harness/                                                
                                                                                
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git log --oneline -5        
  c9dff9e (HEAD -> feature/s2-003-qa-test-harness, origin/main,                 
  origin/feature/s2-003-qa-test-harness, origin/HEAD, main) S2-004: Add         
  Deterministic Scope-Guard Evaluation Set (#72)                                
  f931a34 chore: add Sprint 2 issue backlog (#51)                               
  16fa028 Harden review database writes and size limits (#50)                   
  b69e4aa Fix Google Maps path-case validation and refresh Sprint 1 docs (#49)  
  8cc48aa Implement S1-018 and S1-023 (#48)                                     
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             

⏺ You've staged the first three files but haven't committed them yet, so HEAD is
  still at c9dff9e. Run the first commit:

  git commit -m "test(S2-003): add Q&A model contract, fake model, and network 
  guard

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  Then the remaining three:

  git add tests/helpers/qa-harness/assertions.ts
  tests/helpers/qa-harness/reference-pipeline.ts
  tests/helpers/qa-harness/index.ts tests/fixtures/qa/
  git commit -m "test(S2-003): add harness entry point, assertions, fixtures, 
  and golden cases

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  git add tests/unit/qa-harness/
  git commit -m "test(S2-003): add harness self-tests, golden suite, and 
  determinism proof

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  git add package.json README.md
  ai-transcripts/2026-11-13_deep_S2-003_claude-code.md
  git commit -m "docs(S2-003): add test:qa script, README harness section, and 
  AI transcript

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  Paste the output of git status and git log --oneline -5 again after that if
  you want me to check before you push.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "test(S2-003): add Q&A model contract, fake model, and network guard          
                                                                                
  dquote>                                                                       
                                                                                
  what to put here??                                                            

⏺ Nothing is wrong. The shell is waiting for the closing quote because the
  message spans several lines. Type this line and press Enter:

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  The " at the end closes the message, and the commit will run.

  For the remaining commits, you can avoid the dquote> prompt by using two -m
  flags on one line (git puts a blank line between them):

  git add tests/helpers/qa-harness/assertions.ts
  tests/helpers/qa-harness/reference-pipeline.ts
  tests/helpers/qa-harness/index.ts tests/fixtures/qa/
  git commit -m "test(S2-003): add harness entry point, assertions, fixtures, 
  and golden cases" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  git add tests/unit/qa-harness/
  git commit -m "test(S2-003): add harness self-tests, golden suite, and 
  determinism proof" -m "Co-Authored-By: Claude Opus 5.5 
  <noreply@anthropic.com>"

  git add package.json README.md
  ai-transcripts/2026-11-13_deep_S2-003_claude-code.md
  git commit -m "docs(S2-003): add test:qa script, README harness section, and 
  AI transcript" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

  If you'd rather cancel the current commit and start over, press Ctrl+C.
  Nothing gets committed, and your files stay staged.

[Image #1]

❯ eepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git log --oneline -5         
  c9dff9e (HEAD -> feature/s2-003-qa-test-harness, origin/main,                 
  origin/feature/s2-003-qa-test-harness, origin/HEAD, main) S2-004: Add         
  Deterministic Scope-Guard Evaluation Set (#72)                                
  f931a34 chore: add Sprint 2 issue backlog (#51)                               
  16fa028 Harden review database writes and size limits (#50)                   
  b69e4aa Fix Google Maps path-case validation and refresh Sprint 1 docs (#49)  
  8cc48aa Implement S1-018 and S1-023 (#48)                                     
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "test(S2-003): add Q&A model contract, fake model, and network guard          
                                                                                
  dquote>                                                                       
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "test(S2-003): add Q&A model contract, fake model, and network guard"         
                                                                                
  [feature/s2-003-qa-test-harness 7a9cf82] test(S2-003): add Q&A model          
  contract, fake model, and network guard                                       
   3 files changed, 553 insertions(+)                                           
   create mode 100644 tests/helpers/qa-harness/contract.ts                      
   create mode 100644 tests/helpers/qa-harness/fake-model.ts                    
   create mode 100644 tests/helpers/qa-harness/network-guard.ts                 
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git add                     
  tests/unit/qa-harness/                                                        
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "test(S2-003): add harness self-tests, golden suite, and determinism proof"   
                                                                                
  [feature/s2-003-qa-test-harness c5be5e9] test(S2-003): add harness            
  self-tests, golden suite, and determinism proof                               
   7 files changed, 1101 insertions(+)                                          
   create mode 100644 tests/unit/qa-harness/assertions.test.ts                  
   create mode 100644 tests/unit/qa-harness/determinism.test.ts                 
   create mode 100644 tests/unit/qa-harness/fake-model.test.ts                  
   create mode 100644 tests/unit/qa-harness/fixtures.test.ts                    
   create mode 100644 tests/unit/qa-harness/golden-cases.test.ts                
   create mode 100644 tests/unit/qa-harness/harness.test.ts                     
   create mode 100644 tests/unit/qa-harness/network-guard.test.ts               
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git add package.json        
  README.md ai-transcripts/2026-11-13_deep_S2-003_claude-code.md                
                                                                                
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "docs(S2-003): add test:qa script, README harness section, and AI transcript" 
                                                                                
  [feature/s2-003-qa-test-harness c42da55] docs(S2-003): add test:qa script,    
  README harness section, and AI transcript                                     
   3 files changed, 143 insertions(+)                                           
   create mode 100644 ai-transcripts/2026-11-13_deep_S2-003_claude-code.md      
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             

⏺ The second commit was skipped. The 5 files in your Source Control panel
  (datasets.ts, golden-cases.ts, assertions.ts, index.ts, reference-pipeline.ts)
  are still uncommitted, but the tests you already committed depend on them.
  Commit them now:

  git add tests/helpers/qa-harness/assertions.ts
  tests/helpers/qa-harness/reference-pipeline.ts
  tests/helpers/qa-harness/index.ts tests/fixtures/qa/
  git commit -m "test(S2-003): add harness entry point, assertions, fixtures, 
  and golden cases"

  Then check:

  git status            # should say: nothing to commit, working tree clean
  git log --oneline -5  # should show 4 new commits above c9dff9e

  Because this commit lands last instead of second, the two commits before it
  won't build on their own. Once all four are in, the branch is complete and CI
  runs on the final state, so it's fine to leave the order as it is.

  Your commits went in without the Co-Authored-By line. The PR description
  already says Claude Code was used, which is what the team's AI policy asks
  for, so you don't need to amend them.

  Once git status is clean, push and create the PR:

  git push origin feature/s2-003-qa-test-harness

  gh pr create --base main --head feature/s2-003-qa-test-harness \
    --title "S2-003: Deterministic Q&A Test Harness (PR 1: model-level harness)"
  \
    --body-file
  /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantastic
  -Six/a6d9f398-b19c-4239-aed5-5578ba6f45c0/scratchpad/s2-003-pr1-description.md

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git add                     
  tests/helpers/qa-harness/assertions.ts                                        
  tests/helpers/qa-harness/reference-pipeline.ts                                
  tests/helpers/qa-harness/index.ts tests/fixtures/qa/                          
                                                                                
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "test(S2-003): add harness entry point, assertions, fixtures, and golden      
  cases"                                                                        
                                                                                
  [feature/s2-003-qa-test-harness 53b5124] test(S2-003): add harness entry      
  point, assertions, fixtures, and golden cases                                 
   5 files changed, 1394 insertions(+)                                          
   create mode 100644 tests/fixtures/qa/datasets.ts                             
   create mode 100644 tests/fixtures/qa/golden-cases.ts                         
   create mode 100644 tests/helpers/qa-harness/assertions.ts                    
   create mode 100644 tests/helpers/qa-harness/index.ts                         
   create mode 100644 tests/helpers/qa-harness/reference-pipeline.ts            
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status                  
  On branch feature/s2-003-qa-test-harness                                      
  Your branch is ahead of 'origin/feature/s2-003-qa-test-harness' by 4 commits. 
    (use "git push" to publish your local commits)                              
                                                                                
  nothing to commit, working tree clean                                         
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git log --oneline -5        
  53b5124 (HEAD -> feature/s2-003-qa-test-harness) test(S2-003): add harness    
  entry point, assertions, fixtures, and golden cases                           
  c42da55 docs(S2-003): add test:qa script, README harness section, and AI      
  transcript                                                                    
  c5be5e9 test(S2-003): add harness self-tests, golden suite, and determinism   
  proof                                                                         
  7a9cf82 test(S2-003): add Q&A model contract, fake model, and network guard   
  c9dff9e (origin/main, origin/feature/s2-003-qa-test-harness, origin/HEAD,     
  main) S2-004: Add Deterministic Scope-Guard Evaluation Set (#72)              
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             

⏺ That's all four commits, and the working tree is clean, so the branch has
  everything. The files are identical to what I verified earlier, so you don't
  need to re-run the checks.

  Push and create the PR:

  git push origin feature/s2-003-qa-test-harness

  gh pr create --base main --head feature/s2-003-qa-test-harness \
    --title "S2-003: Deterministic Q&A Test Harness (PR 1: model-level harness)"
  \
    --body-file
  /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantastic
  -Six/a6d9f398-b19c-4239-aed5-5578ba6f45c0/scratchpad/s2-003-pr1-description.md

  gh will print the PR URL. After that:
  - CI: wait for the "Lint, typecheck, test, build" check to go green. It runs
    on Node 24, which confirms what I could only test on 23.
  - Reviewer: request at least one teammate, and ideally a second for the
    security side, since this covers AI data-boundary tests.
  - Team post: share the interfaces message from earlier so Aryan, Shawn, Neel
    and Melissa can agree on contract.ts.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git push origin             
  feature/s2-003-qa-test-harness                                                
                                                                                
  Enumerating objects: 45, done.                                                
  Counting objects: 100% (45/45), done.                                         
  Delta compression using up to 12 threads                                      
  Compressing objects: 100% (36/36), done.                                      
  Writing objects: 100% (38/38), 39.50 KiB | 13.17 MiB/s, done.                 
  Total 38 (delta 11), reused 0 (delta 0), pack-reused 0 (from 0)               
  remote: Resolving deltas: 100% (11/11), completed with 6 local objects.       
  To https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six.git         
     c9dff9e..53b5124  feature/s2-003-qa-test-harness ->                        
  feature/s2-003-qa-test-harness                                                
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             
  PUSH IS DONE :) LETS GO, I will manually create a PR what should the base     
  branch and PR description b3e??                                               

⏺ Set base: main and compare: feature/s2-003-qa-test-harness.

  Title: S2-003: Deterministic Q&A Test Harness (PR 1: model-level harness)

  Description (written for reviewers):

  Refs #54

  ## What and why

  Q&A is about to land across several stories (S2-010/011/013 in #76, #78, #79,
  #82; S2-014/015/016). Each needs to test what goes to the model and how the
  app handles the reply, without paying for or depending on a live model. This
  PR adds a reusable harness that:

  - replaces the model seam (`QaModelCaller`) with a **scripted fake** that
  records every request;
  - **blocks all network access** (fetch, http/https, raw sockets) and removes
  provider and Supabase env vars during each test. Any attempt fails the test,
  even if the code swallowed the error;
  - provides **frozen synthetic datasets** (normal, empty, mixed ratings, Target
  A/B, User B private, malformed rows) and **21 golden cases** covering
  answerable, insufficient evidence, general-knowledge, other entity/platform,
  cross-user leak, target switch, stale context, edge inputs, malformed model
  output, and model errors;
  - provides **behaviour assertions**: system prompt applied, only the active
  target's reviews sent, no reviewer names, no foreign markers/IDs/text in the
  request or the answer, grounded citations, declines carry no citations.
  Nothing compares model prose.

  It merges independently of the unmerged Q&A PRs and imports none of their
  code. It uses a harness-owned copy of their types (`contract.ts`, marked
  **pending team agreement**) and a small test-only **contract reference 
  pipeline**. A follow-up PR (stacked on #82) runs the same golden table against
  the real `answerActiveTargetQuestion`.

  **What this does not prove:** with a fake model, the reply outcome is
  scripted. These tests check orchestration (inputs, reply handling, when the
  model must not be called). They do not check whether the real model refuses
  correctly. That needs a separate approved live-model evaluation.

  ## Files changed

  New (all harness-owned):
  - `tests/helpers/qa-harness/contract.ts`: copies of PR #82 types and error
  names (pending agreement)
  - `tests/helpers/qa-harness/fake-model.ts`: `createFakeQaModel`, `reply.*`
  builders
  - `tests/helpers/qa-harness/network-guard.ts`: `installNetworkGuard`
  - `tests/helpers/qa-harness/assertions.ts`: `expect*` helpers
  - `tests/helpers/qa-harness/reference-pipeline.ts`: test-only stand-in
  pipeline
  - `tests/helpers/qa-harness/index.ts`: `createQaTestHarness`,
  `setupQaTestHarness`, `runGoldenCase`
  - `tests/fixtures/qa/datasets.ts`, `tests/fixtures/qa/golden-cases.ts`
  - `tests/unit/qa-harness/` (7 suites, 91 tests): fake model, network guard,
  assertions, fixtures, golden cases plus 9 mutation tests that prove the runner
  rejects broken pipelines, determinism, harness lifecycle

  Modified (additive only): `package.json` (`test:qa`), `README.md` (harness
  section and script row).

  No teammate files, no `src/` files, no new dependencies, and no CI workflow
  changes.

  ## How to run

      npm run test:qa   # harness suites only
      npm test          # everything (CI already runs this, with no secrets)

  ## How teammates use it

      import { reply, setupQaTestHarness, expectNoForeignData } from
  "../../helpers/qa-harness";

      const qa = setupQaTestHarness({
        script: [{ when: { questionIncludes: "battery" }, then:
  reply.answered([reviewId]) }],
      });

      it("...", async () => {
        const result = await qa().ask(targetId, "What about battery life?");
        expectNoForeignData(qa().model.lastCall().request, [otherDataset]);
      });

  - To add a golden case, append to `QA_GOLDEN_CASES`. Foreign-data,
  system-prompt and context checks run automatically.
  - S2-016 Phase 2: use `reply.echoContext()` with `expectNoForeignData` and
  `expectAnswerHasNoForeignData`.
  - After #82 merges: pass the real orchestration as the harness `pipeline`
  option.

  ## Verification

  | Check | Result |
  | --- | --- |
  | `npm run format:check` | pass |
  | `npm run lint` | pass |
  | `npm run typecheck` | pass |
  | `npm test` | 55 suites / 749 tests pass |
  | `npm run build` | pass |
  | `npm run test:qa` × 3 | 91/91 each run |
  | `env -i PATH HOME npm run test:qa` | 91/91 |

  Run locally on Node 23.10 (`.nvmrc` pins 24); CI confirms on 24.

  ## Open questions / blockers

  1. Team agreement on the interfaces in `contract.ts` (Aryan: model
  request/reply shapes and question layout; Shawn: `callModel` as the only test
  override and error codes; Neel: S2-004 category mapping).
  2. The follow-up PR (fake Supabase, fake OpenAI fetch, real-pipeline golden
  run, compile-time type-equivalence checks) is blocked on #76, #79 and #82
  merging.
  3. The S2-BR rule texts referenced by #54 are not in the repo; criteria are
  taken from the issue body.

  ## AI assistance

  Claude Code (Claude Opus 5.5). Transcript:
  `ai-transcripts/2026-11-13_deep_S2-003_claude-code.md`. Reviewed by the
  author. Needs one teammate reviewer; a security reviewer is suggested, since
  this touches AI data-boundary tests.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Before you submit:
  - "Reviewed by the author": that line is a claim you're making, so read
    through the diff first.
  - Full transcript: if you haven't added the full exported transcript yet, add
    it in a follow-up commit on this branch. The PR will update automatically.

❯ u sure Ref #54 is correct??                                                   

⏺ Yes. I checked it during discovery with gh issue list, and #54 is the open
  issue titled "S2-003 - Create Deterministic Q&A Test Harness". Its body
  matches the acceptance criteria I quoted. You can confirm with:

  gh issue view 54 --json number,title,state

  I used Refs #54 rather than Closes #54 on purpose. Closes would close the
  issue automatically when this PR merges, but S2-003 isn't finished until the
  follow-up PR runs the golden cases against the real pipeline. Use Closes #54
  on that second PR.

❯ Address Neel's review on PR #83. Do not touch teammates' files or production  
  code.                                                                         
                                                                                
  1. tests/helpers/qa-harness/assertions.ts, expectContextOnlyForTarget:        
     Parse request.input and validate the full evidence projection per the      
  S2-013/S2-011 format (review ID, text, rating, date, order) against the       
  expected dataset rows, not just reviewIds and text presence. Add mutation     
  tests proving each corruption is caught: changed rating, changed date,        
  changed ID, swapped order, dropped review, extra review.                      
  2. expectSystemPromptApplied:                                                 
     Assert a stable semantic contract, not exact prose: grounding-in-reviews   
  rule, decline/insufficient-evidence rule, scope restriction (active target    
  only, no outside knowledge), plus the JSON-stringified target name and        
  platform label. Define these as named invariants (e.g. keyword/regex groups)  
  in one place. Add a regression test that strips the grounding and decline     
  rules from a valid prompt and requires the assertion to fail. Document in the 
  README that this checks the reference pipeline's prompt contract until        
  integration against the real S2-013 prompt lands.                             
                                                                                
  Then: add tests for both, run format:check, lint, typecheck, npm test, build. 
  Small commits. Show output. Don't commit and push.                            

⏺ "Small commits" and "don't commit" conflict again, so I'll leave everything
  uncommitted and give you a suggested commit split at the end. First, Neel's
  actual review and the current branch state:

  Ran 1 shell command (ctrl+o to expand)

⏺ Neel's third review item, the full original session export, is still open
  since only you can produce it. I'm re-reading my reformatted files before
  editing.

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

⏺ Plan: put the evidence layout and the named prompt invariants in contract.ts,
  next to the other copied S2-013 items, so they're defined in one place. First,
  the contract additions:

⏺ Update(tests/helpers/qa-harness/contract.ts)
  ⎿  Added 73 lines
       91   */
       92  export const QA_INPUT_QUESTION_HEADER = "QUESTION (JSON string
           ):";
       93  
       94 +/**                                                           
       95 + * Mirror of the S2-013 evidence section that opens `input`:  
       96 + *                                                            
       97 + *   REVIEW DATASET (<n> reviews, JSON array):                
       98 + *   [{"id":…,"rating":…,"date":…,"text":…}, …]               
       99 + *                                                            
      100 + * Each row is exactly this projection of a persisted Review, 
          +in persisted order. Reviewer names,                           
      101 + * URLs and source metadata are deliberately absent (S2-013 da
          +ta minimisation).                                             
      102 + */                                                           
      103 +export const QA_INPUT_DATASET_HEADER_PATTERN = /^REVIEW DATASE
          +T \((\d+) reviews, JSON array\):$/;                           
      104 +                                                              
      105 +export interface QaEvidenceRow {                              
      106 +  id: string;                                                 
      107 +  rating: number;                                             
      108 +  /** The review's `reviewDate` (ISO 8601) or null. */        
      109 +  date: string | null;                                        
      110 +  text: string;                                               
      111 +}                                                             
      112 +                                                              
      113 +export const QA_EVIDENCE_ROW_FIELDS = ["id", "rating", "date",
          + "text"] as const satisfies readonly (keyof QaEvidenceRow)[]; 
      114 +                                                              
      115 +/**                                                           
      116 + * S2-013 system-prompt contract as stable semantic invariants
          +, not exact prose.                                            
      117 + *                                                            
      118 + * PENDING AGREEMENT (Aryan, S2-013). Each invariant lists alt
          +ernatives. An alternative is satisfied                        
      119 + * when ONE sentence of the whitespace-normalised prompt match
          +es ALL of its patterns, so a rule must                        
      120 + * be stated together, not assembled from words scattered acro
          +ss the prompt. Rewording the prompt is                        
      121 + * fine as long as each rule is still stated. Until the S2-003
          + integration PR runs these against the                        
      122 + * real S2-013 prompt, CI checks them only against the referen
          +ce pipeline's placeholder prompt.                             
      123 + *                                                            
      124 + * The target name (JSON-encoded) and platform label are check
          +ed separately, per target.                                    
      125 + */                                                           
      126 +export interface QaPromptInvariant {                          
      127 +  readonly id: string;                                        
      128 +  readonly rule: string;                                      
      129 +  readonly alternatives: readonly (readonly RegExp[])[];      
      130 +}                                                             
      131 +                                                              
      132 +export const QA_SYSTEM_PROMPT_INVARIANTS = [                  
      133 +  {                                                           
      134 +    id: "grounded-in-reviews",                                
      135 +    rule: "Answers are based only on the supplied reviews.",  
      136 +    alternatives: [[/\bonly\b/i, /\b(supplied|provided)\b/i, /
          +\breviews?\b/i, /\b(answer|base|evidence)/i]],                
      137 +  },                                                          
      138 +  {                                                           
      139 +    id: "no-outside-knowledge",                               
      140 +    rule: "Outside or general knowledge must not be used.",   
      141 +    alternatives: [[/\b(do not|don't|never|must not)\b/i, /\b(
          +outside|general|external)\b/i, /\bknowledge\b/i]],            
      142 +  },                                                          
      143 +  {                                                           
      144 +    id: "insufficient-evidence",                              
      145 +    rule: "When the reviews lack enough information, say so in
          +stead of guessing.",                                          
      146 +    alternatives: [[/\b(not|n't|lack\w*)\b/i, /\benough\b/i, /
          +\b(information|evidence)\b/i]],                               
      147 +  },                                                          
      148 +  {                                                           
      149 +    id: "decline-out-of-scope",                               
      150 +    rule: "Questions not about analysing these reviews are dec
          +lined.",                                                      
      151 +    alternatives: [[/\bdecline\b/i, /\bquestions?\b/i, /\b(not
          + about|unrelated|general)\b/i]],                              
      152 +  },                                                          
      153 +  {                                                           
      154 +    id: "decline-other-entity",                               
      155 +    rule: "Questions about another entity, business or product
          + are declined.",                                              
      156 +    alternatives: [[/\bdecline\b/i, /\b(other|another|differen
          +t)\b/i, /\b(entity|entities|business|product)\b/i]],          
      157 +  },                                                          
      158 +  {                                                           
      159 +    id: "decline-other-platform",                             
      160 +    rule: "Questions about reviews from another platform are d
          +eclined.",                                                    
      161 +    alternatives: [[/\bdecline\b/i, /\b(other|another|differen
          +t)\b/i, /\bplatforms?\b/i]],                                  
      162 +  },                                                          
      163 +] as const satisfies readonly QaPromptInvariant[];            
      164 +                                                              
      165 +export type QaPromptInvariantId = (typeof QA_SYSTEM_PROMPT_INV
          +ARIANTS)[number]["id"];                                       
      166 +                                                              
      167  /** Mirror of S2-013 request-budget constants (application bud
           get, not a model limit). */
      168  export const QA_MAX_REQUEST_TOKENS = 16_000;
      169  export const QA_RESERVED_OUTPUT_TOKENS = 1_500;

⏺ The n't alternative can never match, because \b doesn't fall inside "doesn't".
  Replacing it:
⏺ Update(tests/helpers/qa-harness/contract.ts)
  ⎿  Added 1 line, removed 1 line
      143    {
      144      id: "insufficient-evidence",
      145      rule: "When the reviews lack enough information, say so in
           stead of guessing.",
      146 -    alternatives: [[/\b(not|n't|lack\w*)\b/i, /\benough\b/i, /
          -\b(information|evidence)\b/i]],                               
      146 +    alternatives: [[/\b(not|lack\w*|without)\b/i, /\benough\b/
          +i, /\b(information|evidence)\b/i]],                           
      147    },
      148    {
      149      id: "decline-out-of-scope",

⏺ Update(tests/helpers/qa-harness/assertions.ts)
  ⎿  Added 6 lines
       1  import type { QaFixtureDataset } from "../../fixtures/qa/datase
          ts";
       2  import {
       3    isDeclineOutcome,
       4 +  QA_EVIDENCE_ROW_FIELDS,                                      
       5 +  QA_INPUT_DATASET_HEADER_PATTERN,                             
       6 +  QA_SYSTEM_PROMPT_INVARIANTS,                                 
       7    REVIEW_PLATFORM_LABELS,
       8    type QaAnswer,
       9    type QaDeclineOutcome,
      10 +  type QaEvidenceRow,                                          
      11    type QaModelRequest,
      12    type QaPipelineErrorShape,
      13 +  type QaPromptInvariant,                                      
      14 +  type QaPromptInvariantId,                                    
      15  } from "./contract";
      16  import { applicationSuppliedInput, extractQuestion } from "./fa
          ke-model";
      17  

⏺ Update(tests/helpers/qa-harness/assertions.ts)
  ⎿  Added 33 lines, removed 2 lines
      31    throw new QaHarnessAssertionError(message);
      32  }
      33  
      34 +/** Whitespace-normalised sentences of a prompt (rules may wrap
         + across lines). */                                             
      35 +function promptSentences(instructions: string): string[] {     
      36 +  return instructions                                          
      37 +    .replace(/\s+/g, " ")                                      
      38 +    .split(/(?<=[.!?])\s+/)                                    
      39 +    .filter((sentence) => sentence.trim() !== "");             
      40 +}                                                              
      41 +                                                               
      42 +function satisfies(invariant: QaPromptInvariant, sentences: rea
         +donly string[]): boolean {                                     
      43 +  return invariant.alternatives.some((patterns) =>             
      44 +    sentences.some((sentence) => patterns.every((pattern) => pa
         +ttern.test(sentence))),                                        
      45 +  );                                                           
      46 +}                                                              
      47 +                                                               
      48 +/** IDs of the S2-013 prompt invariants (see `QA_SYSTEM_PROMPT_
         +INVARIANTS`) the prompt lacks. */                              
      49 +export function missingPromptInvariants(instructions: string): 
         +QaPromptInvariantId[] {                                        
      50 +  const sentences = promptSentences(instructions);             
      51 +  return QA_SYSTEM_PROMPT_INVARIANTS.filter((invariant) => !sat
         +isfies(invariant, sentences)).map(                             
      52 +    (invariant) => invariant.id,                               
      53 +  );                                                           
      54 +}                                                              
      55 +                                                               
      56  /**
      35 - * S2-013: the system prompt is present, names the active targe
         -t and platform, and keeps                                      
      36 - * untrusted content (review text and the user's question) out 
         -of the system instructions.                                    
      57 + * S2-013: the system prompt is present, names the active targe
         +t (JSON-encoded) and platform,                                 
      58 + * states every rule in `QA_SYSTEM_PROMPT_INVARIANTS` (groundin
         +g, no outside knowledge,                                       
      59 + * insufficient evidence, and the three decline rules), and kee
         +ps untrusted content (review text                              
      60 + * and the user's question) out of the system instructions. It 
         +checks meaning, not exact wording.                             
      61   */
      62  export function expectSystemPromptApplied(
      63    request: QaModelRequest,
     ...
      76    if (!request.instructions.includes(platform)) {
      77      fail(`System instructions do not name the review platform "
          ${platform}".`);
      78    }
      79 +  const missing = missingPromptInvariants(request.instructions)
         +;                                                              
      80 +  if (missing.length > 0) {                                    
      81 +    const rules = QA_SYSTEM_PROMPT_INVARIANTS.filter((invariant
         +) =>                                                           
      82 +      (missing as string[]).includes(invariant.id),            
      83 +    ).map((invariant) => `${invariant.id} (${invariant.rule})`)
         +;                                                              
      84 +    fail(`System instructions are missing prompt rules:\n- ${ru
         +les.join("\n- ")}`);                                           
      85 +  }                                                            
      86    if (options.promptVersion !== undefined && request.promptVers
          ion !== options.promptVersion) {
      87      fail(`Prompt version ${request.promptVersion} is not ${opti
          ons.promptVersion}.`);
      88    }

⏺ Now the full evidence check. It parses the dataset section of input and
  compares every row's ID, rating, date, text and position against the persisted
  fixture rows:

⏺ Update(tests/helpers/qa-harness/assertions.ts)
  ⎿  Added 82 lines, removed 10 lines
       97    }
       98  }
       99  
      100 -/** S2-010: the request carries exactly the active dataset's r
          -eviews, in persisted order. */                                
      100 +const isRecord = (value: unknown): value is Record<string, unk
          +nown> =>                                                      
      101 +  typeof value === "object" && value !== null && !Array.isArra
          +y(value);                                                     
      102 +                                                              
      103 +/**                                                           
      104 + * Parses the S2-013 evidence section of `request.input` (see 
          +`QA_INPUT_DATASET_HEADER_PATTERN`)                            
      105 + * into rows, failing on any layout or shape problem: missing 
          +header, invalid JSON, a declared                              
      106 + * count that differs from the rows, or a row whose fields are
          + not exactly id/rating/date/text.                             
      107 + */                                                           
      108 +export function parseEvidenceRows(request: QaModelRequest): Qa
          +EvidenceRow[] {                                               
      109 +  const supplied = applicationSuppliedInput(request).replace(/
          +\n+$/, "");                                                   
      110 +  const newline = supplied.indexOf("\n");                     
      111 +  const header = newline === -1 ? supplied : supplied.slice(0,
          + newline);                                                    
      112 +  const match = QA_INPUT_DATASET_HEADER_PATTERN.exec(header); 
      113 +  if (!match || newline === -1) fail("Model input does not sta
          +rt with a REVIEW DATASET section.");                          
      114 +                                                              
      115 +  let parsed: unknown;                                        
      116 +  try {                                                       
      117 +    parsed = JSON.parse(supplied.slice(newline + 1));         
      118 +  } catch {                                                   
      119 +    fail("The REVIEW DATASET section is not a single valid JSO
          +N array.");                                                   
      120 +  }                                                           
      121 +  if (!Array.isArray(parsed)) fail("The REVIEW DATASET section
          + is not a JSON array.");                                      
      122 +  if (Number(match[1]) !== parsed.length) {                   
      123 +    fail(`The REVIEW DATASET header declares ${match[1]} revie
          +ws but contains ${parsed.length}.`);                          
      124 +  }                                                           
      125 +                                                              
      126 +  const expectedKeys = [...QA_EVIDENCE_ROW_FIELDS].sort().join
          +(",");                                                        
      127 +  return parsed.map((row: unknown, index): QaEvidenceRow => { 
      128 +    const label = `Evidence row ${index + 1}`;                
      129 +    if (!isRecord(row)) fail(`${label} is not an object.`);   
      130 +    const keys = Object.keys(row).sort().join(",");           
      131 +    if (keys !== expectedKeys) fail(`${label} has fields [${ke
          +ys}]; expected [${expectedKeys}].`);                          
      132 +    const { id, rating, date, text } = row;                   
      133 +    if (                                                      
      134 +      typeof id !== "string" ||                               
      135 +      typeof rating !== "number" ||                           
      136 +      (date !== null && typeof date !== "string") ||          
      137 +      typeof text !== "string"                                
      138 +    ) {                                                       
      139 +      fail(`${label} has a field of the wrong type.`);        
      140 +    }                                                         
      141 +    return { id, rating, date, text };                        
      142 +  });                                                         
      143 +}                                                             
      144 +                                                              
      145 +/**                                                           
      146 + * S2-010 / S2-013: the request carries exactly the active dat
          +aset's evidence. Every row's id,                              
      147 + * rating, date and text matches the persisted review at the s
          +ame position, with nothing dropped,                           
      148 + * added or reordered, and `reviewIds` lists the same IDs in t
          +he same order.                                                
      149 + */                                                           
      150  export function expectContextOnlyForTarget(
      151    request: QaModelRequest,
      152    dataset: QaFixtureDataset,
     ...
      154    if (request.targetId !== dataset.target.id) {
      155      fail(`Request targetId ${request.targetId} is not ${datase
           t.target.id} (${dataset.key}).`);
      156    }
      108 -  const expected = dataset.reviews.map((review) => review.id);
      109 -  if (JSON.stringify(request.reviewIds) !== JSON.stringify(exp
          -ected)) {                                                     
      157 +                                                              
      158 +  const rows = parseEvidenceRows(request);                    
      159 +  const expected: QaEvidenceRow[] = dataset.reviews.map((revie
          +w) => ({                                                      
      160 +    id: review.id,                                            
      161 +    rating: review.rating,                                    
      162 +    date: review.reviewDate,                                  
      163 +    text: review.text,                                        
      164 +  }));                                                        
      165 +  if (rows.length !== expected.length) {                      
      166 +    fail(`Model input has ${rows.length} reviews; ${dataset.ke
          +y} has ${expected.length}.`);                                 
      167 +  }                                                           
      168 +  const sortedIds = (list: readonly QaEvidenceRow[]) => JSON.s
          +tringify(list.map((r) => r.id).sort());                       
      169 +  if (                                                        
      170 +    sortedIds(rows) === sortedIds(expected) &&                
      171 +    rows.some((row, index) => row.id !== expected[index].id)  
      172 +  ) {                                                         
      173 +    fail(`Evidence rows are not in persisted order for ${datas
          +et.key}.`);                                                   
      174 +  }                                                           
      175 +  for (const [index, row] of rows.entries()) {                
      176 +    for (const field of QA_EVIDENCE_ROW_FIELDS) {             
      177 +      if (row[field] !== expected[index][field]) {            
      178 +        fail(                                                 
      179 +          `Evidence row ${index + 1} ${field} is ${JSON.string
          +ify(row[field])}; expected ` +                                
      180 +            `${JSON.stringify(expected[index][field])} (${data
          +set.key} review ${expected[index].id}).`,                     
      181 +        );                                                    
      182 +      }                                                       
      183 +    }                                                         
      184 +  }                                                           
      185 +                                                              
      186 +  const expectedIds = expected.map((row) => row.id);          
      187 +  if (JSON.stringify(request.reviewIds) !== JSON.stringify(exp
          +ectedIds)) {                                                  
      188      fail(
      189        `Request reviewIds ${JSON.stringify(request.reviewIds)} 
           are not exactly ` +
      112 -        `${JSON.stringify(expected)} (${dataset.key}).`,      
      190 +        `${JSON.stringify(expectedIds)} (${dataset.key}).`,   
      191      );
      192    }
      115 -  const supplied = applicationSuppliedInput(request);         
      116 -  for (const review of dataset.reviews) {                     
      117 -    if (!supplied.includes(JSON.stringify(review.text))) {    
      118 -      fail(`Review ${review.id} text from ${dataset.key} is mi
          -ssing from the model input.`);                                
      119 -    }                                                         
      120 -  }                                                           
      193  }
      194  
      195  /** S2-013 data minimisation: reviewer names and source URLs n
           ever reach the model. */

⏺ Now the reference pipeline's placeholder prompt. It has to state each rule as
  a real sentence, like S2-013 does, or it would fail the new invariants itself:

⏺ Update(tests/helpers/qa-harness/reference-pipeline.ts)
  ⎿  Added 8 lines, removed 2 lines
      49  function referenceInstructions(dataset: QaFixtureDataset): stri
          ng {
      50    const name = JSON.stringify(dataset.target.name);
      51    const platform = REVIEW_PLATFORM_LABELS[dataset.target.platfo
          rm];
      52 +  // States each rule in QA_SYSTEM_PROMPT_INVARIANTS once, in i
         +ts own sentence, like S2-013 does.                             
      53    return [
      54      "[S2-003 reference placeholder prompt; not the S2-013 syste
          m prompt]",
      54 -    `Analyze only the ${platform} reviews for ${name} supplied 
         -in the user message.`,                                         
      55 -    "Decline general-knowledge, other-entity, and other-platfor
         -m questions.",                                                 
      55 +    `You analyze the ${platform} reviews for ${name} supplied i
         +n the user message.`,                                          
      56 +    "Base every answer only on the supplied reviews.",         
      57 +    "Do not use outside or general knowledge.",                
      58 +    "If the reviews do not contain enough information to answer
         +, say so instead of guessing.",                                
      59 +    "Decline questions that are not about analyzing these revie
         +ws.",                                                          
      60 +    `Decline questions about any other entity, business, or pro
         +duct than ${name}.`,                                           
      61 +    `Decline questions about reviews from any other platform th
         +an ${platform}.`,                                              
      62      `Reply with JSON: {"outcome": one of ${QA_OUTCOMES.join(", 
          ")}, "answer", "citedReviewIds"}.`,
      63    ].join("\n");
      64  }

⏺ Update(tests/helpers/qa-harness/index.ts)
  ⎿  Added 2 lines, removed 1 line
      219      const foreign = harness.datasets.filter((candidate) => can
           didate.key !== active.key);
      220      const { request } = result.calls[0];
      221      expectSystemPromptApplied(request, active);
      222 +    // Foreign data first: a leaked row would also fail the co
          +ntext check, but this names the leak.                         
      223 +    expectNoForeignData(request, foreign);                    
      224      expectContextOnlyForTarget(request, active);
      225      expectNoReviewerIdentity(request, active);
      224 -    expectNoForeignData(request, foreign);                    
      226  
      227      if (result.ok) {
      228        expectAnswerHasNoForeignData(result.answer, foreign);

⏺ Running the existing suite to see which tests need updating after the stricter
  checks:

  Ran 1 shell command (ctrl+o to expand)

⏺ Typecheck is clean, and the only two failures are the expected ones: both now
  fail with a more specific message. Updating those, then adding the new
  mutation and invariant tests:

  Ran 1 shell command (ctrl+o to expand)

⏺ Update(tests/unit/qa-harness/assertions.test.ts)
  ⎿  Added 1 line, removed 1 line
      129            },
      130            targetA,
      131          ),
      132 -      /missing from the model input/,                         
      132 +      /Evidence row 3 text/,                                  
      133      );
      134    });
      135  

⏺ Update(tests/unit/qa-harness/golden-cases.test.ts)
  ⎿  Added 2 lines, removed 1 line
      64            ? { ...request, reviewIds: [targetAReview.id, ...requ
          est.reviewIds] }
      65            : request,
      66        ),
      67 -      /step 2: Request reviewIds/,                             
      67 +      // The stale Target A ID is foreign to Target B, so the l
         +eak check names it first.                                      
      68 +      /step 2: Foreign data reached the model request:\n- targe
         +tA: "2a000000/,                                                
      69      ],
      70      [
      71        "sends reviewer names to the model",

⏺ Now the new test file: evidence mutations, including Neel's exact "rating":5 →
  "rating":1 example, and the prompt-invariant regressions:

⏺ Write(tests/unit/qa-harness/prompt-and-evidence-contract.test.ts)
  ⎿  Wrote 233 lines to
     tests/unit/qa-harness/prompt-and-evidence-contract.test.ts
       1 /** @jest-environment node */
       2 
       3 import { getQaDataset } from "../../fixtures/qa/datasets";
       4 import {
       5   expectContextOnlyForTarget,
       6   expectSystemPromptApplied,
       7   missingPromptInvariants,
       8   parseEvidenceRows,
       9   QA_INPUT_QUESTION_HEADER,
      10   QA_SYSTEM_PROMPT_INVARIANTS,
     … +223 lines (ctrl+o to expand)

⏺ Adding the same rating corruption at the golden-runner level, so it's shown to
  be caught end to end:

  Searched for 1 pattern (ctrl+o to expand)

⏺ Update(tests/unit/qa-harness/golden-cases.test.ts)
  ⎿  Added 21 lines
       77        /Reviewer name/,
       78      ],
       79      [
       80 +      "corrupts a serialized rating while keeping text and rev
          +iewIds",                                                      
       81 +      "qa-answer-001",                                        
       82 +      tamperRequest((request) => ({                           
       83 +        ...request,                                           
       84 +        input: request.input.replace('"rating":5', '"rating":1
          +'),                                                           
       85 +      })),                                                    
       86 +      /qa-answer-001 step 1: Evidence row 1 rating is 1; expec
          +ted 5/,                                                       
       87 +    ],                                                        
       88 +    [                                                         
       89        "drops the system prompt",
       90        "qa-general-001",
       91        tamperRequest((request) => ({ ...request, instructions: 
           "" })),
       92        /System instructions are empty/,
       93      ],
       94      [
       95 +      "strips the grounding and decline rules from the system 
          +prompt",                                                      
       96 +      "qa-other-entity-001",                                  
       97 +      tamperRequest((request) => ({                           
       98 +        ...request,                                           
       99 +        instructions: request.instructions                    
      100 +          .split("\n")                                        
      101 +          .filter((line) => !/^(Base every answer|Decline )/.t
          +est(line))                                                    
      102 +          .join("\n"),                                        
      103 +      })),                                                    
      104 +      /qa-other-entity-001 step 1: System instructions are mis
          +sing prompt rules:\n- grounded-in-reviews/,                   
      105 +    ],                                                        
      106 +    [                                                         
      107        "puts the user question into the system prompt",
      108        "qa-other-entity-001",
      109        tamperRequest((request) => ({

⏺ Bash(npx prettier --write tests/helpers/qa-harness tests/unit/qa-harness
      >/dev/null && npx tsc --noEmit --incremental false 2>&1 | head; npx jest
      --runInBand tests/u…)
  ⎿  Tests:       123 passed, 123 total
  ⎿  Updated tests/helpers/qa-harness/assertions.ts (+2 -1)
      165    if (rows.length !== expected.length) {
      166      fail(`Model input has ${rows.length} reviews; ${dataset.ke
           y} has ${expected.length}.`);
      167    }
      168 -  const sortedIds = (list: readonly QaEvidenceRow[]) => JSON.s
          -tringify(list.map((r) => r.id).sort());                       
      168 +  const sortedIds = (list: readonly QaEvidenceRow[]) =>       
      169 +    JSON.stringify(list.map((r) => r.id).sort());             
      170    if (
      171      sortedIds(rows) === sortedIds(expected) &&
      172      rows.some((row, index) => row.id !== expected[index].id)
  ⎿  Updated tests/helpers/qa-harness/contract.ts (+15 -4)
      110    text: string;
      111  }
      112  
      113 -export const QA_EVIDENCE_ROW_FIELDS = ["id", "rating", "date",
          - "text"] as const satisfies readonly (keyof QaEvidenceRow)[]; 
      113 +export const QA_EVIDENCE_ROW_FIELDS = [                       
      114 +  "id",                                                       
      115 +  "rating",                                                   
      116 +  "date",                                                     
      117 +  "text",                                                     
      118 +] as const satisfies readonly (keyof QaEvidenceRow)[];        
      119  
      120  /**
      121   * S2-013 system-prompt contract as stable semantic invariants
           , not exact prose.
     ...
      138    {
      139      id: "grounded-in-reviews",
      140      rule: "Answers are based only on the supplied reviews.",
      136 -    alternatives: [[/\bonly\b/i, /\b(supplied|provided)\b/i, /
          -\breviews?\b/i, /\b(answer|base|evidence)/i]],                
      141 +    alternatives: [                                           
      142 +      [/\bonly\b/i, /\b(supplied|provided)\b/i, /\breviews?\b/
          +i, /\b(answer|base|evidence)/i],                              
      143 +    ],                                                        
      144    },
      145    {
      146      id: "no-outside-knowledge",
      147      rule: "Outside or general knowledge must not be used.",
      141 -    alternatives: [[/\b(do not|don't|never|must not)\b/i, /\b(
          -outside|general|external)\b/i, /\bknowledge\b/i]],            
      148 +    alternatives: [                                           
      149 +      [/\b(do not|don't|never|must not)\b/i, /\b(outside|gener
          +al|external)\b/i, /\bknowledge\b/i],                          
      150 +    ],                                                        
      151    },
      152    {
      153      id: "insufficient-evidence",
     ...
      162    {
      163      id: "decline-other-entity",
      164      rule: "Questions about another entity, business or product
            are declined.",
      156 -    alternatives: [[/\bdecline\b/i, /\b(other|another|differen
          -t)\b/i, /\b(entity|entities|business|product)\b/i]],          
      165 +    alternatives: [                                           
      166 +      [/\bdecline\b/i, /\b(other|another|different)\b/i, /\b(e
          +ntity|entities|business|product)\b/i],                        
      167 +    ],                                                        
      168    },
      169    {
     … 1 more lines (ctrl+o to expand)
  ⎿  Updated tests/unit/qa-harness/prompt-and-evidence-contract.test.ts
     (+49 -13)
      35  /** Rebuilds the evidence section from mutated rows, keeping th
          e question and `reviewIds`. */
      36  function withRows(request: QaModelRequest, mutate: (rows: QaEvi
          denceRow[]) => unknown[]) {
      37    const rows = mutate(structuredClone(parseEvidenceRows(request
          )));
      38 -  const question = request.input.slice(request.input.lastIndexO
         -f(`\n\n${QA_INPUT_QUESTION_HEADER}\n`));                       
      38 +  const question = request.input.slice(                        
      39 +    request.input.lastIndexOf(`\n\n${QA_INPUT_QUESTION_HEADER}\
         +n`),                                                           
      40 +  );                                                           
      41    return {
      42      ...request,
      43      input: `REVIEW DATASET (${rows.length} reviews, JSON array)
          :\n${JSON.stringify(rows)}${question}`,
     ...
      55          text: review.text,
      56        })),
      57      );
      56 -    expect(() => expectContextOnlyForTarget(withRows(request, (
         -rows) => rows), targetA)).not.toThrow();                       
      58 +    expect(() =>                                               
      59 +      expectContextOnlyForTarget(                              
      60 +        withRows(request, (rows) => rows),                     
      61 +        targetA,                                               
      62 +      ),                                                       
      63 +    ).not.toThrow();                                           
      64    });
      65  
      66    it('catches the review example: "rating":5 changed to "rating
          ":1, text and reviewIds kept', async () => {
     ...
      68      const tampered = { ...request, input: request.input.replace
          ('"rating":5', '"rating":1') };
      69      expect(tampered.input).not.toBe(request.input);
      70      expect(tampered.reviewIds).toEqual(request.reviewIds);
      64 -    rejects(() => expectContextOnlyForTarget(tampered, targetA)
         -, /Evidence row 1 rating is 1; expected 5/);                   
      71 +    rejects(                                                   
      72 +      () => expectContextOnlyForTarget(tampered, targetA),     
      73 +      /Evidence row 1 rating is 1; expected 5/,                
      74 +    );                                                         
      75    });
      76  
      77    it.each<[string, (rows: QaEvidenceRow[]) => unknown[], RegExp
          ]>([
     ...
      82      ],
      83      [
      84        "a changed date",
      75 -      (rows) => rows.map((row, i) => (i === 1 ? { ...row, date:
         - "2026-01-01T00:00:00.000Z" } : row)),                         
      85 +      (rows) =>                                                
      86 +        rows.map((row, i) => (i === 1 ? { ...row, date: "2026-0
         +1-01T00:00:00.000Z" } : row)),                                 
     … 98 more lines (ctrl+o to expand)

⏺ All 123 tests pass now, up from 91. Before the README note, I'm running a
  one-off check on Aryan's real S2-013 prompt from PR #82 to see whether the new
  invariants hold, since PR 2 would fail otherwise.

  Ran 1 shell command (ctrl+o to expand)

⏺ Strip-only mode can't handle parameter properties, so I'll use
  --experimental-transform-types on the scratch copy:

  Ran 1 shell command (ctrl+o to expand)

⏺ Aryan's S2-013 prompt (s2-013.v2, PR #82) passes all six invariants and the
  name/platform checks, so the contract should hold when PR 2 lands. I'm writing
  up the README note next.

  Searched for 1 pattern (ctrl+o to expand)

⏺ Update(README.md)
  ⎿  Added 16 lines
      203  names were sent, and that no other dataset's data reached the 
           request or the answer. Assertions
      204  cover behaviour and structure, never exact model wording.
      205  
      206 +**What the context and prompt checks verify.**                
      207 +                                                              
      208 +- `expectContextOnlyForTarget` parses the `REVIEW DATASET` JSO
          +N in the model input. Every row's                             
      209 +  `id`, `rating`, `date` and `text` must match the persisted r
          +eview at the same position, with                              
      210 +  nothing dropped, added or reordered, and no extra fields.   
      211 +- `expectSystemPromptApplied` checks the JSON-encoded target n
          +ame, the platform label, and the                              
      212 +  named rules in `QA_SYSTEM_PROMPT_INVARIANTS` (`contract.ts`)
          +: grounded in the supplied reviews,                           
      213 +  no outside knowledge, say so when evidence is insufficient, 
          +and decline out-of-scope,                                     
      214 +  other-entity and other-platform questions. Each rule must be
          + stated within one sentence, but                              
      215 +  any wording is accepted.                                    
      216 +                                                              
      217  **Pipeline.** Until the S2-010/S2-011 Q&A services are merged,
            golden cases run against a small
      218  test-only _contract reference pipeline_ (`reference-pipeline.t
           s`). When they are merged, pass the
      219  real orchestration as `pipeline` so the same cases run against
            production code.
      220  
      221 +> **Limitation:** until that integration lands, CI checks the 
          +prompt contract and evidence layout                           
      222 +> against the reference pipeline's placeholder prompt, **not**
          + the real S2-013 prompt. The                                  
      223 +> invariants are pending agreement with the S2-013 owner, and 
          +passing these tests is not S2-003                             
      224 +> end-to-end acceptance.                                      
      225 +                                                              
      226  ### Run database tests
      227  
      228  `npm run test:db` checks the real schema and Row Level Securit
           y policies, not a mock. It creates a

  Ran 1 shell command (ctrl+o to expand)
⏺ All five checks pass. Last, three test:qa runs for flakiness and a scope check
  of the diff:

  Ran 1 shell command (ctrl+o to expand)

⏺ I've fixed Neel's items 1 and 2, and everything passes, but nothing is
  committed or pushed. His item 3, the full original transcript, is still open:
  only you can export the real session, and he won't approve until it's in the
  PR.

  Item 1: evidence check. expectContextOnlyForTarget now reads the review
  dataset JSON out of the model input. It compares every row's ID, rating, date
  and text against the stored reviews, in the same order, and rejects extra or
  missing fields. Neel's exact example is a test: changing "rating":5 to
  "rating":1 while keeping the text and reviewIds now fails with Evidence row 1 
  rating is 1; expected 5.

  Tests that each corruption is caught:

  ┌───────────────────┬─────────────────────────────────────────────────────┐
  │ Required by Neel  │                    Also covered                     │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ changed rating,   │ date set to null, changed text                      │
  │ date, ID          │                                                     │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ swapped order     │ extra or missing field, wrong type, non-object row  │
  ├───────────────────┼─────────────────────────────────────────────────────┤
  │ dropped review,   │ header count mismatch, invalid JSON, missing        │
  │ extra review      │ dataset section, reviewIds disagreeing with the     │
  │                   │ rows                                                │
  └───────────────────┴─────────────────────────────────────────────────────┘

  Item 2: prompt rules. I defined six named rules in one place,
  QA_SYSTEM_PROMPT_INVARIANTS in contract.ts:
  - answers based only on the supplied reviews
  - no outside knowledge
  - say so when the reviews lack enough evidence
  - decline questions not about these reviews
  - decline questions about another entity
  - decline questions about another platform

  Each rule must be stated within a single sentence, but any wording passes.
  expectSystemPromptApplied checks all six plus the target name and platform.
  - Neel's regression: removing the grounding and decline rules while keeping
    the name and platform now fails and lists the four missing rules.
  - Other tests: each rule fails when removed on its own; a reworded prompt
    passes; and rule words scattered across sentences, or appearing only in
    outcome names, don't count.
  - README: notes that CI checks this against the reference pipeline's
    placeholder prompt, not the real S2-013 prompt, until integration lands.

  As a one-off check that isn't committed, I ran the six rules against Aryan's
  real S2-013 prompt from PR #82. All six hold, so PR 2 shouldn't break on them.

  Other changes I made:
  - Placeholder prompt: I rewrote the reference pipeline's prompt to state each
    rule explicitly; otherwise it would fail the new checks itself.
  - Check order: the golden runner now checks for foreign data before the
    context check, so a leaked row is reported as a leak rather than a generic
    mismatch. That changed the expected message in one existing mutation test.

  Verification (output trimmed):
  === format:check   All matched files use Prettier code style!
  === lint           eslint . (no errors)
  === typecheck      ✓ Types generated successfully (no tsc errors)
  === npm test       Test Suites: 56 passed, 56 total
                     Tests:       781 passed, 781 total
  === build          ✓ Compiled successfully in 247ms
  === test:qa ×3     Tests: 123 passed, 123 total (each run)
  The harness suite went from 91 to 123 tests. Only files under
  tests/helpers/qa-harness, tests/unit/qa-harness and README.md changed; no
  teammate or production code was touched.

  Suggested commits, if you want small ones:
  git add tests/helpers/qa-harness/contract.ts
  tests/helpers/qa-harness/assertions.ts tests/helpers/qa-harness/index.ts
  tests/helpers/qa-harness/reference-pipeline.ts
  git commit -m "test(S2-003): validate full evidence projection and semantic 
  prompt rules"

  git add tests/unit/qa-harness/
  git commit -m "test(S2-003): add evidence and prompt-contract mutation tests"

  git add README.md
  git commit -m "docs(S2-003): document prompt contract and reference-pipeline 
  limitation"

  Once you've pushed, a short reply to Neel could say items 1 and 2 are fixed,
  that Refs #54 keeps the issue open until PR 2, and when the full transcript
  will be added.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git add                     
  tests/helpers/qa-harness/contract.ts tests/helpers/qa-harness/assertions.ts   
  tests/helpers/qa-harness/index.ts tests/helpers/qa-harness/reference-pipeline 
  fatal: pathspec 'tests/helpers/qa-harness/reference-pipeline' did not match   
  any files                                                                     
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             

⏺ The path is missing .ts at the end: the file is reference-pipeline.ts. When
  one path doesn't match, git stages none of them, so run the full line again:

  git add tests/helpers/qa-harness/contract.ts
  tests/helpers/qa-harness/assertions.ts tests/helpers/qa-harness/index.ts
  tests/helpers/qa-harness/reference-pipeline.ts
  git commit -m "test(S2-003): validate full evidence projection and semantic 
  prompt rules"

  Then continue with the other two:

  git add tests/unit/qa-harness/
  git commit -m "test(S2-003): add evidence and prompt-contract mutation tests"

  git add README.md
  git commit -m "docs(S2-003): document prompt contract and reference-pipeline 
  limitation"

  git status   # should say: nothing to commit, working tree clean

  Pressing Tab after typing part of a filename lets zsh complete the path, which
  avoids this kind of typo.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git add                     
  tests/helpers/qa-harness/contract.ts tests/helpers/qa-harness/assertions.ts   
  tests/helpers/qa-harness/index.ts                                             
  tests/helpers/qa-harness/reference-pipeline.ts                                
                                                                                
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "test(S2-003): validate full evidence projection and semantic prompt rules"   
  [feature/s2-003-qa-test-harness 511f914] test(S2-003): validate full evidence 
  projection and semantic prompt rules                                          
   4 files changed, 216 insertions(+), 15 deletions(-)                          
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git add                     
  tests/unit/qa-harness/                                                        
                                                                                
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "test(S2-003): add evidence and prompt-contract mutation tests"               
                                                                                
  [feature/s2-003-qa-test-harness 07efb4b] test(S2-003): add evidence and       
  prompt-contract mutation tests                                                
   3 files changed, 293 insertions(+), 2 deletions(-)                           
   create mode 100644                                                           
  tests/unit/qa-harness/prompt-and-evidence-contract.test.ts                    
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git add README.md           
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m               
  "docs(S2-003): document prompt contract and reference-pipeline limitation"    
                                                                                
  [feature/s2-003-qa-test-harness 6cec4fb] docs(S2-003): document prompt        
  contract and reference-pipeline limitation                                    
   1 file changed, 16 insertions(+)                                             
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status                  
  On branch feature/s2-003-qa-test-harness                                      
  Your branch is ahead of 'origin/feature/s2-003-qa-test-harness' by 3 commits. 
    (use "git push" to publish your local commits)                              
                                                                                
  nothing to commit, working tree clean                                         
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %                             

⏺ All three commits are in (511f914, 07efb4b, 6cec4fb), and the line counts
  match what I changed. Push them:

  git push origin feature/s2-003-qa-test-harness

  PR #83 picks up the new commits automatically, and CI reruns on the new head.
  Neel asked for new-head CI to pass before he re-reviews, so wait for the green
  check before replying.

  Still blocking approval: Neel's item 3, the full original Claude Code
  transcript. Export this session from Claude Code and add it under
  ai-transcripts/. If parts of the original session aren't available, the file
  has to say so plainly rather than fill the gap; that's what Neel asked for.

  Reply to Neel (written for him, to post on PR #83 after CI is green):

  ▎ Thanks for the review. Items 1 and 2 are fixed in 511f914, 07efb4b and 
  ▎ 6cec4fb:
  ▎
  ▎ 1. Evidence projection: expectContextOnlyForTarget now parses the REVIEW 
  ▎ DATASET JSON and checks every row's id, rating, date and text against the 
  ▎ persisted rows, including order, count and exact fields. Your example 
  ▎ ("rating":5 → "rating":1 with text and reviewIds unchanged) is now a test 
  ▎ and fails with Evidence row 1 rating is 1; expected 5. There are mutation 
  ▎ tests for a changed rating, date or ID, swapped order, dropped and extra 
  ▎ reviews, extra or missing fields, wrong types, a header count mismatch, and 
  ▎ invalid JSON.
  ▎ 2. Prompt contract: there are now six named invariants in 
  ▎ QA_SYSTEM_PROMPT_INVARIANTS (contract.ts): grounded in reviews, no outside 
  ▎ knowledge, insufficient evidence, and the three decline rules. Each must be 
  ▎ stated within one sentence, so different wording passes but keyword-stuffing
  ▎ doesn't. A regression strips the grounding and decline rules while keeping 
  ▎ the target name and platform, and requires failure. I also checked locally, 
  ▎ outside this PR, that Aryan's real s2-013.v2 prompt from #82 satisfies all 
  ▎ six. The README now says CI checks the reference pipeline's prompt until 
  ▎ integration lands.
  ▎ 3. Transcript: [say when the full session export will be added, or note 
  ▎ anything that isn't available].
  ▎
  ▎ Agreed on the acceptance boundary: #54 stays open (Refs, not Closes), and I 
  ▎ won't claim end-to-end S2-003 acceptance until the integration PR runs the 
  ▎ same golden cases against the real S2-010/011/013 path.

  Fill in the item 3 line before posting.

❯ Refs #54                                                                      
                                                                                
  ## What and why                                                               
                                                                                
  Q&A is about to land across several stories (S2-010/011/013 in #76, #78, #79, 
  #82; S2-014/015/016). Each needs to test what goes to the model and how the   
  app handles the reply, without paying for or depending on a live model. This  
  PR adds a reusable harness that:                                              
                                                                                
  - replaces the model seam (`QaModelCaller`) with a **scripted fake** that     
  records every request;                                                        
  - **blocks all network access** (fetch, http/https, raw sockets) and removes  
  provider and Supabase env vars during each test. Any attempt fails the test,  
  even if the code swallowed the error;                                         
  - provides **frozen synthetic datasets** (normal, empty, mixed ratings,       
  Target A/B, User B private, malformed rows) and **21 golden cases** covering  
  answerable, insufficient evidence, general-knowledge, other entity/platform,  
  cross-user leak, target switch, stale context, edge inputs, malformed model   
  output, and model errors;                                                     
  - provides **behaviour assertions**: system prompt applied, only the active   
  target's reviews sent, no reviewer names, no foreign markers/IDs/text in the  
  request or the answer, grounded citations, declines carry no citations.       
  Nothing compares model prose.                                                 
                                                                                
  It merges independently of the unmerged Q&A PRs and imports none of their     
  code. It uses a harness-owned copy of their types (`contract.ts`, marked      
  **pending team agreement**) and a small test-only **contract reference        
  pipeline**. A follow-up PR (stacked on #82) runs the same golden table        
  against the real `answerActiveTargetQuestion`.                                
                                                                                
  **What this does not prove:** with a fake model, the reply outcome is         
  scripted. These tests check orchestration (inputs, reply handling, when the   
  model must not be called). They do not check whether the real model refuses   
  correctly. That needs a separate approved live-model evaluation.              
                                                                                
  ## Files changed                                                              
                                                                                
  New (all harness-owned):                                                      
  - `tests/helpers/qa-harness/contract.ts`: copies of PR #82 types and error    
  names (pending agreement)                                                     
  - `tests/helpers/qa-harness/fake-model.ts`: `createFakeQaModel`, `reply.*`    
  builders                                                                      
  - `tests/helpers/qa-harness/network-guard.ts`: `installNetworkGuard`          
  - `tests/helpers/qa-harness/assertions.ts`: `expect*` helpers                 
  - `tests/helpers/qa-harness/reference-pipeline.ts`: test-only stand-in        
  pipeline                                                                      
  - `tests/helpers/qa-harness/index.ts`: `createQaTestHarness`,                 
  `setupQaTestHarness`, `runGoldenCase`                                         
  - `tests/fixtures/qa/datasets.ts`, `tests/fixtures/qa/golden-cases.ts`        
  - `tests/unit/qa-harness/` (7 suites, 91 tests): fake model, network guard,   
  assertions, fixtures, golden cases plus 9 mutation tests that prove the       
  runner rejects broken pipelines, determinism, harness lifecycle               
                                                                                
  Modified (additive only): `package.json` (`test:qa`), `README.md` (harness    
  section and script row).                                                      
                                                                                
  No teammate files, no `src/` files, no new dependencies, and no CI workflow   
  changes.                                                                      
                                                                                
  ## How to run                                                                 
                                                                                
      npm run test:qa   # harness suites only                                   
      npm test          # everything (CI already runs this, with no secrets)    
                                                                                
  ## How teammates use it                                                       
                                                                                
      import { reply, setupQaTestHarness, expectNoForeignData } from            
  "../../helpers/qa-harness";                                                   
                                                                                
      const qa = setupQaTestHarness({                                           
        script: [{ when: { questionIncludes: "battery" }, then:                 
  reply.answered([reviewId]) }],                                                
      });                                                                       
                                                                                
      it("...", async () => {                                                   
        const result = await qa().ask(targetId, "What about battery life?");    
        expectNoForeignData(qa().model.lastCall().request, [otherDataset]);     
      });                                                                       
                                                                                
  - To add a golden case, append to `QA_GOLDEN_CASES`. Foreign-data,            
  system-prompt and context checks run automatically.                           
  - S2-016 Phase 2: use `reply.echoContext()` with `expectNoForeignData` and    
  `expectAnswerHasNoForeignData`.                                               
  - After #82 merges: pass the real orchestration as the harness `pipeline`     
  option.                                                                       
                                                                                
  ## Verification                                                               
                                                                                
  | Check | Result |                                                            
  | --- | --- |                                                                 
  | `npm run format:check` | pass |                                             
  | `npm run lint` | pass |                                                     
  | `npm run typecheck` | pass |                                                
  | `npm test` | 55 suites / 749 tests pass |                                   
  | `npm run build` | pass |                                                    
  | `npm run test:qa` × 3 | 91/91 each run |                                    
  | `env -i PATH HOME npm run test:qa` | 91/91 |                                
                                                                                
  Run locally on Node 23.10 (`.nvmrc` pins 24); CI confirms on 24.              
                                                                                
  ## Open questions / blockers                                                  
                                                                                
  1. Team agreement on the interfaces in `contract.ts` (Aryan: model            
  request/reply shapes and question layout; Shawn: `callModel` as the only test 
  override and error codes; Neel: S2-004 category mapping).                     
  2. The follow-up PR (fake Supabase, fake OpenAI fetch, real-pipeline golden   
  run, compile-time type-equivalence checks) is blocked on #76, #79 and #82     
  merging.                                                                      
  3. The S2-BR rule texts referenced by #54 are not in the repo; criteria are   
  taken from the issue body.                                                    
                                                                                
  ## AI assistance                                                              
                                                                                
  Claude Code (Claude Opus 5.5). Transcript:                                    
  `ai-transcripts/2026-11-13_deep_S2-003_claude-code.md`. Reviewed by the       
  author. Needs one teammate reviewer; a security reviewer is suggested, since  
  this touches AI data-boundary tests.                                          
  Any changes to make in PR descirption                                         

⏺ Yes. Several numbers are out of date and the review fixes aren't mentioned.
  Re-running the stripped-environment check first, so every number in the
  updated description comes from the current code:

  Ran 4 shell commands (ctrl+o to expand)

⏺ The golden suite file has 32 tests: the 21 golden cases plus 11
  broken-pipeline tests, up from 9. Everything below comes from the current
  head, 6cec4fb.

  What needs changing in the description:
  - Test counts: 7 suites / 91 tests is now 8 suites / 123 tests; the full run
    is 55/749 → 56/781; broken-pipeline tests are 9 → 11.
  - Files: add prompt-and-evidence-contract.test.ts.
  - Assertions bullet: say that the full evidence rows and the named prompt
    rules are checked.
  - New "Review changes" section: what changed for Neel's items 1 and 2.
  - Limitation: add the reference-pipeline prompt caveat.
  - Transcript: say the full export is pending, rather than implying the summary
    file is the whole record.

  Updated description (written for PR reviewers; replace the whole body):

  Refs #54

  ## What and why

  Q&A is about to land across several stories (S2-010/011/013 in #76, #78, #79,
  #82; S2-014/015/016). Each needs to test what goes to the model and how the
  app handles the reply, without paying for or depending on a live model. This
  PR adds a reusable harness that:

  - replaces the model seam (`QaModelCaller`) with a **scripted fake** that
  records every request;
  - **blocks all network access** (fetch, http/https, raw sockets) and removes
  provider and Supabase env vars during each test. Any attempt fails the test,
  even if the code swallowed the error;
  - provides **frozen synthetic datasets** (normal, empty, mixed ratings, Target
  A/B, User B private, malformed rows) and **21 golden cases** covering
  answerable, insufficient evidence, general-knowledge, other entity/platform,
  cross-user leak, target switch, stale context, edge inputs, malformed model
  output, and model errors;
  - provides **behaviour assertions**:
    - the **full evidence payload** in the model input matches the persisted
  reviews: every row's id, rating, date and text, in order, nothing dropped,
  added or reordered, and no extra fields;
    - the **system prompt** names the target and platform and states six named
  rules (grounded in the reviews, no outside knowledge, say so when evidence is
  insufficient, decline out-of-scope / other-entity / other-platform questions).
  Rules are checked by meaning, not exact wording;
    - no reviewer names and no foreign markers/IDs/text in the request or the
  answer;
    - citations are grounded, and declines carry no citations.

    Nothing compares model prose.

  It merges independently of the unmerged Q&A PRs and imports none of their
  code. It uses a harness-owned copy of their types and prompt rules
  (`contract.ts`, marked **pending team agreement**) and a small test-only
  **contract reference pipeline**. A follow-up PR (stacked on #82) runs the same
  golden table against the real `answerActiveTargetQuestion`.

  **What this does not prove:** with a fake model, the reply outcome is
  scripted. These tests check orchestration (inputs, reply handling, when the
  model must not be called). They do not check whether the real model refuses
  correctly. That needs a separate approved live-model evaluation. Until the
  integration PR lands, the prompt and evidence checks run against the
  **reference pipeline's placeholder prompt**, not the real S2-013 prompt, so
  this PR is not S2-003 end-to-end acceptance and #54 stays open.

  ## Review changes (round 1, @neel-0064)

  1. **Full evidence projection** (`511f914`, `07efb4b`):
  `expectContextOnlyForTarget` parses the `REVIEW DATASET` JSON and checks every
  row against the persisted reviews. The review example (`"rating":5` →
  `"rating":1` with text and `reviewIds` unchanged) is a test and fails with
  `Evidence row 1 rating is 1; expected 5`. Mutation tests cover a changed
  rating, date or ID, swapped order, dropped and extra reviews, extra or missing
  fields, wrong types, a header count mismatch, invalid JSON, and `reviewIds`
  disagreeing with the rows.
  2. **Semantic prompt contract** (`511f914`, `07efb4b`, `6cec4fb`): six named
  rules in `QA_SYSTEM_PROMPT_INVARIANTS`. Each must be stated within one
  sentence, so rewording passes but scattered keywords or outcome names alone do
  not. A regression strips the grounding and decline rules (keeping the target
  name and platform) and requires failure, and each rule is tested on its own. A
  one-off local check (not part of this PR) confirmed the real `s2-013.v2`
  prompt from #82 satisfies all six. The README documents the reference-pipeline
  limitation.
  3. **Full AI transcript:** pending; see the AI assistance section.

  ## Files changed

  New (all harness-owned):
  - `tests/helpers/qa-harness/contract.ts`: copies of PR #82 types, error names,
  evidence layout and prompt rules (pending agreement)
  - `tests/helpers/qa-harness/fake-model.ts`: `createFakeQaModel`, `reply.*`
  builders
  - `tests/helpers/qa-harness/network-guard.ts`: `installNetworkGuard`
  - `tests/helpers/qa-harness/assertions.ts`: `expect*` helpers,
  `parseEvidenceRows`, `missingPromptInvariants`
  - `tests/helpers/qa-harness/reference-pipeline.ts`: test-only stand-in
  pipeline
  - `tests/helpers/qa-harness/index.ts`: `createQaTestHarness`,
  `setupQaTestHarness`, `runGoldenCase`
  - `tests/fixtures/qa/datasets.ts`, `tests/fixtures/qa/golden-cases.ts`
  - `tests/unit/qa-harness/` (8 suites, 123 tests): fake model, network guard,
  assertions, evidence and prompt contract, fixtures, golden cases plus 11 tests
  that prove the runner rejects broken pipelines, determinism, harness
  lifecycle

  Modified (additive only): `package.json` (`test:qa`), `README.md` (harness
  section and script row).

  No teammate files, no `src/` files, no new dependencies, and no CI workflow
  changes.

  ## How to run

      npm run test:qa   # harness suites only
      npm test          # everything (CI already runs this, with no secrets)

  ## How teammates use it

      import { reply, setupQaTestHarness, expectNoForeignData } from
  "../../helpers/qa-harness";

      const qa = setupQaTestHarness({
        script: [{ when: { questionIncludes: "battery" }, then:
  reply.answered([reviewId]) }],
      });

      it("...", async () => {
        const result = await qa().ask(targetId, "What about battery life?");
        expectNoForeignData(qa().model.lastCall().request, [otherDataset]);
      });

  - To add a golden case, append to `QA_GOLDEN_CASES`. Evidence, system-prompt
  and foreign-data checks run automatically.
  - S2-016 Phase 2: use `reply.echoContext()` with `expectNoForeignData` and
  `expectAnswerHasNoForeignData`.
  - After #82 merges: pass the real orchestration as the harness `pipeline`
  option.

  ## Verification (head `6cec4fb`)

  | Check | Result |
  | --- | --- |
  | `npm run format:check` | pass |
  | `npm run lint` | pass |
  | `npm run typecheck` | pass |
  | `npm test` | 56 suites / 781 tests pass |
  | `npm run build` | pass |
  | `npm run test:qa` × 3 | 123/123 each run |
  | `env -i PATH HOME npm run test:qa` | 123/123 |

  Run locally on Node 23.10 (`.nvmrc` pins 24); CI confirms on 24.

  ## Open questions / blockers

  1. Team agreement on `contract.ts`. Aryan: model request/reply shapes,
  question and evidence layout, and the six prompt rules. Shawn: `callModel` as
  the only test override, and error codes. Neel: S2-004 category mapping.
  2. The follow-up PR (fake Supabase, fake OpenAI fetch, real-pipeline golden
  run, compile-time type-equivalence checks) is blocked on #76, #79 and #82
  merging.
  3. The S2-BR rule texts referenced by #54 are not in the repo; criteria are
  taken from the issue body.

  ## AI assistance

  Claude Code (Claude Opus 5.5). Step summary:
  `ai-transcripts/2026-11-13_deep_S2-003_claude-code.md`. **Full original 
  session export: pending** (to be added before re-review, per
  `docs/AI-Assisted-Development.md` §6). Reviewed by the author. Needs one
  teammate reviewer; a security reviewer is suggested, since this touches AI
  data-boundary tests.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Two things to check before you paste it:
  - Transcript line: once you've added the full export, change "pending" to the
    filename.
  - Verification table: these numbers are from my local run. After you push,
    confirm CI is green on the new head and that its test counts match.

❯ @Deep                                                                         
  Hey Deep, I re-reviewed S2-003 PR #83 at the latest commit 6cec4fb.           
                                                                                
  Thanks for addressing the review findings!                                    
                                                                                
  I verified that:                                                              
                                                                                
  The full evidence-payload assertions now check review IDs, ratings, dates,    
  text, and order, with regression tests for corrupted data.                    
  The system-prompt assertions now check six grounding and refusal              
  requirements, including tests that reject missing rules.                      
  GitHub CI #152 passed, with 123 focused harness tests and 781 total tests     
  reported.                                                                     
                                                                                
  Both code-related findings from my previous review are resolved.              
                                                                                
  The only remaining blocker for my formal approval is the full original Claude 
  Code session transcript. The PR still lists it as pending, and the existing   
  transcript is only a summary.                                                 
                                                                                
  Could you please add the redacted original session export and update the PR   
  description, then tag me for one final verification?                          
                                                                                
  I understand the real Q&A pipeline integration is separate and can remain for 
  the follow-up PR.                                                             
                                                                                
  Thanks!                                                                       
  My teammate said this how do I get the transcript                             
  ⎿  4 skills available

⏺ Claude Code saves every session on your machine as a JSONL file under
  ~/.claude/projects/. I'll find this session's file and check it for anything
  that needs redacting, without changing anything:

  Ran 1 shell command (ctrl+o to expand)

⏺ This session's raw log is a6d9f398-….jsonl (3 MB, 894 lines). Before
  suggesting how to export it, I'll check what the key-like matches are,
  printing only truncated values:

  Ran 1 shell command (ctrl+o to expand)

⏺ Opus 5.5's safeguards stopped the response above · continuing once 
  with that noted

⏺ Here's how to get the transcript. I'll stop reading the raw session file now;
  you should review its contents yourself before anything is committed.

  Where it is: Claude Code saves every session on your Mac as a JSONL file. This
  session is:

  ~/.claude/projects/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantastic-Six/
  a6d9f398-b19c-4239-aed5-5578ba6f45c0.jsonl

  Two ways to export it:

  1. Readable export (recommended). Open this session in the Claude Code
     terminal (claude --resume, then pick this session) and run /export. It
     writes the conversation as plain text that teammates can read.
  2. Raw copy. Copy the JSONL into the repo. This is the most complete record,
     but it's 3 MB of JSON, so it's hard to read and harder to redact.

  What to redact before committing. My quick scan found:
  - Your email address, which appears 5 times. Replace it with something like
    [redacted-email].
  - Your local paths (/Users/deepshah/...). Optional, but you can shorten them
    to ~/....
  - Key-like matches. The OPENAI_API_KEY= and SUPABASE_SERVICE_ROLE_KEY= hits
    look like grep patterns and the empty .env.example entries, not real values,
    and the eyJ… hits sit inside encoded data. I didn't inspect them fully, so
    search the exported file for KEY=, sk- and eyJ and check each one yourself.
    This session never read .env.local.

  Then add it to the PR:

  # after exporting and redacting, e.g. to 
  ai-transcripts/2026-11-13_deep_S2-003_claude-code-full.md
  git add ai-transcripts/2026-11-13_deep_S2-003_claude-code-full.md
  git commit -m "docs(S2-003): add full redacted Claude Code session transcript"
  git push origin feature/s2-003-qa-test-harness

  In the PR description's AI assistance section, replace "Full original session
  export: pending" with the new filename, then tag Neel for the final check.