# S2-009 Review Q&A interface

The owned workspace includes an Ask ReviewLens card using shared UI primitives,
with the active target and Google Maps platform visible. It validates and trims
questions, prevents duplicate submission, shows processing, preserves failed input,
and distinguishes answers, insufficient evidence, scope refusals and service errors.
Target changes abort requests, clear the form and ignore late responses. Empty or
unavailable reviews disable questions with an explanation. No persistent chat
history is added. The security follow-up adds a timestamp-only quota migration.

## Production integration

`POST /api/analysis-targets/{targetId}/questions` accepts only `{ "question": "..." }`.
It authenticates, checks ownership before reading the body, enforces a 16 KiB body
limit and 2,000-character trimmed question limit, then calls the actual services:

```ts
const provider = createOpenAiQaModel();
answerQuestion(targetId, question, {
  buildReviewDatasetContext,
  callModel: async (request) => {
    readOpenAiQaConfig();
    await reserveQuestionQuota(client);
    return provider(request);
  },
});
```

The verified session client reserves an account-wide slot only after valid context
and provider configuration. All production paid entry points must retain this gate;
direct service calls in deterministic tests use fake providers.

The real builder independently authenticates and checks ownership before retrieving
fresh persisted evidence. Browser evidence and owner claims are ignored and excluded from service inputs. Context
failures stop before model invocation. Replies use private/no-store headers and
include the target ID; the browser rejects mismatches. Three server `declined_*`
outcomes map to the UI's `out_of_scope`; answers and insufficient evidence retain
their meaning. Errors use safe application copy without provider diagnostics.

With user authorization, existing services/tests/docs were imported from S2-011 at
`78c914e` (includes S2-013 prompt and provider-authoritative token counting) and S2-010 at `6835c29`. S2-013
at `14effdf` was inspected; its implementation is already included by S2-011.
Current `main` at `08a014b` contains merged S2-010/S2-011/S2-012/S2-013 and was
reconciled locally in `992b8f1`. The original Q&A services match main except the
user-authorized v4 prompt integration in `c9844fc`, from the separate unmerged
`feature/S2-013-decline-definitions` branch at `ad59a2c`. Main itself still declares
v3; this branch now uses the actual v4 source and tests, not a renamed constant.
See `s2-009-main-reconciliation.md` for current checks and remaining acceptance.
Integration tests now import actual modules
unconditionally, so missing dependencies fail instead of skipping. Their synthetic
model name was replaced with a tokenizer-supported model; provider I/O remains fake.

## Configuration and limits

Paid calls require `QA_ENABLED=true`, server-only `OPENAI_API_KEY` and an explicit
`OPENAI_QA_MODEL`. See `.env.example` and `docs/s2-011-answers.md`. No keys or paid
calls were used for validation.

Apply the quota migration before enabling paid calls. Each account is limited to
five durable reservations per rolling 24 hours across all targets. Storage failure
blocks both provider requests; exhausted quota returns a safe 429. Failed provider
attempts retain their reservation. See `docs/s2-009-security-followup.md` for the
security design, team patch decision and latest tests.

The builder rejects datasets above 100 reviews or 32,768 evidence bytes. The adapter
submits the complete model input/schema to OpenAI's input-token endpoint, then
checks that count plus 1,500 reserved output tokens against a 16,000-token cap.
Counting failures prevent generation. No local tokenizer dependency remains.
The UI waits at most 75 seconds for counting and generation. Citation validation
proves ID membership, not semantic support for every claim.

## Test evidence from the initial implementation

- Lint, TypeScript, production build and formatting passed.
- Initial full Jest run: 940 tests / 58 suites passed. Focused UI/client/integration
  run: 70 tests passed.
- Focused coverage of the four new UI/route/client/schema modules: 98.92% lines,
  92.2% branches, 100% functions. This does not certify the team's CI coverage gate.
- Three Playwright tests passed for processing, target switching, retry, insufficient
  evidence, 375px layout and actual-route failure with paid calls disabled. Browser
  success replies are intercepted; integration tests run the actual route, builder,
  orchestrator, prompt and provider adapter with authentication/database/provider I/O fake.
- Desktop/mobile screenshots in `test-results/s2-009-desktop.png` and
  `test-results/s2-009-mobile.png` were visually inspected.

Useful commands:

```text
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e:auth -- review-questions.spec.ts
npm.cmd run format:check
```

Hosted RLS acceptance, live-model evaluation, overhead calibration, CI and current-head
human review remain team acceptance work. Dependency histories were merged locally;
no push, protected-branch merge, deployment, external message or issue closure was performed.

## Verification follow-up

See `docs/s2-009-verification.md` for the latest checks and security/dependency
fixes. The JSON-only route ignores client ownership/evidence claims, returns safe
structured question errors, logs error categories without request/provider data,
and uses the documented 409/413 context-error statuses. Shared form descriptions
retain both help and validation text for assistive technology. The user explicitly
expanded this task to address existing development dependency advisories; those
changes are described separately in the verification report and PR draft.

AI transcript: `ai-transcripts/2026-11-13_melissa_S2-009_codex.md`.
