# S2-009 main reconciliation and review — 2026-11-14

Author: melissa. AI assistance: Codex. Branch: `s2-009`.
Main reconciliation: `992b8f1` against `08a014b`.
Authorized v4 integration: `c9844fc` from `ad59a2c`.
No push, remote PR edit, hosted migration or paid model request was performed.
Unrelated S2-005 transcript changes were left outside the commits.

## Integration and resolved issues

Main now includes S2-010 #78, S2-011 #79, S2-012 #87 and S2-013 #76.
Reconciliation also accepts main's S2-001 coverage gate and S2-007 UI changes.
All merge conflicts are resolved. The real builder, orchestration, service input
validation, response validator, provider adapter and token budget match main
byte-for-byte in Git. S2-009 adds the quota service; the separately authorized v4
prompt is the only change to an inherited Q&A service.
Dependency source and upstream transcripts no longer appear as added copies in
the diff against main. Historical branch commits remain because main squash-merged
the dependency PRs; commit ancestry and the final file diff are different views.

Initially kept main's `system-prompt.ts` exactly, as requested. Its actual version
constant at `08a014b` is **`s2-013.v3`**, not the teammate's reported `s2-013.v4`.
A second main fetch returned the same tip. The original S2-013 feature branch at
`14effdf` declares v2. Refreshing all origin references located the actual v4 on
the separate, unmerged `feature/S2-013-decline-definitions` branch at `ad59a2c`.
Its real prompt changes clarify recommendations, described other entities and
comparisons; it is not merely a version-label change. The user explicitly approved
integrating this separate branch. Local merge `c9844fc` retains its actual v4 prompt,
tests, documentation and original transcript. No version was fabricated. The source
and tests match that branch exactly. V4 remains an unmerged upstream dependency,
so its delta legitimately remains in #84 until its own PR merges into main.

S2-011 now throws `QaInputValidationError` at its shared service boundary. S2-009's
route previously would have returned a generic 500 for that class. The route now
returns safe 400 field errors for invalid questions or 413 for an oversized model
request; the client recognizes `QA_REQUEST_TOO_LARGE` and displays local guidance.
Tests assert no quota reservation/provider call and no diagnostic leakage for all
three codes. Existing oversized-question integration expectations were aligned
with S2-011's earlier rejection (`QA_QUESTION_TOO_LONG`). Normal integration cases
still delegate to the actual service implementation; only explicit error-contract
tests inject a controlled service failure.

Upstream context/handoff docs were restored from main before adding dated current
status notes, avoiding regressions to obsolete byte/token estimates. Earlier
S2-009 verification sections retain their historical evidence.

## Story, project standards and security review

Reviewed the supplied Sprint 2 story/rules, product/technical/UX requirements,
`UI_UX_Standards.md`, `engineering-standards.md`, `AI-Assisted-Development.md`, and
the new `changed-code-coverage.md`. The installed Next.js route documentation was
consulted before changing the handler. No engineering or coverage policy changed.

| Area                     | Result and evidence                                                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-009 / S2-BR-008       | Question input, submit, processing, answer and meaningful failure states remain present and tested. No persistent chat-history system added.                                                                                                                                                |
| S2-BR-014                | Workspace/card keep the target visible; requests/replies are target-tagged; switching aborts requests and ignores stale answers.                                                                                                                                                            |
| UI/UX                    | Shared Card/Form/Input/Button/Spinner/Alert, visible label/help, inline server errors, preserved failed input, duplicate-submit protection, announced loading/errors and 375px browser checks retained.                                                                                     |
| Authentication/ownership | Cookie-authenticated identity and owned-target lookup precede body/context reads; real builder independently rechecks ownership and uses RLS. Foreign/missing IDs have indistinguishable denials.                                                                                           |
| Input/provider boundary  | JSON-only route, 16 KiB body, trimmed 2,000-character question, main's shared 128 KiB serialized-request check, provider-counted full input/schema plus reserved output and validated citations/outcomes. Context/validation failures make no provider call.                                |
| Quota                    | Durable five-attempt/account rolling-24h gate precedes counting and generation; outages fail closed, exhaustion returns 429, failed provider calls retain their reservation. SQL verifies permissions, identity, expiry and concurrency.                                                    |
| Data/errors/secrets      | Browser owner/evidence claims ignored; previous-target/cross-user evidence excluded; private/no-store replies; plain React text; safe fixed errors and category-only logs; credentials stay server-only. Production static JS contains none of the checked OpenAI key/provider/RPC markers. |
| Dependencies             | No new dependency or version change in this reconciliation. Lockfile and team-approved deepmerge patch remain unchanged; new package entries are npm coverage scripts only. Installed tree and offline install-plan validation pass.                                                        |

The patch remains **dev-only**, with no install scripts. `npm audit` still lists
five low version-based entries through patched deepmerge/Jest; there are zero
moderate/high/critical findings. `npm audit --omit=dev` reports zero findings.
The team-approved patch and actual-consumer regressions remain; this is not a
claim of a clean full audit or independent human security approval.

## Verification

- `npm run coverage:changed` after v4: **1,300 tests / 71 suites passed**, none skipped.
  Changed lines: **522/529 (98.67%)**; changed `src/services/qa/**`: **47/47 (100%)**.
  Unchanged policy requires 80% overall and 90% Q&A. Branch outcomes: 130/136
  (informational). Whole-suite line coverage: 94.05%.
- Lint, typecheck, production build, formatting and branch-vs-main whitespace checks
  passed. Existing upstream transcripts were retained verbatim rather than edited
  solely for their pre-existing trailing whitespace.
- **12 production-browser tests passed again after the v4 build**, including the actual disabled route's
  `QA_DISABLED` response, retry, quota feedback, context switching and mobile layout.
  Successful replies are deterministic fixtures, not live model evaluations.
- Complete local PostgreSQL 18 suite passed, including RLS/grants and existing
  ingestion regressions. Twelve concurrent Q&A reservations produced exactly five
  allowed attempts and seven denials. The disposable test database was cleaned up.
- Dependency tree, offline `npm ci --dry-run --ignore-scripts`, production/full
  registry audits and unchanged lockfile/patch checks completed.
- `git merge-tree --write-tree --name-only origin/main HEAD` succeeds with no
  conflict paths against main `08a014b`. This cannot guarantee future main changes
  remain conflict-free; required remote CI cannot be certified without publishing.

## Remaining acceptance

Keep `QA_ENABLED=false` until the team reviews/applies
`20261113000000_limit_paid_review_questions.sql` and verifies hosted quota/RLS.
Obtain current-head teammate and separate security review under
`AI-Assisted-Development.md` section 7, including the new quota RPC and route.
Hosted/auth and live-model acceptance remain separate; no claim of semantic
grounding, live count-endpoint compatibility or retention/billing behavior is made.
V4 is integrated locally with authorization; reconcile again once its upstream PR
merges. Live-model scope behavior still needs the team's configured-model evaluation.

PR update: `pr-s2-009.md`. Original available follow-up dialogue:
`ai-transcripts/2026-11-14_melissa_S2-009_main-reconciliation_codex.md`.
