# S2-014 General-Knowledge Refusal

## Integration status

Issue #65 requires ReviewLens to decline questions unrelated to the active review dataset without a
hard-coded question or keyword blacklist. PR #75 now contains the independently testable evaluator
and the deterministic production-request integration currently possible on `main`.

The merged boundaries are:

- S2-004 / PR #72: the shared scope-guard fixture;
- S2-003 / PR #83: the recording fake model and behavior assertions;
- S2-013 / PR #76: the production system prompt and `runGroundedQaRequest()`; and
- S2-010 / PR #78: the authenticated `buildReviewDatasetContext()`.

S2-011 / PR #79 remains open and Draft. Its `answerQuestion()` orchestration and production
`QaAnswer` validation are not copied into this branch. S2-009 / PR #84 also remains open and is not
part of this implementation.

## Phase 1: evaluator foundation

`tests/helpers/general-knowledge-refusal.ts` imports the actual S2-004
`ScopeGuardEvaluationCase`. It narrows the shared fixture to
`decline_unrelated_general_knowledge` without copying or reclassifying question text.

One exhaustive mapping translates all S2-004 categories to the S2-013 outcomes. The S2-014 expected
pair is:

```text
decline_unrelated_general_knowledge -> declined_general_knowledge
```

The `QaAnswer` adapter reuses S2-003's `expectDeclined(answer, outcome)`. Consequently, a
non-decline outcome, another decline category, or a decline carrying citations fails the refusal
criterion. S2-014 does not maintain parallel outcome/citation rules.

Scope clarity remains a separate semantic criterion. A human reviewer or an approved semantic
evaluator must decide whether the user-visible answer clearly explains that ReviewLens is limited
to analysis of the active review dataset. The machine-readable outcome cannot set that criterion to
true. For example, a response whose complete answer is `No.` fails scope clarity even when its
outcome is `declined_general_knowledge`.

The evaluator contains no keyword matcher, entity blacklist, fixed refusal template, or production
Q&A behavior. It only coordinates a caller-provided Q&A invocation and semantic assessment.
Invocation and assessment failures are recorded per case with fixed, non-sensitive diagnostics;
raw errors and response content are not exposed. Missing or malformed observations fail closed, and
evaluation continues with the remaining cases.

## Shared S2-004 case set

The fixture now contains all four issue #65 general-knowledge examples:

- current weather;
- the current United States president;
- writing a Python sorting function; and
- general restaurant recommendations in New York.

The fourth case is `sg-general-004`; it requires no review evidence and is labeled as a general
recommendation request rather than analysis of Restaurant A's stored reviews. The shared baseline
now has 16 cases. S2-004's completed issue status is unchanged.

## Phase 2: completed deterministic integration

`tests/unit/services/qa/general-knowledge-refusal.integration.test.ts` runs each of the four shared
questions through these real modules:

```text
mocked verified session + deterministic Supabase HTTP fixture
  -> buildReviewDatasetContext() (S2-010)
  -> runGroundedQaRequest() / buildQaModelRequest() (S2-013)
  -> recording fake model (S2-003)
```

The Supabase client itself is real, but its explicit fetch implementation serves only the synthetic
S2-004 persisted rows. The S2-003 network guard blocks global fetch, HTTP(S), and TCP access. The
tests verify:

- exactly the four S2-004 cases are selected;
- the verified fixture owner and target ID drive the real ownership/context queries;
- the actual S2-013 system prompt names Restaurant A and Google Maps;
- every supplied evidence row and review ID matches the authorized persisted fixture dataset;
- reviewer identity fields do not reach the model request;
- the recording model receives the exact question and expected target;
- the category adapter selects `declined_general_knowledge`; and
- no real provider or database network request occurs.

The fake model returns a controlled raw provider reply so request wiring is observable. That reply
does not prove that a configured model will independently classify and decline these questions.

## Remaining acceptance work

When S2-011 / PR #79 merges, extend the deterministic integration through the real
`answerQuestion(targetId, question, { buildReviewDatasetContext, callModel })` boundary. For every
shared general-knowledge case, validate a real production `QaAnswer` with
`assessGeneralKnowledgeQaAnswer()`. Add production-pipeline regressions for:

1. a valid `declined_general_knowledge` reply with no citations;
2. `answered`, `insufficient_evidence`, and the two wrong decline outcomes;
3. a decline containing review citations; and
4. a correctly categorized but semantically unclear answer such as `No.`.

The fourth assertion still requires the documented human/approved semantic-assessment boundary;
S2-011 response parsing cannot establish scope clarity by itself.

After deterministic orchestration acceptance, run an explicitly approved configured-model
evaluation against the same four cases. It must use the production prompt and context and require
both the mapped outcome and independently assessed scope clarity. Paid/live calls stay outside
normal CI unless the team intentionally provisions them. The endpoint or UI must ultimately surface
the assessed model/orchestration result, not a fabricated fallback.

Therefore, Phase 1 and all currently unblocked deterministic Phase 2 request-wiring work are
complete. Full S2-014 story acceptance remains pending S2-011 integration, configured-model
evaluation, teammate approval, and green PR CI.
