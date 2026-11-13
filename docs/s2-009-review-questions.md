# S2-009 Review Q&A interface

The owned workspace includes an Ask ReviewLens card using shared UI primitives,
with the active target and Google Maps platform visible. It validates and trims
questions, prevents duplicate submission, shows processing, preserves failed input,
and distinguishes answers, insufficient evidence, scope refusals and service errors.
Target changes abort requests, clear the form and ignore late responses. Empty or
unavailable reviews disable questions with an explanation. No persistent chat
history or schema migration is added.

## Production integration

`POST /api/analysis-targets/{targetId}/questions` accepts only `{ "question": "..." }`.
It authenticates, checks ownership before reading the body, enforces a 16 KiB body
limit and 2,000-character trimmed question limit, then calls the actual services:

```ts
answerQuestion(targetId, question, {
  buildReviewDatasetContext,
  callModel: createOpenAiQaModel(),
});
```

The real builder independently authenticates and checks ownership before retrieving
fresh persisted evidence. Browser evidence and owner claims are rejected. Context
failures stop before model invocation. Replies use private/no-store headers and
include the target ID; the browser rejects mismatches. Three server `declined_*`
outcomes map to the UI's `out_of_scope`; answers and insufficient evidence retain
their meaning. Errors use safe application copy without provider diagnostics.

With user authorization, existing services/tests/docs were imported from S2-011 at
`e55c48a` (includes S2-013 prompt and token budget) and S2-010 at `6835c29`. S2-013
at `14effdf` was inspected; its implementation is already included by S2-011.
Service source remains unchanged. Integration tests now import actual modules
unconditionally, so missing dependencies fail instead of skipping. Their synthetic
model name was replaced with a tokenizer-supported model; provider I/O remains fake.

## Configuration and limits

Paid calls require `QA_ENABLED=true`, server-only `OPENAI_API_KEY` and an explicit
`OPENAI_QA_MODEL`. See `.env.example` and `docs/s2-011-answers.md`. No keys or paid
calls were used for validation.

The builder rejects datasets above 100 reviews or 32,768 evidence bytes. The adapter
counts prompt, question/evidence and response schema with a supported tokenizer,
adds 256 tokens for protocol overhead and reserves 1,500 output tokens within a
16,000-token application cap. Protocol framing is an allowance rather than an exact
published provider count. Unsupported models fail closed. Citation validation
proves ID membership, not semantic support for every claim.

## Test evidence

- Lint, TypeScript, production build and formatting passed.
- Final full Jest run: 940 tests / 58 suites passed. Focused UI/client/integration
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
human review remain team acceptance work. No push, merge, deployment, external
message or issue closure was performed.

AI transcript: `ai-transcripts/2026-11-13_melissa_S2-009_codex.md`.
