# S2-011 — Answers from Review Evidence

**Story:** [#62](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/62) S2-011 |
**Rules:** S2-BR-008 through S2-BR-015 | **Builds on:** S2-013 (PR #76, merged), S2-010 (PR #78)

## Pipeline

`answerQuestion(targetId, question, { buildReviewDatasetContext, callModel })`
(`src/services/qa/answer-question.ts`):

1. **Question validation (service boundary):** the question must be a string of at most 2,000
   characters after trimming, or `QaInputValidationError` is thrown. No data is loaded first.
2. **Context (S2-010):** `buildReviewDatasetContext(targetId)` loads the signed-in owner's reviews
   for the active target, or throws.
3. **Request (S2-013):** `buildQaModelRequest` builds the system instructions, the review dataset,
   and the question. It rejects an empty question, an empty dataset, and reviews from another
   target (`QaPromptError`). It does **not** check the request size or token budget.
4. **Request size (service boundary):** `JSON.stringify(request)` must be at most 128 KiB, or
   `QaInputValidationError` is thrown.
5. **Model call (S2-011):** `callModel(request)`. In production this is `createOpenAiQaModel()`,
   which enforces the token budget before generating; tests pass a deterministic fake.
6. **Reply validation (S2-011):** `parseQaModelReply` checks the reply, or throws
   `QaResponseError`.

A failure at any step throws, and nothing unvalidated is returned. Steps 1–4 run before the
injected model caller.

**Integration entry point.** The Q&A route calls `answerQuestion()`. It is built on
`runGroundedQaRequest()` (`qa-request.ts`), the shared service boundary, which runs steps 1–5 and
stops before the model call if any earlier step throws. Do not call `runGroundedQaRequest()`
directly from a route: it does not validate the reply.

### Where each limit is enforced

| Limit                                                  | Enforced in                                         | When                         | Error                                               |
| ------------------------------------------------------ | --------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| Question is a string                                   | Service boundary (`runGroundedQaRequest`)           | Before the context is loaded | `QaInputValidationError` `QA_QUESTION_INVALID_TYPE` |
| Question ≤ 2,000 characters after trimming             | Service boundary (same limit as the S2-009 route)   | Before the context is loaded | `QaInputValidationError` `QA_QUESTION_TOO_LONG`     |
| Question not blank                                     | `buildQaModelRequest` (S2-013)                      | While building the request   | `QaPromptError` `EMPTY_QUESTION`                    |
| Evidence ≤ 100 reviews and 32 KiB                      | `buildReviewDatasetContext` (S2-010)                | While loading the context    | `ReviewContextError` `REVIEW_CONTEXT_TOO_LARGE`     |
| Serialized request ≤ 128 KiB (`QA_MAX_REQUEST_BYTES`)  | Service boundary                                    | After the request is built   | `QaInputValidationError` `QA_REQUEST_TOO_LARGE`     |
| Serialized count body ≤ 128 KiB                        | OpenAI adapter (`token-budget.ts`)                  | Before any network call      | `QaPromptError` `REQUEST_TOO_LARGE`                 |
| Input ≤ 14,500 tokens (16,000 − 1,500 reserved output) | OpenAI adapter, using OpenAI's `input_tokens` count | Before the generation call   | `QaPromptError` `REQUEST_TOO_LARGE`                 |
| Token count is valid                                   | OpenAI adapter                                      | Before the generation call   | `QaBudgetError` `BUDGET_CHECK_FAILED`               |
| Output ≤ 1,500 tokens                                  | OpenAI (`max_output_tokens`)                        | During generation            | `QaModelError` `RESPONSE_INCOMPLETE`                |
| Provider response ≤ 256 KiB                            | OpenAI adapter                                      | While reading the response   | `QaModelError` `MODEL_FAILED`                       |

The service-boundary checks apply to every caller (the route, the S2-003 harness, scripts) and to
any injected model caller, including test fakes. Token counting needs the configured model and
OpenAI's endpoint, so it stays in the adapter.

| Error                                       | From             | Meaning                                                                              |
| ------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `QaInputValidationError`                    | Service boundary | Question not a string or too long; serialized request too large                      |
| `ReviewContextError`, `TargetNotFoundError` | S2-010           | Not signed in, foreign or missing target, no data                                    |
| `QaPromptError`                             | S2-013 / adapter | Empty question, mismatched data; `REQUEST_TOO_LARGE` from the adapter's token budget |
| `QaBudgetError`                             | Budget check     | OpenAI token-count response was invalid (fails closed)                               |
| `QaModelError`                              | OpenAI client    | Disabled, not configured, provider failure                                           |
| `QaResponseError`                           | Validation       | Malformed or ungrounded reply                                                        |

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

## Insufficient evidence (S2-012)

S2-012 is tested in its own pull request (`docs/s2-012-insufficient-evidence.md`). S2-011 provides
what it relies on: an `insufficient_evidence` reply must have no citations, and an uncited
`answered` reply is rejected as `UNGROUNDED_ANSWER`.

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

Each question makes up to two OpenAI calls, in this order:

1. **Size ceiling (no network).** If the serialized count request exceeds
   `MAX_COUNTABLE_REQUEST_BYTES` (128 KiB), the result is `REQUEST_TOO_LARGE` and nothing is sent to
   OpenAI. Real requests are far below this (S2-010 caps evidence at 32 KiB); it only stops
   absurd payloads from leaving the server.
2. **Token count:** `POST /v1/responses/input_tokens` with the same `model`, `instructions`,
   `input`, and `text.format` (structured-output schema) as the generation request.
3. **Budget check:** generation is allowed only if
   `input_tokens + QA_RESERVED_OUTPUT_TOKENS (1,500) <= QA_MAX_REQUEST_TOKENS (16,000)`, that is,
   at most 14,500 input tokens.
4. **Generation:** `POST /v1/responses`, still with `max_output_tokens: 1500`.

**Why OpenAI's count:** the official token-counting guide says the endpoint returns "the exact
count the model will receive" and "includes formatting tokens used to represent request
structure, such as message roles and boundaries". That removes the need for a guessed overhead
allowance and works for any configured model, with no local tokenizer dependency.

**Fail closed.** No generation call is made if:

- the count request fails (HTTP error, timeout, or network failure → the usual `QaModelError`
  codes, with a log-only `detail` naming the "token count" stage);
- the count response is not exactly `{"object": "response.input_tokens", "input_tokens": <safe
non-negative integer>}` (`QaBudgetError("BUDGET_CHECK_FAILED")`);
- the count is over budget (`QaPromptError("REQUEST_TOO_LARGE")`).

**Tests (mocked endpoints, no real calls):** a count of 14,500 allows generation, and 14,501
blocks it. Every invalid count shape and every count-request failure makes zero generation calls,
and a payload over the size ceiling makes no calls at all. Both requests carry the same model,
instructions, input, and format. S2-010's largest allowed evidence plus a 2,000-character question
passes the size ceiling.

**Limitations**

- **Not yet verified live.** The official
  [count endpoint reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count)
  documents `text.format`, so the count body (`model`, `instructions`, `input`, `text`) uses only
  documented fields. It omits `max_output_tokens` and `store`, which don't affect input size. The
  smoke test must still confirm that `input_tokens` matches the generation response's
  `usage.input_tokens`.
- **Billing and rate limits** of the count endpoint were not stated in the docs read. Each
  question makes one extra API call.
- **Reasoning models:** reasoning tokens count against `max_output_tokens`. A reply that runs out
  ends as `RESPONSE_INCOMPLETE`; it never exceeds the budget.
- **Only the OpenAI adapter enforces the token budget.** A fake `callModel` in tests does not. The
  service-boundary limits (question type and length, 128 KiB serialized request) apply to every
  caller, including fakes.

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
- **Token counting:** `POST /v1/responses/input_tokens` and its response
  `{"object": "response.input_tokens", "input_tokens": N}` are confirmed in the official
  [token-counting guide](https://developers.openai.com/api/docs/guides/token-counting) and API
  reference.
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
- **S2-010 wiring:** PR #78 is merged. `buildReviewDatasetContext` stays injected, so the route
  passes S2-010's real builder and tests pass synthetic ones.
- **Live evaluation:** the S2-003 harness and the S2-004 evaluation set measure real model
  behavior. Q&A stays disabled (`QA_ENABLED`) until that run and team review.
- **Model choice:** `OPENAI_QA_MODEL` is a team decision. Neel suggested `gpt-6-luna` for the
  first controlled evaluation, if the API project supports it.
