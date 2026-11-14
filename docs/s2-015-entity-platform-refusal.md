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

## Production modules exercised

`tests/unit/services/qa/entity-platform-refusal.integration.test.ts` exercises:

- the real S2-010 `buildReviewDatasetContext()`;
- the real S2-013 `runGroundedQaRequest()` and request construction;
- the production system prompt, prompt version, evidence projection, and decline-priority helper;
- Deep's S2-003 recording fake model, request assertions, and network guard; and
- the shared S2-004 Restaurant A target, four persisted Google Maps reviews, and six S2-015 cases.

Only the verified session, Supabase HTTP transport beneath the real context builder, and model seam
are faked. The suite checks that every unchanged question reaches the model boundary with Restaurant
A, Google Maps, the exact four authorized review rows, and no reviewer/source metadata. The network
guard prohibits live provider or database calls.

The test-local mixed case, “How does Restaurant A compare with Restaurant B based on Amazon
reviews?”, verifies S2-013's entity-before-platform priority. It is intentionally not added to the
shared S2-004 fixture. Comparisons remain permitted when the authorized dataset actually supports
every material claim; S2-015 does not reject comparisons merely because they are comparisons.

## Independent semantic boundary

The semantic assessor must be a documented human review or approved semantic evaluator. It must
assess active-target clarity, active-platform clarity, unsupported entity information, falsely
available platform reviews, and unsupported comparisons from the actual user-visible response.
It must not derive success from the expected category, use an exact-text matcher, or classify via a
business/platform keyword blacklist. A malformed or unavailable assessment fails closed.

## S2-011-dependent acceptance still pending

PR #79 is still unmerged, so this branch does not copy or recreate its production orchestration.
The following exact acceptance checks remain blocked and are not reported as passing:

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
10. Malformed and unavailable semantic assessments fail closed after a valid production
    `QaAnswer` is obtained.

PR #77 must remain Draft and issue #66 must remain open until those checks and configured-model
evaluation are complete.

## What deterministic tests do not prove

The fake model is scripted. These tests prove production request construction, authorization,
evidence isolation, mapping/assertion behavior, and failure detection; they do not prove that a live
model independently chooses the right refusal. Final acceptance still requires the S2-011
integration above and an explicitly approved configured-model evaluation of the same cases. No live
OpenAI or Supabase access, secret-bearing fixture, fake production Q&A route, or keyword blacklist is
used here.
