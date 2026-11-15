
❯ You are continuing S2-003 (Deterministic Q&A Test Harness) for ReviewLens AI.
  PR #83 (standalone harness) is merged. Issue #54 is reopened and must stay
  open: use "Refs #54", never "Closes". Build the follow-up integration PR on
  branch feature/s2-003-real-qa-integration (already created from origin/main,
  which now contains the merged S2-010/011/013 code).

  Step 0: Discover (no code yet)

  1. Read the merged harness (tests/helpers/qa-harness, tests/fixtures/qa,
  tests/unit/qa-harness) and the 21 golden cases.
  2. Read the real code: answerQuestion(targetId, question, {
  buildReviewDatasetContext, callModel }), the authenticated
  buildReviewDatasetContext (auth/ownership checks, Supabase queries),
  QaModelCaller/QaModelRequest/QaModelReply, QA_OUTCOMES,
  QaInputValidationError / QA_QUESTION_TOO_LONG, QaPromptError /
  REQUEST_TOO_LARGE, UNEXPECTED_CITATIONS, prompt version, token-budget fields,
  createOpenAiQaModel, and Shawn's existing Supabase fake pattern (supabase-js
  with injected fetch).
  3. Report the gap between my harness contract types and the production types.
  4. Propose a short plan and WAIT for my approval.

  Requirements (from Shawn's review)

  1. Run the golden scenarios through the REAL answerQuestion() with the REAL
  authenticated buildReviewDatasetContext(). Mock only infrastructure and
  provider I/O: fake Supabase (fake-supabase.ts), fake auth session for User
  A/B, and the fake model injected as callModel. Do not replace the context
  builder with a fake.
  2. Long-question case: expect QaInputValidationError / QA_QUESTION_TOO_LONG
  with ZERO context-builder calls and ZERO model calls. Keep provider-budget
  rejection as a separate case expecting QaPromptError / REQUEST_TOO_LARGE.
  3. Verify cross-user and wrong-target isolation, stale context after target
  change, and authorization failures against the real pipeline by inspecting
  captured model requests (nothing foreign appears; on auth failure no model
  call at all).
  4. Provider boundary with fakes only: fake-openai-fetch.ts with
  createOpenAiQaModel to check the outgoing request body (store: false,
  instructions/input split, JSON schema) and success/error/malformed/timeout
  responses. No real network, no OPENAI_API_KEY (reuse network-guard).
  5. Align harness contracts with production types, prompt version and error
  codes, with a compile-time check that they match. Keep qa-other-platform-001
  expecting UNEXPECTED_CITATIONS.
  6. No skipped or todo tests. Don't modify production code or teammates'
  files; if a seam is missing, report it.
  7. Docs: update the README harness section (what is real vs faked, how to run
  the integration suite).
  8. The gate from S2-001 will apply to this PR; keep changes under tests/
  where possible.

  Process

  Small commits, but do NOT push. Run format:check, lint, typecheck, npm test,
  build; run the integration suite 3x for flakiness; show output. End with a PR
  description draft (AI-use statement, Test Evidence, Refs #54) and the
  interfaces teammates should know about.

  Start with Step 0 only.
  DO NOT COMMIT OR PUSH

⏺ I'll start with discovery only: reading the harness, the production Q&A code,
  and the existing test patterns.

  Searched for 1 pattern, read 1 file, ran 1 shell command (ctrl+o to expand)

⏺ Now the production Q&A code.

  Read 2 files (ctrl+o to expand)

⏺ Now Shawn's existing Supabase fake pattern and the auth/ownership
  dependencies.

  Listed 1 directory, ran 1 shell command (ctrl+o to expand)

⏺ Now the fixtures, golden cases, reference pipeline and assertions.

  Read 1 file, ran 1 shell command (ctrl+o to expand)

⏺ Checking a few remaining details: the target repository query, how supabase-js
  routes auth calls through an injected fetch, and the golden-case count.

  Searched for 1 pattern, ran 3 shell commands (ctrl+o to expand)

⏺ Step 0 is done. I haven't changed any files, committed, or pushed. The branch
  is at origin/main (8e70172) and is clean. Issue #54 is open.

  What I read

  - Harness: contract.ts, index.ts, fake-model.ts, network-guard.ts,
    assertions.ts and reference-pipeline.ts under tests/helpers/qa-harness/,
    plus the fixtures in tests/fixtures/qa/ and the 8 self-test files.
  - Production code:
    - Pipeline: answer-question.ts, qa-request.ts, qa-response.ts,
      system-prompt.ts, token-budget.ts, openai-qa-client.ts, review-context.ts.
    - Auth and ownership: auth-service.ts, target-ownership.ts,
      analysis-target-repository.ts, lib/supabase/server.ts.
  - Shawn's fake pattern: in review-context.test.ts and
    review-context-pipeline.integration.test.ts.

  Two corrections to the brief:
  - There are 24 golden cases, not 21.
  - There is no fake-supabase.ts. Shawn's pattern is written inline in those two
    test files: createClient(...) with an injected global.fetch that filters on
    eq. parameters and returns a Content-Range header. Both files also mock
    getAuthenticatedUser and createSupabaseServerClient with jest.mock.

  Gaps between the harness and production

  Types that already match (the same shape on both sides): QaModelRequest,
  QaModelReply, QaModelCaller, QaAnswer, QA_OUTCOMES, QA_DECLINE_OUTCOMES (the
  same order as QA_DECLINE_PRIORITY), QA_MAX_REQUEST_TOKENS,
  QA_RESERVED_OUTPUT_TOKENS, the input layout headers and the evidence row
  fields {id, rating, date, text}. Shapes only: QaModelReplyPayload (vs
  QA_REPLY_JSON_SCHEMA) and REVIEW_PLATFORM_LABELS (production types it as a
  plain Record<ReviewPlatform, string>).

  Things that differ or are missing:

  #: 1
  Harness: qa-edge-long-question expects QaPromptError/REQUEST_TOO_LARGE
  Production: A 66,000-character question is rejected with
    QaInputValidationError/QA_QUESTION_TOO_LONG before the context builder runs
  What it means: Add a questionTooLong error key and a "context not loaded"
    expectation. Move REQUEST_TOO_LARGE to its own provider-budget case.
  ────────────────────────────────────────
  #: 2
  Harness: QA_PIPELINE_ERRORS has 11 entries
  Production: Missing codes: QA_QUESTION_INVALID_TYPE, QA_QUESTION_TOO_LONG,
    QA_REQUEST_TOO_LARGE; AUTH_REQUIRED, AUTH_UNAVAILABLE,
    REVIEW_CONTEXT_TOO_LARGE; REVIEW_TARGET_MISMATCH;
    QaBudgetError/BUDGET_CHECK_FAILED; 8 more QaModelErrorCodes
  What it means: Add them, with a compile-time check that each code belongs to
    its production code type.
  ────────────────────────────────────────
  #: 3
  Harness: REFERENCE_PROMPT_VERSION = "s2-013.reference", with a placeholder
    system prompt
  Production: SYSTEM_PROMPT_VERSION = "s2-013.v3" and the real buildSystemPrompt
  What it means: The prompt checks have only ever run against the placeholder.
    Reading the real prompt by hand, rules 1, 2, 4, 6, 7 and 8 should satisfy
  all
     6 checks. I'll confirm that by running them.
  ────────────────────────────────────────
  #: 4
  Harness: FakeQaModelError copies the QaModelError name and accepts any string
    as a code
  Production: The real QaModelError only accepts a QaModelErrorCode
  What it means: The fake should throw the real class.
  ────────────────────────────────────────
  #: 5
  Harness: The reference pipeline rejects an empty question before loading data
  Production: The real code runs auth and both Supabase queries first, then
    throws EMPTY_QUESTION from buildQaModelRequest
  What it means: The golden expectation still passes, since the model is never
    called. Reported as a finding below.
  ────────────────────────────────────────
  #: 6
  Harness: The harness has no way to express "user not signed in"
  Production: The real code has AUTH_REQUIRED and AUTH_UNAVAILABLE
  What it means: Add an anonymous or failing-auth step type.
  ────────────────────────────────────────
  #: 7
  Harness: The harness has no contract for the provider adapter
  Production: createOpenAiQaModel sends two POSTs (token count, then generation)

    and sets store:false, the instructions/input split, a strict JSON schema,
  and
     max_output_tokens
  What it means: New fake-openai-fetch.ts.

  Unreachable through the real builder: QaPromptError with NO_REVIEW_DATA or
  REVIEW_TARGET_MISMATCH. The builder throws first (ReviewContextError
  NO_REVIEW_DATA, or REVIEW_CONTEXT_UNAVAILABLE for a wrong analysis_target_id).
  I'll document that rather than fake it.

  Seams and findings to report (I won't change production code)

  1. No injectable Supabase client. buildReviewDatasetContext and
     getAuthenticatedUser both call createSupabaseServerClient() directly. So
     every test file that runs the real pipeline must contain
     jest.mock("@/lib/supabase/server") and jest.mock("server-only"). Jest only
     hoists those calls in test files, not in shared helpers. Shawn's tests
     already do the same, and it's acceptable.
  2. Empty question loads data first (gap #5). A whitespace-only question
     triggers auth and database reads before it's rejected. Moving the empty
     check into assertValidQuestion would fix it. That's a suggestion for Aryan,
     not a change in this PR.
  3. One size limit may never fire. MAX_COUNTABLE_REQUEST_BYTES and
     QA_MAX_REQUEST_BYTES are both 131,072. The service-boundary check runs
     first, so the adapter's own limit is close to unreachable. I'll note it and
     won't test it.

  Proposed plan

  1. fake-supabase.ts (in the helpers folder), built from Shawn's pattern:
     - A real supabase-js client with an injected fetch.
     - It handles the analysis_targets and reviews lookups (eq,
       order=created_at.asc,id.asc, limit, select projection, Content-Range
       count) plus GET /auth/v1/user.
     - It stores a fake session (fixed token per actor, far-future expiry) so
       the real getAuthenticatedUser runs and verifies it. This goes one level
       deeper than Shawn's tests, which mock that function. Only
       createSupabaseServerClient is mocked.
     - Failure switches: no session, auth returns 401, auth returns 500,
       database 500.
     - Every request is recorded for assertions.
     - It does not emulate row-level security, so isolation has to come from the
       app-layer checks.
  2. real-pipeline.ts adapter: calls the real answerQuestion with the real
     builder, wrapped in a pass-through spy so tests can count builder calls.
     The fake model is injected as callModel.
  3. Contract alignment:
     - contract.ts re-exports the production types with export type … from, so
       nothing extra loads at runtime.
     - A new type-only contract-alignment.ts holds the compile-time checks. npm
       run typecheck already covers tests/.
     - It checks that each mirrored constant's literal type equals the
       production one (QA_OUTCOMES, budgets, SYSTEM_PROMPT_VERSION) and that
       every error code in QA_PIPELINE_ERRORS belongs to its production code
       type.
  4. Golden cases:
     - Change the long-question case to questionTooLong with the builder never
       called.
     - Add auth-failure cases.
     - Keep qa-other-platform-001 expecting UNEXPECTED_CITATIONS.
     - Run all of them through the real pipeline.
  5. Integration suite
     (tests/unit/qa-harness/real-pipeline.integration.test.ts):
     - Cross-user, wrong-target and stale-context isolation, checked by
       inspecting the captured model requests and the recorded Supabase reads
       (no review read for a foreign target).
     - Auth failures, which must produce zero model calls and zero database
       reads.
     - The long question, which must produce zero builder calls and zero model
       calls.
  6. fake-openai-fetch.ts and a provider-boundary suite:
     - The real createOpenAiQaModel with a fake fetch and a synthetic env
       object; the network guard stays on.
     - Checks on the outgoing request body.
     - Success, HTTP 429/500/401, malformed JSON, no text, incomplete, refusal,
       and a timeout (an AbortError from the fake).
     - Provider budget: a token count of 14,501 gives
       QaPromptError/REQUEST_TOO_LARGE and no generation call.
  7. Fake model: throw the real QaModelError.
  8. README: what is real vs faked, the required jest.mock lines, and how to run
     the suite.
  9. Commits: small and local only. Then run format:check, lint, typecheck, npm
     test and build, run the integration suite 3 times, and draft the PR
     description with "Refs #54".

  All changes stay under tests/ plus the README. The coverage gate only measures
  src/ and scripts/, so it should pass trivially.

  Decision needed before I start

  What should happen to reference-pipeline.ts?
  - (A) Delete it (my recommendation). The real pipeline becomes the harness
    default, and each harness test file that calls ask() gets the 2-line
    jest.mock preamble. The adapter will throw a clear error if the preamble is
    missing. There's then only one pipeline to keep in step.
  - (B) Keep it only for the fake-model and assertion self-tests, with golden
    cases always running on the real pipeline. Fewer mock lines, but two
    pipelines can drift apart.

  I'm also assuming you're fine with going one level deeper than Shawn's tests
  on auth (a real getAuthenticatedUser reading a fake session), and with
  skipping row-level security emulation. Tell me if either of those should
  change.

❯ Plan approved with changes:
  1. Option A: delete reference-pipeline.ts. Add the jest.mock preamble to
  harness tests that call ask(). Port any self-test that depended on
  placeholder behavior (e.g. prompt mutation tests) to the real prompt or to
  pure unit tests on synthetic requests. Don't drop coverage.
  2. Don't use a type-level literal check for SYSTEM_PROMPT_VERSION or other
  values teammates may bump. Import them at runtime and assert in tests. Keep
  compile-time checks for structural types and error-code membership only.
  3. README: document that the fake auth session doesn't emulate Supabase RLS;
  isolation tested here comes from app-layer checks.
  4. Report the three findings (empty-question ordering, unreachable
  QaPromptError codes, equal byte limits) in the PR description, don't change
  production code.
  5. Fine to go one level deeper than Shawn on auth (real getAuthenticatedUser
  with fake session).
     DO NOT COMMIT OR PUSH I WILL DO THAT AND ALSO DO NOT CHNAGE TEAMMATE CODE

⏺ Starting implementation. I won't commit or push, and I won't touch teammate
  code. First I'll read the rest of the harness and its self-tests.

  Searched for 2 patterns, read 1 file, ran 3 shell commands (ctrl+o to expand)

⏺ Now checking the reviews table column names and how supabase-js routes auth
  requests through an injected fetch.

  Listed 1 directory, ran 1 shell command (ctrl+o to expand)

⏺ I have what I need. Writing the code now, starting with the contract
  (production re-exports plus harness-owned error table).

⏺ Write(tests/helpers/qa-harness/contract.ts)
  ⎿  Added 79 lines, removed 112 lines
        1  /**
        2 - * S2-003 harness-owned copy of the Q&A model-boundary contrac
          -t.                                                            
        2 + * S2-003 Q&A harness contract.                               
        3   *
        4 - * ┌──────────────────────────────────────────────────────────
          -────────────────────────────────┐                             
        5 - * │ PENDING TEAM AGREEMENT. Nothing here is production code a
          -nd nothing here is authoritative. │                           
        6 - * └──────────────────────────────────────────────────────────
          -────────────────────────────────┘                             
        4 + * The production types and constants are re-exported from the
          +ir owners, never copied:                                      
        5   *
        8 - * The real definitions live in unmerged PRs and are NOT impor
          -ted, so this harness can merge to                             
        9 - * `main` independently:                                      
        6 + * - `QaModelRequest`, `QA_OUTCOMES`, `QA_DECLINE_PRIORITY`, b
          +udgets, platform labels and                                   
        7 + *   `SYSTEM_PROMPT_VERSION`: S2-013 (`src/services/qa/system-
          +prompt.ts`).                                                  
        8 + * - `QaModelReply`, `QaModelCaller`: S2-011 (`src/services/qa
          +/answer-question.ts`).                                        
        9 + * - `QaAnswer`: S2-011 (`src/services/qa/qa-response.ts`).   
       10 + * - `QaReviewContextBuilder`: S2-011 (`src/services/qa/qa-req
          +uest.ts`); the real S2-010                                    
       11 + *   `buildReviewDatasetContext` satisfies it.                
       12   *
       11 - * - `QaModelRequest`, `QA_OUTCOMES`, `QA_DECLINE_PRIORITY`, i
          -nput format, budget constants:                                
       12 - *   Aryan, S2-013 (`src/services/qa/system-prompt.ts`, PR #76
          -, as carried by #79).                                         
       13 - * - `QaModelReply`, `QaModelCaller`, `QaAnswer`, reply valida
          -tion rules, and the entry point                               
       14 - *   `answerQuestion(targetId, question, { buildReviewDatasetC
          -ontext, callModel })`: Aryan, S2-011                          
       15 - *   (`src/services/qa/answer-question.ts`, `qa-response.ts`, 
          -PR #79).                                                      
       16 - * - `buildReviewDatasetContext(targetId)` and its errors: Sha
          -wn, S2-010                                                    
       17 - *   (`src/services/qa/review-context.ts`, PR #78).           
       13 + * Constants are imported at runtime (so a teammate bumping th
          +e prompt version or a budget does                             
       14 + * not break the harness); tests assert on them where it matte
          +rs. What stays harness-owned is                               
       15 + * listed below: the input layout the harness parses, the sema
          +ntic prompt invariants, and the                               
       16 + * error-name/code table. `contract-alignment.ts` checks at co
          +mpile time that the harness-owned                             
       17 + * types and error codes still fit the production ones.       
       18   *
       19 - * Every item below mirrors PR #79 head `e55c48a` and PR #78 h
          -ead `6835c29` (2026-11-13). PR #82                            
       20 - * was closed and consolidated into #78; nothing here depends 
          -on it. When #78 and #79 merge, the                            
       21 - * S2-003 follow-up PR adds compile-time checks that these cop
          -ies are assignable to and from the                            
       22 - * real types, then replaces each copy with a re-export. Do no
          -t extend this file with new                                   
       23 - * production behaviour; propose changes to the owning story i
          -nstead.                                                       
       24 - *                                                            
       25 - * Integration plan (PR 2): call the real `answerQuestion` wit
          -h the REAL                                                    
       26 - * `buildReviewDatasetContext`, so its authentication and owne
          -rship checks stay under test. Mock                            
       27 - * only the infrastructure beneath it: a fake Supabase client 
          -(persisted rows), a fake verified                             
       28 - * auth session for the actor, and the fake model as `callMode
          -l`. Never pass a fake builder.                                
       19 + * Importing this module loads `server-only` modules, so every
          + test file that imports the harness                           
       20 + * starts with the preamble documented in `index.ts`.         
       21   */
       22  
       31 -/** Mirror of S2-013 `QA_OUTCOMES`. */                        
       32 -export const QA_OUTCOMES = [                                  
       33 -  "answered",                                                 
       34 -  "insufficient_evidence",                                    
       35 -  "declined_general_knowledge",                               
       36 -  "declined_other_entity",                                    
       37 -  "declined_other_platform",                                  
       38 -] as const;                                                   
       23 +import type { QaReviewContextBuilder } from "@/services/qa/qa-
          +request";                                                     
       24 +import type { QaModelCaller } from "@/services/qa/answer-quest
          +ion";                                                         
       25 +import type { QaAnswer } from "@/services/qa/qa-response";    
       26 +import { QA_DECLINE_PRIORITY, type QaOutcome } from "@/service
          +s/qa/system-prompt";                                          
       27  
       40 -export type QaOutcome = (typeof QA_OUTCOMES)[number];         
       28 +export {                                                      
       29 +  QA_DECLINE_PRIORITY,                                        
       30 +  QA_MAX_REQUEST_TOKENS,                                      
       31 +  QA_OUTCOMES,                                                
       32 +  QA_RESERVED_OUTPUT_TOKENS,                                  
       33 +  REVIEW_PLATFORM_LABELS,                                     
       34 +  SYSTEM_PROMPT_VERSION,                                      
       35 +} from "@/services/qa/system-prompt";                         
       36 +export type { QaDeclineOutcome, QaModelRequest, QaOutcome } fr
          +om "@/services/qa/system-prompt";                             
       37 +export type { QaModelCaller, QaModelReply } from "@/services/q
          +a/answer-question";                                           
       38 +export type { QaAnswer } from "@/services/qa/qa-response";    
       39 +export type { QaReviewContextBuilder } from "@/services/qa/qa-
          +request";                                                     
       40  
       42 -/** Mirror of S2-013 `QA_DECLINE_PRIORITY` (the decline outcom
          -es). */                                                       
       43 -export const QA_DECLINE_OUTCOMES = [                          
       44 -  "declined_other_entity",                                    
       45 -  "declined_other_platform",                                  
       46 -  "declined_general_knowledge",                               
       47 -] as const satisfies readonly QaOutcome[];                    
       41 +/** The S2-013 decline outcomes, in priority order. Alias kept
          + for harness readability. */                                  
       42 +export const QA_DECLINE_OUTCOMES = QA_DECLINE_PRIORITY;       
       43  
       49 -export type QaDeclineOutcome = (typeof QA_DECLINE_OUTCOMES)[nu
          -mber];                                                        
       50 -                                                              
       51 -export function isDeclineOutcome(outcome: QaOutcome): outcome 
          -is QaDeclineOutcome {                                         
       52 -  return (QA_DECLINE_OUTCOMES as readonly QaOutcome[]).include
          -s(outcome);                                                   
       44 +export function isDeclineOutcome(outcome: QaOutcome): outcome 
          +is (typeof QA_DECLINE_PRIORITY)[number] {                     
       45 +  return (QA_DECLINE_PRIORITY as readonly QaOutcome[]).include
          +s(outcome);                                                   
       46  }
       47  
       55 -/** Mirror of S2-013 `QaModelRequest`: the provider-neutral re
          -quest handed to the model seam. */                            
       56 -export interface QaModelRequest {                             
       57 -  promptVersion: string;                                      
       58 -  targetId: string;                                           
       59 -  /** System-level instructions (the ReviewLens system prompt)
          -. */                                                          
       60 -  instructions: string;                                       
       61 -  /** User-turn content: the review dataset followed by the qu
          -estion. */                                                    
       62 -  input: string;                                              
       63 -  /** IDs of the reviews included in `input`. */              
       64 -  reviewIds: string[];                                        
       65 -  maxOutputTokens: number;                                    
       66 -}                                                             
       67 -                                                              
       68 -/** Mirror of S2-011 `QaModelReply`: the raw provider reply, b
          -efore validation. */                                          
       69 -export interface QaModelReply {                               
       70 -  text: string;                                               
       71 -  usage?: { inputTokens: number; outputTokens: number };      
       72 -  /** Input tokens counted by S2-011's pre-call budget check (
          -`token-budget.ts`). */                                        
       73 -  countedInputTokens?: number;                                
       74 -}                                                             
       75 -                                                              
       76 -/** Mirror of S2-011 `QaModelCaller`: the single model seam th
          -e harness replaces. */                                        
       77 -export type QaModelCaller = (request: QaModelRequest) => Promi
          -se<QaModelReply>;                                             
       78 -                                                              
       79 -/** The JSON object the S2-013 prompt asks the model to return
          - (mirror of `QA_REPLY_JSON_SCHEMA`). */                       
       48 +/**                                                           
       49 + * The JSON object the S2-013 prompt asks the model to return.
          + Harness-owned so replies can be                              
       50 + * scripted; `contract-alignment.ts` checks its keys against S
          +2-011 `QA_REPLY_JSON_SCHEMA`.                                 
       51 + */                                                           
       52  export interface QaModelReplyPayload {
       53    outcome: QaOutcome;
       54    answer: string;
       55    citedReviewIds: string[];
       56  }
       57  
       86 -/** Mirror of S2-011 `QaAnswer`: the validated answer returned
          - to callers. */                                               
       87 -export interface QaAnswer {                                   
       88 -  outcome: QaOutcome;                                         
       89 -  answer: string;                                             
       90 -  citedReviewIds: string[];                                   
       91 -  promptVersion: string;                                      
       92 -  targetId: string;                                           
       93 -}                                                             
       94 -                                                              
       58  /**
       96 - * Mirror of the S2-013 user-turn layout. The harness reads th
          -e question back out of `input` so                             
       97 - * scripts can match on it. PENDING AGREEMENT: ask S2-013 to e
          -xport a parser or add a `question`                            
       98 - * field to `QaModelRequest`, so the harness does not depend o
          -n prompt formatting.                                          
       59 + * The S2-013 user-turn layout. S2-013 exports no parser, so t
          +he harness reads the question back                            
       60 + * out of `input` itself. The golden suite runs every request 
          +through the real                                              
       61 + * `buildQaModelRequest`, so a layout change fails loudly here
          + rather than silently.                                        
       62   */
       63  export const QA_INPUT_QUESTION_HEADER = "QUESTION (JSON string
           ):";
       64  
       65  /**
      103 - * Mirror of the S2-013 evidence section that opens `input`:  
       66 + * The S2-013 evidence section that opens `input`:            
       67   *
       68   *   REVIEW DATASET (<n> reviews, JSON array):
       69   *   [{"id":…,"rating":…,"date":…,"text":…}, …]
     ...
       91  /**
       92   * S2-013 system-prompt contract as stable semantic invariants
           , not exact prose.
       93   *
      131 - * PENDING AGREEMENT (Aryan, S2-013). Each invariant lists alt
          -ernatives. An alternative is satisfied                        
      132 - * when ONE sentence of the whitespace-normalised prompt match
          -es ALL of its patterns, so a rule must                        
      133 - * be stated together, not assembled from words scattered acro
          -ss the prompt. Rewording the prompt is                        
      134 - * fine as long as each rule is still stated. Until the S2-003
          - integration PR runs these against the                        
      135 - * real S2-013 prompt, CI checks them only against the referen
          -ce pipeline's placeholder prompt.                             
       94 + * Each invariant lists alternatives. An alternative is satisf
          +ied when ONE sentence of the                                  
       95 + * whitespace-normalised prompt matches ALL of its patterns, s
          +o a rule must be stated together,                             
       96 + * not assembled from words scattered across the prompt. Rewor
          +ding the prompt is fine as long as                            
       97 + * each rule is still stated. The golden suite checks these ag
          +ainst the real S2-013 prompt.                                 
       98   *
       99   * The target name (JSON-encoded) and platform label are check
           ed separately, per target.
      100   */
     ...
      146  export type QaPromptInvariantId = (typeof QA_SYSTEM_PROMPT_INV
           ARIANTS)[number]["id"];
      147  
      148  /**
      187 - * Mirror of S2-013 request-budget constants (application budg
          -et, not a model limit).                                       
      188 - *                                                            
      189 - * In #79 the budget is enforced inside the OpenAI adapter (`c
          -reateOpenAiQaModel` →                                         
      190 - * `token-budget.ts`), i.e. BELOW the `callModel` seam. With a
          - fake `callModel`, the real pipeline                          
      191 - * therefore does not reject an oversized question before the 
          -model call. See the open question in                          
      192 - * `reference-pipeline.ts` and the `qa-edge-long-question` gol
          -den case.                                                     
      149 + * Error names and codes the real pipeline throws (S1-013, S2-
          +010, S2-011, S2-013). Golden cases                            
      150 + * assert on `name` and `code`, never on message text. `contra
          +ct-alignment.ts` fails the type                               
      151 + * check if any code here is not a member of its production er
          +ror's code type.                                              
      152   */
      194 -export const QA_MAX_REQUEST_TOKENS = 16_000;                  
      195 -export const QA_RESERVED_OUTPUT_TOKENS = 1_500;               
      196 -                                                              
      197 -/** Mirror of S2-013 `REVIEW_PLATFORM_LABELS`. */             
      198 -export const REVIEW_PLATFORM_LABELS = { google_maps: "Google M
          -aps" } as const;                                              
      199 -                                                              
      200 -/**                                                           
      201 - * Error names and codes the pipeline throws (S2-010, S2-011, 
          -S2-013, S1-013). Golden cases assert                          
      202 - * on `name` and `code`, never on message text, so they hold f
          -or both the reference pipeline and                            
      203 - * the real one.                                              
      204 - */                                                           
      153  export const QA_PIPELINE_ERRORS = {
      154 +  // S1-013 ownership guard (via S2-010).                     
      155    targetNotFound: { name: "TargetNotFoundError", code: "TARGET
           _NOT_FOUND" },
      156 +  // S2-010 context builder.                                  
      157 +  authRequired: { name: "ReviewContextError", code: "AUTH_REQU
          +IRED" },                                                      
      158 +  authUnavailable: { name: "ReviewContextError", code: "AUTH_U
          +NAVAILABLE" },                                                
      159    noReviewData: { name: "ReviewContextError", code: "NO_REVIEW
           _DATA" },
      160 +  contextTooLarge: { name: "ReviewContextError", code: "REVIEW
          +_CONTEXT_TOO_LARGE" },                                        
      161    contextUnavailable: { name: "ReviewContextError", code: "REV
           IEW_CONTEXT_UNAVAILABLE" },
      162 +  // S2-011 service boundary (`qa-request.ts`), checked before
          + the context builder runs.                                    
      163 +  questionInvalidType: { name: "QaInputValidationError", code:
          + "QA_QUESTION_INVALID_TYPE" },                                
      164 +  questionTooLong: { name: "QaInputValidationError", code: "QA
          +_QUESTION_TOO_LONG" },                                        
      165 +  // S2-013 request builder, and REQUEST_TOO_LARGE from the Op
          +enAI adapter's token budget.                                  
      166    emptyQuestion: { name: "QaPromptError", code: "EMPTY_QUESTIO
           N" },
      167    requestTooLarge: { name: "QaPromptError", code: "REQUEST_TOO
           _LARGE" },
      168 +  // S2-011 token budget.                                     
      169 +  budgetCheckFailed: { name: "QaBudgetError", code: "BUDGET_CH
          +ECK_FAILED" },                                                
      170 +  // S2-011 reply validation.                                 
      171    invalidModelResponse: { name: "QaResponseError", code: "INVA
           LID_MODEL_RESPONSE" },
      172    ungroundedAnswer: { name: "QaResponseError", code: "UNGROUND
           ED_ANSWER" },
      213 -  /** #79: any outcome other than "answered" that carries cita
          -tions is rejected, not repaired. */                           
      173 +  /** Any outcome other than "answered" that carries citations
          + is rejected, not repaired. */                                
      174    unexpectedCitations: { name: "QaResponseError", code: "UNEXP
           ECTED_CITATIONS" },
      175 +  // S2-011 provider adapter.                                 
      176 +  qaDisabled: { name: "QaModelError", code: "QA_DISABLED" },  
      177 +  apiKeyNotConfigured: { name: "QaModelError", code: "API_KEY_
          +NOT_CONFIGURED" },                                            
      178    modelTimeout: { name: "QaModelError", code: "MODEL_TIMEOUT" 
           },
      179    modelUnavailable: { name: "QaModelError", code: "MODEL_UNAVA
           ILABLE" },
      180    modelRateLimited: { name: "QaModelError", code: "MODEL_RATE_
           LIMITED" },
      181 +  modelAuth: { name: "QaModelError", code: "MODEL_AUTH" },    
      182 +  modelRejected: { name: "QaModelError", code: "MODEL_REJECTED
          +" },                                                          
      183 +  modelFailed: { name: "QaModelError", code: "MODEL_FAILED" },
      184 +  modelRefused: { name: "QaModelError", code: "MODEL_REFUSED" 
          +},                                                            
      185 +  responseIncomplete: { name: "QaModelError", code: "RESPONSE_
          +INCOMPLETE" },                                                
      186  } as const satisfies Record<string, { name: string; code: stri
           ng }>;
      187  
      188  export type QaPipelineErrorKey = keyof typeof QA_PIPELINE_ERRO
           RS;
      189  export type QaPipelineErrorShape = (typeof QA_PIPELINE_ERRORS)
           [QaPipelineErrorKey];
      190  
      223 -/** A test identity. In the real pipeline this becomes the moc
          -ked verified Supabase session. */                             
      191 +/** A test identity. The harness turns it into a fake verified
          + Supabase session. */                                         
      192  export interface QaActor {
      193    readonly id: string;
      194    readonly email: string;
      195  }
      196  
      197  /**
      230 - * Harness-defined orchestration entry point. The harness call
          -s whatever implements this: the                               
      231 - * contract reference pipeline in PR 1, and in PR 2 an adapter
          - that installs a fake verified auth                           
      232 - * session for `actor` and a fake Supabase client holding the 
          -fixture rows, then calls                                      
      233 - * `answerQuestion(targetId, question, { buildReviewDatasetCon
          -text, callModel })` with the REAL                             
      234 - * S2-010 `buildReviewDatasetContext`, so authentication and o
          -wnership remain under test. Only the                          
      235 - * infrastructure under the builder and the model are faked; t
          -he builder itself never is.                                   
      198 + * The orchestration under test. The default is `realQaPipelin
          +e` (`real-pipeline.ts`), which calls                          
      199 + * the real `answerQuestion`. `buildReviewDatasetContext` is A
          +LWAYS the real S2-010 builder (the                            
      200 + * harness wraps it only to count calls); a pipeline must not 
          +replace it. The actor's session is                            
      201 + * already installed in the fake Supabase client before the pi
          +peline runs; `actor` is informative.                          
      202   */
      203  export interface QaPipelineInput {
      238 -  readonly actor: QaActor;                                    
      204 +  readonly actor: QaActor | null;                             
      205    readonly targetId: unknown;
      240 -  readonly question: string;                                  
      206 +  readonly question: unknown;                                 
      207 +  readonly buildReviewDatasetContext: QaReviewContextBuilder; 
      208    readonly callModel: QaModelCaller;
      209  }
      210  

⏺ Write(tests/helpers/qa-harness/contract-alignment.ts)
  ⎿  Wrote 75 lines to tests/helpers/qa-harness/contract-alignment.ts
       1 /**
       2  * S2-003 compile-time alignment between the harness and product
         ion Q&A code.
       3  *
       4  * Nothing here runs. `npm run typecheck` (tsc over `tests/`) fa
         ils if a harness-owned type or
       5  * error code drifts from production. Only structural types and
         error-code membership are checked
       6  * here. Values teammates may bump (`SYSTEM_PROMPT_VERSION`, bud
         gets, outcome lists) are imported
     … +69 lines (ctrl+o to expand)

  Searched for 1 pattern (ctrl+o to expand)

⏺ Now the fake Supabase (supabase-js with an injected fetch, a fake verified
  session, and a PostgREST subset).

⏺ Write(tests/helpers/qa-harness/fake-supabase.ts)
  ⎿  Wrote 273 lines to tests/helpers/qa-harness/fake-supabase.ts
       1 import { createClient, type SupabaseClient } from "@supabase/sup
         abase-js";
       2
       3 import type { AnalysisTarget } from "@/services/analysis-targets
         /analysis-target-repository";
       4 import type { Review } from "@/services/reviews/review-service";
       5
       6 import type { QaFixtureDataset } from "../../fixtures/qa/dataset
         s";
       7 import type { QaActor } from "./contract";
     … +266 lines (ctrl+o to expand)

⏺ Now the real-pipeline adapter that binds the fake Supabase to the mocked
  server-client factory.

⏺ Write(tests/helpers/qa-harness/real-pipeline.ts)
  ⎿  Wrote 61 lines to tests/helpers/qa-harness/real-pipeline.ts
       1 import type { SupabaseClient } from "@supabase/supabase-js";
       2
       3 import { createSupabaseServerClient } from "@/lib/supabase/serve
         r";
       4 import { answerQuestion } from "@/services/qa/answer-question";
       5 import { buildReviewDatasetContext } from "@/services/qa/review-
         context";
       6
       7 import type { QaPipeline, QaReviewContextBuilder } from "./contr
         act";
     … +54 lines (ctrl+o to expand)

⏺ Bash(git rm -q tests/helpers/qa-harness/reference-pipeline.ts && git status
      --short)
  ⎿   M tests/helpers/qa-harness/contract.ts
     D  tests/helpers/qa-harness/reference-pipeline.ts
     ?? tests/helpers/qa-harness/contract-alignment.ts
     … +2 lines (ctrl+o to expand)
  ⎿  Deleted tests/helpers/qa-harness/reference-pipeline.ts (+0 -207)
        1 -import type { QaFixtureDataset } from "../../fixtures/qa/datas
          -ets";                                                         
        2 -import {                                                      
        3 -  QA_INPUT_QUESTION_HEADER,                                   
        4 -  QA_MAX_REQUEST_TOKENS,                                      
        5 -  QA_OUTCOMES,                                                
        6 -  QA_PIPELINE_ERRORS,                                         
        7 -  QA_RESERVED_OUTPUT_TOKENS,                                  
        8 -  REVIEW_PLATFORM_LABELS,                                     
        9 -  type QaAnswer,                                              
       10 -  type QaModelRequest,                                        
       11 -  type QaOutcome,                                             
       12 -  type QaPipeline,                                            
       13 -  type QaPipelineErrorShape,                                  
       14 -} from "./contract";                                          
       15 -                                                              
       16 -/**                                                           
       17 - * S2-003 CONTRACT REFERENCE PIPELINE. TEST-ONLY STAND-IN, NOT
          - THE REVIEWLENS IMPLEMENTATION.                               
       18 - *                                                            
       19 - * The real Q&A pipeline (S2-010 context builder, S2-013 promp
          -t, S2-011 reply validation) is not on                         
       20 - * `main` yet. This stand-in follows the contract of PR #79 (`
          -answerQuestion`, `parseQaModelReply`)                         
       21 - * and PR #78 (`buildReviewDatasetContext`), so the harness, g
          -olden cases and assertions can run in                         
       22 - * CI today: same order of checks, same error names and codes,
          - same request layout. Its system                              
       23 - * prompt is a placeholder and is NOT the S2-013 prompt.      
       24 - *                                                            
       25 - * The S2-003 follow-up PR replaces this with an adapter that 
          -calls the real                                                
       26 - * `answerQuestion(targetId, question, { buildReviewDatasetCon
          -text, callModel })` using the REAL                            
       27 - * S2-010 builder over a fake Supabase client and fake verifie
          -d session, so authentication and                              
       28 - * ownership stay under test. The same golden cases must then 
          -pass unchanged. Any case that passes                          
       29 - * here but fails there is a contract mismatch to raise with t
          -he owning story, not something to                             
       30 - * "fix" in this file.                                        
       31 - *                                                            
       32 - * KNOWN DIFFERENCE (open question): this stand-in rejects an 
          -oversized request with                                        
       33 - * REQUEST_TOO_LARGE before calling the model. In #79 that bud
          -get check runs inside the OpenAI                              
       34 - * adapter, below the `callModel` seam, so with a fake model t
          -he real pipeline would call the model                         
       35 - * instead. The `qa-edge-long-question` golden case needs a te
          -am decision before PR 2.                                      
       36 - */                                                           
       37 -                                                              
       38 -export const REFERENCE_PROMPT_VERSION = "s2-003.reference";   
       39 -const MAX_ANSWER_CHARACTERS = 8_000;                          
       40 -const MAX_CITED_REVIEW_IDS = 1_000;                           
     … 167 more lines (ctrl+o to expand)
  ⎿  (files that changed while this command ran, by the command or by
     another process; a convenience view, not a review or audit of the
     command)

⏺ Bash(git reset -q HEAD tests/helpers/qa-harness/reference-pipeline.ts && git
      status --short | head -3 && python3 - <<'EOF'
      p='tests/helpers/qa-harness/real-pipeline.…)
  ⎿   M tests/helpers/qa-harness/contract.ts
      D tests/helpers/qa-harness/reference-pipeline.ts
     ?? tests/helpers/qa-harness/contract-alignment.ts
  ⎿  Updated tests/helpers/qa-harness/real-pipeline.ts (+0 -4)
  ⎿  (a git step in this command can move the working tree, so these may be
     its changes, not edits) (ctrl+o to expand)

⏺ Bash(python3 - <<'EOF'
      p='tests/helpers/qa-harness/fake-model.ts'…)
  ⎿  Updated tests/helpers/qa-harness/fake-model.ts (+6 -13)
      1 +import { QaModelError, type QaModelErrorCode } from "@/services/
        +qa/openai-qa-client";                                           
      2 +                                                                
      3  import {
      4    QA_INPUT_QUESTION_HEADER,
      5    type QaModelCaller,
     ...
      16   * - Recorded: every call is captured (deep-copied) with its ou
          tcome for assertions.
      17   * - Loud: an unscripted call throws `UnscriptedQaModelCallErro
          r` unless a fallback is configured.
      18   * - Offline: it never performs I/O. Delays use `setTimeout`, s
          o Jest fake timers control them.
      19 + * - Real errors: provider failures are the real S2-011 `QaMode
         +lError`, not a look-alike.                                     
      20   */
      21  
      19 -/** A provider-style failure. `name` matches the real S2-011 `Q
         -aModelError` so golden cases agree. */                         
      20 -export class FakeQaModelError extends Error {                  
      21 -  constructor(                                                 
      22 -    readonly code: string,                                     
      23 -    message = `Fake model failure: ${code}`,                   
      24 -  ) {                                                          
      25 -    super(message);                                            
      26 -    this.name = "QaModelError";                                
      27 -  }                                                            
      28 -}                                                              
      29 -                                                               
      22  /** Thrown when the code under test calls the model and no rule
           or fallback matches. */
      23  export class UnscriptedQaModelCallError extends Error {
      24    constructor(question: string | undefined, targetId: string) {
     ...
      254    error(createError: () => Error, delayMs?: number): QaReplySp
           ec {
      255      return { kind: "error", createError, delayMs };
      256    },
      265 -  providerError(code: string, delayMs?: number): QaReplySpec {
      266 -    return reply.error(() => new FakeQaModelError(code), delay
          -Ms);                                                          
      257 +  /** Rejects with the real S2-011 `QaModelError` carrying `co
          +de`. */                                                       
      258 +  providerError(code: QaModelErrorCode, delayMs?: number): QaR
          +eplySpec {                                                    
      259 +    return reply.error(() => new QaModelError(code, "Scripted 
          +by the S2-003 fake model."), delayMs);                        
      260    },
      261    /** Rejects with `QaModelError`/`MODEL_TIMEOUT` after `ms` (
           use Jest fake timers to advance). */
      262    timeout(ms = 30_000): QaReplySpec {

⏺ Next, the fake OpenAI fetch for the provider boundary.

⏺ Write(tests/helpers/qa-harness/fake-openai-fetch.ts)
  ⎿  Wrote 172 lines to tests/helpers/qa-harness/fake-openai-fetch.ts
       1 import type { QaModelReplyPayload } from "./contract";
       2
       3 /**
       4  * S2-003 fake for the OpenAI Responses API, injected as `create
         OpenAiQaModel({ fetcher })`. The
       5  * real adapter builds the request body, counts tokens, enforces
          the budget, maps HTTP errors and
       6  * parses the reply; this fake only answers the two endpoints it
          calls and records what was sent.
       7  *
     … +165 lines (ctrl+o to expand)
⏺ Now rewriting the harness entry point around the real pipeline.

⏺ Bash(python3 - <<'EOF'
      p='tests/helpers/qa-harness/index.ts'…)
  ⎿  Updated tests/helpers/qa-harness/index.ts (+77 -19)
      21    expectSystemPromptApplied,
      22    QaHarnessAssertionError,
      23  } from "./assertions";
      24 -import { QA_PIPELINE_ERRORS, type QaActor, type QaAnswer, type 
         -QaPipeline } from "./contract";                                
      24 +import {                                                       
      25 +  QA_PIPELINE_ERRORS,                                          
      26 +  SYSTEM_PROMPT_VERSION,                                       
      27 +  type QaActor,                                                
      28 +  type QaAnswer,                                               
      29 +  type QaPipeline,                                             
      30 +  type QaPipelineErrorKey,                                     
      31 +} from "./contract";                                           
      32  import {
      33    createFakeQaModel,
      34    type FakeQaModel,
     ...
      36    type QaScriptRule,
      37    type RecordedQaModelCall,
      38  } from "./fake-model";
      39 +import { createFakeSupabase, type FakeSupabase, type FakeSupaba
         +seRequest } from "./fake-supabase";                            
      40  import { installNetworkGuard, type NetworkGuard } from "./netwo
          rk-guard";
      33 -import { createReferencePipeline } from "./reference-pipeline";
      41 +import { bindFakeSupabase, countingContextBuilder, realQaPipeli
         +ne } from "./real-pipeline";                                   
      42  
      43  /**
      44   * S2-003 deterministic Q&A test harness. See the "Deterministi
          c Q&A test harness" README section.
      45   *
      46 + * Every question runs through the REAL `answerQuestion` with t
         +he REAL S2-010                                                 
      47 + * `buildReviewDatasetContext`. Only the infrastructure is fake
         +d: Supabase (`fake-supabase.ts`,                               
      48 + * holding the fixture rows and a fake verified session for the
         + actor) and the model.                                         
      49 + *                                                             
      50 + * Every test file that imports the harness must start with thi
         +s preamble (Jest hoists                                        
      51 + * `jest.mock` only in test files):                            
      52 + *                                                             
      53 + *   jest.mock("server-only", () => ({}));                     
      54 + *   jest.mock("@/lib/supabase/server", () => ({ createSupabase
         +ServerClient: jest.fn() }));                                   
      55 + *                                                             
      56 + * Then:                                                       
      57 + *                                                             
      58   *   const qa = createQaTestHarness({ script: [{ when: { questi
          onIncludes: "pizza" },
      59   *                                               then: reply.an
          swered([reviewId]) }] });
     … 146 more lines (ctrl+o to expand)

⏺ Now the golden-case runner section.

⏺ Bash(python3 - <<'EOF'
      p='tests/helpers/qa-harness/index.ts'…)
  ⎿  254:export interface QaGoldenRunOptions {
     255-  readonly datasets?: readonly QaFixtureDataset[];
     256-  readonly pipeline?: QaPipeline;
     … +8 lines (ctrl+o to expand)
  ⎿  Updated tests/helpers/qa-harness/index.ts (+40 -5)
      256    readonly pipeline?: QaPipeline;
      257  }
      258  
      259 +/** Errors that must be raised before any review row is read. 
          +*/                                                            
      260 +const DENIED_BEFORE_REVIEW_READS: readonly QaPipelineErrorKey[
          +] = [                                                         
      261 +  "targetNotFound",                                           
      262 +  "authRequired",                                             
      263 +  "authUnavailable",                                          
      264 +  "questionInvalidType",                                      
      265 +  "questionTooLong",                                          
      266 +];                                                            
      267 +                                                              
      268  function checkStep(harness: QaTestHarness, { step, result }: Q
           aGoldenStepRun): void {
      269    const { expect: expected } = step;
      270    const shouldCall = expected.result !== "error" || expected.m
           odelCalled;
      271  
      272 +  if (expected.result === "error" && DENIED_BEFORE_REVIEW_READ
          +S.includes(expected.error)) {                                 
      273 +    const reads = result.supabaseRequests.filter((request) => 
          +request.resource === "reviews");                              
      274 +    if (reads.length > 0) {                                   
      275 +      throw new QaHarnessAssertionError(                      
      276 +        `Review rows were read ${reads.length} time(s) before 
          +${expected.error} was raised.`,                               
      277 +      );                                                      
      278 +    }                                                         
      279 +  }                                                           
      280 +  if (expected.result === "error" && expected.contextLoaded ==
          += false) {                                                    
      281 +    if (result.contextBuilds !== 0 || result.supabaseRequests.
          +length !== 0) {                                               
      282 +      throw new QaHarnessAssertionError(                      
      283 +        `The context builder ran ${result.contextBuilds} time(
          +s) and made ` +                                               
      284 +          `${result.supabaseRequests.length} Supabase request(
          +s); expected none.`,                                          
      285 +      );                                                      
      286 +    }                                                         
      287 +  }                                                           
      288 +                                                              
      289    if (!shouldCall) {
      290      if (result.calls.length !== 0) {
      291        throw new QaHarnessAssertionError(
     ...
      304      const active = harness.dataset(step.target);
      305      const foreign = harness.datasets.filter((candidate) => can
           didate.key !== active.key);
      306      const { request } = result.calls[0];
      281 -    expectSystemPromptApplied(request, active);               
     … 43 more lines (ctrl+o to expand)

⏺ Updating golden cases: long-question expectation, plus new authorization
  cases.

⏺ Bash(python3 - <<'EOF'
      p='tests/fixtures/qa/golden-cases.ts'…)
  ⎿  Updated tests/fixtures/qa/golden-cases.ts (+85 -4)
      1  import type { QaDeclineOutcome, QaPipelineErrorKey } from "../..
         /helpers/qa-harness/contract";
      2  import { reply, type QaReplySpec } from "../../helpers/qa-harnes
         s/fake-model";
      3 +import type { FakeAuthMode } from "../../helpers/qa-harness/fake
        +-supabase";                                                     
      4  import { getQaDataset, QA_MISSING_TARGET_ID, type QaDatasetKey, 
         type QaUserKey } from "./datasets";
      5  
      6  /**
     ...
      14   * - what it does with the reply: grounding checks, decline han
          dling, fail-closed errors;
      15   * - when it must not call the model at all.
      16   *
      17 + * Every step runs through the REAL `answerQuestion` and the RE
         +AL S2-010 context builder over a                               
      18 + * fake Supabase and a fake verified session; only the model re
         +ply is scripted.                                               
      19 + *                                                             
      20   * They do not prove the real model would choose the scripted o
          utcome. That needs an approved
      21   * live-model evaluation (S2-004/S2-014/S2-015), which is out o
          f scope for CI.
      22   *
     ...
      30    "general_knowledge",
      31    "other_entity_or_platform",
      32    "cross_user_leak",
      33 +  "authorization",                                             
      34    "target_switch",
      35    "stale_context",
      36    "edge_input",
     ...
      44    | { readonly result: "answered" }
      45    | { readonly result: "insufficient_evidence" }
      46    | { readonly result: "declined"; readonly outcome: QaDeclineO
          utcome }
      42 -  | { readonly result: "error"; readonly error: QaPipelineError
         -Key; readonly modelCalled: boolean };                          
      47 +  | {                                                          
      48 +      readonly result: "error";                                
      49 +      readonly error: QaPipelineErrorKey;                      
      50 +      readonly modelCalled: boolean;                           
      51 +      /** `false`: the context builder must not run and Supabas
         +e must not be touched at all. */                               
      52 +      readonly contextLoaded?: boolean;                        
      53 +    };                                                         
      54  
      55  export interface QaGoldenStep {
      45 -  readonly actor: QaUserKey;                                   
      56 +  /** Who is signed in; `"anonymous"` means no session cookie a
         +t all. */                                                      
      57 +  readonly actor: QaUserKey | "anonymous";                     
      58 +  /** How Supabase Auth answers the session token. Default `"va
         +lid"`. */                                                      
      59 +  readonly auth?: Exclude<FakeAuthMode, "valid">;              
     … 97 more lines (ctrl+o to expand)

⏺ Adding the mock preamble to every harness test file, then a first run to see
  where things stand.

⏺ Bash(for f in tests/unit/qa-harness/*.test.ts; do python3 - "$f" <<'EOF'
      import sys…)
  ⎿    ● createFakeQaModel › throws scripted errors with their name and cod
     e, and records them
           153 |       { kind: "error", name: "TypeError", code: undefined
     … +3 lines (ctrl+o to expand)
  ⎿  Updated tests/unit/qa-harness/assertions.test.ts (+5 -0)
       1  /** @jest-environment node */
       2  
       3 +// S2-003 harness preamble: the real Q&A pipeline imports `serv
         +er-only` modules, and the fake                                 
       4 +// Supabase is injected through this module mock (the context b
         +uilder has no client seam).                                    
       5 +jest.mock("server-only", () => ({}));                          
       6 +jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
         +rClient: jest.fn() }));                                        
       7 +                                                               
       8  import { getQaDataset } from "../../fixtures/qa/datasets";
       9  import {
      10    errorMatches,
  ⎿  Updated tests/unit/qa-harness/determinism.test.ts (+5 -0)
       1  /** @jest-environment node */
       2  
       3 +// S2-003 harness preamble: the real Q&A pipeline imports `serv
         +er-only` modules, and the fake                                 
       4 +// Supabase is injected through this module mock (the context b
         +uilder has no client seam).                                    
       5 +jest.mock("server-only", () => ({}));                          
       6 +jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
         +rClient: jest.fn() }));                                        
       7 +                                                               
       8  import { getQaDataset } from "../../fixtures/qa/datasets";
       9  import { QA_GOLDEN_CASES } from "../../fixtures/qa/golden-cases
          ";
      10  import {
  ⎿  Updated tests/unit/qa-harness/fake-model.test.ts (+5 -0)
       1  /** @jest-environment node */
       2  
       3 +// S2-003 harness preamble: the real Q&A pipeline imports `serv
         +er-only` modules, and the fake                                 
       4 +// Supabase is injected through this module mock (the context b
         +uilder has no client seam).                                    
       5 +jest.mock("server-only", () => ({}));                          
       6 +jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
         +rClient: jest.fn() }));                                        
       7 +                                                               
       8  import {
       9    createFakeQaModel,
      10    extractQuestion,
  ⎿  Updated tests/unit/qa-harness/fixtures.test.ts (+5 -0)
       1  /** @jest-environment node */
       2  
       3 +// S2-003 harness preamble: the real Q&A pipeline imports `serv
         +er-only` modules, and the fake                                 
       4 +// Supabase is injected through this module mock (the context b
         +uilder has no client seam).                                    
       5 +jest.mock("server-only", () => ({}));                          
       6 +jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
         +rClient: jest.fn() }));                                        
       7 +                                                               
       8  import { scopeGuardEvaluationFixture } from "../../fixtures/sco
          pe-guard-evaluation";
       9  import {
      10    allQaDatasets,
  ⎿  Updated tests/unit/qa-harness/golden-cases.test.ts (+5 -0)
       1  /** @jest-environment node */
       2  
       3 +// S2-003 harness preamble: the real Q&A pipeline imports `serv
         +er-only` modules, and the fake                                 
       4 +// Supabase is injected through this module mock (the context b
         +uilder has no client seam).                                    
       5 +jest.mock("server-only", () => ({}));                          
       6 +jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
         +rClient: jest.fn() }));                                        
       7 +                                                               
       8  import { allQaDatasets, getQaDataset } from "../../fixtures/qa/
          datasets";
       9  import { QA_GOLDEN_CASES, type QaGoldenCase } from "../../fixtu
          res/qa/golden-cases";
      10  import {
  ⎿  … 3 more files changed

⏺ Most of it already passes on the real pipeline. Checking the two failing
  suites:

  Ran 1 shell command (ctrl+o to expand)

⏺ Expected. Fixing the fake-model test, then porting the golden mutation tests
  to the real pipeline.

⏺ Bash(python3 - <<'EOF'
      p='tests/unit/qa-harness/fake-model.test.ts'…)
  ⎿  /** @jest-environment node */

     // S2-003 harness preamble: the real Q&A pipeline imports `server-only
     … +20 lines (ctrl+o to expand)
  ⎿  Updated tests/unit/qa-harness/fake-model.test.ts (+7 -2)
       5  jest.mock("server-only", () => ({}));
       6  jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
          rClient: jest.fn() }));
       7  
       8 +import { QaModelError } from "@/services/qa/openai-qa-client"; 
       9 +                                                               
      10  import {
      11    createFakeQaModel,
      12    extractQuestion,
      11 -  FakeQaModelError,                                            
      13    reply,
      14    UnscriptedQaModelCallError,
      15    type QaModelRequest,
     ...
      153        { kind: "error", name: "QaModelError", code: "MODEL_UNAV
           AILABLE" },
      154        { kind: "error", name: "TypeError", code: undefined },
      155      ]);
      155 -    expect(new FakeQaModelError("X")).toBeInstanceOf(Error);  
      156 +    // Provider failures are the real S2-011 class, not a look
          +-alike.                                                       
      157 +    expect(model.calls[0].outcome).toMatchObject({ name: QaMod
          +elError.name });                                              
      158 +    await expect(                                             
      159 +      createFakeQaModel({ fallback: reply.providerError("MODEL
          +_REFUSED") }).callModel(request("x")),                        
      160 +    ).rejects.toBeInstanceOf(QaModelError);                   
      161    });
      162  
      163    it("builds dynamic replies from the request", async () => {

⏺ Bash(python3 - <<'EOF'
      p='tests/unit/qa-harness/golden-cases.test.ts'…)
  ⎿  Test Suites: 1 failed, 7 passed, 8 total
     Tests:       2 failed, 142 passed, 144 total
           at tests/unit/qa-harness/golden-cases.test.ts:28:7
     … +50 lines (ctrl+o to expand)
  ⎿  Updated tests/unit/qa-harness/golden-cases.test.ts (+40 -12)
       5  jest.mock("server-only", () => ({}));
       6  jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
          rClient: jest.fn() }));
       7  
       8 -import { allQaDatasets, getQaDataset } from "../../fixtures/qa/
         -datasets";                                                     
       8 +import { createSupabaseServerClient } from "@/lib/supabase/serv
         +er";                                                           
       9 +                                                               
      10 +import { getQaDataset } from "../../fixtures/qa/datasets";     
      11  import { QA_GOLDEN_CASES, type QaGoldenCase } from "../../fixtu
          res/qa/golden-cases";
      12  import {
      11 -  createReferencePipeline,                                     
      13 +  realQaPipeline,                                              
      14    runGoldenCase,
      15    type QaModelRequest,
      16    type QaPipeline,
      17  } from "../../helpers/qa-harness";
      18  
      19  /**
      18 - * Runs every golden case through the contract reference pipeli
         -ne. PR 2 runs the same table                                   
      19 - * against the real `answerQuestion` (with the real S2-010 `bui
         -ldReviewDatasetContext` over fake                              
      20 - * Supabase and a fake verified session) by passing that adapte
         -r as `pipeline`.                                               
      20 + * Runs every golden case through the REAL `answerQuestion` wit
         +h the REAL S2-010                                              
      21 + * `buildReviewDatasetContext`, over a fake Supabase client and
         + a fake verified session. Only the                             
      22 + * model reply is scripted.                                    
      23   */
      22 -describe("golden Q&A cases (contract reference pipeline)", () =
         -> {                                                            
      24 +describe("golden Q&A cases (real answerQuestion + real context 
         +builder)", () => {                                             
      25    it.each(QA_GOLDEN_CASES.map((goldenCase) => [goldenCase.id, g
          oldenCase] as const))(
      26      "%s",
      27      async (_id, goldenCase) => {
     ...
      31  });
      32  
      33  /**
      32 - * Mutation checks: each pipeline below is broken in one specif
         -ic way. If the golden runner did                               
      33 - * not reject it, the harness would be giving false confidence.
      34 + * Mutation checks: each pipeline below wraps the real one and 
         +breaks it in one specific way. If                              
      35 + * the golden runner did not reject it, the harness would be gi
         +ving false confidence.                                         
      36   */
      37  describe("golden runner rejects broken pipelines", () => {
      36 -  const reference = createReferencePipeline(allQaDatasets());  
      38 +  const reference = realQaPipeline;                            
     … 59 more lines (ctrl+o to expand)

⏺ Two expected differences from the placeholder prompt. Let me see which
  real-prompt sentence still satisfies the grounding rule:

  Ran 1 shell command (ctrl+o to expand)

⏺ Rule 7's comparison sentence counts as a grounding statement, which makes it a
  loose harness invariant rather than a prompt problem; I'm tightening it to
  require "answer" or "base", and moving the more specific context-loaded check
  to the front. · summary

⏺ Bash(python3 - <<'EOF'
      p='tests/helpers/qa-harness/contract.ts'…)
  ⎿  Test Suites: 8 passed, 8 total
     Tests:       144 passed, 144 total
  ⎿  Updated tests/helpers/qa-harness/contract.ts (+3 -1)
      109      id: "grounded-in-reviews",
      110      rule: "Answers are based only on the supplied reviews.",
      111      alternatives: [
      112 -      [/\bonly\b/i, /\b(supplied|provided)\b/i, /\breviews?\b/
          -i, /\b(answer|base|evidence)/i],                              
      112 +      // "answer|base", not "evidence": S2-013 rule 7 says a c
          +omparison is allowed "only if the                             
      113 +      // supplied reviews ... contain the evidence", which is 
          +not the grounding rule.                                       
      114 +      [/\bonly\b/i, /\b(supplied|provided)\b/i, /\breviews?\b/
          +i, /\b(answer|base)/i],                                       
      115      ],
      116    },
      117    {
  ⎿  Updated tests/helpers/qa-harness/index.ts (+8 -8)
      269    const { expect: expected } = step;
      270    const shouldCall = expected.result !== "error" || expected.m
           odelCalled;
      271  
      272 -  if (expected.result === "error" && DENIED_BEFORE_REVIEW_READ
          -S.includes(expected.error)) {                                 
      273 -    const reads = result.supabaseRequests.filter((request) => 
          -request.resource === "reviews");                              
      274 -    if (reads.length > 0) {                                   
      275 -      throw new QaHarnessAssertionError(                      
      276 -        `Review rows were read ${reads.length} time(s) before 
          -${expected.error} was raised.`,                               
      277 -      );                                                      
      278 -    }                                                         
      279 -  }                                                           
      272    if (expected.result === "error" && expected.contextLoaded ==
           = false) {
      273      if (result.contextBuilds !== 0 || result.supabaseRequests.
           length !== 0) {
      274        throw new QaHarnessAssertionError(
     ...
      277        );
      278      }
      279    }
      280 +  if (expected.result === "error" && DENIED_BEFORE_REVIEW_READ
          +S.includes(expected.error)) {                                 
      281 +    const reads = result.supabaseRequests.filter((request) => 
          +request.resource === "reviews");                              
      282 +    if (reads.length > 0) {                                   
      283 +      throw new QaHarnessAssertionError(                      
      284 +        `Review rows were read ${reads.length} time(s) before 
          +${expected.error} was raised.`,                               
      285 +      );                                                      
      286 +    }                                                         
      287 +  }                                                           
      288  
      289    if (!shouldCall) {
      290      if (result.calls.length !== 0) {

⏺ All 144 pass on the real pipeline. Now renaming the placeholder-specific tests
  and making the prompt-strip helper work at sentence level on the real prompt:

⏺ Bash(python3 - <<'EOF'
      p='tests/unit/qa-harness/prompt-and-evidence-contract.test.ts'…)
  ⎿  tests/unit/qa-harness/golden-cases.test.ts:38:  const reference = real
     QaPipeline;
     tests/unit/qa-harness/golden-cases.test.ts:49:      reference({ ...inp
     … +15 lines (ctrl+o to expand)
  ⎿  Updated tests/unit/qa-harness/harness.test.ts (+1 -1)
      120    });
      121  });
      122  
      123 -describe("reference pipeline citation contract (#79 parseQaMod
          -elReply)", () => {                                            
      123 +describe("real S2-011 citation contract (parseQaModelReply thr
          +ough answerQuestion)", () => {                                
      124    const cited = [restaurantA.reviews[0].id];
      125  
      126    it.each(QA_OUTCOMES.filter((outcome) => outcome !== "answere
           d").map((outcome) => [outcome]))(
  ⎿  Updated tests/unit/qa-harness/prompt-and-evidence-contract.test.ts
     (+27 -8)
       5  jest.mock("server-only", () => ({}));
       6  jest.mock("@/lib/supabase/server", () => ({ createSupabaseServe
          rClient: jest.fn() }));
       7  
       8 -import { getQaDataset } from "../../fixtures/qa/datasets";     
       8 +import { buildSystemPrompt, SYSTEM_PROMPT_VERSION } from "@/ser
         +vices/qa/system-prompt";                                       
       9 +                                                               
      10 +import { allQaDatasets, getQaDataset } from "../../fixtures/qa/
         +datasets";                                                     
      11  import {
      12    expectContextOnlyForTarget,
      13    expectSystemPromptApplied,
     ...
      186  });
      187  
      188  describe("expectSystemPromptApplied: semantic prompt contract"
           , () => {
      187 -  /** Removes every prompt line that states the given rules (t
          -he reference prompt has one per line). */                     
      189 +  /**                                                         
      190 +   * Removes every sentence of the (whitespace-normalised) pro
          +mpt that states one of the given                              
      191 +   * rules. Sentence-level, because the real S2-013 prompt wra
          +ps rules across lines.                                        
      192 +   */                                                         
      193    const strip = (instructions: string, ids: readonly string[])
            =>
      194      instructions
      190 -      .split("\n")                                            
      195 +      .replace(/\s+/g, " ")                                   
      196 +      .split(/(?<=[.!?])\s+/)                                 
      197        .filter(
      192 -        (line) =>                                             
      198 +        (sentence) =>                                         
      199            !QA_SYSTEM_PROMPT_INVARIANTS.some(
      200              (invariant) =>
      201                ids.includes(invariant.id) &&
      202                invariant.alternatives.some((patterns) =>
      197 -                patterns.every((pattern) => pattern.test(line)
          -),                                                            
      203 +                patterns.every((pattern) => pattern.test(sente
          +nce)),                                                        
      204                ),
      205            ),
      206        )
      201 -      .join("\n");                                            
      207 +      .join(" ");                                             
      208  
      203 -  it("the reference pipeline prompt states every rule", async 
          -() => {                                                       
      209 +  it("the request carries exactly the real S2-013 system promp
          +t, which states every rule", async () => {                    
     … 20 more lines (ctrl+o to expand)

⏺ Bash(sed -i '' 's/const reference = realQaPipeline;/const real =
      realQaPipeline;/; s/\breference(/real(/g'
      tests/unit/qa-harness/golden-cases.test.ts && sed -i '' 's…)
  ⎿  7
     Test Suites: 1 failed, 7 passed, 8 total
     Tests:       11 failed, 134 passed, 145 total
  ⎿  Updated tests/unit/qa-harness/assertions.test.ts (+1 -1)
      88        /platform/,
      89      );
      90      rejects(
      91 -      () => expectSystemPromptApplied(request, targetA, { promp
         -tVersion: "s2-013.v2" }),                                      
      91 +      () => expectSystemPromptApplied(request, targetA, { promp
         +tVersion: "not-the-current-version" }),                        
      92        /Prompt version/,
      93      );
      94      rejects(
  ⎿  Updated tests/unit/qa-harness/golden-cases.test.ts (+3 -3)
      35   * the golden runner did not reject it, the harness would be gi
          ving false confidence.
      36   */
      37  describe("golden runner rejects broken pipelines", () => {
      38 -  const reference = realQaPipeline;                            
      38 +  const real = realQaPipeline;                                 
      39    const byId = (id: string): QaGoldenCase => {
      40      const found = QA_GOLDEN_CASES.find((goldenCase) => goldenCa
          se.id === id);
      41      if (!found) throw new Error(`no golden case ${id}`);
     ...
      186        "keeps citations on a decline",
      187        "qa-other-platform-002",
      188        async (input) => ({
      189 -        ...(await reference(input)),                          
      189 +        ...(await real(input)),                               
      190          citedReviewIds: [getQaDataset("restaurantA").reviews[0
           ].id],
      191        }),
      192        /declined reply carries cited reviews/,
     ...
      235      [
      236        "reports a stale prompt version on the answer",
      237        "qa-answer-001",
      238 -      async (input) => ({ ...(await reference(input)), promptV
          -ersion: "s2-013.stale" }),                                    
      238 +      async (input) => ({ ...(await real(input)), promptVersio
          +n: "s2-013.stale" }),                                         
      239        /Answer prompt version s2-013.stale is not/,
      240      ],
      241    ])("fails a pipeline that %s", async (_label, caseId, pipeli
           ne, message) => {

⏺ macOS sed doesn't support \b, so I'll redo the rename with perl:

⏺ Bash(perl -pi -e 's/\breference\(/real(/g'
      tests/unit/qa-harness/golden-cases.test.ts && grep -n "reference"
      tests/unit/qa-harness/golden-cases.test.ts; npx jest --r…)
  ⎿  Test Suites: 8 passed, 8 total
     Tests:       145 passed, 145 total
  ⎿  Updated tests/unit/qa-harness/golden-cases.test.ts (+7 -7)
      46    const tamperRequest =
      47      (rewrite: (request: QaModelRequest) => QaModelRequest): QaP
          ipeline =>
      48      (input) =>
      49 -      reference({ ...input, callModel: (request) => input.callM
         -odel(rewrite(request)) });                                     
      49 +      real({ ...input, callModel: (request) => input.callModel(
         +rewrite(request)) });                                          
      50  
      51    /** The pre-#79 behaviour: silently repair a non-answer by dr
          opping its citations. */
      52    const dropCitationsBeforeValidation: QaPipeline = (input) =>
      53 -    reference({                                                
      53 +    real({                                                     
      54        ...input,
      55        callModel: async (request) => {
      56          const modelReply = await input.callModel(request);
     ...
      147              maxOutputTokens: 0,
      148            })
      149            .catch(() => undefined);
      150 -        return reference(input);                              
      150 +        return real(input);                                   
      151        },
      152        /called 1 time\(s\); expected none/,
      153      ],
     ...
      157        // Sends a correct request, then returns the model's cit
           ations without validating them.
      158        async (input) => {
      159          let sent: QaModelRequest | undefined;
      160 -        await reference({                                     
      160 +        await real({                                          
      161            ...input,
      162            callModel: async (request) => {
      163              sent = request;
     ...
      207        "leaks a foreign marker into the answer text",
      208        "qa-answer-001",
      209        async (input) => {
      210 -        const answer = await reference(input);                
      210 +        const answer = await real(input);                     
      211          return { ...answer, answer: `${answer.answer} QA_USER_
           B_PRIVATE_MARKER` };
      212        },
      213        /Foreign data appeared in the answer/,
     ...
      217        "qa-edge-long-question",
      218        async (input) => {
      219          await input.buildReviewDatasetContext(input.targetId).
           catch(() => undefined);
     … 13 more lines (ctrl+o to expand)

⏺ Now a runtime alignment test for values and error class names (values are
  imported, not type-checked as literals):

⏺ Write(tests/unit/qa-harness/contract-alignment.test.ts)
  ⎿  Wrote 71 lines to tests/unit/qa-harness/contract-alignment.test.ts
       1 /** @jest-environment node */
       2
       3 // S2-003 harness preamble: the real Q&A pipeline imports `serve
         r-only` modules, and the fake
       4 // Supabase is injected through this module mock (the context bu
         ilder has no client seam).
       5 jest.mock("server-only", () => ({}));
       6 jest.mock("@/lib/supabase/server", () => ({ createSupabaseServer
         Client: jest.fn() }));
       7
     … +64 lines (ctrl+o to expand)

⏺ Update(tests/unit/qa-harness/contract-alignment.test.ts)
  ⎿  Added 3 lines, removed 1 line
      60      expect(harness.parseEvidenceRows(request).map((row) => row.
          id)).toEqual(
      61        reviews.map((review) => review.id),
      62      );
      63 -    expect(harness.applicationSuppliedInput(request)).not.toCon
         -tain("battery\\\" last");                                      
      63 +    expect(harness.applicationSuppliedInput(request)).not.toCon
         +tain(                                                          
      64 +      JSON.stringify('Does "battery" last?'),                  
      65 +    );                                                         
      66    });
      67  
      68    it("scripts replies with exactly the structured-output fields
           S2-011 requests", () => {

⏺ Now the integration suite for the real pipeline: isolation, stale context,
  auth/persistence failures, and the input boundary.

⏺ Write(tests/unit/qa-harness/real-pipeline.integration.test.ts)
  ⎿  Wrote 317 lines to
     tests/unit/qa-harness/real-pipeline.integration.test.ts
       1 /** @jest-environment node */
       2
       3 // S2-003 harness preamble: the real Q&A pipeline imports `serve
         r-only` modules, and the fake
       4 // Supabase is injected through this module mock (the context bu
         ilder has no client seam).
       5 jest.mock("server-only", () => ({}));
       6 jest.mock("@/lib/supabase/server", () => ({ createSupabaseServer
         Client: jest.fn() }));
       7
     … +310 lines (ctrl+o to expand)
  Ran 1 shell command (ctrl+o to expand)

⏺ All 31 pass. Now the provider-boundary suite: the real createOpenAiQaModel
  over the fake fetch, behind the real pipeline.

⏺ Write(tests/unit/qa-harness/provider-boundary.test.ts)
  ⎿  Wrote 312 lines to tests/unit/qa-harness/provider-boundary.test.ts
       1 /** @jest-environment node */
       2
       3 // S2-003 harness preamble: the real Q&A pipeline imports `serve
         r-only` modules, and the fake
       4 // Supabase is injected through this module mock (the context bu
         ilder has no client seam).
       5 jest.mock("server-only", () => ({}));
       6 jest.mock("@/lib/supabase/server", () => ({ createSupabaseServer
         Client: jest.fn() }));
       7
     … +305 lines (ctrl+o to expand)

  Ran 1 shell command (ctrl+o to expand)

⏺ 33 pass. Now formatting, lint and typecheck on the changed files.

⏺ Bash(npx prettier --write tests/helpers/qa-harness tests/unit/qa-harness
      tests/fixtures/qa >/dev/null && npm run typecheck 2>&1 | tail -15 && npx
      eslint tests/helper…)
  ⎿  > reviewlens-ai@0.1.0 typecheck
     > next typegen && tsc --noEmit --incremental false
     … +20 lines (ctrl+o to expand)
  ⎿  Updated tests/helpers/qa-harness/contract-alignment.ts (+7 -10)
      11  import type { AuthIdentity } from "@/lib/validation/auth";
      12  import type { QaModelErrorCode } from "@/services/qa/openai-qa-
          client";
      13  import type { QaInputValidationErrorCode } from "@/services/qa/
          qa-request";
      14 -import type { QA_REPLY_JSON_SCHEMA, QaAnswer, QaResponseErrorCo
         -de } from "@/services/qa/qa-response";                         
      14 +import type {                                                  
      15 +  QA_REPLY_JSON_SCHEMA,                                        
      16 +  QaAnswer,                                                    
      17 +  QaResponseErrorCode,                                         
      18 +} from "@/services/qa/qa-response";                            
      19  import type { ReviewContextErrorCode } from "@/services/qa/revi
          ew-context";
      20  import type { PromptReview, QaPromptError } from "@/services/qa
          /system-prompt";
      21  import type { QaBudgetError } from "@/services/qa/token-budget"
          ;
      22  
      19 -import type {                                                  
      20 -  QA_PIPELINE_ERRORS,                                          
      21 -  QaActor,                                                     
      22 -  QaEvidenceRow,                                               
      23 -  QaModelReplyPayload,                                         
      24 -} from "./contract";                                           
      23 +import type { QA_PIPELINE_ERRORS, QaActor, QaEvidenceRow, QaMod
         +elReplyPayload } from "./contract";                            
      24  
      25  type Equal<A, B> =
      26    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ?
           1 : 2 ? true : false;
     ...
      52    // Every harness error entry names a real error class and one
           of its real codes.
      53    Expect<Equal<MisalignedErrors<HarnessErrorEntry>, never>>,
      54    // The scripted reply payload has exactly the S2-011 structur
          ed-output keys...
      56 -  Expect<                                                      
      57 -    Equal<keyof QaModelReplyPayload, (typeof QA_REPLY_JSON_SCHE
         -MA)["required"][number]>                                       
      58 -  >,                                                           
      55 +  Expect<Equal<keyof QaModelReplyPayload, (typeof QA_REPLY_JSON
         +_SCHEMA)["required"][number]>>,                                
      56    // ...and the same field types as the validated answer.
      57    Expect<Equal<QaModelReplyPayload, Pick<QaAnswer, keyof QaMode
          lReplyPayload>>>,
      58    // An evidence row is exactly the S2-013 projection of a Prom
          ptReview.
  ⎿  Updated tests/helpers/qa-harness/contract.ts (+3 -1)
      41  /** The S2-013 decline outcomes, in priority order. Alias kept 
          for harness readability. */
      42  export const QA_DECLINE_OUTCOMES = QA_DECLINE_PRIORITY;
      43  
      44 -export function isDeclineOutcome(outcome: QaOutcome): outcome i
         -s (typeof QA_DECLINE_PRIORITY)[number] {                       
      44 +export function isDeclineOutcome(                              
      45 +  outcome: QaOutcome,                                          
      46 +): outcome is (typeof QA_DECLINE_PRIORITY)[number] {           
      47    return (QA_DECLINE_PRIORITY as readonly QaOutcome[]).includes
          (outcome);
      48  }
      49  
  ⎿  Updated tests/helpers/qa-harness/fake-openai-fetch.ts (+5 -1)
      138  
      139  export function createFakeOpenAiFetch(options: FakeOpenAiFetch
           Options = {}): FakeOpenAiFetch {
      140    const calls: FakeOpenAiCall[] = [];
      141 -  const resolve = (respond: Respond | undefined, fallback: Res
          -pond, body: Record<string, unknown>) => {                     
      141 +  const resolve = (                                           
      142 +    respond: Respond | undefined,                             
      143 +    fallback: Respond,                                        
      144 +    body: Record<string, unknown>,                            
      145 +  ) => {                                                      
      146      const chosen = respond ?? fallback;
      147      return typeof chosen === "function" ? chosen(body) : chose
           n;
      148    };
  ⎿  Updated tests/helpers/qa-harness/fake-supabase.ts (+14 -3)
      159    const fetcher: typeof fetch = async (input, init) => {
      160      const url = new URL(input instanceof Request ? input.url :
            String(input));
      161      const headers = new Headers(input instanceof Request ? inp
           ut.headers : init?.headers);
      162 -    const method = (init?.method ?? (input instanceof Request 
          -? input.method : "GET")).toUpperCase();                       
      162 +    const method = (                                          
      163 +      init?.method ?? (input instanceof Request ? input.method
          + : "GET")                                                     
      164 +    ).toUpperCase();                                          
      165      const token = bearer(headers);
      166      const params = Object.fromEntries(url.searchParams);
      167      const caller = token ? actorsByToken.get(token) : undefine
           d;
     ...
      187  
      188      const rest = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
      189      const table = rest?.[1];
      188 -    requests.push({ kind: "rest", method, resource: table ?? u
          -rl.pathname, params, actorId: caller?.id });                  
      190 +    requests.push({                                           
      191 +      kind: "rest",                                           
      192 +      method,                                                 
      193 +      resource: table ?? url.pathname,                        
      194 +      params,                                                 
      195 +      actorId: caller?.id,                                    
      196 +    });                                                       
      197      if (method !== "GET" || (table !== "analysis_targets" && t
           able !== "reviews")) {
      190 -      return json({ message: `QA harness fake Supabase does no
          -t serve ${method} ${url.pathname}` }, { status: 404 });       
      198 +      return json(                                            
      199 +        { message: `QA harness fake Supabase does not serve ${
          +method} ${url.pathname}` },                                   
      200 +        { status: 404 },                                      
      201 +      );                                                      
      202      }
      203      const failure = failures.get(table);
      204      if (failure !== undefined) {
  ⎿  Updated tests/unit/qa-harness/assertions.test.ts (+2 -1)
      88        /platform/,
      89      );
      90      rejects(
      91 -      () => expectSystemPromptApplied(request, targetA, { promp
         -tVersion: "not-the-current-version" }),                        
      91 +      () =>                                                    
      92 +        expectSystemPromptApplied(request, targetA, { promptVer
         +sion: "not-the-current-version" }),                            
      93        /Prompt version/,
      94      );
      95      rejects(
  ⎿  … 1 more file changed

⏺ Three fixes: widen FAKE_OPENAI_ENV's type, type the actor steps as QaActor,
  and rename useProvider (lint mistakes it for a React hook).

⏺ Bash(python3 - <<'EOF'
      import re…)
  ⎿  LINT_OK
     Test Suites: 11 passed, 11 total
     Tests:       209 passed, 209 total
  ⎿  Updated tests/helpers/qa-harness/fake-openai-fetch.ts (+1 -1)
      13  export const FAKE_OPENAI_RESPONSES_URL = "https://api.openai.co
          m/v1/responses";
      14  
      15  /** A synthetic environment that enables Q&A without any real c
          redential. */
      16 -export const FAKE_OPENAI_ENV = Object.freeze({                 
      16 +export const FAKE_OPENAI_ENV: Readonly<Record<string, string | 
         +undefined>> = Object.freeze({                                  
      17    QA_ENABLED: "true",
      18    OPENAI_API_KEY: "qa-harness-synthetic-key-not-live",
      19    OPENAI_QA_MODEL: "qa-harness-synthetic-model",
  ⎿  Updated tests/unit/qa-harness/provider-boundary.test.ts (+11 -11)
      48  let provider: FakeOpenAiFetch;
      49  
      50  /** The harness fake model is bypassed; the real OpenAI adapter
           becomes `callModel`. */
      51 -function useProvider(options: FakeOpenAiFetchOptions = {}, env 
         -= FAKE_OPENAI_ENV) {                                           
      51 +function withProvider(options: FakeOpenAiFetchOptions = {}, env
         + = FAKE_OPENAI_ENV) {                                          
      52    provider = createFakeOpenAiFetch(options);
      53    const callModel = createOpenAiQaModel({ fetcher: provider.fet
          cher, env });
      54    return callModel;
      55  }
      56  
      57 -let callModel = useProvider();                                 
      57 +let callModel = withProvider();                                
      58  const qa = setupQaTestHarness(() => ({
      59    pipeline: (input) => realQaPipeline({ ...input, callModel }),
      60  }));
      61  
      62  beforeEach(() => {
      63 -  callModel = useProvider();                                   
      63 +  callModel = withProvider();                                  
      64  });
      65  
      66  async function ask(targetId = targetA.target.id, question = QUE
          STION) {
     ...
      110      await ask();
      111      const [generation] = provider.generationCalls();
      112      expect(generation.body).toEqual({
      113 -      model: FAKE_OPENAI_ENV.OPENAI_QA_MODEL,                 
      113 +      model: "qa-harness-synthetic-model",                    
      114        instructions: expect.any(String),
      115        input: expect.any(String),
      116        max_output_tokens: QA_RESERVED_OUTPUT_TOKENS,
     ...
      126      });
      127      expect(generation).toMatchObject({ method: "POST", cache: 
           "no-store", hasAbortSignal: true });
      128      expect(generation.headers).toMatchObject({
      129 -      authorization: `Bearer ${FAKE_OPENAI_ENV.OPENAI_API_KEY}
          -`,                                                            
      129 +      authorization: "Bearer qa-harness-synthetic-key-not-live
          +",                                                            
      130        "content-type": "application/json",
      131      });
      132    });
     ...
      169  
      170  describe("provider replies", () => {
     … 45 more lines (ctrl+o to expand)
  ⎿  Updated tests/unit/qa-harness/real-pipeline.integration.test.ts (+2
     -1)
      29    setupQaTestHarness,
      30    SYSTEM_PROMPT_VERSION,
      31    toReviewRow,
      32 +  type QaActor,                                                
      33    type QaAskResult,
      34    type QaModelRequest,
      35    type QaPipelineErrorKey,
     ...
      142    });
      143  
      144    it("alternating users each see only their own data", async (
           ) => {
      144 -    const steps: [typeof userA, QaFixtureDataset][] = [       
      145 +    const steps: [QaActor, QaFixtureDataset][] = [            
      146        [userA, targetA],
      147        [userB, userBPrivate],
      148        [userA, targetB],

⏺ Typecheck, lint and all 209 harness tests pass. I'll confirm the compile-time
  check actually fails on a bad code by adding a bogus entry temporarily:

  Ran 1 shell command (ctrl+o to expand)

⏺ The check catches it, and the file is restored. Now the README harness
  section.

⏺ Bash(python3 - <<'EOF'
      p='README.md'…)
  ⎿   README.md | 147 ++++++++++++++++++++++++++++++++++++++++++-----------
     ---------
      1 file changed, 101 insertions(+), 46 deletions(-)
  ⎿  Updated README.md (+101 -46)
      175  
      176  ### Deterministic Q&A test harness (S2-003)
      177  
      178 -Q&A tests never call OpenAI, the network, or a live Supabase p
          -roject. The harness swaps the model                           
      179 -seam (`QaModelCaller`) for a scripted fake, records every requ
          -est sent to it, and blocks all                                
      180 -network access while a test runs.                             
      178 +Q&A tests never call OpenAI, the network, or a live Supabase p
          +roject. Each question runs through                            
      179 +the **real** Q&A pipeline with only the infrastructure underne
          +ath it faked. The harness records                             
      180 +every request sent to the model and to Supabase, and blocks al
          +l network access while a test runs.                           
      181 +                                                              
      182 +**What is real and what is faked.**                           
      183 +                                                              
      184 +| Layer                                                       
          +                 | In the harness                             
          +                                        |                     
      185 +| ------------------------------------------------------------
          +---------------- | -------------------------------------------
          +--------------------------------------- |                     
      186 +| `answerQuestion` (S2-011), `runGroundedQaRequest`, input lim
          +its              | **Real**                                   
          +                                        |                     
      187 +| `buildReviewDatasetContext` (S2-010), ownership guard, targe
          +t repository     | **Real** (wrapped only to count calls; neve
          +r replaced)                             |                     
      188 +| `getAuthenticatedUser` (S1-009)                             
          +                 | **Real**: verifies a fake session against a
          + fake `/auth/v1/user`                   |                     
      189 +| supabase-js query builders and response parsing             
          +                 | **Real** client; only its `fetch` is replac
          +ed                                      |                     
      190 +| `buildQaModelRequest` / system prompt (S2-013), `parseQaMode
          +lReply` (S2-011) | **Real**                                   
          +                                        |                     
      191 +| `createOpenAiQaModel` (S2-011)                              
          +                 | **Real** in the provider-boundary suite, ov
          +er a fake `fetch`                       |                     
      192 +| `createSupabaseServerClient` (cookies, Next headers)        
          +                 | Faked: Jest module mock returning the fake 
          +Supabase client                         |                     
      193 +| Supabase HTTP (auth + PostgREST)                            
          +                 | Faked: `fake-supabase.ts` over the fixture 
          +rows                                    |                     
      194 +| The model (`callModel`)                                     
          +                 | Faked: scripted `fake-model.ts`, or the Ope
          +nAI adapter over `fake-openai-fetch.ts` |                     
      195 +                                                              
      196 +> **The fake Supabase does not emulate Row Level Security.** R
          +ows are filtered only by the                                  
      197 +> query's own filters, so every cross-user and wrong-target de
          +nial these tests prove comes from                             
      198 +> the **application-layer** checks (session verification, `get
          +OwnedTargetOrThrow`, the S2-010                               
      199 +> row checks). RLS itself is tested against real PostgreSQL by
          + `npm run test:db`.                                           
      200 +                                                              
      201 +| Path                                             | Contents 
          +                                                              
          +              |                                               
      202 +| ------------------------------------------------ | ---------
          +--------------------------------------------------------------
          +------------- |                                               
      203 +| `tests/helpers/qa-harness/`                      | Harness: 
          +real-pipeline adapter, fakes, network guard, assertions, golde
          +n-case runner |                                               
      204 +| `tests/helpers/qa-harness/contract.ts`           | Re-export
          +s of the production Q&A types and constants, plus harness-owne
          +d error table |                                               
      205 +| `tests/helpers/qa-harness/contract-alignment.ts` | Compile-t
          +ime checks that harness types and error codes match production
          +              |                                               
      206 +| `tests/helpers/qa-harness/fake-supabase.ts`      | Real supa
          +base-js client over a fake `fetch`: fake session, PostgREST su
          +bset          |                                               
      207 +| `tests/helpers/qa-harness/fake-openai-fetch.ts`  | Fake Open
          +AI Responses endpoints for `createOpenAiQaModel({ fetcher })` 
          +              |                                               
      208 +| `tests/fixtures/qa/datasets.ts`                  | Synthetic
          + datasets: normal, empty, mixed ratings, Target A/B, User B, m
          +alformed rows |                                               
      209 +| `tests/fixtures/qa/golden-cases.ts`              | Table of 
          +golden Q&A cases                                              
          +              |                                               
      210 +| `tests/unit/qa-harness/`                         | Golden su
          +ite, integration and provider-boundary suites, harness self-te
          +sts           |                                               
      211 +                                                              
     … 129 more lines (ctrl+o to expand)

  Searched for 1 pattern (ctrl+o to expand)

⏺ Only historical transcripts mention it. Checking whether any test outside the
  harness imports it:

  Ran 2 shell commands (ctrl+o to expand)

⏺ Nothing outside the harness imports it, and src/ and teammates' tests are
  untouched. Running the full gate: format:check, lint, typecheck, test, build.

  Ran 3 shell commands (ctrl+o to expand)

⏺ Everything is green. Now the integration suites three times in a row, plus the
  changed-coverage gate:

  Ran 2 shell commands (ctrl+o to expand)

⏺ The integration suites passed 3 out of 3 runs, and the coverage gate passes.
  One last check that no existing harness test was dropped:

  Ran 1 shell command (ctrl+o to expand)

⏺ The S2-003 integration work is finished, and nothing is committed or pushed.
  Everything is in the working tree on feature/s2-003-real-qa-integration. The
  24 golden cases plus 4 new authorization cases now run through the real
  answerQuestion() with the real authenticated buildReviewDatasetContext(). All
  checks pass and the integration suites passed 3 out of 3 runs. No production
  code or teammate files were changed: git diff -- src tests/unit/services is
  empty, and only tests/ and README.md changed.

  What changed

  New files
  - tests/helpers/qa-harness/fake-supabase.ts: a real supabase-js client with an
    injected fetch. It serves a fake /auth/v1/user session check, so the real
    getAuthenticatedUser runs. It also serves the target and review queries
    (select, eq., order, limit, exact count) and records every request with the
    user it came from. It does not emulate RLS.
  - tests/helpers/qa-harness/real-pipeline.ts: realQaPipeline calls the real
    answerQuestion. countingContextBuilder wraps the real builder only to count
    calls. bindFakeSupabase hooks the fake into the mocked
    createSupabaseServerClient, and throws an error that prints the required
    preamble if the mock is missing.
  - tests/helpers/qa-harness/fake-openai-fetch.ts: fakes the two OpenAI
    endpoints, with a synthetic env.
  - tests/helpers/qa-harness/contract-alignment.ts: compile-time checks only,
    covering error-code membership and the shapes of the reply payload, evidence
    rows and actor. I checked that a bogus code fails typecheck.
  - tests/unit/qa-harness/real-pipeline.integration.test.ts (27 tests),
    provider-boundary.test.ts (33) and contract-alignment.test.ts (4).

  Changed
  - contract.ts now re-exports the production types and constants (prompt
    version, outcomes, budgets, platform labels). They're imported at runtime
    and checked for identity in tests, as you asked.
  - The fake model throws the real QaModelError.
  - The golden runner now checks the prompt version. It also fails if any review
    row is read before an auth or input-validation error, and a step can
    require that the context builder never ran (contextLoaded: false).
  - The long-question case now expects
    QaInputValidationError/QA_QUESTION_TOO_LONG with zero builder, Supabase and
    model calls. qa-other-platform-001 still expects UNEXPECTED_CITATIONS.
  - Deleted reference-pipeline.ts. The 3 self-tests that depended on its
    placeholder prompt were rewritten to use the real S2-013 prompt; no test was
    dropped. The harness went from 100 tests to 209.

  One harness fix: running the prompt checks against the real prompt showed that
  the "grounded in reviews" check was also matched by rule 7's comparison
  sentence ("…only if the supplied reviews… contain the evidence"). I tightened
  that check. This was a harness weakness, not a prompt problem.

  Test evidence

  format:check            exit 0  All matched files use Prettier code style!
  lint                    exit 0
  typecheck               exit 0
  npm test                exit 0  Test Suites: 70 passed · Tests: 1273 passed
  build                   exit 0  ✓ Compiled successfully
  coverage:changed        exit 0  No coverable changed source lines. PASS
  integration ×3          108/108 passed each run (≈0.52 s)
  skip/todo/only search   none in harness

  ---

  PR description draft

  Written for: teammates reviewing this PR on GitHub.

  S2-003: Run the deterministic Q&A harness against the real pipeline

  Refs #54

  Summary

  Follow-up to #83. The golden Q&A cases now run through the real
  answerQuestion() with the real authenticated buildReviewDatasetContext(). Only
  infrastructure is faked: Supabase HTTP, the session, and the model or OpenAI
  fetch. The test-only reference pipeline is removed.

  What is real vs faked

  - Real:
    - Orchestration and limits: answerQuestion and runGroundedQaRequest,
      including the input limits.
    - Auth and data: buildReviewDatasetContext, getAuthenticatedUser,
      getOwnedTargetOrThrow and the repository, and the supabase-js query
      builders and response parsing.
    - Prompt and reply: buildQaModelRequest and the system prompt,
      parseQaModelReply.
    - createOpenAiQaModel, in the provider-boundary suite.
  - Faked:
    - createSupabaseServerClient, via a Jest module mock.
    - Supabase HTTP, via fake-supabase.ts.
    - The model, via fake-model.ts, or fake-openai-fetch.ts for the provider
      suite.
  - RLS is not emulated. The isolation proven here comes from application-layer
    checks. RLS is covered by npm run test:db.

  Coverage added

  - Cross-user isolation: a foreign target is denied before any review read and
    looks identical to a missing one. Users alternating, and an echoing model on
    every User A dataset, never surface User B's data.
  - Wrong-target isolation: malformed, non-string and object target IDs are
    rejected without any table read.
  - Stale context:
    - Context is rebuilt on every call (an added row appears, removed rows give
      NO_REVIEW_DATA).
    - A target that changes owner mid-conversation is denied on the next
      question.
    - A user switch is denied, and A → B → A sends only the active target each
      time.
  - Auth failures: no session, a rejected session (401) and an auth outage (500)
    all lead to zero model calls. A missing session also makes zero Supabase
    requests, and nothing private is logged.
  - Input limits: an over-long question gives QA_QUESTION_TOO_LONG (and a
    non-string one QA_QUESTION_INVALID_TYPE) with zero builder calls, Supabase
    requests or model calls. The trimmed-length boundary is tested.
  - Provider budget: this is a separate case. 14,500 counted tokens generates;
    14,501 gives QaPromptError/REQUEST_TOO_LARGE with no generation call.
  - Provider boundary:
    - The outgoing body: store: false, the instructions/input split,
      max_output_tokens, the strict JSON schema, and a count body that matches
      the generation body.
    - Every error mapping: HTTP 429, 401, 400, 500 and 408; network error;
      timeout; non-JSON; incomplete; refusal; empty output; prose; foreign
      citation; cited decline.
    - A failed token count never generates.
    - With the env cleared, the result is QA_DISABLED with zero fetches.

  Test evidence

  format:check, lint, typecheck, npm test (70 suites / 1,273 tests), build and
  coverage:changed all pass. The integration suites ran 3× (108/108 each). No
  skipped or todo tests.

  Findings for owners (production code not changed)

  1. Empty-question ordering (S2-011): a whitespace-only question passes
     assertValidQuestion, so auth and both Supabase queries run before
     buildQaModelRequest throws EMPTY_QUESTION. The model is never called, but
     data is loaded unnecessarily. Suggestion: reject an empty trimmed question
     in assertValidQuestion.
  2. Unreachable QaPromptError codes (S2-013): with the real builder,
     QaPromptError NO_REVIEW_DATA and REVIEW_TARGET_MISMATCH can't happen. The
     builder throws ReviewContextError NO_REVIEW_DATA or
     REVIEW_CONTEXT_UNAVAILABLE first. They're still a valid last line of
     defense, but no test can reach them through the real pipeline.
  3. Equal byte limits (S2-011): QA_MAX_REQUEST_BYTES (the service boundary) and
     MAX_COUNTABLE_REQUEST_BYTES (the adapter) are both 131,072, and the
     service check runs first, so the adapter check is effectively unreachable.
     With a 2,000-character question and 32 KiB of evidence, the
     service-boundary limit (QA_REQUEST_TOO_LARGE) also looks unreachable in
     practice.
  4. Seam: buildReviewDatasetContext and getAuthenticatedUser call
     createSupabaseServerClient() directly, so tests must module-mock
     @/lib/supabase/server. An optional client-factory parameter would remove
     that need.

  AI use

  Claude Code (Claude Opus) was used to read the merged code, propose the plan
  (approved with changes), write the test helpers, suites and README section,
  and run every check above. All changes were reviewed by the author. No
  production code was generated or modified.

  🤖 Generated with Claude Code (https://claude.com/claude-code)

  ---

  What teammates need to know

  - Preamble: every test file that imports tests/helpers/qa-harness must start
    with:
  jest.mock("server-only", () => ({}));
  jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient:
  jest.fn() }));
  - createQaTestHarness / setupQaTestHarness:
    - ask(targetId, question) returns calls, contextBuilds and supabaseRequests.
    - setActor(actor | null) changes the signed-in user; null signs out.
    - supabase.setAuthMode("rejected" | "unavailable") and
      supabase.failTable(table, status) simulate failures, and supabase.tables
      holds the editable rows.
  - realQaPipeline: wrap it to substitute callModel, for example
    createOpenAiQaModel({ fetcher, env: FAKE_OPENAI_ENV }).
  - createFakeOpenAiFetch with openAi.* builders: countCalls() and
    generationCalls() return the recorded request bodies.
  - Golden steps now take actor: "anonymous", auth?, and expect.contextLoaded:
    false.
  - Production changes that will affect this harness: adding a new error code is
    fine. Renaming a code that the harness lists will fail typecheck. Bumping
    the prompt version, budgets or outcome lists needs no harness change.

  Possible commit split, if useful: (1) contract and alignment check, (2) fake
  Supabase and the real-pipeline adapter (including removing the reference
  pipeline), (3) golden cases and ported self-tests, (4) integration suite, (5)
  fake OpenAI fetch and provider suite, (6) README.

❯ NOw I can just commit, push and create a PR ??

⏺ Yes, it's ready. Every check passed on the current working tree. A few things
  to keep in mind:

  1. Stage everything, including the deletion. reference-pipeline.ts is deleted
     on disk but not staged, so use git add -A (or git add tests README.md) so
     the removal goes in.
  2. Keep it "Refs #54". Don't let GitHub's PR form or a commit message add
     "Closes" or "Fixes", because those would close the issue on merge.
  3. Base is main. Your branch already tracks
     origin/feature/s2-003-real-qa-integration, so a plain git push works.
  4. AI transcript, if your team requires one. Teammates have been adding logs
     to ai-transcripts/ (yours from #83 is
     2026-11-13_deep_S2-003_claude-code.md). If that's expected for this PR, add
     one before pushing.

  As one commit:
  git add -A
  git status            # should show only README.md and files under tests/
  git commit -m "S2-003: run Q&A harness against the real pipeline (Refs #54)"
  git push
  gh pr create --base main --title "S2-003: Run the deterministic Q&A harness
  against the real pipeline" --body-file pr.md
  Save the PR description draft from my last message as pr.md first. Or skip
  --body-file and paste it into the GitHub form.

  If you'd rather have small commits, the 6-way split I suggested works. Stage
  each group by path, for example git add tests/helpers/qa-harness/contract.ts
  tests/helpers/qa-harness/contract-alignment.ts
  tests/unit/qa-harness/contract-alignment.test.ts for the first. Make sure the
  deletion goes in with the fake-Supabase/adapter commit, so each commit still
  type-checks.

  After you push, check that CI's S2-001 coverage gate is green. It passed
  locally with "Nothing to gate", since no src/ lines changed.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status
  On branch feature/s2-003-real-qa-integration
  Your branch is up to date with 'origin/feature/s2-003-real-qa-integration'.

  Changes to be committed:
    (use "git restore --staged <file>..." to unstage)
          modified:   README.md
          modified:   tests/fixtures/qa/golden-cases.ts
          new file:   tests/helpers/qa-harness/contract-alignment.ts
          modified:   tests/helpers/qa-harness/contract.ts
          modified:   tests/helpers/qa-harness/fake-model.ts
          new file:   tests/helpers/qa-harness/fake-openai-fetch.ts
          new file:   tests/helpers/qa-harness/fake-supabase.ts
          modified:   tests/helpers/qa-harness/index.ts
          new file:   tests/helpers/qa-harness/real-pipeline.ts
          deleted:    tests/helpers/qa-harness/reference-pipeline.ts
          modified:   tests/unit/qa-harness/assertions.test.ts
          new file:   tests/unit/qa-harness/contract-alignment.test.ts
          modified:   tests/unit/qa-harness/determinism.test.ts
          modified:   tests/unit/qa-harness/fake-model.test.ts
          modified:   tests/unit/qa-harness/fixtures.test.ts
          modified:   tests/unit/qa-harness/golden-cases.test.ts
          modified:   tests/unit/qa-harness/harness.test.ts
          modified:   tests/unit/qa-harness/network-guard.test.ts
          modified:
  tests/unit/qa-harness/prompt-and-evidence-contract.test.ts
          new file:   tests/unit/qa-harness/provider-boundary.test.ts
          new file:   tests/unit/qa-harness/real-pipeline.integration.test.ts

  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m "S2-003: run
  Q&A harness against the real pipeline (Refs #54)"

  [feature/s2-003-real-qa-integration 78ddd3c] S2-003: run Q&A harness against
  the real pipeline (Refs #54)
   21 files changed, 1823 insertions(+), 440 deletions(-)
   create mode 100644 tests/helpers/qa-harness/contract-alignment.ts
   create mode 100644 tests/helpers/qa-harness/fake-openai-fetch.ts
   create mode 100644 tests/helpers/qa-harness/fake-supabase.ts
   create mode 100644 tests/helpers/qa-harness/real-pipeline.ts
   delete mode 100644 tests/helpers/qa-harness/reference-pipeline.ts
   create mode 100644 tests/unit/qa-harness/contract-alignment.test.ts
   create mode 100644 tests/unit/qa-harness/provider-boundary.test.ts
   create mode 100644 tests/unit/qa-harness/real-pipeline.integration.test.ts
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git push
  Enumerating objects: 50, done.
  Counting objects: 100% (50/50), done.
  Delta compression using up to 12 threads
  Compressing objects: 100% (28/28), done.
  Writing objects: 100% (29/29), 30.43 KiB | 10.14 MiB/s, done.
  Total 29 (delta 16), reused 0 (delta 0), pack-reused 0 (from 0)
  remote: Resolving deltas: 100% (16/16), completed with 16 local objects.
  To https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six.git
     8e70172..78ddd3c  feature/s2-003-real-qa-integration ->
  feature/s2-003-real-qa-integration
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %

⏺ The commit and push worked. All 21 files went in, including the
  reference-pipeline.ts deletion, and the branch on GitHub is now at 78ddd3c.
  All that's left is opening the PR. I'll save the description to a file outside
  the repo so you don't have to copy it from chat.

  Made 1 scratchpad edit +80 (ctrl+o to expand)

⏺ The PR description is saved outside the repo, so it won't end up in a commit.
  To open the PR, run:

  gh pr create --base main \
    --title "S2-003: Run the deterministic Q&A harness against the real
  pipeline" \
    --body-file /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Len
  s-AI-Fantastic-Six/4e9264ab-3f4a-4c88-be9b-3653886099bd/scratchpad/pr.md

  You can also open the file and paste its contents into the GitHub form. The
  body uses "Refs #54", so merging won't close the issue. If GitHub's form
  suggests a "Closes" keyword, leave it out.

  After the PR is open:
  - CI: check that it's green, especially the S2-001 coverage gate. It passed
    locally with "Nothing to gate", because no src/ lines changed.
  - Reviewers: ask Shawn to look at fake-supabase.ts and the real-pipeline
    adapter (both build on his test pattern). Ask Aryan to look at findings 1–3,
    which concern his code.
  - Transcript: if your team expects an AI transcript in ai-transcripts/ for
    each PR, add one in a follow-up commit on this branch.

[Image #1]

❯ what should the title, description and reviewer  of PR be?? and the base is
  main

⏺ The base main is correct. I'll look up teammates' GitHub handles from the
  history of the files this PR touches:

  Ran 1 shell command (ctrl+o to expand)

⏺ Fill in the form like this:

  Title (replace the one GitHub pre-filled; keep "Refs #54" out of the title):
  S2-003: Run the deterministic Q&A harness against the real pipeline

  Description: copy the prepared text to your clipboard with this command, then
  paste it into the description box:
  pbcopy < /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-
  Fantastic-Six/4e9264ab-3f4a-4c88-be9b-3653886099bd/scratchpad/pr.md
  It starts with Refs #54. Check the Preview tab to confirm it renders, and
  don't add "Closes" or "Fixes" anywhere. Issue #54 has to stay open.

  Reviewers (click the gear next to "Reviewers"). The branch needs at least one
  approval to merge.
  - shawnd121 (Shawn): the PR runs his real S2-010 buildReviewDatasetContext,
    and fake-supabase.ts builds on his test pattern. He made the original
    requirements, so he's the most important reviewer.
  - aum-2004 (Aryan): owns S2-011 and S2-013. Findings 1–3 in the description
    are about his code (the empty-question ordering, the unreachable
    QaPromptError codes, and the equal byte limits).

  Other fields:
  - Assignee: click "assign yourself".
  - Labels, Projects, Milestone: follow whatever your team used on #83. Leave
    them empty if nothing was set.
  - Development: leave it empty. Linking issue #54 there would close it on
    merge, the same as a closing keyword.

  Then click Create pull request.

❯ waht about the PR description still need one, that whole field is blank

⏺ The description box stays blank until you paste into it. Run this in your
  terminal; it prints nothing but copies the description to your clipboard:

  pbcopy < /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-
  Fantastic-Six/4e9264ab-3f4a-4c88-be9b-3653886099bd/scratchpad/pr.md

  Then click in the description box and press ⌘V.

  Or copy everything inside the block below and paste it in:

  Refs #54

  ## Summary

  Follow-up to #83. The golden Q&A cases now run through the **real**
  `answerQuestion()` with the **real** authenticated
  `buildReviewDatasetContext()`. Only infrastructure is faked: Supabase HTTP,
  the session, and the model or OpenAI fetch. The test-only reference pipeline
  is removed.

  ## What is real vs faked

  - **Real:**
    - Orchestration and limits: `answerQuestion` and `runGroundedQaRequest`,
  including the input limits.
    - Auth and data: `buildReviewDatasetContext`, `getAuthenticatedUser`,
  `getOwnedTargetOrThrow` and the repository, and the supabase-js query builders
  and response parsing.
    - Prompt and reply: `buildQaModelRequest` and the system prompt,
  `parseQaModelReply`.
    - `createOpenAiQaModel`, in the provider-boundary suite.
  - **Faked:**
    - `createSupabaseServerClient`, via a Jest module mock.
    - Supabase HTTP, via `fake-supabase.ts`.
    - The model, via `fake-model.ts`, or `fake-openai-fetch.ts` for the provider
  suite.
  - **RLS is not emulated.** The isolation proven here comes from
  application-layer checks. RLS is covered by `npm run test:db`.

  ## Coverage added

  - **Cross-user isolation:** a foreign target is denied before any review read
  and looks identical to a missing one. Users alternating, and an echoing model
  on every User A dataset, never surface User B's data.
  - **Wrong-target isolation:** malformed, non-string and object target IDs are
  rejected without any table read.
  - **Stale context:**
    - Context is rebuilt on every call (an added row appears, removed rows give
  `NO_REVIEW_DATA`).
    - A target that changes owner mid-conversation is denied on the next
  question.
    - A user switch is denied, and A → B → A sends only the active target each
  time.
  - **Auth failures:** no session, a rejected session (401) and an auth outage
  (500) all lead to zero model calls. A missing session also makes zero Supabase
  requests, and nothing private is logged.
  - **Input limits:** an over-long question gives
  `QaInputValidationError`/`QA_QUESTION_TOO_LONG` (and a non-string one
  `QA_QUESTION_INVALID_TYPE`) with zero builder calls, Supabase requests or
  model calls. The trimmed-length boundary is tested.
  - **Provider budget:** this is a separate case. 14,500 counted tokens
  generates; 14,501 gives `QaPromptError`/`REQUEST_TOO_LARGE` with no generation
  call.
  - **Provider boundary:**
    - The outgoing body: `store: false`, the instructions/input split,
  `max_output_tokens`, the strict JSON schema, and a count body that matches the
  generation body.
    - Every error mapping: HTTP 429, 401, 400, 500 and 408; network error;
  timeout; non-JSON; incomplete; refusal; empty output; prose; foreign citation;
  cited decline.
    - A failed token count never generates.
    - With the env cleared, the result is `QA_DISABLED` with zero fetches.
  - **Contract alignment:** production types and constants are re-exported,
  never copied. `contract-alignment.ts` fails `npm run typecheck` if a harness
  error code is not a member of its production error's code type, or if the
  reply payload or evidence-row shapes drift. Values teammates may bump (prompt
  version, budgets, outcome lists) are imported at runtime and asserted in
  tests. `qa-other-platform-001` still expects `UNEXPECTED_CITATIONS`.

  ## Test Evidence

  ```
  format:check            exit 0  All matched files use Prettier code style!
  lint                    exit 0
  typecheck               exit 0
  npm test                exit 0  Test Suites: 70 passed · Tests: 1273 passed
  build                   exit 0  ✓ Compiled successfully
  coverage:changed        exit 0  No coverable changed source lines. PASS
  integration suites ×3   108/108 passed each run (≈0.52 s)
  ```

  No skipped, todo or `.only` tests. No real network and no `OPENAI_API_KEY`:
  the network guard is installed throughout and provider env vars are scrubbed.

  ## Findings for owners (production code not changed)

  1. **Empty-question ordering (S2-011):** a whitespace-only question passes
  `assertValidQuestion`, so auth and both Supabase queries run before
  `buildQaModelRequest` throws `EMPTY_QUESTION`. The model is never called, but
  data is loaded unnecessarily. Suggestion: reject an empty trimmed question in
  `assertValidQuestion`.
  2. **Unreachable `QaPromptError` codes (S2-013):** with the real builder,
  `QaPromptError` `NO_REVIEW_DATA` and `REVIEW_TARGET_MISMATCH` can't happen.
  The builder throws `ReviewContextError` `NO_REVIEW_DATA` or
  `REVIEW_CONTEXT_UNAVAILABLE` first. They're still a valid last line of
  defense, but no test can reach them through the real pipeline.
  3. **Equal byte limits (S2-011):** `QA_MAX_REQUEST_BYTES` (the service
  boundary) and `MAX_COUNTABLE_REQUEST_BYTES` (the adapter) are both 131,072,
  and the service check runs first, so the adapter check is effectively
  unreachable. With a 2,000-character question and 32 KiB of evidence, the
  service-boundary limit (`QA_REQUEST_TOO_LARGE`) also looks unreachable in
  practice.
  4. **Seam:** `buildReviewDatasetContext` and `getAuthenticatedUser` call
  `createSupabaseServerClient()` directly, so tests must module-mock
  `@/lib/supabase/server`. An optional client-factory parameter would remove
  that need.

  ## Interfaces teammates should know about

  - **Preamble:** every test file that imports `tests/helpers/qa-harness` must
  start with:
    ```ts
    jest.mock("server-only", () => ({}));
    jest.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient:
  jest.fn() }));
    ```
  - **`createQaTestHarness` / `setupQaTestHarness`:**
    - `ask(targetId, question)` returns `calls`, `contextBuilds` and
  `supabaseRequests`.
    - `setActor(actor | null)` changes the signed-in user; `null` signs out.
    - `supabase.setAuthMode("rejected" | "unavailable")` and
  `supabase.failTable(table, status)` simulate failures, and `supabase.tables`
  holds the editable rows.
  - **`realQaPipeline`:** wrap it to substitute `callModel`, for example
  `createOpenAiQaModel({ fetcher, env: FAKE_OPENAI_ENV })`.
  - **`createFakeOpenAiFetch` with `openAi.*` builders:** `countCalls()` and
  `generationCalls()` return the recorded request bodies.
  - **Golden steps** now take `actor: "anonymous"`, `auth?`, and
  `expect.contextLoaded: false`.
  - **Production changes that will affect this harness:** adding a new error
  code is fine. Renaming a code that the harness lists will fail typecheck.
  Bumping the prompt version, budgets or outcome lists needs no harness change.

  ## AI use

  Claude Code (Claude Opus) was used to read the merged code, propose the plan
  (approved with changes), write the test helpers, suites and README section,
  and run every check above. All changes were reviewed by the author. No
  production code was generated or modified.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  After pasting, open the Preview tab to check that the headings and code blocks
  look right, and that the first line reads Refs #54.

❯ once again best person to be assigned as reviwer for this PR S2-003: Run the
  deterministic Q&A harness against the real pipeline - #90
  #90
⏺ The best reviewer for #90 is shawnd121 (Shawn).
  - He asked for this follow-up, and the requirements came from his review.
  - The PR runs his real S2-010 buildReviewDatasetContext, and fake-supabase.ts
    extends his supabase-js test pattern. He's the best person to confirm the
    auth and ownership checks are tested properly and not faked.

  Add aum-2004 (Aryan) as a second reviewer.
  - He owns the code most of the tests run against: answerQuestion, the system
    prompt, reply validation and the OpenAI adapter.
  - Findings 1–3 in the description are about his code, so he should see them.

  The branch needs at least one approval to merge. Shawn's matters most, but
  requesting both is better.

  To add them from the terminal:
  gh pr edit 90 --add-reviewer shawnd121,aum-2004

❯ shawn — 7:08 PM
  @Deep
  Changes requested for #90 at 78ddd3c: one transcript requirement remains. No
  blocking code defect found.

  The integration addresses the agreed S2-003 follow-up:
  Golden cases use real authentication, context construction, orchestration and
  response validation.
  Long-question rejection and provider-token-budget rejection are tested
  separately.
  Ownership failures, user/target switching, refreshed persisted data and
  provider failures are covered.
  The reference pipeline is removed; production contracts are reused.
  I independently verified:
  1,273 tests passed across 70 suites.
  104 tests passed in the three integration suites.
  All four deliberate faults were caught: ownership-filter removal, disabled
  question-length rejection, accepted cited declines and an incorrect token
  boundary.
  Typecheck, focused lint/formatting and both CI jobs passed.
  Required before approval: #90 declares AI assistance but adds/updates no
  transcript and links none. §6 requires the complete available session and a
  PR link. Save the new session with redactions and accepted/changed/rejected
  notes. The earlier #83 transcript exception doesn’t document this new work.
  DO NOT COMMIT OR PUSH

⏺ I'll check the transcript rules (§6) and how earlier transcripts are
  formatted, and look at the change to contract.ts.

  Ran 1 shell command (ctrl+o to expand)

⏺ HEAD is now on different commits (ad59a2c fix(S2-013)…), so you may have
  switched branches. Checking before I touch anything:

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

  Request ID: req_011Ch3tpD1PWeCXUdEjgTaz9

  Message ID: msg_011Ch3tpEZ9ku1hxAdQacczS

❯ the shwan's  review only blocker is the trasncirpt right

⏺ Opus 5.5's safeguards stopped the response above · continuing once
  with that noted

⏺ API Error: Opus 5.5's safeguards flagged this message
  (https://www.anthropic.com/legal/aup). This sometimes happens with
  safe, normal conversations. Claude Code can't respond to this message
  with Opus 5.5.

  Try rephrasing the request in a new session or change your model.

  Learn more: https://support.claude.com/en/articles/8106465

  Details: `[reasoning_extraction]`

  Request ID: req_011Ch3u4LA8q3RjPZGyyhFsM

  Message ID: msg_011Ch3u4LYSyRyZkyntXWV9h