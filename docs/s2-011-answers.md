# S2-011 / S2-012 — Answers from Review Evidence

**Stories:** [#62](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/62) S2-011,
[#63](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/63) S2-012 |
**Rules:** S2-BR-008 through S2-BR-015 | **Builds on:** S2-013 (PR #76), S2-010 (PR #78)

## Pipeline

`answerQuestion(targetId, question, { buildReviewDatasetContext, callModel })`
(`src/services/qa/answer-question.ts`):

1. **Context (S2-010):** `buildReviewDatasetContext(targetId)` loads the signed-in owner's reviews
   for the active target, or throws.
2. **Request (S2-013):** `buildQaModelRequest` builds the system instructions, the review dataset,
   and the question, and checks the request-size budget, or throws `QaPromptError`.
3. **Model call (S2-011):** `callModel(request)`. In production this is `createOpenAiQaModel()`;
   tests pass a deterministic fake.
4. **Reply validation (S2-011 / S2-012):** `parseQaModelReply` checks the reply, or throws
   `QaResponseError`.

A failure at any step throws, and nothing unvalidated is returned. Steps 1 and 2 run before any
model call.

| Error                                       | From          | Meaning                                            |
| ------------------------------------------- | ------------- | -------------------------------------------------- |
| `ReviewContextError`, `TargetNotFoundError` | S2-010        | Not signed in, foreign or missing target, no data  |
| `QaPromptError`                             | S2-013        | Empty question, mismatched data, request too large |
| `QaModelError`                              | OpenAI client | Disabled, not configured, provider failure         |
| `QaResponseError`                           | Validation    | Malformed or ungrounded reply                      |

Every error message is user-safe. None includes review text, model output, provider bodies, or
the API key.

## Reply validation (`qa-response.ts`)

The model must reply with exactly `{"outcome", "answer", "citedReviewIds"}`. Bad replies are
rejected, not repaired:

- `INVALID_MODEL_RESPONSE`: not JSON, an unknown outcome, missing or extra fields, an empty answer,
  an answer over `MAX_ANSWER_CHARACTERS` (8,000), or non-string citations.
- `UNGROUNDED_ANSWER`:
  - a cited review ID that was not in the request (invented, or from another target); or
  - `outcome: "answered"` with no citations. S2-011 requires answers that are defensibly
    connected to the reviews, so an uncited "answer" is treated as a general-knowledge guess.

Accepted replies are normalized: the answer is trimmed, and duplicate citations are removed.
Decline outcomes never carry citations. `insufficient_evidence` may cite reviews for the part of
the question they do answer (prompt evidence rule 4).

## S2-012: insufficient evidence

The prompt (S2-013 evidence rules 4–5) tells the model to separate what the reviews support from
what they do not, and to return `insufficient_evidence` instead of guessing. The tests use a
controlled dataset with food and service reviews only, and the issue's question: "Do customers
think the parking lot is safe at night?". They check that:

- the dataset sent to the model contains no parking evidence;
- an `insufficient_evidence` reply passes through with its limitation stated;
- an `answered` reply with no supporting reviews is rejected as `UNGROUNDED_ANSWER`.

These tests check the pipeline with a fake model, not live model judgment. Whether the configured
model actually returns `insufficient_evidence` for this question is measured with the S2-003
harness and the S2-004 evaluation set.

## OpenAI client (`openai-qa-client.ts`)

- **Endpoint:** `POST https://api.openai.com/v1/responses` with `Authorization: Bearer`, called
  with `fetch` (no SDK dependency), a 30 s timeout, and `cache: "no-store"`.
- **Provider-input isolation:** `instructions` (the system prompt) is the only system-level input.
  Review text and the question are sent only in `input` (the user message). A test checks this.
- **Structured output:** `text.format` is a strict JSON schema (`QA_REPLY_JSON_SCHEMA`) that
  mirrors the validator. The validator still runs on every reply.
- **Output limit:** `max_output_tokens` is `QA_RESERVED_OUTPUT_TOKENS` from the request budget.
- **Retention:** `store: false`, because the request contains customer review text.
- **Response handling:** only `status: "completed"` is accepted. `incomplete` becomes
  `RESPONSE_INCOMPLETE`, and a `refusal` content part becomes `MODEL_REFUSED`. The text is read
  from `output[].content[]` parts of type `output_text`. Bodies are capped at 256 KiB.
  `usage.input_tokens` / `output_tokens` are returned when present, so the byte-based token
  estimate can be compared with real usage.
- **HTTP errors:** 429 → `MODEL_RATE_LIMITED`; 401 / 403 → `MODEL_AUTH`; other 4xx (except 408) →
  `MODEL_REJECTED`; 408 / 5xx / network → `MODEL_UNAVAILABLE`; timeout → `MODEL_TIMEOUT`.

### Configuration

| Variable          | Required              | Notes                                                   |
| ----------------- | --------------------- | ------------------------------------------------------- |
| `QA_ENABLED`      | Yes, exactly `"true"` | Any other value disables Q&A before any network request |
| `OPENAI_API_KEY`  | When enabled          | Server-only. Never `NEXT_PUBLIC_`.                      |
| `OPENAI_QA_MODEL` | When enabled          | Team decision. There is deliberately no default.        |

Configuration is read on every call, so a missing key or a disabled flag fails closed.

### API verification

Checked against the official OpenAI API reference and structured-outputs guide on 2026-11-12.

- **Confirmed:** endpoint, method, and auth header; `instructions` as a system/developer message;
  `input` as a string; `max_output_tokens` (minimum 16); `store`; the
  `text.format` json_schema nesting; the message content shapes `output_text` / `refusal`.
- **Not confirmed from the page:** the full list of top-level `status` values, the `usage` field
  names, and whether `output_text` appears in the raw REST body. The client is written so that
  each of these fails closed: only `completed` is accepted, usage is optional, and text is read
  from `output[]`. Confirm them with one manual call before enabling Q&A.

## Not in this change

- **Q&A Route Handler and UI (S2-009):** the route must use `requireApiUser()`, apply the
  question length limit, pass S2-010's `buildReviewDatasetContext` and `createOpenAiQaModel()`
  into `answerQuestion`, and map each error class to a response.
- **S2-010 wiring:** `buildReviewDatasetContext` is injected because PR #78 is not merged yet.
- **Live evaluation:** the S2-003 harness and the S2-004 evaluation set measure real model
  behavior. Q&A stays disabled (`QA_ENABLED`) until that run and team review.
- **Model choice:** `OPENAI_QA_MODEL` is a team decision.
