# Scope-Guard Evaluation Set

The S2-004 fixture in `tests/fixtures/scope-guard-evaluation.ts` provides deterministic input for
future ReviewLens scope-behavior verification. It contains one synthetic active target (Restaurant
A on Google Maps), four synthetic persisted reviews, and representative questions across five
expected behavioral categories. Each case has `expectedReviewIds`: an explicit set of supporting
persisted review IDs required or relevant to substantiate the expected in-scope answer. An empty
list means the case has no required supporting review evidence; it is not a blanket prohibition on
citing permitted active-target evidence in a scope explanation.

The current Jest test validates the fixture itself: required fields, stable unique IDs, unique
questions, allowed categories, balanced category coverage, case-ID/category consistency,
valid persisted review data, and references to existing evidence.
It does not call an AI provider or claim that ReviewLens Q&A behavior passes these cases.

## Future Q&A integration

After the real Q&A endpoint and its response contract are finalized, a deterministic harness should:

1. Supply the fixture's active target and persisted reviews as the only review context.
2. Submit each case's question through the same orchestration boundary used by the endpoint, with a
   mocked model in CI and an explicitly approved live-model evaluation when appropriate.
3. Map the response contract's machine-readable scope outcome to `expectedCategory`.
4. Assert the category and evidence boundary without requiring exact answer or refusal sentences.
   Use `expectedReviewIds` as a reference set of relevant evidence, not a requirement that every
   supported answer cite every listed review or that merely citing an ID proves factual grounding.
   Do not interpret an empty set as forbidden evidence. For example, a platform-scope refusal may
   mention that the available evidence is from Google Maps, provided it does not misrepresent those
   reviews as Yelp, TripAdvisor, or DoorDash evidence. If the future response contract needs to
   express prohibited evidence, add a distinct field rather than overloading `expectedReviewIds`.
5. For `answer_from_active_reviews`, verify that material claims are supported by the fixture's
   review text. For `insufficient_review_evidence`, verify that the response communicates the
   dataset limitation rather than inventing an answer. For decline categories, verify that the
   response keeps the user within the active entity, platform, and review-analysis scope.

Live endpoint and model-behavior verification remains pending until that endpoint, response
contract, and deterministic Q&A harness exist. If the eventual contract uses different category
names, prefer an adapter in the harness over changing the intent of these cases.

## Scope boundaries

This fixture deliberately keeps the five categories required by S2-004. Cross-user isolation,
question/review prompt injection, empty-target workflows, aggregation, and reviewer-identity
privacy are important but belong to their respective security, Q&A, and summary stories or a
separately approved expanded evaluation set. Prompt-injection and reviewer-identity/PII evaluation
are tracked by GitHub issue [#74](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/74)
and do not need to be added to this 15-case baseline. Structural Jest validation cannot prove that a
question's intended meaning matches its label; human review and later behavior tests must check
this explicitly.
