# AI session — S2-013 Define and Apply the ReviewLens System Prompt

- **Date:** 2026-11-12
- **Author:** Aryan Modi (`aum-2004`)
- **Story:** S2-013 — Define and Apply the ReviewLens System Prompt (#64)
- **Tool:** Claude Code (Claude Opus 5.5)
- **Branch:** `feature/S2-013-system-prompt`
- **Pull request:** _pending_

## Transcript scope and redaction

This file preserves the S2-013 portions of a Claude Code session. It includes the earlier Sprint 2
planning turns because they shaped the S2-013 design (backlog review, story assignments, and
choosing S2-013 first). Tool calls are shown as short summaries of the command and what it
returned, rather than full command output.

Local filesystem paths, the author's email address, and machine and request identifiers are
removed. No credentials, API keys, Supabase keys, or `.env` values appeared in the session.

## Human review notes

### Accepted

- `src/services/qa/system-prompt.ts`: versioned system prompt, `buildQaModelRequest`, the
  `QA_OUTCOMES` response contract, and `QaPromptError` guards.
- Outcome names mapped one-to-one onto Neel's S2-004 evaluation categories.
- Data minimization: only review id, rating, date, and text are sent to the model.
- `tests/unit/services/qa/system-prompt.test.ts` (18 tests, 100% coverage of the module).
- `docs/s2-013-system-prompt.md` and the `qa/` row in `src/services/README.md`.

### Changed or corrected

- Provider question resolved from `docs/engineering-standards.md` (OpenAI API), instead of
  leaving it as an open team decision.
- Added `import "server-only"` after checking the convention used by the ingestion services.

### Rejected or deferred

- Building the model client, reply parsing, and the Q&A route. These belong to S2-011, S2-003, and
  the route owner.
- Loading and selecting reviews, which belongs to Shawn's S2-010.
- Hard-coded refusal lists for out-of-scope questions (forbidden by S2-014).
- Checking the prompt against the S2-BR rule text, which was not in the repository during the
  session.

## Transcript

### User

okay, now we are on Sprint 2, and I'm going to provide you with all the files. We already have the
issues in the backlog. If you can, just look into it on GitHub.

### Claude

_Tool: listed the repository's open issues with `gh`. 20 Sprint 2 issues, #52–#71, all labeled
`sprint-2` with no milestone or assignee. Read each issue body._

_Tool: surveyed the repository: no LLM dependency yet, existing `test:coverage` script and CI
workflow, Sprint 1 migrations for targets, reviews, and ingestion attempts._

Summarized the 20 issues in five groups (quality gates, ingestion summary, Q&A core, scope guard,
isolation and target switching). Noted that no LLM provider is integrated yet, so an injectable
model adapter must come first; that the issues reference S2-BR-001–031 without including the rule
text; and that S2-001 can build on the existing coverage script and CI.

### User

_(Pasted the team's Sprint 2 story assignments and plan.)_ Aryan owns S2-013, S2-011, and S2-012.
S2-010 (Shawn) and S2-013 (Aryan) are the foundation and their interfaces should be agreed early.
Each person posts a plan within 24 hours and opens a draft PR within 48 hours.

### Claude

_Tool: listed `src/` and read the `reviews` and `analysis_targets` migrations._

Explained how S2-013 connects to S2-010 (context), S2-003 (mock LLM), S2-014/S2-015 (refusals come
from the prompt), and S2-009 (UI). Proposed a draft shared contract (`ReviewContext`, `LlmClient`,
`QaResponse` with statuses `answered | insufficient_evidence | out_of_scope | no_data`), suggested
that the model return a JSON status so scope behavior can be tested without matching exact
sentences, and drafted a progress update for the team channel.

### User

which one should I start working on first?

### Claude

Recommended S2-013 first: S2-011 and S2-012 depend on the prompt, Neel's refusal stories rely on
it, and it can be built without waiting on anyone. Suggested posting the contract draft, then the
prompt builder and tests, then a draft PR.

### User

can we start working on S2-013 and make sure to have all the requirements which we are following
since before

### Claude

_Tool: read `docs/engineering-standards.md` and `docs/AI-Assisted-Development.md`, and listed
`ai-transcripts/`._ The standards name the OpenAI API for review analysis and require mocked model
calls in CI, the shared error shape, server-only services, and a transcript per story.

_Tool: read `src/services/README.md`, review and target types, the Jest config, and the S1-014
transcript format._

_Tool: pulled `main`, created `feature/S2-013-system-prompt`, and found Neel's open PRs #72 (S2-004)
and #73 (S2-016)._

_Tool: read Neel's S2-004 evaluation doc and fixture and his S2-016 security doc._ The S2-004
fixture defines five expected categories, and S2-016 asks for a model-boundary request that tests
can capture in full.

Changed the earlier draft contract to five outcomes that map onto Neel's categories one-to-one,
replacing the single `out_of_scope` status. Split responsibilities: S2-013 builds the prompt and
request from an already-authorized dataset; S2-010 loads and selects reviews; S2-011 calls the
model and parses the reply.

_Tool: wrote `src/services/qa/system-prompt.ts` with the versioned prompt, platform labels, outcome
list, `buildSystemPrompt`, `buildQaModelRequest`, and `QaPromptError`
(`NO_REVIEW_DATA`, `EMPTY_QUESTION`, `REVIEW_TARGET_MISMATCH`)._

_Tool: checked the `server-only` convention (used by ingestion and auth services, mocked in Jest)
and added `import "server-only"`._

_Tool: wrote `tests/unit/services/qa/system-prompt.test.ts`._ The tests cover prompt contents for
each S2-013 requirement, outcome documentation, hostile target names, review and question
injection, data minimization, blank questions, empty datasets, and foreign-target reviews.

_Tool: ran Prettier and the new tests: 18 passed, 100% statement, branch, function, and line
coverage for `src/services/qa/system-prompt.ts`._

_Tool: ran `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` (48 suites, 663
tests passed), and `npm run build`. All passed._

_Tool: wrote `docs/s2-013-system-prompt.md` (requirement-to-test mapping, response contract, safety
guards, other stories' responsibilities, limitations) and added the `qa/` row to
`src/services/README.md`._

_Tool: wrote this transcript._
