# S2-003 Deterministic Q&A Test Harness — Claude Code session (PR 1)

- **Author:** Deep Shah
- **Tool:** Claude Code (Claude Opus 5.5), VS Code extension
- **Issue:** #54 (S2-003)
- **Branch:** `feature/s2-003-qa-test-harness` (from `origin/main` at `c9dff9e`)

> This is a step summary. Per `docs/AI-Assisted-Development.md` §6, append or link the full exported
> session transcript (prompts, responses, failed attempts) before opening the PR.

## 1. Prompts given

1. A structured S2-003 brief (stack, teammates' stories, requirements, constraints). It asked for a
   **discovery-only Step 0** and approval before coding. My own instruction on top: do not commit,
   push, or change teammates' code.
2. Approval with changes: PR 1 from `origin/main` limited to contract, fake model, network guard,
   assertions, harness entry point, fixtures, self-tests, determinism proof, `test:qa`, README.
   `fake-openai-fetch.ts` and `fake-supabase.ts` moved to PR 2. No `ci.yml` change. Use the existing
   branch. Do not push.

## 2. Discovery (Step 0, read-only)

- Read `package.json`, Jest/TS/ESLint/Prettier config, `ci.yml`, `AGENTS.md`,
  `docs/AI-Assisted-Development.md`, `docs/engineering-standards.md`, the README test sections.
- Found the S2-003 acceptance criteria in `Sprint2Issues.csv` and issue #54, and quoted them.
- Inspected teammates' unmerged branches via `git show` (no checkout, no edits):
  `integration/S2-010-S2-011-qa-context` (PR #82: `QaModelCaller`, `QaModelRequest`,
  `answerActiveTargetQuestion(targetId, question, { callModel })`), S2-013/S2-011 (Aryan), S2-010
  (Shawn), S2-014/015/016 (Neel). Neel's S2-016 doc names "Deep's S2-003 harness" as the model-request
  capture point.
- Found that the original local `feature/s2-003-qa-test-harness` held only a stale pre-squash S2-004
  commit. I recreated it from `origin/main` myself (not the AI) before the coding phase.
- Proposed acceptance criteria AC6–AC10 (determinism, offline, loud failure on real calls, edge
  cases, docs) and a two-PR plan. Waited for approval.

## 3. Implementation (PR 1)

| File | What |
| --- | --- |
| `tests/helpers/qa-harness/contract.ts` | Harness-owned copies of the PR #82 types, flagged "pending team agreement" |
| `tests/helpers/qa-harness/fake-model.ts` | Scripted, recording fake `QaModelCaller`; reply builders including timeout and echo |
| `tests/helpers/qa-harness/network-guard.ts` | Blocks fetch, http(s) and sockets; removes provider env vars; records attempts |
| `tests/helpers/qa-harness/assertions.ts` | System-prompt, context-only-target, no-foreign-data, reviewer-identity, grounding and decline checks |
| `tests/helpers/qa-harness/reference-pipeline.ts` | **Added beyond the approved list.** Test-only stand-in pipeline so golden cases run on `main` |
| `tests/helpers/qa-harness/index.ts` | `createQaTestHarness`, `setupQaTestHarness`, `runGoldenCase` |
| `tests/fixtures/qa/datasets.ts`, `golden-cases.ts` | Seven frozen synthetic datasets; 21 golden cases in 10 scenarios |
| `tests/unit/qa-harness/*.test.ts` | 7 suites, 91 tests, including 9 mutation tests of broken pipelines |
| `package.json`, `README.md` | `test:qa` script; additive README section |

## 4. Errors, corrections and dead ends

- zsh expanded `$B:s…` as a history modifier and `=====` as a command in `git show` calls. Fixed by
  quoting `"${B}:path"`. A later `sed` over `$files` failed because zsh does not word-split; I used an
  array instead.
- Typecheck: `matchedRule` was `readonly` but assigned for fallback calls. Made it mutable.
- Design fix: the echo reply first echoed the whole input, including the user's own question. A user
  typing a foreign target ID would then have looked like a leak. Changed it to echo only
  application-supplied content (`applicationSuppliedInput`).
- Design fix: freezing fixtures would also have frozen Neel's exported S2-004 objects. Changed to
  clone them first, and added a test that the S2-004 fixture stays unfrozen.
- Design fix: `runGoldenCase` ran `cleanup()` in `finally`, which could hide the real step failure.
  It now reports the step failure first.
- Mutation-test fixes: the stale-ID tamper initially also broke step 1, so it now applies only to
  Target B. The "ungrounded" broken pipeline was rewritten to make one real model call and then skip
  validation.
- Test failure: `net.connect` passes `[options, cb]` to `Socket#connect`, so the target showed as
  "unknown target". The guard now unwraps arrays.
- Lint: `react-hooks/rules-of-hooks` flagged the `useQaTestHarness` name. Renamed it to
  `setupQaTestHarness`.
- Typecheck: a test read `.errorName` on the union `QaAskResult`. Switched to `toMatchObject`.

## 5. Verification (local, Node v23.10.0; `.nvmrc` requires 24)

- `npm run format:check`: pass. `npm run lint`: pass. `npm run typecheck`: pass.
- `npm test`: 55 suites, 749 tests pass. `npm run build`: pass.
- `npm run test:qa` run 3 times: 7 suites, 91 tests pass each time. Also passes under `env -i`.
- No real network or secrets: every harness test runs inside the network guard, and `cleanup()`
  fails on any attempt. `next/jest` still loads `.env.local` from disk locally, but the guard removes
  all provider and Supabase variables during each harness test.

## 6. Accepted, changed or rejected

- **Accepted:** the plan with your changes. Harness lives under `tests/helpers/qa-harness`, following
  Neel's `tests/helpers` convention.
- **Changed (needs your sign-off):** added `reference-pipeline.ts`, which was not on the approved list.
  Without it the golden cases could not run on `main`. It is clearly labelled as test-only, and PR 2
  replaces it via the `pipeline` option.
- **Rejected:** committing. The brief said "small commits", but my instruction said not to commit. All
  changes are uncommitted for me to review and commit.
- **Not done:** live-model evaluation (out of scope); PR 2 items.
