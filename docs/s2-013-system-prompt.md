# S2-013 — ReviewLens System Prompt

**Story:** [#64](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/64) |
**Rules:** S2-BR-015 through S2-BR-021 | **Source:** `src/services/qa/system-prompt.ts`,
`src/services/qa/qa-request.ts`

## What this provides

| Export                           | Purpose                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `buildSystemPrompt`              | ReviewLens rules bound to the validated active review platform, but independent of target name. |
| `buildQaModelRequest`            | The full provider-neutral model request: system instructions plus review dataset and question.  |
| `SYSTEM_PROMPT_VERSION`          | Version tag sent with every request. Bump it whenever the prompt text changes.                  |
| `QA_OUTCOMES`                    | The machine-readable outcomes the model must return.                                            |
| `QA_COVERAGE`                    | The coverage enum (`complete`, `partial`, `none`) that replaced the free-text `note` in v7.     |
| `MAX_CLAIM_STATEMENT_CHARACTERS` | Longest claim statement (300). Stated in the prompt, enforced by `qa-response.ts`.              |
| `QaPromptError`                  | Thrown when a request cannot be built safely. The caller must not call the model.               |
| `QA_DECLINE_PRIORITY`            | Which decline outcome wins when more than one applies.                                          |
| `resolveDeclineOutcome`          | Returns the winning decline outcome; used to label multi-category evaluation cases.             |
| `QA_MAX_REQUEST_TOKENS`          | The single configurable cap on one model request, in tokens (enforced by S2-011, see below).    |
| `QA_RESERVED_OUTPUT_TOKENS`      | Output tokens reserved for the reply; sent to the provider as `maxOutputTokens`.                |
| `runGroundedQaRequest`           | (`qa-request.ts`) Builds the S2-010 context, then the request, then calls the injected model.   |

The prompt text lives only in source control (`src/services/qa/system-prompt.ts`). It is not
configured in a hosted AI console. Changes go through a reviewed pull request and a version bump.

## Prompt requirements and where they are covered

| S2-013 requirement                                   | Prompt section     | Test                                                      |
| ---------------------------------------------------- | ------------------ | --------------------------------------------------------- |
| Identifies the product/entity being analyzed         | Target metadata    | `keeps the active target name in metadata…`               |
| Identifies the review platform                       | Active dataset     | `states the trusted Google Maps platform in instructions` |
| Answers come only from the supplied reviews          | Evidence rules 1–2 | `restricts answers to the supplied review dataset`        |
| Unsupported information is not invented              | Evidence rules 3–5 | `forbids inventing unsupported information…`              |
| General-knowledge questions are declined             | Scope rule 6       | `requires declining general-knowledge questions`          |
| Other products, entities, and platforms are declined | Scope rules 7–8    | `requires declining other entities and other platforms`   |

The prompt also tells the model to treat target metadata values, review text, and questions as
untrusted data, and not to repeat reviewer personal details.

## Target-name injection hardening (`s2-013.v5`)

The v5 system instructions contain no AnalysisTarget name or other user-controlled target value.
V5 placed both the target name and review platform in a JSON object at the start of the user turn.
Its deterministic request-shape evidence is historical and does not establish trusted-platform
authority for v6.

This is a message-hierarchy control, not a claim that JSON escaping sanitizes natural-language
instructions. JSON encoding prevents a hostile value from forging the surrounding sections, while
keeping the value out of the system message prevents it from receiving system-level authority.
Deterministic tests cover names that ask to ignore prior instructions, reveal the system prompt,
switch businesses, forge role delimiters, and inject quotes or JSON-like text. They also prove that
the instructions remain byte-for-byte target-independent and that the review IDs and evidence rows
remain those selected by the authenticated context builder.

## Trusted platform authority (`s2-013.v6`)

V6 keeps the target name out of system instructions and serializes only `{ "name": ... }` in the
untrusted `TARGET METADATA` section. The platform is different: `AnalysisTarget.platform` is
validated by the application boundary and has the closed `ReviewPlatform` type. The request
builder resolves it through the exhaustive `REVIEW_PLATFORM_LABELS` mapping and passes that typed
label to `buildSystemPrompt`. The ACTIVE DATASET section and scope rules 8–9 therefore identify the
authoritative platform in system instructions. A `reviewPlatform` value forged in the target name,
review text, question, or extra user-turn metadata cannot change that authority.

The review dataset and question remain separately JSON-encoded in the user turn. This preserves
section structure, but is not itself a claim that JSON encoding neutralizes malicious prose.
Deterministic tests inspect the constructed request, parse each JSON section, prove forged headers
remain inside review/question strings, and compare instructions before and after injecting forged
content. The real authorized review IDs and rows are also checked unchanged.

## Model response contract

The model must reply with only this JSON object:

```json
{
  "outcome": "answered",
  "claims": [
    { "statement": "plain text", "evidence": [{ "reviewId": "<id>", "quote": "<exact>" }] }
  ],
  "coverage": "complete"
}
```

**Current version: `s2-013.v7`.** Since `s2-013.v5`, every finding is a claim whose evidence quotes
one contiguous passage of the cited review. `v6` is reserved by PR #103 (target-name hardening,
not merged yet), so the next prompt change in PR #104 is `v7`. `v7` changes, compared with `v5`:

- **`note` is gone.** It was free text the server could not check. It is replaced by
  `coverage`, a closed enum: `complete` or `partial` for `answered`, and `none` for every other
  outcome. Any other combination is rejected.
- **The server writes all non-claim text.** Decline, insufficient-evidence, and partial-coverage
  wording comes from `nonAnswerText` and `PARTIAL_COVERAGE_TEXT` in `qa-response.ts`. Evidence
  rules 4 and 5 and scope rule 9 now tell the model not to write that text.
- **Statements are short.** One plain-text sentence, at most `MAX_CLAIM_STATEMENT_CHARACTERS`
  (300), with no review IDs. The prompt also says that each quote is shown next to its statement.

Scope rules 6–8, the outcome definitions, the decline priority, and the untrusted-content and
privacy rules (10–11) are unchanged. A test (`v7 combined prompt: main's S2-013 protections and
the grounding rules together`) checks that one prompt carries both. See `docs/s2-011-answers.md`
for validation.

| `outcome`                    | Meaning                                                                                              | S2-004 category                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `answered`                   | The reviews contain evidence that answers the question                                               | `answer_from_active_reviews`          |
| `insufficient_evidence`      | In scope, but the reviews lack the evidence                                                          | `insufficient_review_evidence`        |
| `declined_general_knowledge` | Not about analyzing these reviews, including open-ended recommendations about no particular business | `decline_unrelated_general_knowledge` |
| `declined_other_entity`      | About, or comparing the target with, any other business or entity, named or only described           | `decline_other_entity_or_product`     |
| `declined_other_platform`    | About reviews from a different platform                                                              | `decline_other_review_platform`       |

### Outcome priority

When a question falls under more than one decline outcome, the model must use the first match in
`QA_DECLINE_PRIORITY`:

1. `declined_other_entity`: the question is about, or compares the target with, any other product,
   business, or entity (named or only described), whatever platform it names.
2. `declined_other_platform`: the question is about the active entity, but on another platform.
3. `declined_general_knowledge`: anything else that is not about analyzing these reviews.

The most specific scope mismatch wins. For example, "What do Restaurant B's Yelp reviews say?" (with
Restaurant A on Google Maps active) is `declined_other_entity`. The prompt text is generated from
`QA_DECLINE_PRIORITY`, and S2-004 / S2-015 evaluation cases should use `resolveDeclineOutcome` to
label multi-category questions. Test: `S2-015: labels another entity's reviews on another
platform as declined_other_entity`.

### General knowledge versus another entity (retained from `s2-013.v4`)

An open-ended recommendation or ranking that is not about the target and points to no particular
business, such as "What are the best restaurants in New York?", is `declined_general_knowledge`
(issue #65 lists it as a general-knowledge example). A question about any other business, product,
or entity is `declined_other_entity`, whether it is named ("What do customers think about
Restaurant B?") or only described ("the place across the street"). Questions comparing the target
with other businesses ("Is it better than other restaurants nearby?", "better than the average
cafe") are also `declined_other_entity`, unless the supplied reviews themselves contain the
comparison evidence. `s2-013.v3` listed "recommendations for other businesses" under general
knowledge while also defining `declined_other_entity` as any different business, which made the
New York case ambiguous. An earlier draft of this change limited `declined_other_entity` to
"specific, named" entities; security review (#89) showed that let unnamed comparisons slip
through, so "named or only described" replaced it.

S2-011 validates this reply before showing anything to the user: it rejects unknown outcomes and
coverage values, any extra field (including the removed `note`), review IDs that were not in the
request's `reviewIds`, quotes that are not contiguous spans of the cited review, and statements
that contain a review ID or repeat eight or more consecutive words of this prompt (`PROMPT_ECHO`).

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
- The target name is JSON-encoded in `TARGET METADATA`; review text and the question are separately
  JSON-encoded. The trusted platform label is resolved from the validated target platform and is
  included in system instructions, not taken from user-turn metadata.
- `targetId` and the exact review IDs remain application-side authorization/audit fields. A target
  name never selects persisted rows; S2-010 ownership and target-scoped review queries do that, and
  `REVIEW_TARGET_MISMATCH` remains the final fail-closed check.
- The module imports `server-only`, so the prompt text is never shipped to the browser.

## Evaluation provenance and prompt-version validation

Configured-model results recorded before the target-name hardening belong to `s2-013.v4`; they do
not validate v5 or v6. V5 artifacts, if present, remain tied only to v5 and do not validate v6's
trusted-platform authority boundary. The historical S2-014 and S2-015 documents and artifact
manifests intentionally retain their original prompt-version labels.

V6 requires a fresh deterministic offline harness run to verify request construction, prompt
version capture, refusal-case orchestration, budgets, and artifact/report mechanics. No v6 live
or paid-model evaluation has been performed or is authorized by this change. Before production
enablement, v6 still needs independent security review and a separately authorized
configured-model evaluation covering target identification, the trusted Google Maps label,
refusal priority, scope behavior, forged metadata in target names/reviews/questions, and unchanged
citation behavior. The spending guard and explicit approval requirements in
`s2-configured-model-evaluation-harness.md` still apply.

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
- Provider-input isolation is deterministic: `instructions` contains fixed rules plus the trusted
  validated platform label, while the target name, review evidence, and question are sent only in
  `input`. The adapter tests exercise both token counting and generation with fake HTTP; semantic
  adherence still requires the separately authorized v6 evaluation described above.
- Response validation: unknown outcomes and coverage values, malformed JSON, extra fields
  (including the removed `note`), review IDs outside the request's `reviewIds`, unverifiable
  quotes, and statements that echo the prompt (`PROMPT_ECHO`) are rejected before anything
  reaches the user.
- The S2-BR rule text was not available in the repository when this was written. The prompt was
  written from the S2-013, S2-011, S2-012, S2-014, S2-015, and S2-020 issue guidance and should be
  checked against the business rules document.
