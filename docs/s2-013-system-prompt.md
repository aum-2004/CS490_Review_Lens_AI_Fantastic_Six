# S2-013 — ReviewLens System Prompt

**Story:** [#64](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/64) |
**Rules:** S2-BR-015 through S2-BR-021 | **Source:** `src/services/qa/system-prompt.ts`,
`src/services/qa/qa-request.ts`

## What this provides

| Export                      | Purpose                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `buildSystemPrompt`         | The ReviewLens system prompt for one AnalysisTarget.                                           |
| `buildQaModelRequest`       | The full provider-neutral model request: system instructions plus review dataset and question. |
| `SYSTEM_PROMPT_VERSION`     | Version tag sent with every request. Bump it whenever the prompt text changes.                 |
| `QA_OUTCOMES`               | The machine-readable outcomes the model must return.                                           |
| `QaPromptError`             | Thrown when a request cannot be built safely. The caller must not call the model.              |
| `QA_DECLINE_PRIORITY`       | Which decline outcome wins when more than one applies.                                         |
| `resolveDeclineOutcome`     | Returns the winning decline outcome; used to label multi-category evaluation cases.            |
| `QA_MAX_REQUEST_TOKENS`     | The single configurable cap on one model request, in tokens (enforced by S2-011, see below).   |
| `QA_RESERVED_OUTPUT_TOKENS` | Output tokens reserved for the reply; sent to the provider as `maxOutputTokens`.               |
| `runGroundedQaRequest`      | (`qa-request.ts`) Builds the S2-010 context, then the request, then calls the injected model.  |

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

| `outcome`                    | Meaning                                                                                       | S2-004 category                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- |
| `answered`                   | The reviews contain evidence that answers the question                                        | `answer_from_active_reviews`          |
| `insufficient_evidence`      | In scope, but the reviews lack the evidence                                                   | `insufficient_review_evidence`        |
| `declined_general_knowledge` | Not about analyzing these reviews, including open-ended recommendations that name no business | `decline_unrelated_general_knowledge` |
| `declined_other_entity`      | About a specific, named product, business, or entity other than the target                    | `decline_other_entity_or_product`     |
| `declined_other_platform`    | About reviews from a different platform                                                       | `decline_other_review_platform`       |

### Outcome priority

When a question falls under more than one decline outcome, the model must use the first match in
`QA_DECLINE_PRIORITY`:

1. `declined_other_entity`: the question is about a specific, named product, business, or entity
   other than the target, whatever platform it names.
2. `declined_other_platform`: the question is about the active entity, but on another platform.
3. `declined_general_knowledge`: anything else that is not about analyzing these reviews.

The most specific scope mismatch wins. For example, "What do Restaurant B's Yelp reviews say?" (with
Restaurant A on Google Maps active) is `declined_other_entity`. The prompt text is generated from
`QA_DECLINE_PRIORITY`, and S2-004 / S2-015 evaluation cases should use `resolveDeclineOutcome` to
label multi-category questions. Test: `S2-015: labels another entity's reviews on another
platform as declined_other_entity`.

### General knowledge versus another entity (`s2-013.v4`)

An open-ended recommendation or ranking that names no specific business, such as "What are the
best restaurants in New York?", is `declined_general_knowledge` (issue #65 lists it as a
general-knowledge example). A question about a specific, named business, product, or entity other
than the target, such as "What do customers think about Restaurant B?", is
`declined_other_entity`. The priority above applies only when a question genuinely falls under
more than one outcome; an open-ended recommendation does not fall under `declined_other_entity`
because it names no entity. `s2-013.v3` listed "recommendations for other businesses" under
general knowledge while also defining `declined_other_entity` as any different business, which
made this case ambiguous.

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

`REQUEST_TOO_LARGE` is no longer thrown by `buildQaModelRequest`. It is thrown by the S2-011
pre-generation budget check (see below), which needs the configured model.

### Request size budget

| Part            | Limit                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| Review evidence | S2-010: at most 100 reviews and 32 KiB of evidence JSON (checked first)     |
| Whole request   | `QA_MAX_REQUEST_TOKENS` = 16,000 tokens                                     |
| Of which, reply | `QA_RESERVED_OUTPUT_TOKENS` = 1,500, sent to the provider as the output cap |

These constants live here; enforcement lives in S2-011's `qa/token-budget.ts`. It counts the
full model input with OpenAI's token-count endpoint before the generation call. See
`docs/s2-011-answers.md` → "Request budget". The earlier UTF-8 bytes ÷ 3 estimate was removed
because it undercounts dense JSON and IDs. These are application budgets for cost and latency, not
the model's context window. Change the budget only through `QA_MAX_REQUEST_TOKENS`.

### Wiring to S2-010

`runGroundedQaRequest(targetId, question, { buildReviewDatasetContext, invokeModel })` calls
`buildReviewDatasetContext(targetId)`, projects its `target` and `reviews` into the prompt input
with `toPromptContext`, builds the request, and only then calls `invokeModel`. If either builder
throws (S2-010's `ReviewContextError` or `TargetNotFoundError`, or `QaPromptError`), the error
propagates and the model is never called.

The S2-010 builder is passed in rather than imported, so this PR does not depend on the unmerged
PR #78. Its `ReviewDatasetContext` satisfies `QaReviewContext` structurally (it already has
`analysisTargetId` and `reviewDate`), so no type conversion is needed. Once #78 merges, the Q&A
route passes S2-010's `buildReviewDatasetContext` in directly. The projection drops
`target.sourceUrl` and ignores `evidenceJson`, because this module encodes its own dataset from
the listed fields only. The tests mirror S2-010's context shape, error codes, and limits; replace
those stand-ins with imports after #78 merges.

Other safeguards:

- Only `id`, `rating`, `reviewDate`, and `text` are sent per review. Reviewer names, review URLs,
  and source metadata are never sent.
- The target name, review text, and question are JSON-encoded. This preserves the request's
  structure (their content cannot close or forge a prompt section). It does **not** make the
  request resistant to prompt injection: the model still reads the text and may follow
  instructions inside it. The prompt's untrusted-content rule reduces this risk but does not
  remove it.
- The module imports `server-only`, so the prompt text is never shipped to the browser.

## Responsibilities of other stories

- **S2-010 (context):** loads reviews for the authenticated owner's active target and enforces
  the evidence limit. Passed into `runGroundedQaRequest` as `buildReviewDatasetContext`.
- **S2-011 (answers):** calls `runGroundedQaRequest` with a provider invoker that maps
  `QaModelRequest` onto the OpenAI API (`instructions` as the system message, `input` as the user
  message, `maxOutputTokens` as the output limit), and validates the JSON reply.
- **S2-003 (harness):** captures `QaModelRequest` at the model boundary so tests can inspect it
  without a paid API call.
- **S2-009 (UI):** enforces the question length limit before submission. The server must apply the
  same limit.

## Limitations

- The prompt reduces, but cannot guarantee, out-of-scope or ungrounded model output. Scope behavior
  is measured with the S2-004 evaluation set; S2-011 validates the response structure.
- The token budget caps total request size, but the route should still apply its own question
  length limit (S2-009) so users get a clear message before any database work.
- **Still to verify during S2-011 integration:**
  - Provider-input isolation: `instructions` is sent as the system message and review text and
    the question only in the user message, never concatenated into the system message.
  - Response validation: unknown outcomes, malformed JSON, and `citedReviewIds` outside the
    request's `reviewIds` are rejected before anything reaches the user.
  - Full request-size limits: now enforced by S2-011 using OpenAI's token-count endpoint
    before the generation call; the smoke test confirms the count matches reported usage.
- The S2-BR rule text was not available in the repository when this was written. The prompt was
  written from the S2-013, S2-011, S2-012, S2-014, S2-015, and S2-020 issue guidance and should be
  checked against the business rules document.
