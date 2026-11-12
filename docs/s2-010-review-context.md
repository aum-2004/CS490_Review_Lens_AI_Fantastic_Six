# S2-010: Review dataset context for Q&A

Issue: [#61](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/61).
Owner: Shawn. Status: context implementation with a typed S2-013 handoff;
S2-011 caller integration, human/security review and PR CI remain pending.

## Scope and architectural decision

For the current course-scale datasets, supply **all persisted reviews of one owned
target**, subject to explicit limits. Do not introduce embeddings, a retrieval index,
ranking or model conversation memory. This avoids selecting a different hidden
subset from the dataset represented by the ingestion summary.

The initial policy supports at most **100 reviews** and **32,768 UTF-8 bytes** of
serialized evidence, including target identification and JSON framing/escaping.
Current provider ingestion caps one completed run at 30 reviews, but imported or
older datasets may be larger. Every otherwise valid dataset must still fit the
byte budget. Limits are application constants, not browser-controlled options.

The database read selects five review columns and at most 101 rows. An exact count
detects a too-large dataset or a project Max Rows cap below the requested limit.
Incomplete results fail closed; they are never labeled a complete context.
Oversized data produces a typed error, with **no truncation, partial context,
automatic summarization or general-knowledge fallback**. A future retrieval strategy
can replace this policy after an explicit team decision and new tests.

On 2026-11-12 Shawn delegated the architectural decision for this story to this
implementation; the bounded complete-dataset strategy and limits above are the
chosen initial policy. This does not claim that Aryan selected a specific model
or that a provider's entire context window is available for review evidence.
**Bytes are not tokens.** S2-011 must validate its complete outgoing request against
the chosen model's token budget, including system instructions, question, evidence,
message overhead and reserved output. Reduce this budget or add a reviewed
selection strategy if necessary; do not silently slice the serialized evidence.

## Server-side contract

Entry point: `src/services/qa/review-context.ts`.

```ts
buildReviewDatasetContext(targetId: unknown): Promise<ReviewDatasetContext>
```

The only caller input is the active target identifier. Do not accept browser review
arrays, owner IDs, prior context or provider thread IDs. The service internally:

1. Verifies the cookie-session identity through `getAuthenticatedUser()` every call.
2. Creates a request/session-scoped Supabase server client; never a service-role client.
3. Calls the existing `getOwnedTargetOrThrow()` before any review read.
4. Loads bounded, target-filtered persisted review evidence with deterministic
   `created_at, id` ordering and an exact total in the same request.
5. Requires complete results, valid text/ratings/dates, matching target IDs and unique row IDs.
6. Projects only target identification and review ID/target ID/text/rating/date,
   then serializes and enforces the UTF-8 byte budget before returning.

The return value contains:

| Field           | Meaning                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------- |
| `target`        | Persisted target ID, name, platform and source URL                                        |
| `reviews`       | Typed readonly `ReviewEvidence[]`, structurally compatible with S2-013's `PromptReview[]` |
| `reviewCount`   | Exact number of included persisted reviews                                                |
| `strategy`      | `all-persisted-reviews`                                                                   |
| `evidenceJson`  | JSON `{ target, reviews: [{ id, analysisTargetId, text, rating, reviewDate }] }`          |
| `evidenceBytes` | UTF-8 size of that exact JSON string                                                      |

This is a **server-only internal contract**, not a public browser endpoint. It does
not supply a system prompt or invoke an LLM. Source URLs and target names identify
the active entity; they are data, not instructions. Reviewer names, owner identifiers,
arbitrary source metadata and ingestion-job details are not selected for model input.
Written review text can itself contain personal information: this projection is not
a PII detector, redactor or substitute for the team's data-sharing permission policy.

Review text is untrusted evidence. JSON serialization prevents it from changing the
envelope's structure; it does **not** prove prompt-injection resistance. S2-013 must
keep high-priority instructions separate and explicitly treat reviews as data.
S2-004/#74 model-boundary evaluations must verify the resulting behavior.

## Direct S2-013 handoff

The typed `reviews` field avoids parsing or reconstructing authorized evidence and
preserves the parent ID for S2-013's mismatch backstop. A nullable persisted date is
retained for dated evidence. Its type is based on the existing `Review` domain type,
so this branch need not import or duplicate Aryan's unmerged prompt module.

When S2-013 is available in the consuming branch, S2-011 can compose it directly:

```ts
const context = await buildReviewDatasetContext(activeTargetId);
const request = buildQaModelRequest({
  target: context.target,
  reviews: context.reviews,
  question,
});
// S2-011 validates the complete request budget before invoking its model adapter.
```

`evidenceJson`/`evidenceBytes` describe the complete bounded dataset for auditing;
they must not be concatenated with a second copy of `reviews` in the model request.
S2-013 formats its own representation from the typed fields. Runtime ownership is
still S2-010's responsibility; prompt-level mismatch checks are an extra backstop.

## Errors and proposed caller mapping

The service returns no partial context on failure and logs no review text or raw
provider errors. Callers must stop before model invocation on every error.

| Error                                            | Proposed HTTP mapping | Caller behavior                                                 |
| ------------------------------------------------ | --------------------- | --------------------------------------------------------------- |
| `ReviewContextError: AUTH_REQUIRED`              | 401                   | Sign-in required                                                |
| `ReviewContextError: AUTH_UNAVAILABLE`           | 503                   | Retryable authentication outage                                 |
| Existing `TargetNotFoundError: TARGET_NOT_FOUND` | 404                   | Same denial for missing, foreign or malformed IDs               |
| `ReviewContextError: NO_REVIEW_DATA`             | 409                   | No normal grounded-answer workflow; coordinate S2-020           |
| `ReviewContextError: REVIEW_CONTEXT_TOO_LARGE`   | 413                   | Explain unsupported dataset size; do not truncate               |
| `ReviewContextError: REVIEW_CONTEXT_UNAVAILABLE` | 503                   | Safe failure for incomplete, invalid or unavailable persistence |

The existing HTTP response envelope and private/no-store headers remain the caller's
responsibility. No new route, mutation, migration, dependency or secret is introduced.
The builder checks persisted evidence, not ingestion-status presentation. S2-005/020
own readiness/status UX; do not infer successful ingestion merely from review rows.

## Integration handoff

- **Aryan (S2-011/013):** invoke the builder for each question, pass its typed
  target/reviews to `buildQaModelRequest`, enforce the whole-request token budget,
  and stop on errors. Never reuse prior
  review messages/provider threads when switching targets. Do not send this internal
  context back to the browser simply to send it to the server again.
- **Melissa (S2-009/017/020):** submit the active target ID, not evidence or owner
  claims; handle no-data, oversized and unavailable results. UI response ownership
  and pending-request behavior are separate S2-018/019 integration concerns.
- **Bansi (S2-008):** summaries and Q&A share the persisted target boundary. The
  context either includes every review or declines the unsupported dataset; it
  never silently claims that a subset represents the full summary.
- **Neel (S2-016):** use two users and distinctive evidence; inspect all actual
  model-input fields once S2-011 exists, including IDs/metadata and prior messages.
- **Deep (S2-002/003):** use this entry point through a controlled persistence
  boundary, capture actual Q&A model requests and add critical integration coverage.
- **Shawn (S2-018/019):** no cross-request context cache is introduced. Fresh builder
  reads are foundational coverage only; UI races, late answers and any future chat
  memory still require the separate switching/stale-context stories.

S2-013 request construction is available in PR #76 and has been tested against this
builder in isolation. S2-011 orchestration and Q&A UI integration are not present on
main yet. Consequently this service does not establish live-model grounding,
full S2-016 isolation or completion of S2-018/019. Do not close those stories based
on the context tests alone.

## Validation and review

`tests/unit/services/qa/review-context.test.ts` composes the production builder,
ownership guard/repository and **real Supabase SDK** against synthetic HTTP row
fixtures. It verifies query scoping/count/limit/ordering, safe errors, data projection,
fresh reads, two-user boundaries, wrong-target rejection, incomplete reads, empty
data and exact/over-budget cases. Persistence updates in these fixtures do not prove
actual hosted RLS or database transactions. Existing SQL tests remain separate.

Initial local verification on 2026-11-12 (base `f931a34`, before the dated typed handoff):

- All 682 Jest tests across 48 suites passed, including the existing Sprint 1 tests.
- All 37 focused context tests passed. Measured coverage of the new module is 100%
  statements, branches, functions and lines. This is not a claim that the team's
  S2-001 changed-code CI gate is already configured or passed remotely.
- Repository formatting, lint, explicit typecheck and production build passed.
- No hosted database operation, paid provider request or model invocation occurred.
- Browser and native database suites were not rerun for this server-only read
  service. No schema or existing page/route behavior changed.
- No real Q&A caller was available to manually exercise. Human acceptance and
  model-boundary integration remain outstanding rather than being inferred from
  fixture tests.

Completion follow-up on 2026-11-12:

- All 687 Jest tests across 48 suites passed. The 42 context tests retain measured
  100% statement, branch, function and line coverage of the new module.
- Final lint, formatting, explicit typecheck and production build passed.
- The context suite now has 42 tests, including typed target-linked evidence and
  nullable/invalid persisted dates.
- The exact S2-013 implementation at PR #76 commit `66cee597d46daf792df23a8a881bb8f2dfba7a18`
  was composed with this builder in a detached worktree, without editing Aryan's
  files. All 66 tests passed: 18 prompt tests, 42 context tests and six compatibility
  probes. The composed source also passed TypeScript checking.
- The six probes captured the complete request from the real `buildQaModelRequest`
  and verified typed date handoff, exclusion of foreign content/metadata, same-user
  target switching, account changes and no controlled-model invocation after
  foreign/missing/no-data/size errors.
- These probes use a controlled consumer, synthetic persistence and a mocked model.
  They do not certify an S2-011 endpoint that has not been implemented. The probe
  artifacts are preserved outside the repository under the project-artifacts
  folder; the original command/code is also retained in the AI transcript.
- Three additional guard-removal probes were rejected by test assertions: removing
  the review target check, the evidence-byte limit or the incomplete-dataset check
  each fails the context suite. These mutations ran only in the detached copy;
  restoring it returned all 42 tests to passing.

## Release checklist

- [x] Server-only persisted context service and explicit retrieval/size policy.
- [x] Fresh verified identity and existing target-ownership guard per invocation.
- [x] Typed prompt-compatible projection and safe errors without partial evidence.
- [x] Active-target, cross-user, empty-data, transition and boundary tests.
- [x] Interoperability with the actual S2-013 snapshot (not a copied prompt fixture).
- [x] Local configured checks and available original AI dialogue retained.
- [ ] Author reviews the final implementation before opening the PR.
- [ ] Normal and independent security reviews; published-head CI.
- [ ] S2-011 calls this builder in the running application and enforces the complete
      model-request token budget; integrated model-boundary/manual acceptance.
- [ ] Merge and update the issue/board after acceptance.

The context implementation is ready for review/integration. This checklist keeps
unavailable downstream wiring and human/remote acceptance visible; it does not
represent the entire story as already Done or authorize closing #61.

Run the focused checks with:

```powershell
npm.cmd test -- --runTestsByPath tests/unit/services/qa/review-context.test.ts
```

Before merge: obtain normal and independent security
review under `docs/AI-Assisted-Development.md` section 7, retain the original available
AI dialogue and verify PR CI. The Sprint 2 changed-code gate and deterministic
orchestration harness are team dependencies, not implemented by this story.

AI assistance: Codex. The available original implementation dialogue is retained
in `ai-transcripts/2026-11-12_shawn_S2-010_codex.md`, with scope and redaction notes.

API references checked during implementation:
[Supabase select/count](https://supabase.com/docs/reference/javascript/select),
[Supabase limit](https://supabase.com/docs/reference/javascript/using-modifiers-limit),
and installed Next.js 16.4.3's `01-app/02-guides/data-security.md`.
