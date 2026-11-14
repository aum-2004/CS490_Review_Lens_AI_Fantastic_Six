# S2-015 Entity and Platform Refusal

## Phase 1 evaluator

Phase 1 established a deterministic evaluator for the two S2-004 categories owned by S2-015:
unsupported entities/products and unsupported review platforms. It independently fails responses
that do not decline, obscure the active target or platform, present unsupported entity facts, treat
another platform's reviews as available, or present an unsupported comparison as evidence-backed.
Malformed semantic assessments fail closed, case sets are validated, and one invocation or
assessment failure does not stop later cases.

Bansi's approval and regression suggestions cover this evaluator foundation. Phase 2 preserves
those checks, including the three regressions where a response says it declined but still contains
unsupported entity information, platform-review claims, or comparison claims.

## Phase 2 integration

Phase 2 replaces the temporary fixture shape with the real S2-004
`ScopeGuardEvaluationCase`. The selector loads the six unchanged questions from
`scopeGuardEvaluationFixture`; no S2-004 question is copied into S2-015.

A single narrow, type-checked map connects the two S2-015 categories to S2-013 outcomes:

| S2-004 category                   | S2-013 outcome            |
| --------------------------------- | ------------------------- |
| `decline_other_entity_or_product` | `declined_other_entity`   |
| `decline_other_review_platform`   | `declined_other_platform` |

The evaluator applies Deep's S2-003 `expectDeclined(answer, expectedOutcome)` assertion before
semantic assessment. An answered result, swapped decline outcome, or decline carrying citations
therefore fails the structured contract. Semantic scope and unsupported-claim checks remain
independent; a structurally valid decline is not automatically considered safe or clear.

PR #75 (S2-014) currently owns an unmerged exhaustive S2-004-to-S2-013 map. S2-015 deliberately
does not copy that broader helper. Once #75 merges, reconcile this two-entry map with the shared
contract in a normal follow-up.

## Real S2-011 production-pipeline integration

`tests/unit/services/qa/entity-platform-refusal.integration.test.ts` exercises:

- the real S2-010 `buildReviewDatasetContext()`;
- the real S2-013 request construction and `s2-013.v3` system prompt;
- the real S2-011 `answerQuestion()` orchestration and `parseQaModelReply()` validation;
- the S2-015 evaluator over the production `QaAnswer`;
- the production system prompt, prompt version, evidence projection, and decline-priority helper;
- Deep's S2-003 recording fake model, request assertions, and network guard; and
- the shared S2-004 Restaurant A target, four persisted Google Maps reviews, and six S2-015 cases.

Only the verified session, Supabase HTTP transport beneath the real context builder, and model seam
are faked. The suite checks that every unchanged question reaches the model boundary with Restaurant
A, Google Maps, the exact four authorized review rows, and no reviewer/source metadata. The network
guard prohibits live provider or database calls. The helper now consumes the actual production
`QaAnswer` and `QaDeclineOutcome` types instead of the harness-owned mirror types.

Every shared case now completes the full deterministic path:

```text
mocked verified session + deterministic Supabase transport
  -> real buildReviewDatasetContext() (S2-010)
  -> real S2-013 request construction
  -> real answerQuestion() (S2-011)
  -> real parseQaModelReply() response validation
  -> evaluateEntityPlatformRefusals()
  -> independent recorded semantic assessment
```

The test-local mixed case, “How does Restaurant A compare with Restaurant B based on Amazon
reviews?”, verifies S2-013's entity-before-platform priority. It is intentionally not added to the
shared S2-004 fixture. Comparisons remain permitted when the authorized dataset actually supports
every material claim; S2-015 does not reject comparisons merely because they are comparisons.

## Independent semantic boundary

The semantic assessor must be a documented human review or approved semantic evaluator. It must
assess active-target clarity, active-platform clarity, unsupported entity information, falsely
available platform reviews, and unsupported comparisons from the actual user-visible response.
It must not derive success from the expected category, use an exact-text matcher, or classify via a
business/platform keyword blacklist. The integration uses explicit recorded human judgments for
fixed synthetic replies; it does not derive those judgments from the outcome. A malformed or
unavailable assessment fails closed.

## Completed deterministic acceptance

PR #79 is merged. The following formerly blocked checks now run without skips:

1. Each of the three S2-004 other-entity questions passes through real
   `answerQuestion()`, produces `declined_other_entity`, has no citations, and passes independent
   semantic assessment.
2. Each of the three S2-004 other-platform questions passes through real
   `answerQuestion()`, produces `declined_other_platform`, has no citations, and passes
   independent semantic assessment.
3. The mixed Restaurant B/Amazon question passes through real `answerQuestion()` and produces
   entity-first `declined_other_entity`.
4. An `answered` payload for an other-entity question fails the production response/evaluation
   path.
5. An `answered` payload for an other-platform question fails that path.
6. `declined_other_platform` for an other-entity question fails `expectDeclined()`.
7. `declined_other_entity` for an other-platform question fails `expectDeclined()`.
8. Platform-first decline for the mixed question fails the priority assertion.
9. A decline carrying citations is rejected by real S2-011 validation.
10. A malformed model reply is rejected as `INVALID_MODEL_RESPONSE` without leaking its content.
11. Independent semantic assessment can still fail a production-valid structured decline for
    unclear target/platform scope, unsupported entity or platform claims, or an unsupported
    comparison.
12. A production parsing failure is isolated per case and does not prevent the next case running.

The Restaurant B, Coffee Shop C, and Product X countertop-blender cases remain specifically
identified external entities and produce `declined_other_entity`. General open-ended
recommendations without a specifically identified external business remain
`declined_general_knowledge`; S2-015 does not relabel them. Multi-category priority remains entity
before platform before general.

## Remaining acceptance

No separate S2-013 prompt-clarification follow-up was present on `origin/main` after PR #79 merged.
This branch does not independently modify Aryan's prompt. If that follow-up lands, merge `main`
normally and rerun this suite against the new prompt version.

PR #77 must remain Draft and issue #66 must remain open until an explicitly approved
configured-model evaluation runs the same six shared cases and mixed case, requiring the mapped
outcome, zero citations, and independently assessed scope clarity and claim safety.

## What deterministic tests do not prove

The fake model is scripted. These tests prove production request construction, authorization,
evidence isolation, mapping/assertion behavior, and failure detection; they do not prove that a live
model independently chooses the right refusal. Final acceptance still requires the configured-model
evaluation above. No live OpenAI or Supabase access, secret-bearing fixture, fake production Q&A
route, or keyword blacklist is used here.
