# S2-010 / S2-011 concrete service integration

Refs #61. This integration branch combines S2-010 PR #78 at `c9c7f38` with
S2-011 PR #79 at `1b0d081` (which includes S2-013 PR #76 at `ff2bd35`).
It is stacked on `feature/S2-011-answer-from-reviews`; the exact approved S2-010
commit was cherry-picked without changing its implementation. The original
#78 branch/head and its approvals are preserved.

## Entry point for the route and evaluation owners

```ts
import { answerActiveTargetQuestion } from "@/services/qa/answer-active-target-question";

const answer = await answerActiveTargetQuestion(targetId, question);
```

The server-only binding always calls the real `buildReviewDatasetContext(targetId)`
and supplies its typed output to S2-011's `answerQuestion`. It defaults to the real
`createOpenAiQaModel()` adapter; that adapter remains disabled unless explicitly
configured. Authentication, target ownership and persisted review selection cannot
be replaced through this entry point's options.

For Neel/Deep's deterministic evaluations, replace only the model boundary:

```ts
const answer = await answerActiveTargetQuestion(targetId, question, {
  callModel: async (request) => {
    // Capture the ENTIRE request before returning a controlled model reply.
    captured.push(request);
    return { text: JSON.stringify(controlledReply) };
  },
});
```

These options are a server-only test seam, not HTTP inputs. Mock verified-session
lookup and Supabase HTTP beneath the real builder; do not mock the builder or
ownership checks away. To inspect the final provider envelope including structured
output schema, inject a fake `fetcher` and synthetic `env` into
`createOpenAiQaModel` and pass that caller here. The checked-in tests demonstrate
both boundaries without a real key or paid request.

## Published integration-test candidate

`tests/unit/services/qa/answer-active-target-question.test.ts` exercises the real
binding, authentication guard/repository, context builder, prompt, orchestration,
reply validator and provider serializer. It mocks only auth/session, database HTTP
and model/provider I/O. Thirteen cases cover:

- Exact active-target request/answer and necessary evidence fields.
- Entire outgoing provider body excluding other users, previous targets, reviewer
  names, metadata, source URLs and duplicate serialized evidence.
- Consecutive targets/users without retained evidence or provider conversation IDs.
- Missing/foreign targets returning the same error before review lookup/provider I/O.
- Spoofed identity language in questions not changing verified ownership.
- Missing/outage authentication, review-storage failure, empty data, over-100 rows,
  over-32-KiB evidence and estimated prompt overflow preventing provider invocation.
- Default provider binding with global HTTP mocked and an entirely synthetic env.
- Complete request capture through the model seam while real authorization remains.

The existing S2-010 42-case suite separately covers malformed rows, duplicate IDs,
exact byte/count boundaries, incomplete reads and actual SDK query filters.
These are service-level integration tests, not browser or hosted-RLS acceptance.

## Concrete route handoff (Melissa / Aryan)

The new binding is callable production code, but this PR does not invent or replace
Melissa's Q&A Route Handler or workspace UI. The route owner should:

1. Authenticate the request with the shared server guard and validate/bound the
   request body and question using the agreed HTTP schema. Never accept owner IDs,
   browser review arrays, prior context or model thread IDs as authoritative input.
2. Take the requested active target ID from that contract and call the binding.
   The binding re-verifies identity/ownership independently for each question.
3. Map errors to the existing `{ success, error: { code, message } }` response
   envelope with private/no-store headers. Preserve indistinguishable 404 denials.
   Proposed context-code mappings remain in `s2-010-review-context.md`; they are
   proposals until the route owner finalizes them. Never expose raw exceptions.
4. Return the validated answer with its target identity. Correlate it with the
   target/session/request in the UI; never label an arbitrary reply as current.
5. Integrate S2-018's session coordinator for pending work and late responses, and
   independently align summary state with the same active target. Do not reuse a
   previous target's provider conversation history.
6. Add tests against the actual route (not a copied route or mocked-out builder),
   then browser happy/failure/switching checks. Port the adversarial cross-user
   scenarios into S2-016's shared harness and configured-model evaluations.

## Full model-token budget is still an open gate

S2-010's evidence limits are enforced exactly: 100 reviews and 32,768 serialized
UTF-8 bytes, with no truncation. Current S2-013 computes input estimates as
`ceil(bytes(instructions)/3) + ceil(bytes(input)/3)` and reserves 1,500 output
within a 16,000-token application budget. The overflow path is tested here.

This is not proof of a hard complete token cap: the provider adapter adds a
response schema after this calculation, bytes/3 is not established as an upper
bound for arbitrary accepted text, and provider usage arrives only after the call.
Aryan must validate/enforce the chosen model's complete pre-invocation budget,
including schema/protocol overhead and reserved output, with boundary/adversarial
text tests. No budget fix or model configuration is silently added by this branch.
This PR cannot satisfy that acceptance gate by renaming an estimate as a limit.

Shawn's selected initial model/evaluation policy was communicated as
`gpt-5.4-mini-2026-03-17`, retaining citation requirements and keeping the shared
Q&A environment disabled until integration/evaluations pass. The team/provider
operator must configure and verify access; this branch changes no credentials,
paid-call flags, model settings, environment files or spending limits.

## Reviews, merge order and remaining acceptance

#78's source-level functional review (Neel), independent security review (Bansi)
and CI passed at `c9c7f38`. They do not automatically approve this new binding.
This integration PR needs its own normal/security review and current-head CI.

Keep the integration PR Draft while these dependencies are unmerged. Merge the
approved parent stories under the team's agreed order, then reconcile the stack
against main, inspect squash-history duplication, remove already-merged parent
changes from the diff, retarget and rerun checks before final integration merge.
Do not merge this stacked branch early to bypass #76/#78/#79 reviews.

Keep #61 open until production entry-point wiring, full budget enforcement and
the team's integrated/manual acceptance are demonstrated. S2-014/015/016 and
S2-018/019 retain their own configured-model, security and switching acceptance.
No claim is made that this module alone completes those stories.

## Validation

The completion checkpoint records actual checks below. No live model call,
hosted mutation, migration or dependency/lockfile change was made. Test-only
synthetic markers are not actual confidential user data.

AI assistance: Codex. The available original follow-up dialogue, tool failures and
corrections are retained in
`ai-transcripts/2026-11-12_shawn_S2-010_integration_codex.md`.

### Completion checkpoint

- 812 Jest tests / 54 suites passed on the combined branch, including the new
  13-case integration suite and the original 42 context cases.
- The seven QA suites passed 167 tests together.
- New binding coverage is 100% statements, branches, functions and lines.
- ESLint, TypeScript and normal Next.js production build passed; formatting and
  staged whitespace checks are recorded with the final commit preparation.
- Typecheck initially found that the synthetic process.env fixture omitted
  Next.js's required NODE_ENV field. The fixture now explicitly uses test; the
  subsequent typecheck and production build passed.
- Dependencies were installed with npm ci --ignore-scripts from the unchanged
  lockfile. No dependency/package/lockfile change is included.
- Native DB/browser suites and live model calls were not run for this service
  binding; route/UI, hosted RLS and configured-model acceptance remain separate.
