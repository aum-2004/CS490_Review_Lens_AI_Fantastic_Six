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

These tests supplement the existing route and PostgreSQL RLS tests. They do not prove full S2-016
acceptance because this branch has no S2-010 context builder, S2-011 Q&A orchestrator, or model
invocation boundary.

The ReviewStore-based Phase 1 tests remain valid for the current production review-service
boundary. Phase 2 must adapt the fixture and infrastructure mocks to S2-010's session-scoped,
bounded Supabase query implementation; it must not replace the real context builder with the
ReviewStore test double.

## Required integration once S2-010 and S2-011 land

Call the real S2-010 context builder while mocking only its underlying authentication and Supabase
infrastructure and the permitted provider/model boundary. Do not mock the builder's authorization,
ownership, or evidence-bounding behavior. Use Deep's S2-003 deterministic harness or an equivalent
injected model adapter to capture the complete model request without making a provider call. Add
integration tests with the synthetic fixture that verify all of the following:

1. Mock a verified User B session, call `buildReviewDatasetContext` for Target B, and submit the
   fixture's adversarial question through the real orchestration boundary. Assert that the returned
   review IDs are exactly the Target B review IDs.
2. Once S2-011 is available, inspect the complete outgoing model request, including the system
   prompt, evidence, user question, message history, metadata, and any tool payloads. Assert that it
   contains the authorized `BETA_PRIVATE_REVIEW_MARKER` evidence and never contains
   `ALPHA_PRIVATE_REVIEW_MARKER`, a Target A review ID, or evidence or metadata retained from a
   prior target. The adversarial question intentionally contains a user-supplied Target A
   identifier; its presence in the user question is not by itself an unauthorized review-data leak.
3. Configure the deterministic model response to echo every marker it receives. Assert that the
   Q&A result still cannot contain `ALPHA_PRIVATE_REVIEW_MARKER`. This is an output check in
   addition to, not a substitute for, inspecting model input.
4. With the verified User B session, call the real builder for Target A and for the fixture's
   missing target so the builder can perform its ownership check. Assert that both receive
   indistinguishable denials, no unauthorized review lookup occurs, no successful review context is
   returned, and no model invocation occurs.
5. Repeat the Target A request with every fixture `spoofedIdentityClaims` field in the body or query.
   Assert that the internally verified User B session remains authoritative and the model is not
   invoked.
6. Exercise consecutive users and targets through the real orchestration boundary and assert that
   request two is built only from its newly verified session and authorized target, with no stale
   evidence from request one. Coordinate the active-target state setup and cache-reset expectations
   with Shawn's S2-019 work instead of implementing that state here.

## Shared interface expectations

- S2-010's proposed public builder interface is
  `buildReviewDatasetContext(targetId: unknown): Promise<ReviewDatasetContext>`. The builder verifies
  the session identity and target ownership internally before querying reviews. Its public interface
  must not accept a user ID, authenticated identity, client-supplied review context, or ownership
  claims.
- Once S2-011 is available, its permitted model boundary should let the integration test capture the
  complete outgoing request before any provider receives it. This document does not prescribe a
  finalized S2-011 interface.
- S2-003 should let tests inspect every model invocation and supply deterministic responses without
  live API access. The captured request type should include all content and metadata sent to the
  provider.
- Any context cache must be request-scoped or keyed by both authenticated user and active target.
  A target ID alone is not an adequate cross-user cache key.

Full S2-016 acceptance remains pending until these model-input and orchestration tests run against
the merged production boundaries.
