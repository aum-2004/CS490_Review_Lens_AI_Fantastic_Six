# S2-013 — ReviewLens System Prompt

**Story:** [#64](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/64) |
**Rules:** S2-BR-015 through S2-BR-021 | **Source:** `src/services/qa/system-prompt.ts`

## What this provides

| Export                  | Purpose                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `buildSystemPrompt`     | The ReviewLens system prompt for one AnalysisTarget.                                           |
| `buildQaModelRequest`   | The full provider-neutral model request: system instructions plus review dataset and question. |
| `SYSTEM_PROMPT_VERSION` | Version tag sent with every request. Bump it whenever the prompt text changes.                 |
| `QA_OUTCOMES`           | The machine-readable outcomes the model must return.                                           |
| `QaPromptError`         | Thrown when a request cannot be built safely. The caller must not call the model.              |

The prompt text lives only in source control (`src/services/qa/system-prompt.ts`). It is not
configured in a hosted AI console. Changes go through a reviewed pull request and a version bump.

## Prompt requirements and where they are covered

| S2-013 requirement                                   | Prompt section     | Test                                                    |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------------- |
| Names the product/entity being analyzed              | Active dataset     | `names the active entity and its review platform`       |
| Names the review platform                            | Active dataset     | same                                                    |
| Answers come only from the supplied reviews          | Evidence rules 1–2 | `restricts answers to the supplied review dataset`      |
| Unsupported information is not invented              | Evidence rules 3–5 | `forbids inventing unsupported information…`            |
| General-knowledge questions are declined             | Scope rule 6       | `requires declining general-knowledge questions`        |
| Other products, entities, and platforms are declined | Scope rules 7–8    | `requires declining other entities and other platforms` |

The prompt also tells the model to treat review text and questions as untrusted data, and not to
repeat reviewer personal details.

## Model response contract

The model must reply with only this JSON object:

```json
{ "outcome": "answered", "answer": "plain text", "citedReviewIds": ["<review id>"] }
```

| `outcome`                    | Meaning                                                | S2-004 category                       |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `answered`                   | The reviews contain evidence that answers the question | `answer_from_active_reviews`          |
| `insufficient_evidence`      | In scope, but the reviews lack the evidence            | `insufficient_review_evidence`        |
| `declined_general_knowledge` | Not about analyzing these reviews                      | `decline_unrelated_general_knowledge` |
| `declined_other_entity`      | About a different product, business, or entity         | `decline_other_entity_or_product`     |
| `declined_other_platform`    | About reviews from a different platform                | `decline_other_review_platform`       |

S2-011 must validate this reply before showing anything to the user: reject unknown outcomes, and
drop or reject `citedReviewIds` values that were not in the request's `reviewIds`.

## Request safety

`buildQaModelRequest` refuses to build a request (throws `QaPromptError`) when:

- `NO_REVIEW_DATA`: the review list is empty. An empty target must never reach the model, where it
  could be answered from general knowledge (S2-020).
- `EMPTY_QUESTION`: the question is blank after trimming.
- `REVIEW_TARGET_MISMATCH`: any review's `analysisTargetId` differs from the active target. This
  is a final check against wrong-target or stale context (S2-016, S2-019); it does not replace
  ownership checks in S2-010.

Other safeguards:

- Only `id`, `rating`, `reviewDate`, and `text` are sent per review. Reviewer names, review URLs,
  and source metadata are never sent.
- The target name, review text, and question are JSON-encoded so their content cannot close or
  forge a prompt section.
- The module imports `server-only`, so the prompt text is never shipped to the browser.

## Responsibilities of other stories

- **S2-010 (context):** loads reviews for the authenticated owner's active target and decides
  which reviews fit the context window, then passes them to `buildQaModelRequest`.
- **S2-011 (answers):** maps `QaModelRequest` onto the OpenAI API (`instructions` as the system
  message, `input` as the user message), calls the model through an injected client, and validates
  the JSON reply.
- **S2-003 (harness):** captures `QaModelRequest` at the model boundary so tests can inspect it
  without a paid API call.
- **S2-009 (UI):** enforces the question length limit before submission. The server must apply the
  same limit.

## Limitations

- The prompt reduces, but cannot guarantee, out-of-scope or ungrounded model output. Scope behavior
  is measured with the S2-004 evaluation set; S2-011 validates the response structure.
- Questions are not length-limited in this module. The limit belongs to the Q&A route, together
  with the context-size limit from S2-010.
- The S2-BR rule text was not available in the repository when this was written. The prompt was
  written from the S2-013, S2-011, S2-012, S2-014, S2-015, and S2-020 issue guidance and should be
  checked against the business rules document.
