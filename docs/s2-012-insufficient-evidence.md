# S2-012 — Handle Questions with Insufficient Review Evidence

**Story:** [#63](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/63) S2-012 |
**Rules:** S2-BR-010, S2-BR-011, S2-BR-015 | **Builds on:** S2-013 (PR #76, merged), S2-011
(PR #79), S2-004 (PR #72, merged)

## Outcome

When a question is about the active reviews, but the reviews do not contain the information needed
to answer it, ReviewLens says so. It does not infer an answer from general knowledge.

Example from the issue: the reviews discuss food quality and service, and the user asks "Do
customers think the parking lot is safe at night?". No review mentions parking, so the correct
reply is `insufficient_evidence`, with no citations.

## How the behavior is produced

S2-012 adds no production code. It relies on two pieces that already exist, and this change tests
them together against controlled datasets.

| Piece                           | Where                                           | What it does for S2-012                                                                                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System prompt (S2-013)          | `src/services/qa/system-prompt.ts`, `s2-013.v3` | Evidence rule 4: if the reviews lack the information, say so clearly and do not fill the gap from general knowledge. Rule 5: keep what the reviews say separate from what they do not say. A partial answer uses `answered` for the supported part and states what is not covered. |
| Reply validation (S2-011)       | `src/services/qa/qa-response.ts`                | `insufficient_evidence` must have no citations (`UNEXPECTED_CITATIONS` otherwise). An `answered` reply with no citations, or with a review ID outside the dataset, is rejected as `UNGROUNDED_ANSWER`, so a general-knowledge guess cannot reach the user.                         |
| Outcome mapping (S2-013/S2-004) | `docs/s2-013-system-prompt.md`                  | `insufficient_evidence` corresponds to the S2-004 category `insufficient_review_evidence`.                                                                                                                                                                                         |

The issue asks the prompt to make the model distinguish (1) information supported by the reviews
from (2) information absent from them. Rules 4 and 5 are that instruction, and the tests assert
that both reach the model on every insufficient-evidence question.

## Tests

`tests/unit/services/qa/insufficient-evidence.test.ts` (28 tests). The model is a fake with a fixed
reply, so no network, database, or API key is used.

### Controlled datasets where the absence is known

| Dataset                                                                                         | Questions                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Issue example: 3 food and service reviews                                                       | "Do customers think the parking lot is safe at night?"                                                     |
| S2-004 evaluation dataset (`tests/fixtures/scope-guard-evaluation.ts`): Restaurant A, 4 reviews | Every case labeled `insufficient_review_evidence`: outdoor seating, opening hours, parking safety at night |

Each question has a list of topic terms (for example `park`, `lot`, `night`, `safe`). A test checks
every review in the dataset against them, so the absence is verified, not assumed. If a review that
mentions the topic is ever added, the test fails. A new S2-004 `insufficient_review_evidence` case
also fails the suite until its topic terms are added.

### What each question checks

- The whole active dataset and the question are sent to the model, with evidence rules 4 and 5 and
  the `insufficient_evidence` outcome in the instructions.
- An `insufficient_evidence` reply that states the limitation, with no citations, is returned
  unchanged.
- A guessed `answered` reply with no citations is rejected as `UNGROUNDED_ANSWER`.
- An `answered` reply that cites a review outside the dataset is rejected as `UNGROUNDED_ANSWER`.
- An `insufficient_evidence` reply that cites reviews is rejected as `UNEXPECTED_CITATIONS`.

### Partial evidence

"How is the pizza, and does Restaurant A have outdoor seating?": one review covers the pizza, and
none covers seating. An `answered` reply that cites the pizza review and states that seating is not
mentioned is accepted. The prompt's partial-answer instruction is asserted too.

### Checking that the tests can fail

Two deliberate mistakes were made locally and then reverted:

- Adding "The parking lot was dark." to a review fails the absence check (1 test).
- Removing "clearly" from evidence rule 4 fails the prompt assertions (4 tests).

## Limitations

- **Fake model.** These tests check what the pipeline sends and which replies it accepts. They do
  not show that a live model chooses `insufficient_evidence`. That is measured by running the S2-004
  evaluation set against the configured model, after the team approves the smoke test.
- **The wording of the limitation is not checked.** The validator confirms the outcome and the
  citations, not that the answer text names the missing topic. The prompt asks for it.
- **Citation support is not verified** (S2-011 known limitation): for a partial answer, the
  validator confirms the cited review is in the dataset, not that it supports the claim.
