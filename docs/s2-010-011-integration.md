# S2-010 integration evidence and S2-011 handoff

Refs #61. S2-010 remains an independent, main-based change. No S2-011 or S2-013
production source is copied into this branch, and no combined branch is required.

## Use the existing S2-011 entry point

Once the consuming branch contains S2-010 and S2-011, the route owner composes them
directly using Aryan's existing API:

```ts
import { answerQuestion } from "@/services/qa/answer-question";
import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";
import { buildReviewDatasetContext } from "@/services/qa/review-context";

const answer = await answerQuestion(targetId, question, {
  buildReviewDatasetContext,
  callModel: createOpenAiQaModel(),
});
```

An extra `answerActiveTargetQuestion` wrapper is optional and is not part of this
branch. The builder still resolves the authenticated identity internally, checks
target ownership before reviews, and selects fresh persisted evidence every call.
Pass its typed target/reviews into the existing prompt flow; never append a second
copy of `evidenceJson` or accept browser evidence/owner claims as authoritative.

The route owner retains responsibility for the agreed request schema, bounded
question/body validation, safe error mapping, private/no-store responses and
target-tagged replies. UI/summary switching and late-response correlation remain
with their owning stories. These tests do not create a production route.

## Preserved integration tests

`tests/unit/services/qa/review-context-pipeline.integration.test.ts` preserves the
useful real-service scenarios developed during the separate integration work.
It calls the actual context builder, ownership helper/repository, prompt,
orchestrator, response validator and provider serializer. Only authentication,
database HTTP and provider I/O are mocked. No real key or paid request is needed.

The 16 cases cover complete outgoing provider-body projection, active-target and
cross-user isolation, consecutive targets/users, indistinguishable foreign/missing
denials before review reads, authentication/storage/empty/size failures preventing
provider invocation, the serialized request ceiling and foreign-citation rejection.
The fixture handles the real count-then-generate protocol. Count and generation
must carry the same model, instructions, input and schema, with no previous-target
evidence in either request. A count of 14,500 permits generation; 14,501, an invalid
count or an unavailable count endpoint prevents generation. Counting itself is a
provider request, so these checks distinguish no generation from no network call.
Test-local structural types are not new shared production interfaces.

### Explicit dependency gate

This branch does not contain S2-011 yet. The integration suite therefore reports
**16 skipped cases**, rather than replacing the missing pipeline with a fake or
importing unmerged production modules. The original 42 builder tests still run.
Once the real `answer-question.ts` exists in the consuming checkout, the suite
loads the actual modules; missing/broken transitive dependencies fail normally.

For integration acceptance, skipping must be forbidden:

```powershell
$env:REQUIRE_QA_INTEGRATION = 'true'
npm.cmd test -- --runTestsByPath tests/unit/services/qa/review-context-pipeline.integration.test.ts
```

The strict mode fails immediately if S2-011 is absent. Run it in the integrated
checkout, not this incomplete main-based branch. The team must enable strict mode
in its integrated CI gate or remove the temporary dependency gate once S2-011 is
merged. A green run with skipped cases is **not** integration acceptance.

For Neel/Deep's model-boundary evaluations, inject `callModel` through the existing
`answerQuestion` API while retaining the real builder and its ownership checks.
Capture the entire request, not only the displayed answer. Inject the provider
adapter's fake fetcher when checking the final HTTP envelope, including schema.

## Current integration status (2026-11-13)

- S2-013 #76 is merged into main at `ed686a26`.
- S2-011 #79 at `78c914e` uses the provider-authoritative input-token count and
  rejects counting failures, invalid counts and input above 14,500 before generation.
- S2-009 #84 at `2a138d7` wires its real questions route/UI to this builder and
  `answerQuestion`. It bounds question/body input, checks ownership before body
  reads and returns validated target-tagged, private/no-store responses.
- The #84 integration passed 1,120 tests, typecheck, lint, a production build and
  three production-browser tests during its review. Browser success replies were
  intercepted; service-path tests mock only database/auth/provider infrastructure.
- A fresh detached integration with current main also passed 1,120 tests and
  typecheck after preserving the reviewed S2-011 versions in four S2-013
  squash-history conflicts. No branch or protected merge was performed.

The builder and deterministic production-path integration are now demonstrated.
Final reviewer reconfirmation, updated-head CI, merge coordination and the team's
final acceptance remain. Hosted RLS, live-model grounding and the full switching
stories are not certified by these checks.

Local PR refresh verification after reconciling main at `ed686a26`:

- 907 tests passed; the 16 portable integration cases were explicitly skipped
  because this independent branch does not include S2-011.
- The exact refreshed portable suite passed all 16 cases with strict mode against
  the actual S2-009/S2-010/S2-011 integration and current main in a detached checkout.
- Formatting, lint, typecheck and the standalone production build passed.
- Only tests/docs/transcript changed beyond the upstream main reconciliation;
  the production context builder, request contract and dependency lockfile did not.
- Original available task records are retained in
  `ai-transcripts/2026-11-13_shawn_S2-010-pr-refresh_codex.md` with explicit cutoff
  and privacy notes. No remote action or final team acceptance is inferred.

The merged S2-003 harness no longer depends on #82 and rejects cited refusals in
line with #79. Its documented oversized-question case still needs its Phase 2
boundary adjustment: a fake `callModel` bypasses the real adapter's budget check.
Use the actual route or actual adapter with mocked count/generation transport for
budget assertions; do not substitute a fake builder or claim that case passes.

## Historical verified snapshots

- S2-010 builder: `c9c7f385a8355264491d93366ce36f2635ae75b9` (#78).
- Latest checked S2-011: `8b4ca92d89ffa38d3fd9c69ce32a37451f78029e` (#79).
- The exact portable suite passed with `REQUIRE_QA_INTEGRATION=true` against those
  real sources in a detached checkout: **183 tests / seven QA suites passed**,
  including all 12 integration cases and the original 42 context tests.
- That composition also passed TypeScript checking. It used synthetic I/O and
  does not certify hosted RLS, browser behavior or live-model judgment.
- Earlier optional-wrapper branch #82 passed 812 tests and CI #147 at `9261b86`.
  Those results belong to that older combined snapshot, not this PR's current CI.

## Token budget and remaining acceptance

S2-010 enforces the exact 100-review / 32,768-byte evidence policy. S2-011 at
`78c914e` now builds the actual provider body, rejects count requests above 128 KiB,
and calls `/v1/responses/input_tokens` with the same model, instructions, input and
structured-output format used for generation. It permits generation only when
the validated input count plus 1,500 reserved output tokens fits 16,000. The old
bytes/3 estimate, local tokenizer and 256-token overhead allowance are superseded.

The refreshed 16-case portable suite verifies this protocol against the actual
adapter when present. Standalone skipped cases remain explicitly unaccepted.
CI of the consuming integration must run strict mode or retain equivalent
unconditionally executed actual-route checks. Current-head reviews and final
team acceptance are needed before merging/closing #61. Configured-model smoke
tests and hosted verification remain separate; no real provider call was made.

## Retiring the optional combined PR

The integration documentation and portable scenarios are consolidated into #78.
#82 can be closed without merging. Its branch and commit `9261b86` retain the
original optional wrapper, tests, transcript and historical evidence; no branch
is deleted or force-pushed. Aryan/Neel may adopt any remaining useful artifacts in
their own PRs. Neither #78 nor #79 needs the extra wrapper to integrate.

The original functional/security approvals and CI belong to #78 at `c9c7f38`.
This documentation/test consolidation needs current-head CI and reviewer
reconfirmation where required. The production builder remains unchanged.

AI assistance: Codex. The original integration transcript is retained in
`ai-transcripts/2026-11-12_shawn_S2-010_integration_codex.md`; the consolidation
records are in `ai-transcripts/2026-11-13_shawn_S2-010_codex.md`.

## Consolidation verification (2026-11-13)

- Standalone #78: 687 tests / 48 suites passed, with the additional integration
  suite explicitly reporting 12 skipped cases (49 suites / 699 cases total).
- Strict missing-dependency probe failed with the intended error; strict mode
  cannot silently skip missing S2-011.
- Exact portable suite on #79 at `8b4ca92` plus actual #78 source: 183 QA tests
  passed, none skipped; TypeScript checking passed.
- Standalone lint, TypeScript and normal production build passed. Final formatting
  and staged whitespace checks are run before committing this consolidation.
- No production builder, model, route, package, lockfile, TypeScript or Jest
  configuration changes. No live provider or hosted database operation occurred.
- Original wrapper/tests/transcript remain archived at #82's branch. No branches
  are deleted or force-pushed. This consolidation does not complete issue #61.
