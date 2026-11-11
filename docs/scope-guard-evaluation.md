# Scope-Guard Evaluation Set

The S2-004 fixture in `tests/fixtures/scope-guard-evaluation.ts` provides deterministic input for
future ReviewLens scope-behavior verification. It contains one synthetic active target (Restaurant
A on Google Maps), four synthetic persisted reviews, and representative questions across five
expected behavioral categories.

The current Jest test validates the fixture itself: required fields, stable unique IDs, unique
questions, allowed categories, complete category coverage, and at least three cases per category.
It does not call an AI provider or claim that ReviewLens Q&A behavior passes these cases.

## Future Q&A integration

After the real Q&A endpoint and its response contract are finalized, a deterministic harness should:

1. Supply the fixture's active target and persisted reviews as the only review context.
2. Submit each case's question through the same orchestration boundary used by the endpoint, with a
   mocked model in CI and an explicitly approved live-model evaluation when appropriate.
3. Map the response contract's machine-readable scope outcome to `expectedCategory`.
4. Assert the category and evidence boundary without requiring exact answer or refusal sentences.
5. For `answer_from_active_reviews`, verify that material claims are supported by the fixture's
   review text. For `insufficient_review_evidence`, verify that the response communicates the
   dataset limitation rather than inventing an answer. For decline categories, verify that the
   response keeps the user within the active entity, platform, and review-analysis scope.

Live endpoint and model-behavior verification remains pending until that endpoint, response
contract, and deterministic Q&A harness exist. If the eventual contract uses different category
names, prefer an adapter in the harness over changing the intent of these cases.
