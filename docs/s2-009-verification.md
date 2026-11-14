# S2-009 verification — 2026-11-13

## Current upstream refresh

The repeated verification fetched newer tips: main `26f48f7` (S2-003 harness) and
S2-011 `78c914e` (provider-authoritative token counting). Both merged cleanly into
`s2-009`; S2-010 remains `6835c29` and S2-013 remains `14effdf`. Source through
`ba133bb` passed lint, TypeScript, **1,120 tests in 68 suites**, production build
and **three production-server browser tests**. The elevated browser run exited
normally without the earlier sandbox wrapper workaround. The new harness's own
tests also pass; this does not claim all live-model evaluations pass.

Current S2-011 calls `/v1/responses/input_tokens` and then generates only if the
reported full input count plus 1,500 reserved output tokens fits the 16,000 cap.
It rejects serialized count requests above 128 KiB before network access. The
local tokenizer and protocol-overhead estimate are no longer used; their package
was removed and pruned. The UI deadline is now 75 seconds, covering the two
separate 30-second provider stages. Additional integration tests verify that the
count and generation bodies contain identical model/instructions/evidence/schema,
exclude prior-target evidence from both, and never generate on count failure or
overflow. **113 focused tests passed.**

The official [input-token API reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count)
documents the request's `text.format` structured-output configuration. This
resolves the earlier documentation uncertainty; configured-model smoke testing
is still pending. No live provider request was made. Counting also transmits the
authorized review context to OpenAI; its billing/retention behavior must not be
inferred from generation's `store: false` setting.

Lockfile validation (`npm ci --dry-run --ignore-scripts --no-audit --no-fund`),
pruning and the full dependency-tree inspection passed after tokenizer removal.
The earlier full clean install remains historical evidence. Refreshed production
audit: **zero findings**. Full audit remains **five low entries and zero
moderate/high/critical**, with the local deepmerge mitigation described below.
Formatting, whitespace and all four merge checks are repeated before handoff.
Human review, separate security review, current-head CI, hosted RLS and live-model
acceptance remain outstanding. No push or remote PR was performed.

## Earlier review snapshot (historical)

Author: melissa. Review performed with Codex. Implementation and fixes were tested
through code commit `ed9dc33` on `s2-009`. Documentation commits follow that source
snapshot. No push, remote PR, deployment or protected-branch merge was performed.
The unrelated S2-005 transcript rename remains outside the task commits.

## Merge compatibility

| Compared remote tip                     | Snapshot  | Result                                                                    |
| --------------------------------------- | --------- | ------------------------------------------------------------------------- |
| `origin/main`                           | `9533a69` | Incorporated locally; clean merge simulation                              |
| `feature/S2-010-review-dataset-context` | `6835c29` | Incorporated locally; dependency ancestry retained                        |
| `feature/S2-011-answer-from-reviews`    | `e55c48a` | Incorporated locally; current model-budget/prompt implementation retained |
| `feature/S2-013-system-prompt`          | `14effdf` | Incorporated locally after S2-011; newer S2-011 implementation retained   |

The original copied-file snapshot merged cleanly with main but produced add/add
conflicts against S2-010's modified integration test/handoff and the separate
S2-013 snapshot. Local integration commits now retain the actual branch ancestry.
S2-010 conflicts were resolved by retaining the real production-route tests and
historical-document annotation; its production builder was unchanged. After S2-011
was integrated, S2-013 merged without additional code conflicts. There are no
unresolved conflict entries. This verifies these tips, not future branch changes.

## Story and project-doc review

The supplied S2-009 story is [issue #60](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/60),
despite the original request also linking #56. No unrelated story is claimed closed.

| Requirement                                 | Implementation/evidence                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Natural-language question and submit action | Visible required Question label, shared Zod validation, Ask question button and Enter submission |
| Processing state                            | Shared spinner, disabled submit, processing copy naming the target, stale success hidden         |
| Response display                            | Plain text with distinct answer, insufficient-evidence and scope-refusal headings                |
| Meaningful errors                           | Safe inline field errors, service alerts, preserved question, retry and expired-session redirect |
| Active AnalysisTarget remains clear         | Target name/platform in the workspace and Q&A card; request and response target IDs correlated   |
| S2-BR-008 and S2-BR-014                     | Protected owned workspace and authenticated target-scoped production route                       |
| Persistent history optional                 | One question/answer interaction; no history schema or model thread cache                         |

Reviewed against `UI_UX_Standards.md`, `engineering-standards.md`,
`AI-Assisted-Development.md`, ownership/route-protection docs and the S2-010/011/013
service contracts. Feature code reuses AppShell, existing cards/forms/buttons,
alerts and the shared spinner. It remains usable at 375px. The source services
remain server-only; business/context logic stays outside the React component.

Corrections made during review:

- Ignore extra browser ownership/evidence fields, as `s1-011-ownership.md` requires;
  only the validated question reaches orchestration. They cannot select context.
- Require `application/json` before reading the bounded body. Browser form media
  types cannot trigger provider calls; JSON cross-origin browser requests require
  a CORS preflight, for which this endpoint grants no cross-origin access.
- Return safe structured question errors and map only recognized local messages
  into the same accessible inline field error. Preserve both help and error
  descriptions in the shared form primitive.
- Use documented 409/413 context-error statuses, typed service failures and a
  generic 500 for unexpected failures. Log operation/category, without question,
  review, key or raw provider/database diagnostics.
- Replace summary-only AI retention with the available recorded sessions. The
  transcript includes melissa, omits internal reasoning and redacts filesystem
  paths; historical unavailable text is not reconstructed.

## Security evidence and limits

Actual-route integration tests execute the real auth guard, ownership repository,
context builder, prompt, orchestration, response validator and provider serializer.
Authentication lookup, database HTTP and provider I/O use deterministic fixtures.
They verify unauthenticated denial, indistinguishable foreign/missing denial before
review reads, fresh target selection, exclusion of previous/cross-user evidence,
ignored forged browser context, bounded/invalid requests and no provider invocation
after context failure. Invalid/foreign citations cannot become a successful reply.
Responses are private/no-store. Model output is rendered through React as text.

The production browser static output contains no `OPENAI_API_KEY` identifier,
provider endpoint or model-budget adapter. This is a targeted server/client-boundary
check, not a general-purpose secret scanner. No real key or paid provider call was
used. `QA_ENABLED` stays false by default. No RLS policy, privileged client or
database schema change was introduced.

The token budget includes the question/evidence, instructions, response schema,
reserved output and an explicit protocol allowance. The allowance still requires
live-provider calibration. Citation membership does not prove semantic grounding;
prompt injection, PII behavior and configured-model judgment still need the team's
live/model-boundary evaluations, including #74. Hosted RLS was not revalidated here.

## Dependency review and fixes

The user explicitly authorized extending this review to existing development-tool
advisories. npm remains the only package manager; the lockfile is retained.

- `gpt-tokenizer@4.1.0` is pinned for complete pre-call counting. Official npm
  metadata confirmed MIT licensing, matching integrity and a 2026-11-10 update.
  The official download endpoint reported 2,684,258 downloads for 2026-11-06 through
  2026-11-12. Compatibility was exercised on Node 24.22.2 / npm 11.19.1.
- Affected `glob` and `minimatch` transitive ranges now resolve to 14.0.6 and 11.0.8.
  Overrides target vulnerable ranges; legacy unaffected minimatch consumers retain
  their compatible version. The patched packages support the project's Node 24.
- Upstream `deepmerge` has no fixed release for
  [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
  The local MIT-licensed `4.3.1+reviewlens.1` patch defines own data properties for
  all three destination writes instead of invoking the inherited prototype setter.
  Six tests resolve the dependency from **Jest's actual consumer**, prove the local
  build is used, reject prototype poisoning, and retain normal merge behavior.
  These exploit tests failed against the vulnerable nested copy before it was
  removed, and pass against the final clean install.
- The local patch has no runtime dependencies or install scripts. Its source,
  license and maintenance notes are in `vendor/deepmerge-patched`. `.npmrc` packs
  local packages for reproducible clean installs. Nested file overrides and stale
  local metadata initially failed `npm ci`; the final direct development dependency
  and deduplicated lockfile pass a clean install.

Final production audit: **zero reported vulnerabilities**. Full audit: **zero
moderate/high/critical and five low entries**, all the version-based deepmerge/Jest
chain. npm still matches the nominal upstream version despite the local source
patch. These entries are documented, not hidden or reported as a zero-finding
full audit. Security review must assess the local patch itself. Keep the regression
tests and replace the local package when a verified upstream fix is available.
Existing ESLint/whatwg-encoding deprecation notices also remain; they are not new
advisories or proof of a runtime failure.

## Final checks

| Check                                                | Result                                            |
| ---------------------------------------------------- | ------------------------------------------------- |
| Clean `npm ci --ignore-scripts --no-audit --no-fund` | Passed                                            |
| `npm ls --all --json`                                | Exit 0; no dependency-tree problems               |
| Lint and TypeScript                                  | Passed                                            |
| Full Jest regression                                 | **966 tests, 60 suites passed**                   |
| Focused UI/client/route/dependency checks            | **83 tests, four suites passed**                  |
| Focused changed UI/route/helper/schema coverage      | **98.69% lines, 93.33% branches, 100% functions** |
| Production build                                     | Passed                                            |
| Production-server Playwright Q&A checks              | **Three passed**                                  |
| Formatting and Git whitespace/conflict checks        | Passed before final handoff                       |

Browser checks cover Enter submission, loading, retry, target switching,
insufficient evidence and the 375px layout. Successful browser replies are
intercepted HTTP fixtures; a separate case exercises the real route's safe failure
with paid calls disabled. The actual-service integration tests establish the
controlled successful server path. Desktop/mobile screenshots under `test-results`
were visually inspected. The sandbox's Windows test-wrapper teardown hung after
the assertions; stopping only this run's fixture/server wrappers let Playwright
exit 0. No application workaround was introduced.

Before a protected merge, obtain normal teammate review **and a separate security
reviewer** under `AI-Assisted-Development.md` section 7, human review of generated
code/tests, and current-head PR CI. The separately owned Sprint 2 changed-code CI
gate, hosted ownership acceptance and live-model evaluation are not certified by
these local checks. This report does not close dependent stories or replace those
acceptance gates.

PR draft: `docs/pr-s2-009.md`. Recorded AI sessions:
`ai-transcripts/2026-11-13_melissa_S2-009_codex.md`.
