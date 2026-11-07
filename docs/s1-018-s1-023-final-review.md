# S1-018 / S1-023 final integration review

Date: 2026-11-07, America/New_York. Branch: s1-018.
Current review target: e5ce0c3, containing implementation 0558509, main merge
366dc01 and the PR #48 review corrections. Main includes S1-015 e8839ef.
The fixes are now committed; earlier references to uncommitted corrections below
are historical descriptions of the preceding implementation turn. This is an implementation review,
not independent teammate/security approval or hosted acceptance.

## Requirement coverage

| Requirement                          | Implementation and evidence                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-018 target context and navigation | Owned workspace shows name, platform, source and current ingestion state. Auth/ownership precedes child reads; missing/foreign/malformed IDs share denial. Unit and browser checks cover refresh, account switch and logout.                                  |
| S1-023 attempt/result state          | Separate durable processing/succeeded/failed attempts, counts and safe errors; atomic review insertion/finalization; existing reviews survive failure. Unit and actual SQL tests cover terminal outcomes, rollback and repeated finalization.                 |
| S1-015 deferred handoff              | Creation routes to the encoded target ID with created=1; the owned workspace displays the required success notice. The temporary unavailable message is removed. Stale completions cannot redirect a later page. Creation/refresh/mobile browser checks pass. |
| S1-017 deferred badge                | Every target card uses IngestionStatus and the owner-scoped status view. Missing/truncated/unavailable state stays unknown; only confirmed absence is Not ingested. All four states, new targets, outages and User B isolation are covered.                   |
| S1-BR-004 / 008 / 011                | Independent verified auth, parent ownership, RLS and restricted RPCs; safe errors/logging; private keys remain server-only. No trust in browser owner/source/job overrides. Cross-user and callback tests pass.                                               |
| Provider-job contract                | Durable reservation before submission, saved owner/target/source/job association, no duplicate active or post-success run, recovery signatures and verified-only finalization. URL provenance remains explicitly qualified. Storage stays gated.              |
| UI/UX                                | Shared shell/header/cards/status/errors/loading; Inter and semantic colors; responsive wrapping and prose width; persisted reviews; processing/poll retry and disabled-action explanations. Creation confirmation remains until leaving the workspace.        |
| Engineering/AI standards             | Business logic stays in server services; migration is additive; npm/lockfile changes came from merged S1-015, with no unrelated upgrades. Tests, docs and original available dialogue retained. Normal/security re-review and CI remain required.             |

Authoritative sources: the supplied requirements folder's Sprint 1 Stories,
Technical Specifications, Product Requirements, UX and Interface Guidance and
Sprint 1 demo; repository docs/engineering-standards.md,
docs/AI-Assisted-Development.md and docs/UI_UX_Standards.md. The originally named
alternate repository contains only .git; this workspace's docs remain the
user-confirmed standards source. No normative standards were changed.

## Review findings addressed

1. Result lookup failures preserve the accepted binding/lock. HTTP 401/402/403,
   missing key, invalid JSON, 404 and 502 probes prove no second paid start and
   restoration of the same job. Unknown nonterminal errors also remain retryable.
2. Reservation and UI block a new run after success; repeated requests return the
   saved result instead of creating another attempt or review batch.
3. Four-hour application expiry uses database time and a row lock, with checks
   before lookup and finalization. It ends the processing display but retains the
   billing hold until an evidenced operator resolution. This is deliberately
   separate from the provider's four-hour post-completion result availability.
4. Definitive submission 4xx rejections, except 408, are normal failures; ambiguous
   acceptance remains blocked. The restricted resolution RPC and runbook provide
   an audited release path after provider confirmation.
5. Callback recovery has explicit service-role SELECT and an RLS read policy,
   tested through an actual read without relying on Supabase defaults.
6. SQL tests exercise reservation owner denial, each finalization owner predicate,
   expected Place ID mismatch and no mutation on denial. Mutation probes rejected
   all five removed safeguards, including recovery-read permission.
7. The replacement PR description uses Refs #18 / Refs #23, distinguishes green
   baseline CI from unrun corrected-head CI, and states owner-visible job IDs
   accurately. It is saved locally and was published to PR #48 with an explicit
   warning that the code corrections and main merge are not yet pushed. Only the
   description changed remotely; no code was pushed and no reviews were requested.

No requested code fix was rejected. Expired jobs retain a billing hold rather
than automatically starting again; the operator release resolves that hold when
independent evidence permits it. Review-record deduplication remains outside this
scope; preventing post-success ingestion does not alter the merged storage API.

## Remaining acceptance boundary

Local checks: 600 tests / 45 Jest suites, 22 browser tests, seven SQL files across
four migrations, lint, formatting, typecheck and production build passed. Native
PostgreSQL CI for 0558509 was independently read as green in the preceding turn;
passing checks are required on the actual PR head. Remote publication and current
CI were not inspected during this review. Screenshots cover desktop/mobile/provenance layouts.

No further functional blocker was found in this review of the stated scope. This
does not declare the sprint or stories Done: human acceptance, normal and section 7
security re-review, hosted migrations/configuration, storage permission and hosted
two-user verification remain outstanding. Keep ingestion disabled. Use Refs until
hosted verification supports manual closure. No push, deployment or live provider
operation was performed; the main merge is the only new commit made by this agent.

## Read-only code review and local PR guidance update

The e5ce0c3 source was rechecked against S1-018, S1-023, the S1-015 creation
handoff, the S1-017 status-badge contract, and applicable docs standards. No new
implementation blocker was found in those paths. This is not independent normal
or section 7 security approval, nor hosted acceptance.

The minor inherited form-spacing discrepancy identified in this review was
subsequently corrected at the user's request. TargetForm now uses space-y-4
between fields and grid gap-1.5 within all three field groups, matching UI/UX
sections 3.2 and 7.3. No exception is needed. The preceding read-only review left
application code unchanged; this subsequent follow-up changes spacing only.

The original available dialogue was compared with the task's local session log.
Every previously retained message matched its original text after the documented
redaction/line-ending normalization. The preceding final response and this review's
new messages were appended; historical dialogue was not rewritten. A current
status annotation explains the later commit instead of misrepresenting old
uncommitted-state statements as current facts.

The local PR description now identifies e5ce0c3, retains Refs #18 / Refs #23,
removes the obsolete remote-head assertion and includes specific reviewer paths,
expected behavior and test entry points for both deferred integrations in addition
to the two stories and the additional security review. No GitHub operation was
performed. Only local documentation/transcript changes were made; the previously
passing application suites were not repeated for this documentation-only update.
