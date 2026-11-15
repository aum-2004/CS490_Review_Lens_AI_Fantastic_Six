# S2-018: Change Q&A context when the target changes

Refs [#69](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/69).
Owner: Shawn. Clean publication checkpoint: 2026-11-15. Base: main 2a9e54b6.

## Draft scope

This PR publishes target-switching regression tests against current production
code. It does not introduce another context store, duplicate Q&A implementation,
summary implementation, selector or migration. It is not full S2-018 acceptance.

The older isolated checkout contained a local combination of S2-006 and an earlier
S2-009 snapshot. That work, summary assertions, browser fixture/configuration and
unused coordinator prototypes are preserved locally. They are not blindly copied
into this PR. The Nov 14 transcript records that earlier composed-source evidence;
its counts are historical and are not verification of this published head.

## Requirement matrix

| Story requirement                           | Current evidence / remaining work                                                                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New context contains Target B reviews       | Seven production-route cases exercise the real builder, ownership repository, prompt, reply validation and provider adapter with synthetic DB/provider HTTP. They inspect counting and generation bodies across A -> B -> A.             |
| Target A reviews are no longer supplied     | Distinct IDs and battery-life/customer-service markers, changed persisted rows and fail-closed foreign/missing/empty/logout/unavailable cases.                                                                                           |
| Summary information corresponds to Target B | Pending final S2-006 #80 integration. It is not present on current main, so this draft does not import its unmerged modules or mark the requirement passed. Original composed-summary tests remain preserved locally for reconciliation. |
| UI clearly identifies B as active           | Five real workspace/client-form/transport cases inspect the heading, active label, persisted review text, request URL, answer and A -> B -> A reset.                                                                                     |
| Actual navigation                           | Two production-build Edge browser cases use current main's local auth fixture and real navigation. Answer responses are intercepted; provider serialization is tested separately in Node.                                                |

Rules: S2-BR-023 (subsequent Q&A uses the newly selected target) and S2-BR-024
(previous target reviews must not remain in active context).

## Boundaries and compatibility

The route still verifies identity and parent ownership before reading the body.
The builder freshly verifies session/ownership and reads persisted target-scoped
reviews; the browser submits only a question. The provider adapter counts and
generates independently for each request, with no previous-response conversation
state. The local DB transport simulates the durable quota RPC; it does not execute
SQL or prove hosted RLS/quota behavior. Synthetic configuration and injected
provider fetches make no paid calls.

The UI tests use real ProtectedTargetWorkspace, ReviewQuestions and
askReviewQuestion, while controlling server data dependencies and fetch replies.
They cover late success/failure, wrong response target and A -> B -> A. Browser
interception does not certify model behavior. Next Cache Components preserves
hidden pages; selectors target visible/accessibility state. These tests do not
claim all preserved DOM is deleted.

S2-019 PR #92 separately fixes Activity hide/restore and account-state races.
These tests currently pass without copying that PR's production changes; rerun
both stories after merge. S2-017 #91 supplies the dedicated selector and must keep
the authenticated active-target identity when it integrates. Existing links are
used for this draft's browser transitions. S2-006 #80 owns summary behavior.

## Run checks

Unit integration:

    node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/unit/services/qa/target-switching.production.test.ts tests/unit/app/analysis-targets/target-switching.production.test.tsx

Browser: use playwright.auth.config.ts with PLAYWRIGHT_AUTH_SERVER=production and
PLAYWRIGHT_CHANNEL=msedge, after building with the configuration's local dummy
Supabase settings. Run tests/e2e/auth/target-context-switching.spec.ts. Do not read
or overwrite .env.local or enable paid providers for deterministic tests.

## Remaining gates

Keep the PR Draft and #69 open. After #80's final integration, restore/adapt the
preserved summary assertions to prove B's count/rating/status and recomputation
from persisted rows. Reconcile the workspace with #91 and #92, run current-head
checks, and obtain normal/security review plus team acceptance before closure.
The older combined checkout and all existing branches remain preserved.

## AI assistance

Codex. Original available Nov 12 dialogue is preserved in
../ai-transcripts/2026-11-12_shawn_S2-018_codex.md. Nov 14 and Nov 15 files are
explicitly labeled work summaries, not reconstructed full-chat exports.

## Clean draft verification (2026-11-15)

- Full Jest: 81 suites / 1,475 tests passed, zero skips.
- Focused integration: 12/12 passed.
- Production-build Edge switching checks: 2/2 passed.
- Formatting, lint, typecheck and production build passed.
- Tests and documentation only: no changed production lines.
- No hosted changes or paid provider calls. Current-head GitHub CI remains a separate gate.
