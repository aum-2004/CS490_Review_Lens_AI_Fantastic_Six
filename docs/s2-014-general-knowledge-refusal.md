# S2-014 General-Knowledge Refusal Foundation

## Current boundary audit

Issue #65 requires ReviewLens to decline questions unrelated to the active review dataset without a
hard-coded question or keyword blacklist. The behavior is expected to come primarily from the
reviewable system prompt and application context.

At the `f931a34` branch baseline, the repository has no Q&A route, Q&A orchestration service, model
adapter, OpenAI dependency, or production response contract. GitHub also has no S2-011 or S2-013
branch or pull request available for integration. Production refusal behavior therefore cannot be
executed or honestly claimed as verified on this branch.

## Relationship to S2-004

S2-004 is implemented separately in PR #72. Its fixture owns the representative questions and
includes three cases categorized as `decline_unrelated_general_knowledge`:

- current weather;
- the current United States president; and
- writing a Python sorting function.

S2-014 does not copy those questions or add a competing evaluation fixture. The reusable helper in
`tests/helpers/general-knowledge-refusal.ts` accepts the S2-004 case shape and selects that category
after PR #72 lands.

The helper runs caller-supplied Q&A invocations and requires a semantic observation that confirms
both:

1. the question was declined; and
2. the response made the active-review scope clear.

It intentionally does not classify questions or responses with keyword matching, prescribe an exact
refusal sentence, create fake production AI behavior, or define Aryan's prompt/orchestration
contract. An invitation to ask about the active reviews is optional under issue #65 and is therefore
not a pass condition.

## Completed automated coverage

The helper's unit suite verifies category selection, the passing contract, independent failure
reporting, continued evaluation after invocation/assessment errors, and rejection of malformed case
sets before Q&A is invoked. These tests verify the reusable evaluator only. They do not verify that
ReviewLens or a model currently declines unrelated questions.

## Pending production integration tests

After S2-004 and the real S2-011/S2-013 boundary land, add an integration suite with these exact
steps:

1. Import `scopeGuardEvaluationFixture` from S2-004 and pass its cases through
   `selectGeneralKnowledgeRefusalCases`; do not restate the questions in S2-014.
2. Supply the fixture's active target and persisted reviews through the real Q&A orchestration entry
   point used by the application.
3. Use the S2-003 injectable model boundary in deterministic CI tests to capture the complete model
   request and verify the production S2-013 system prompt and active-target context are actually
   supplied. Do not add an S2-014 prompt copy.
4. Adapt the finalized production response contract to `GeneralKnowledgeRefusalObservation`. Prefer
   a machine-readable disposition/scope result. If the contract is text-only, use an approved
   semantic evaluator or documented human rubric; do not infer behavior with keyword lists.
5. Run `evaluateGeneralKnowledgeRefusals` for every S2-004 general-knowledge case and require every
   result to pass. Assert the application does not surface a substantive answer to the unrelated
   question and that the response explains the active-review boundary without requiring exact text.
6. Add a failing contract test showing that a substantive answer is reported as
   `question_was_not_declined`, and another showing that a bare refusal with no ReviewLens scope is
   reported as `active_review_scope_was_not_clear`.
7. Separately run an explicitly approved configured-model evaluation against the same S2-004 cases
   to verify actual prompt-driven behavior. Keep paid/live calls out of normal CI unless the team
   intentionally provisions them. Deterministic request/response wiring tests alone do not prove
   model behavior.
8. Exercise the finalized API or UI boundary once available and verify its user-visible refusal is
   the assessed model/orchestration result, not a fabricated fallback answer.

Until steps 1-8 can target production code, S2-014 behavior verification remains pending even though
the independent evaluator foundation is complete and testable.
