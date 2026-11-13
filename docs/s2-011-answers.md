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

**Integration entry point.** The Q&A route calls `answerQuestion()`. It is built on
`runGroundedQaRequest()` (`qa-request.ts`, S2-013), which runs steps 1–3 and stops before the model
call if the context or request builder throws. Do not call `runGroundedQaRequest()` directly from a
route: it does not validate the reply.

| Error                                       | From          | Meaning                                                                    |
| ------------------------------------------- | ------------- | -------------------------------------------------------------------------- |
| `ReviewContextError`, `TargetNotFoundError` | S2-010        | Not signed in, foreign or missing target, no data                          |
| `QaPromptError`                             | S2-013        | Empty question, mismatched data; `REQUEST_TOO_LARGE` from the budget check |
| `QaBudgetError`                             | Budget check  | Model without a confirmed tokenizer, or counting failed                    |
| `QaModelError`                              | OpenAI client | Disabled, not configured, provider failure                                 |
| `QaResponseError`                           | Validation    | Malformed or ungrounded reply                                              |

Every error message is user-safe. None includes review text, model output, provider bodies, or
the API key.

## Reply validation (`qa-response.ts`)

The model must reply with exactly `{"outcome", "answer", "citedReviewIds"}`. Bad replies are
rejected, not repaired:

- `INVALID_MODEL_RESPONSE`: not JSON, an unknown outcome, missing or extra fields, an empty answer,
  an answer over `MAX_ANSWER_CHARACTERS` (8,000), or non-string citations.
- `UNGROUNDED_ANSWER`:
  - a cited review ID that was not in the request (invented, or from another target), for any
    outcome; or
  - `outcome: "answered"` with no citations. S2-011 requires answers that are defensibly
    connected to the reviews, so an uncited "answer" is treated as a general-knowledge guess.
- `UNEXPECTED_CITATIONS`: `insufficient_evidence` or any decline outcome that cites reviews, even
  valid ones. These outcomes are not answers from the reviews, so citations make the reply
  contradictory. They are rejected, not silently dropped.

The citation rules in one table:

| Outcome                  | No citations        | Valid citations        | Unknown citation IDs |
| ------------------------ | ------------------- | ---------------------- | -------------------- |
| `answered`               | `UNGROUNDED_ANSWER` | Accepted               | `UNGROUNDED_ANSWER`  |
| `insufficient_evidence`  | Accepted            | `UNEXPECTED_CITATIONS` | `UNGROUNDED_ANSWER`  |
| `declined_*` (all three) | Accepted            | `UNEXPECTED_CITATIONS` | `UNGROUNDED_ANSWER`  |

The prompt (`s2-013.v3`) states the same contract: a partial answer uses `answered` with
citations and says what the reviews do not cover; every other outcome has an empty
`citedReviewIds`. Accepted replies are normalized: the answer is trimmed, and duplicate citations
are removed.

### Known limitation: citation support is not verified

The validator confirms that each cited review ID belongs to the active dataset. It does **not**
confirm that the cited review supports the claim. For example, an invented parking-safety claim
that cites a food review passes. A test documents this. Semantic support is measured by the
S2-004 evaluation set, which should include cases where the citation does not support the answer.

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
  `usage.input_tokens` / `output_tokens` are returned when present, together with
  `countedInputTokens` from the budget check, so the two can be compared.
- **HTTP errors:** 429 → `MODEL_RATE_LIMITED`; 401 / 403 → `MODEL_AUTH`; other 4xx (except 408) →
  `MODEL_REJECTED`; 408 / 5xx / network → `MODEL_UNAVAILABLE`; timeout → `MODEL_TIMEOUT`.

### Request budget (`token-budget.ts`)

`enforceModelInputBudget()` runs inside the adapter after the request body is built and **before
`fetch()`**. It counts exactly what is sent:

```
counted input = tokens(instructions) + tokens(input: reviews + question)
              + tokens(JSON of text.format: the structured-output schema)
              + QA_MODEL_OVERHEAD_TOKENS (256)

send only if  counted input + QA_RESERVED_OUTPUT_TOKENS (1,500) <= QA_MAX_REQUEST_TOKENS (16,000)
```

`max_output_tokens: 1500` is still sent on every request.

- **Counting method:** [`gpt-tokenizer`](https://github.com/niieani/gpt-tokenizer) 4.1.0 (MIT, no
  dependencies, pinned exactly) with `o200k_base`. That package documents `o200k_base` for the
  GPT-5, GPT-4.1, GPT-4o, and o-series families, which are listed in `QA_MODEL_ENCODINGS`.
  Special-token strings such as `<|endoftext|>` in review text are counted as plain text instead of
  making the tokenizer throw. Counting stops as soon as a part exceeds what is left, so an
  oversized question is never fully tokenized.
- **Fail safely:** a model that is not in `QA_MODEL_ENCODINGS` (for example `gpt-6-luna`, until
  its tokenizer is confirmed) gets `QaBudgetError("MODEL_BUDGET_UNSUPPORTED")`. If the tokenizer
  throws, the error is `QaBudgetError("BUDGET_CHECK_FAILED")`. An over-budget request gets
  `QaPromptError("REQUEST_TOO_LARGE")`. All three happen before any network request. Tests confirm
  zero provider calls.
- **Why not bytes ÷ 3:** a test shows that dense JSON and IDs tokenize to more than UTF-8 bytes ÷
  3, so the old estimate could let an over-budget request through.
- **Tests:** exact counts for dense JSON/IDs, Unicode (emoji, CJK, accents, RTL, ZWJ sequences),
  special-token strings, and schema overhead; a request exactly at the limit is sent once, and
  one token over is never sent; S2-010's largest allowed evidence plus a 2,000-character question
  fits under the default budget.

**Limitations**

- **Overhead is an allowance, not a measured value.** The schema JSON is counted exactly, but
  OpenAI does not publish how it frames messages or wraps the schema. `QA_MODEL_OVERHEAD_TOKENS`
  (256) is a deliberately generous allowance for that. The smoke test should confirm that
  `usage.input_tokens` ≤ `countedInputTokens`.
- **The encoding table must be maintained.** A new model needs its tokenizer confirmed and one
  `QA_MODEL_ENCODINGS` entry. Until then it fails closed.
- **Reasoning models:** reasoning tokens count against `max_output_tokens`. If a reply runs out,
  it ends as `RESPONSE_INCOMPLETE`; it never exceeds the budget.
- **Only the OpenAI adapter enforces the budget.** A fake `callModel` in tests does not.

### Configuration

| Variable          | Required              | Notes                                                   |
| ----------------- | --------------------- | ------------------------------------------------------- |
| `QA_ENABLED`      | Yes, exactly `"true"` | Any other value disables Q&A before any network request |
| `OPENAI_API_KEY`  | When enabled          | Server-only. Never `NEXT_PUBLIC_`.                      |
| `OPENAI_QA_MODEL` | When enabled          | Team decision. There is no default and no fallback.     |

Configuration is read on every call, so a missing key or a disabled flag fails closed before any
network request. Each case has its own error code (`QA_DISABLED`, `API_KEY_NOT_CONFIGURED`,
`MODEL_NOT_CONFIGURED`). `QaModelError.detail` names the missing variable for server logs, for
example "OPENAI_QA_MODEL is not set. There is no default model; set it explicitly." The
user-facing message stays generic. `.env.example` ships with `QA_ENABLED=false` and an empty
`OPENAI_QA_MODEL`, and a test checks both.

### API verification

Checked against the official OpenAI API reference and structured-outputs guide on 2026-11-12.

- **Confirmed:** endpoint, method, and auth header; `instructions` as a system/developer message;
  `input` as a string; `max_output_tokens` (minimum 16); `store`; the
  `text.format` json_schema nesting; the message content shapes `output_text` / `refusal`.
- **Confirmed in review (Shawn, PR #79):** the response text and `usage` fields are documented
  in the [official API reference](https://developers.openai.com/api/reference/resources/responses/methods/create).
- **Still to check with a live call:** the full set of top-level `status` values. The client fails
  closed regardless: only `completed` is accepted, `usage` is optional, and the text is read from
  `output[].content[]`. The planned smoke test with synthetic data will confirm it.

## Running it with synthetic data

No database, network, or API key is needed. Pass a synthetic context builder, and either a fake
model or the real OpenAI adapter with a fake `fetch`:

```ts
import { answerQuestion } from "@/services/qa/answer-question";
import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";

const context = {
  target: { id: "t1", name: "Synthetic Cafe", platform: "google_maps" as const },
  reviews: [
    { id: "r1", analysisTargetId: "t1", rating: 2, text: "Slow service.", reviewDate: null },
  ],
};

const answer = await answerQuestion("t1", "Any complaints?", {
  buildReviewDatasetContext: async () => context,
  // Option A: a fake model that returns a fixed reply.
  callModel: async () => ({
    text: JSON.stringify({ outcome: "answered", answer: "Slow service.", citedReviewIds: ["r1"] }),
  }),
  // Option B: the real adapter with a fake fetch (inspect the outgoing request body):
  // callModel: createOpenAiQaModel({ fetcher: fakeFetch, env: { QA_ENABLED: "true",
  //   OPENAI_API_KEY: "test", OPENAI_QA_MODEL: "test-model" } }),
});
```

Run the existing suites with `npx jest tests/unit/services/qa`. The controlled live smoke test
(real key, synthetic data, spending limit approved) is a separate, manual step that the team
approves first.

## Not in this change

- **Q&A Route Handler and UI (S2-009):** the route must use `requireApiUser()`, apply the
  question length limit, pass S2-010's `buildReviewDatasetContext` and `createOpenAiQaModel()`
  into `answerQuestion`, and map each error class to a response.
- **S2-010 wiring:** `buildReviewDatasetContext` is injected because PR #78 is not merged yet.
- **Live evaluation:** the S2-003 harness and the S2-004 evaluation set measure real model
  behavior. Q&A stays disabled (`QA_ENABLED`) until that run and team review.
- **Model choice:** `OPENAI_QA_MODEL` is a team decision. Neel suggested `gpt-6-luna` for the
  first controlled evaluation, if the API project supports it.
