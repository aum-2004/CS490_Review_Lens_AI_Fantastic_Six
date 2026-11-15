# S2-016 Cross-User AI Context Security

## Phase 1 boundary

The reusable synthetic fixture in
`tests/fixtures/cross-user-ai-context.synthetic.ts` represents two authenticated users, two owned
AnalysisTargets, and persisted reviews with distinct private markers in review text plus separate
markers that occur only in source metadata. The focused tests in
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

### ReviewStore forward compatibility

S2-006 / PR #80 proposes adding `aggregateReviews(targetId)` to `ReviewStore`. The S2-016
`createCrossUserSecurityStore()` remains a read-only cross-user isolation fixture and must not
fabricate summary results. Its store is therefore typed as the current `ReviewStore` intersected
with a narrow `aggregateReviews(targetId): Promise<never>` guard. This shape:

- remains assignable to the current main interface without an excess-property error;
- satisfies PR #80's expanded interface when the branches are combined; and
- throws the fixed `UNEXPECTED_AGGREGATE_REVIEWS_ERROR` if aggregation is unexpectedly invoked,
  without performing an ownership check or review lookup.

The regression test invokes the guard directly and requires the rejection, proving the fixture
cannot silently return fabricated aggregate data. A temporary no-commit merge with PR #80 passed
TypeScript checking; PR #80 itself was not modified or pushed.

## Dependency status

The branch normally merged `origin/main` at `43670b2`, whose main parent `2a9e54b` includes the
merged S2-009 / PR #84 production questions route. S2-003, S2-009, S2-010, S2-011, S2-013, S2-014,
and S2-015 are now exercised together. No S2-009 production code was recreated on this branch.

S2-006 / PR #80 remains separate and unmerged. The read-only Phase 1 fixture retains the reviewed
forward-compatible throwing `aggregateReviews()` guard without copying or changing PR #80's
production implementation. S2-019 / issue #70 also remains separate; the route suite verifies
request-to-request isolation but does not implement unrelated client active-target state.

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

## Production questions-route coverage after #84

`tests/unit/services/ai/cross-user-ai-context-route.test.ts` now contains 12 deterministic cases
through the actual merged `POST /api/analysis-targets/[targetId]/questions` handler. The complete
S2-016 focused suite contains 38 tests and preserves all 31 cases reviewed before Shawn's final
request-assertion finding.

The route-level cases prove that:

- User A / Target A and User B / Target B each receive a no-store response derived only from their
  authorized persisted evidence;
- the complete provider-neutral model request contains exactly the current six production fields;
  a separate dynamic scan covers every application-controlled field and excludes foreign review
  IDs and text, source-review IDs, metadata marker values, reviewer identity, review/source URLs,
  persistence timestamps, target identity, and target source fields;
- foreign and missing targets return the same safe 404 body after ownership lookup, without a
  reviews query, quota reservation, Q&A configuration read, or model invocation;
- consecutive User A → User B → User A requests rebuild context and issue target-scoped review
  queries in that order, with the complete safe-field and foreign-data assertions applied
  independently to all three model calls;
- a Target A identifier typed into User B's question remains attacker-controlled question text and
  does not select Target A reviews or enter the application-supplied evidence portion of the model
  request;
- mutation-sensitive negative cases prove the request oracle fails when a foreign source-review ID
  or metadata-only marker is appended without its field name to model instructions, when the
  metadata marker is placed in another application-controlled request field, and in the reverse
  User B → User A direction;
- malformed model output fails closed as `INVALID_MODEL_RESPONSE`; and
- a model reply carrying a foreign citation fails closed as `UNGROUNDED_ANSWER`, without exposing
  the unvalidated controlled reply through the route response.

The tests leave the production route, ownership guard, S2-010 context builder, S2-011
`answerQuestion()`, and production reply validator intact. They mock only the authenticated user,
the Supabase SDK's synthetic HTTP transport, quota persistence, and the permitted model boundary.
The model boundary uses Deep's recording fake, and the shared network guard removes provider and
Supabase environment configuration and fails any attempted live network access. `QA_ENABLED` is
never enabled.

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

## Remaining acceptance limitations

The deterministic production-route boundary is now covered. Final acceptance still requires human
security review and passing GitHub CI. These tests prove structural evidence isolation and
fail-closed application behavior; they do not prove that an arbitrary real model cannot hallucinate
private-looking text, independently reproduce attacker-supplied text, or make a semantically
unsupported claim while citing an allowed review. Those properties remain evaluation and model-risk
questions rather than route-authorization guarantees.

Any future cache, retained message history, tool payload, or conversation state must be inspected by
the same complete-request assertions and scoped by authenticated user plus active target. The
current production request contract contains no message history or tool payloads.

## Verification

Current local results for the final request-assertion correction:

- Focused S2-016: 3 suites, 38 tests passed (all previously reviewed 31 cases preserved plus seven
  metadata-exclusivity and mutation-sensitive cases).
- Focused S2-016 plus the shared S2-003 assertion suite: 4 suites, 56 tests passed.
- Relevant context-builder, answer, and quota suites: 3 suites, 76 tests passed. The unchanged
  S2-009 route, quota, API client, and component set had previously passed 4 suites / 108 tests;
  every route test was also included in the current full run.
- Next route type generation and strict TypeScript checking passed.
- Full Jest with coverage: 82 suites, 1,503 tests passed; no tests or suites skipped.
- A temporary no-commit merge with S2-006 / PR #80 passed route type generation and TypeScript
  checking. Jest discovery from the hidden nested Windows worktree found no tests, so behavior was
  verified by the standalone 24-test run instead; the temporary worktree was removed.
- Full coverage collection passed at 94.10% statements/lines, 93.68% branches, and 93.18%
  functions. The S2-001 changed-code gate compared against merge-base `2a9e54b`, reported no
  coverable changed production lines, and passed.
- ESLint passed.
- TypeScript typecheck passed.
- Targeted Prettier passed. Repository-wide `format:check` reported only the existing generated
  `supabase/.temp/linked-project.json`; that file was not modified. Whitespace checking passed.
- The production build passed, including TypeScript, page-data collection, and generation of all 12
  static pages. Its first sandboxed attempt could not download the configured Inter font; the same
  build passed when rerun with approved network access.
- The database runner validated migration filenames and timestamp uniqueness, then could not run
  PostgreSQL/RLS tests because the local machine does not have the required `createdb` executable.
  No migration was deployed.
- The first coverage attempt exposed stale local `node_modules` resolving upstream
  `deepmerge@4.3.1` instead of main's committed `4.3.1+reviewlens.1` patch. `npm ci` reconciled the
  merged lockfile without changing tracked dependency files; the dependency integrity tests and the
  complete coverage run then passed.

GitHub CI and Shawn's final security re-review remain required after this correction is pushed.
