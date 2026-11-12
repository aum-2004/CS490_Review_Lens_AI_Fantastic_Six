# S2-015 Entity and Platform Refusal Foundation

## What Phase 1 proves

S2-015 Phase 1 provides a deterministic evaluator for questions about an entity, product, or review
platform outside the active dataset. It selects the two S2-004 categories owned by this story and
reports precise failures for an answer that:

- does not decline the unsupported request;
- presents information about an unsupported entity;
- treats unsupported-platform reviews as available;
- presents an unsupported comparison as evidence-backed; or
- fails to identify the active target or active review platform clearly.

The evaluator also validates its case set, rejects malformed semantic observations, and isolates Q&A
invocation and response-assessment failures per case.

## What Phase 1 does not prove

This phase does not implement or verify production model refusal behavior. The current branch has no
production Q&A boundary, S2-011 orchestration, S2-013 system prompt, or S2-003 model harness to call.
The unit tests use controlled callbacks only to verify evaluator logic. A callback that labels a
response correctly in a unit test is not evidence that a real model response has the same semantics.

Phase 1 does not define an API response shape, exact refusal wording, prompt text, keyword
classifier, name-matching rule, fake AI route, or hard-coded production refusal response.

## Reusing S2-004 cases

PR #72 owns the representative questions in `tests/fixtures/scope-guard-evaluation.ts`. S2-015 does
not copy those questions. After that PR is merged, the production integration should import
`scopeGuardEvaluationFixture.cases` and pass them through `selectEntityPlatformRefusalCases`. This
selects both `decline_other_entity_or_product` and `decline_other_review_platform` while excluding
unrelated S2-004 categories.

## Production integration

After Aryan's S2-011 Q&A orchestration and S2-013 system prompt land, an integration suite should:

1. Load the S2-004 active target, persisted Google Maps reviews, and selected S2-015 questions.
2. Invoke the same production Q&A orchestration boundary used by the application; do not create a
   test-only AI route or duplicate the system prompt.
3. Use Deep's S2-003 injectable model harness to capture the complete model request. Assert that the
   production S2-013 instructions, active target, active platform, and only the authorized persisted
   review context are supplied.
4. Feed controlled model responses through the real S2-011 response path, then adapt the resulting
   response to `EntityPlatformRefusalObservation` with an approved semantic assessment.
5. Assess whether the answer declined the unsupported request, avoided claims about unavailable
   entities/platforms, and clearly redirected the user to Restaurant A's active Google Maps review
   dataset. Do not require one exact sentence.
6. Run every selected S2-004 case and require every evaluator result to pass. Separately exercise
   failure responses for fabricated entity information, invented platform reviews, unsupported
   comparisons, incomplete scope clarification, invocation failure, and assessment failure.
7. Run an explicitly approved configured-model evaluation against the same cases before claiming
   actual prompt-driven behavior. Deterministic request capture and controlled responses prove
   application wiring, not live model reliability.

If the production response contract is machine-readable, the assessor should verify the structured
disposition and evidence metadata against the user-visible answer. It must not accept a success flag
without checking the response. If the contract is text-only, use a documented human rubric or an
approved semantic evaluator and retain assessment evidence. A malformed or unavailable assessment
must fail closed as `response_assessment_failed`.

## Evidence for comparisons

A comparison is legitimate only when evidence for every compared subject and claimed review
platform is present in the authorized active ReviewLens dataset and the material comparison claims
are traceable to that evidence. Merely knowing that another business or platform exists, relying on
general model knowledge, or fabricating citations is not evidence. With S2-004's single Restaurant A
Google Maps dataset, comparisons to Restaurant B or Amazon reviews are unsupported and must be
declined.

## Why there is no keyword blacklist

Entity names, product names, platform names, and comparison wording are open-ended and ambiguous. A
hard-coded blacklist would miss paraphrases, reject legitimate in-scope wording, and test the list
rather than the model's grounded behavior. S2-015 therefore consumes semantic observations from the
future production integration while keeping the questions in S2-004 and the scope rules in the
reviewable S2-013 prompt.
