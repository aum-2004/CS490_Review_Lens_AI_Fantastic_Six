# S2-014 General-Knowledge Refusal

## Integration status

Issue #65 requires ReviewLens to decline questions unrelated to the active review dataset without a
hard-coded question or keyword blacklist. PR #75 contains the independently testable evaluator and
the complete deterministic production-pipeline integration currently possible on `main`.

The integrated boundaries are:

- S2-004 / PR #72: the shared scope-guard fixture;
- S2-003 / PR #83: the recording fake model and behavior assertions;
- S2-013 / PR #76: the production system prompt and request construction;
- S2-010 / PR #78: authenticated `buildReviewDatasetContext()`; and
- S2-011 / PR #79: `answerQuestion()` and production model-response validation.

S2-014 does not modify or copy those production modules. Aryan owns the pending S2-013 wording
clarification and prompt-version bump.

## Classification agreement

The agreed scope classification is:

- an open-ended recommendation or ranking with no specifically identified other business is
  `declined_general_knowledge`;
- a question about a specifically identified other business or product is
  `declined_other_entity`; and
- when multiple decline categories genuinely apply, priority remains entity, then platform, then
  general knowledge.

Accordingly, S2-004 case `sg-general-004`, “What are the best restaurants in New York?”, remains
`decline_unrelated_general_knowledge`, which maps to `declined_general_knowledge`. It asks for a
general ranking and does not identify another particular restaurant. The shared S2-004 baseline
contains 16 cases, including all four issue #65 examples.

## Evaluator contract

`tests/helpers/general-knowledge-refusal.ts` imports the real S2-004
`ScopeGuardEvaluationCase` and production S2-011 `QaAnswer`. One exhaustive mapping translates all
S2-004 categories to S2-013 outcomes:

```text
decline_unrelated_general_knowledge -> declined_general_knowledge
```

The adapter uses S2-003's `expectDeclined()` as the authoritative structured-refusal assertion. It
reports these states without collapsing their meanings:

- `valid`: a citation-free `declined_general_knowledge` answer;
- `not_declined`: `answered` or `insufficient_evidence`;
- `wrong_decline_outcome`: a valid decline using the entity or platform category; and
- `invalid_decline_response`: an otherwise decline-shaped answer that violates the structured
  refusal contract, such as carrying citations.

The evaluator maps those states to distinct failure codes. Invocation and assessment failures keep
fixed, non-sensitive per-case diagnostics, evaluation continues after a failure, and malformed or
missing observations fail closed.

Scope clarity remains a separate semantic criterion. A human reviewer or approved semantic
evaluator must decide whether the user-visible answer clearly explains that ReviewLens is limited
to analysis of the active review dataset. The structured outcome never sets this criterion to true.
For example, a production-validated reply whose answer is only `No.` has a valid outcome but still
fails `active_review_scope_was_not_clear`.

The evaluator contains no keyword matcher, entity blacklist, fixed refusal template, or production
Q&A behavior.

## Deterministic production-pipeline integration

`tests/unit/services/qa/general-knowledge-refusal.integration.test.ts` runs all four shared cases
through:

```text
mocked verified session + deterministic Supabase HTTP fixture
  -> buildReviewDatasetContext() (S2-010)
  -> S2-013 production request construction
  -> answerQuestion() (S2-011)
  -> parseQaModelReply() production response validation
  -> evaluateGeneralKnowledgeRefusals()
  -> assessGeneralKnowledgeQaAnswer()
```

The Supabase client is real, but its explicitly injected fetch implementation serves only the
synthetic S2-004 rows. The S2-003 network guard blocks global fetch, HTTP(S), and TCP access. The
model seam uses S2-003's recording fake and never contacts a provider.

The integration verifies:

- all four questions receive production-validated `declined_general_knowledge` answers with no
  citations;
- the actual prompt version, active Restaurant A target, Google Maps platform, and exact authorized
  evidence reach every model request;
- reviewer identity fields do not reach the model;
- `answered` and `insufficient_evidence` become `question_was_not_declined`;
- entity/platform declines become `wrong_decline_outcome`;
- a cited decline is rejected by S2-011 as `UNEXPECTED_CITATIONS` before assessment;
- malformed model output is rejected as `INVALID_MODEL_RESPONSE` without leaking its contents;
- a correct structured decline with the answer `No.` fails the separately supplied human scope
  assessment; and
- no real database or provider network request occurs.

The human-scope booleans in these deterministic tests record an explicit judgment about the fixed
fixture response text. They are not inferred from the outcome and are not a production classifier.

## Remaining acceptance work

The deterministic production-code path is complete and ready for final review. Two behavior-level
dependencies remain before full story acceptance:

1. Aryan's agreed S2-013 clarification must land with its prompt-version bump. S2-014 should then
   merge `main` and rerun this suite against the revised prompt without independently editing it.
2. An explicitly approved configured-model evaluation must run the same four cases through the
   production prompt and context, requiring both the mapped outcome and independently assessed
   scope clarity.

Scripted fake-model replies prove application wiring, authorization, request construction, response
validation, and evaluator behavior. They do not prove that a configured model will independently
classify and decline the questions reliably. PR #75 therefore remains Draft and issue #65 remains
open until the pending prompt clarification, configured-model evaluation, teammate approval, and PR
CI are complete.
