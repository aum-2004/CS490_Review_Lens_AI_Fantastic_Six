# S2-016 Cross-User AI Context Security

## Phase 1 boundary

The reusable synthetic fixture in
`tests/fixtures/cross-user-ai-context.synthetic.ts` represents two authenticated users, two owned
AnalysisTargets, and persisted reviews with distinctive private markers in both review text and
metadata. The focused tests in
`tests/unit/services/ai/cross-user-context-security.test.ts` exercise the existing production review
service contract.

The tests currently prove that:

- each authenticated identity can retrieve its own target's persisted reviews;
- User B cannot start a review lookup for Target A;
- missing and foreign-owned targets produce the same `TargetNotFoundError`;
- spoofed owner or user query claims do not replace the verified session identity at the production
  reviews GET route, and the foreign request is denied before review lookup begins;
- a Target B lookup contains `BETA_PRIVATE_REVIEW_MARKER` and excludes
  `ALPHA_PRIVATE_REVIEW_MARKER` from both review text and metadata, including after an earlier
  Target A lookup.

These tests supplement the existing route and PostgreSQL RLS tests. They do not by themselves prove
that the Q&A model request is isolated.

The ReviewStore-based Phase 1 tests remain valid for the current production review-service
boundary. Phase 2 must adapt the fixture and infrastructure mocks to S2-010's session-scoped,
bounded Supabase query implementation; it must not replace the real context builder with the
ReviewStore test double.

## Dependency status for Phase 2

The branch normally merged `origin/main` at `ed686a2` before adding Phase 2 coverage. At that point:

- S2-003 / PR #83 and S2-013 / PR #76 were merged and are exercised here.
- S2-010 / PR #78 and S2-011 / PR #79 remained draft and unmerged.
- S2-009 / PR #84 remained open and unmerged, so its production questions route was not copied or
  recreated here.
- S2-019 / issue #70 remained open. This branch tests request-to-request isolation but does not
  implement unrelated active-target state management.

## Phase 2 coverage available on merged production code

`tests/unit/services/ai/cross-user-ai-context-phase2.test.ts` adds seven deterministic cases while
reusing the Phase 1 users, targets, reviews, markers, and adversarial question. The cases prove that:

- User A / Target A and User B / Target B each pass through the production review authorization
  service and real S2-013 request orchestration with exactly their persisted review IDs, ratings,
  dates, text, target identity, and platform;
- reviewer names, review URLs, source review IDs, source metadata, target source URLs, and persistence
  timestamps do not enter the captured model request;
- foreign and missing targets produce indistinguishable denials before review lookup, successful
  context construction, or model invocation;
- a Target A identifier supplied by the attacker inside User B's question remains question data and
  is not mistaken for leaked persisted evidence;
- consecutive User A / Target A, User B / Target B, and denied User B / Target A requests do not
  reuse prior evidence;
- S2-013's production `REVIEW_TARGET_MISMATCH` guard stops an injected foreign-target review before
  the model boundary; and
- Deep's `expectNoForeignData` assertion fails when synthetic Alpha evidence is deliberately
  disguised as Target B evidence, proving the leakage regression check is meaningful.

### Production modules exercised

- `getReviewsForTarget` performs the currently merged ownership check before listing reviews.
- `runGroundedQaRequest` invokes the context dependency, applies `toPromptContext`, constructs the
  real S2-013 request, and calls the model boundary only after those steps succeed.
- `buildQaModelRequest` and `buildSystemPrompt` enforce target matching, data minimization, prompt
  structure, request budgeting, target identity, and platform labeling.

### Test-controlled boundaries

- `createCrossUserSecurityStore` is the shared in-memory `ReviewStore`; it records ownership checks
  and review lookups instead of contacting Supabase.
- `buildAvailableReviewContext` is an explicitly test-only adapter from the currently merged review
  service to S2-013. It selects the synthetic target only after `getReviewsForTarget` authorizes the
  verified test actor. It is not represented as S2-010 and must be removed from the full integration
  test once #78 merges.
- Deep's S2-003 `createFakeQaModel` records the complete provider-neutral request and returns a
  deterministic reply. Its network guard removes provider/Supabase environment variables and fails
  any attempted network access.
- No live OpenAI, Supabase, or review-provider call occurs.

## Remaining full integration after #78 and #79 merge

Full S2-016 acceptance must call the real S2-010
`buildReviewDatasetContext(targetId: unknown): Promise<ReviewDatasetContext>`. That proposed builder
verifies the session identity and target ownership internally before its bounded, session-scoped
Supabase reviews query. The integration test must mock only `getAuthenticatedUser`, the Supabase
infrastructure beneath the builder, and the permitted provider/model boundary; it must not replace
the builder's security behavior.

The final suite must then call the real S2-011 `answerQuestion()` with the real builder and capture
the complete outgoing provider request, including system instructions, evidence, user question,
message history, metadata, and any tool payloads. It must repeat the authorized, foreign/missing,
adversarial, and consecutive-user/target scenarios above and assert:

- no unauthorized reviews query occurs after a foreign or missing ownership denial;
- no successful foreign context or model invocation occurs;
- Alpha review text and IDs never enter User B's model request or validated answer;
- the Target A identifier in the attacker's own question is not treated as a persisted-data leak;
  and
- an echoing controlled model cannot make a validated User B answer expose Alpha evidence.

Once S2-009 / #84 is merged and reconciled with #78/#79, a route-level case must also verify this
behavior through the actual questions endpoint. Any cache or retained conversation state must be
request-scoped or keyed by both authenticated user and active target; a target ID alone is not an
adequate cross-user key.

## Verification

Current local results after the `origin/main` merge:

- Focused S2-016: 2 suites, 14 tests passed (7 Phase 1 + 7 Phase 2).
- S2-003 Q&A harness: 8 suites, 137 tests passed.
- Related S2-013/authentication/ownership/review-service tests: 6 suites, 111 tests passed.
- Full Jest suite: 61 suites, 879 tests passed.
- ESLint passed.
- TypeScript typecheck passed.
- Focused Prettier checks passed after formatting the new Phase 2 test.
- Repository-wide `npm run format:check` reported only the existing generated
  `supabase/.temp/linked-project.json`; that file was not modified.
- The production build passed after rerunning with network access for Next.js to fetch the Inter
  Google Font. The initial sandboxed attempt failed only at that external font download.

Passing the available checks does not remove the #78/#79/#84 integration blockers or make S2-016
ready for complete acceptance.
