# S1-019 / S1-018 / S1-023 integration continuation

Retention follow-up: the original user/assistant messages have now been recovered
from this task's local session log in `2026-11-06_codex_S1-018-S1-023_original.md`.
The export-pending notes below are historical; link that transcript in the PR.

Date: 2026-11-06, America/New_York. Tool: OpenAI Codex. No sub-agents.
This continuation records the available prompts, response and execution evidence.
It does not replace the complete available original session export required before
commit by docs/AI-Assisted-Development.md. Earlier records remain adjacent.

## User

Please re-review, 019 has been merged now.

## User

please integrat s1-019 code into this branch and make needed adjustments to 018 and 023

## Assistant

S1-019 is now integrated into this branch. I’ve adjusted 018/023 to use its submission service while preserving owner-scoped job tracking, duplicate-submission protection, and explicit warnings for URL identities that haven’t been independently matched. I’m finishing verification; paid ingestion and provider-review storage remain disabled.

## Execution record

- Read repository standards, story requirements and installed Next.js route-handler
  documentation. Retained no-push, current-branch and live-storage restrictions.
- Saved existing working changes in the retained safety stash
  s1-018-s1-023-before-s1-019-integration. Fast-forwarded s1-018 to merged S1-019
  commit 0388c43 and reapplied existing changes. Resolved conflicts, retaining the
  final upstream identity-validation checks. Cleared conflict/index entries while
  preserving working files. No new commit or push.
- Composed submitReviewSource with the server-owned reservation snapshot, signed
  recovery callback and durable job binding. Preserved 422 source validation.
  Removed dependence on the obsolete startTargetIngestion helper.
- Allowed valid source-only targets through submission and verified completion.
  Persisted provider-resolved provenance, computed in SQL from stored query kind.
  Configured Place IDs still require exact result matches. Returned URL identities
  never overwrite target identity; UI explicitly discloses the lack of independent
  matching to the saved URL.
- Adapted route, lifecycle, fixture and SQL regressions; added browser coverage of
  the disclosure. All provider fixtures are synthetic. No real provider requests,
  real review persistence, hosted migrations, deployment or issue closure occurred.
- Verification: 42 Jest suites / 541 tests; 20 Edge auth/browser tests; all six SQL
  assertion files in isolated PGlite. Typecheck, lint and formatting passed.
  Production build and final evidence are recorded in the acceptance document.
- Inspected refreshed desktop/mobile and URL-provenance screenshots. No layout
  overflow was observed; browser assertions also check mobile overflow.
- Recorded the integration and remaining release requirements in
  docs/s1-019-018-023-integration.md. Main ingestion and storage gates stay off;
  actual terms approval, callback deployment, database migration, teammate/security
  review, full original transcript retention and PR CI remain release requirements.
