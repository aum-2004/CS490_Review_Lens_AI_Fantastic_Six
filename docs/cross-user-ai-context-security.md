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

The branch normally merged `origin/main` at `cd3e69b`, which includes S2-010 / PR #78. At that
point:

- S2-003 / PR #83, S2-013 / PR #76, and S2-010 / PR #78 were merged and are exercised here.
- S2-011 / PR #79 remained unmerged, so its production `answerQuestion()` and provider adapter were
  not copied or recreated.
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

## Remaining full integration after #79 merges

The current suite calls the merged S2-010
`buildReviewDatasetContext(targetId: unknown): Promise<ReviewDatasetContext>` with only its verified
authentication and session-scoped Supabase infrastructure mocked underneath it. It passes that real
builder to `runGroundedQaRequest()` and captures all fields of the current provider-neutral S2-013
request, including instructions, evidence input, attacker-supplied question text, review IDs,
target, prompt version, output budget, and estimated input tokens.

After S2-011 merges, the suite must call the real `answerQuestion()` with the real builder and capture
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

Current local results after the `origin/main` merge and real-builder reconciliation:

- Focused S2-016 and S2-010 builder coverage: 3 suites, 56 tests passed. Shawn's portable
  S2-010/S2-011 suite remains correctly skipped (1 suite / 16 tests) because S2-011 is not present
  on `main`.
- Full Jest suite: 62 suites, 921 tests passed; 1 suite / 16 tests skipped for the same explicit
  S2-011 dependency.
- ESLint passed.
- TypeScript typecheck passed.
- Focused Prettier checks passed.
- Repository-wide `npm run format:check` reported only the existing generated
  `supabase/.temp/linked-project.json`; that file was not modified.
- The production build passed, including TypeScript, page-data collection, and static-page
  generation.

Passing the available checks removes the #78 builder-integration blocker, but it does not remove the
#79/#84 integration blockers or make S2-016 ready for complete acceptance.
