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

The ReviewStore-based Phase 1 tests remain valid for the production review-service boundary. The
Phase 2 suite now separately adapts the fixture to S2-010's session-scoped, bounded Supabase query
implementation and calls the real context builder rather than replacing its security behavior.

## Dependency status for Phase 2

The branch normally merged `origin/main` at `905d10f`, which includes S2-010 / PR #78 and S2-011 /
PR #79. At that point:

- S2-003 / PR #83, S2-013 / PR #76, S2-010 / PR #78, and S2-011 / PR #79 were merged and are
  exercised here.
- S2-009 / PR #84 remained open and unmerged, so its production questions route was not copied or
  recreated here.
- S2-019 / issue #70 remained open. This branch tests request-to-request isolation but does not
  implement unrelated active-target state management.

## Phase 2 coverage available on merged production code

`tests/unit/services/ai/cross-user-ai-context-phase2.test.ts` contains seven deterministic cases
while reusing the Phase 1 users, targets, reviews, markers, and adversarial question. The cases
prove that:

- User A / Target A and User B / Target B each pass through the real S2-010 session and ownership
  checks, bounded reviews query, and S2-013 request orchestration with exactly their persisted
  review IDs, ratings, dates, text, target identity, and platform;
- reviewer names, review URLs, source review IDs, source metadata, target source URLs, and persistence
  timestamps do not enter the captured model request;
- foreign and missing targets produce indistinguishable denials before review lookup, successful
  context construction, or model invocation;
- a Target A identifier supplied by the attacker inside User B's question remains question data and
  is not mistaken for leaked persisted evidence;
- consecutive User A / Target A, User B / Target B, and denied User B / Target A requests do not
  reuse prior evidence;
- S2-010's production row validation stops an injected foreign-target review before the model
  boundary; and
- Deep's `expectNoForeignData` assertion fails when synthetic Alpha evidence is deliberately
  disguised as Target B evidence, proving the leakage regression check is meaningful.

### Production modules exercised

- `buildReviewDatasetContext(targetId)` obtains the verified session identity, calls the existing
  ownership guard, performs the bounded target-scoped reviews query, validates every row, and
  explicitly projects the safe review evidence.
- `runGroundedQaRequest` invokes the context dependency, applies `toPromptContext`, constructs the
  real S2-013 request, and calls the model boundary only after those steps succeed.
- `buildQaModelRequest` and `buildSystemPrompt` enforce target matching, data minimization, prompt
  structure, request budgeting, target identity, and platform labeling.
- `answerQuestion` passes the authorized request through the injected model boundary and returns
  only the result of the production `parseQaModelReply` validator.
- `parseQaModelReply` rejects malformed schemas, foreign citations, answered replies without a
  citation, and citations attached to non-answer outcomes.

### Test-controlled boundaries

- `getAuthenticatedUser` is mocked with the active synthetic user, and
  `createSupabaseServerClient` returns a real Supabase SDK client whose HTTP transport serves only
  the synthetic persisted target and review rows. Recorded query URLs verify that ownership filters
  are session-derived and that foreign/missing denials never start a reviews read.
- The S2-010 builder itself is not mocked or replaced. Two deliberate persistence mutations prove
  that its wrong-target row validation rejects before model invocation and that Deep's request
  assertion detects foreign content if the persisted target ID is maliciously disguised.
- Deep's S2-003 `createFakeQaModel` records the complete provider-neutral request and returns a
  deterministic reply. Its network guard removes provider/Supabase environment variables and fails
  any attempted network access.
- No live OpenAI, Supabase, or review-provider call occurs.

## Production-answer coverage after #79

The current suite calls the merged S2-010
`buildReviewDatasetContext(targetId: unknown): Promise<ReviewDatasetContext>` with only its verified
authentication and session-scoped Supabase infrastructure mocked underneath it. It passes that real
builder both to `runGroundedQaRequest()` and to the merged S2-011 `answerQuestion()`. Deep's fake
model captures every field of the current provider-neutral request: prompt version, target ID,
system instructions, evidence plus user question, review IDs, and output-token budget. The current
contract has no message-history, metadata, or tool-payload fields; if those are added, the exact-key
assertion requires the security suite to account for them.

Nine deterministic production-answer cases additionally prove that:

- no unauthorized reviews query occurs after a foreign or missing ownership denial;
- no successful foreign context or model invocation occurs;
- Alpha review text and IDs never enter User B's model request or validated answer;
- the Target A identifier in the attacker's own question is not treated as a persisted-data leak;
  the validated answer may repeat that attacker-supplied identifier without proving a persisted-data
  disclosure;
- consecutive answers and a denied user/target switch do not reuse earlier request or answer
  evidence;
- wrong-target persisted rows are rejected by S2-010 before S2-011 invokes the model;
- malformed replies and foreign citations are rejected with safe `QaResponseError` values; and
- an echoing controlled model produces validated answers containing only the authorized active
  dataset.

## Application enforcement and semantic limitations

The deterministic tests distinguish structural application guarantees from semantic model quality:

- **Enforced by application code:** authenticated ownership before review reads; target-scoped and
  bounded evidence; exact safe-field projection; wrong-target row rejection; request size and prompt
  structure; strict response JSON; citations limited to IDs in the active request; at least one
  citation for an answered outcome; and no citations for declines or insufficient-evidence outcomes.
- **Detected by the S2-003 assertions:** foreign markers, IDs, target identity, or review text in the
  captured request or returned answer. Mutation cases demonstrate these assertions fail when
  foreign content is deliberately disguised or injected.
- **Not proven by the response validator:** that answer prose is semantically supported by its valid
  citation, or that a model did not independently generate text resembling another dataset. A
  controlled contaminated reply with a valid active-target citation is accepted by production
  validation and then caught by the test assertion. Semantic grounding and leakage resistance still
  require the S2-004 evaluation set and approved model evaluation; these deterministic tests do not
  claim a model can never repeat attacker-supplied information.

## Remaining route-level acceptance

Once S2-009 / #84 is merged and reconciled with #78/#79, a route-level case must also verify this
behavior through the actual questions endpoint. Any cache or retained conversation state must be
request-scoped or keyed by both authenticated user and active target; a target ID alone is not an
adequate cross-user key.

## Verification

Current local results after the `origin/main` merge and real-answer reconciliation:

- Focused S2-016: 2 suites, 23 tests passed (7 Phase 1, 7 real-builder request cases, and 9
  production-answer cases).
- Relevant S2-003/S2-010/S2-011/S2-016: 18 suites, 416 tests passed.
- Full Jest suite: 67 suites, 1,100 tests passed; no tests or suites skipped.
- ESLint passed.
- TypeScript typecheck passed.
- Focused Prettier checks passed.
- Repository-wide `npm run format:check` reported only the existing generated
  `supabase/.temp/linked-project.json`; that file was not modified.
- The production build passed, including TypeScript, page-data collection, and generation of all 12
  static pages.

Passing the available checks removes the #78 builder and #79 answer-integration blockers, but it does
not remove the #84 route-integration blocker or make S2-016 ready for complete acceptance.
