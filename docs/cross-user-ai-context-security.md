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

## Required integration once S2-010 and S2-011 land

Use Deep's S2-003 deterministic harness or an equivalent injected model adapter to capture the
complete model request without making a provider call. Add integration tests with the synthetic
fixture that verify all of the following:

1. Authenticate as User B, select Target B, and submit the fixture's adversarial question. Assert
   that the retrieved review IDs are exactly the Target B review IDs.
2. Inspect the complete captured model request, including system instructions, user messages,
   review text, tool payloads, and metadata. Assert that it contains `BETA_PRIVATE_REVIEW_MARKER`
   and never contains `ALPHA_PRIVATE_REVIEW_MARKER`, a Target A review ID, or Target A metadata.
3. Configure the deterministic model response to echo every marker it receives. Assert that the
   Q&A result still cannot contain `ALPHA_PRIVATE_REVIEW_MARKER`. This is an output check in
   addition to, not a substitute for, inspecting model input.
4. Authenticate as User B and submit Target A's ID. Compare the response with a request for the
   fixture's missing target ID, assert the existing indistinguishable 404 response, and assert that
   neither context construction nor model invocation occurs.
5. Repeat the Target A request with every fixture `spoofedIdentityClaims` field in the body or query.
   Assert that the verified User B session remains authoritative and the model is not invoked.
6. Exercise consecutive requests through the real orchestration boundary and assert that request
   two is built only from its newly authorized active target. Coordinate the active-target state
   setup and cache-reset expectations with Shawn's S2-019 work instead of implementing that state
   here.

## Shared interface expectations

- S2-010 should accept an authenticated identity from the server auth boundary and an authorized
  active target. It must load persisted reviews server-side; it must not accept client-supplied
  review context or ownership claims.
- S2-011 should expose a dependency-injection boundary around the model call so a test can capture
  the entire request before any provider receives it.
- S2-003 should let tests inspect every model invocation and supply deterministic responses without
  live API access. The captured request type should include all content and metadata sent to the
  provider.
- Any context cache must be request-scoped or keyed by both authenticated user and active target.
  A target ID alone is not an adequate cross-user cache key.

Full S2-016 acceptance remains pending until these model-input and orchestration tests run against
the merged production boundaries.
