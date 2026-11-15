# S2-009 security-review follow-up

> Migration-version fix: the unapplied quota is now
> `20261115043442_limit_paid_review_questions.sql`, with unchanged SQL. The user's
> shared-history/object checks and automatic duplicate-version guard are recorded
> in `s2-009-migration-versions.md`. Keep Q&A disabled until hosted deployment/checks.

> Reviewer follow-up: main `54c3a3a` (#89) is reconciled in `6272d01`, with
> main's exact v4 prompt and tests retained. New ownership-before-body route tests
> reject removal of the route ownership check. See `s2-009-review-followup.md`.
> Earlier reconciliation checkpoints below describe their original snapshots.

> Latest reconciliation: main `08a014b`, including #79, is now integrated in
> `992b8f1`. See `s2-009-main-reconciliation.md` for current verification and the
> authorized v4 prompt integration from `ad59a2c`. The earlier merge state and test totals below are
> historical; the quota design and deployment requirements still apply.

Author: melissa. Code fix: `b079828`. Main reconciliation: `2a622c9` against
`origin/main` at `cd3e69b`. All work remains local; no push or hosted migration
was performed. The earlier functional/security reviews were for `2a138d7` and do
not automatically approve the new quota migration/RPC.

## Paid Q&A limit

Each authenticated account can reserve **five attempts within any rolling 24
hours**, across all AnalysisTargets. This is an initial conservative policy matching
ingestion's account-level limit, not a browser-controlled or per-process counter.

The route order is authentication, target ownership, JSON/bounded question validation,
fresh authorized context and prompt construction, provider configuration check,
durable quota reservation, then the provider's counting/generation path. Invalid,
unauthorized, context-failed, disabled or misconfigured requests reach no quota
reservation and no provider. A reservation failure makes neither provider request.

`supabase/migrations/20261115043442_limit_paid_review_questions.sql` introduces:

- A small reservation table containing only an ID, verified owner ID and timestamp.
  It stores no question, review text, response or chat history. Expired rows are
  cleaned on the next reservation; normal operation retains at most five per account.
- RLS enabled and all direct table access revoked from browser/API roles.
- A narrow `SECURITY DEFINER` RPC with a fixed empty search path and no arguments.
  It derives identity from `auth.uid()`, rejects a missing identity and touches only
  that caller's budget. Only `authenticated` may execute it; no service-role client
  or caller-supplied owner is used. Review evidence still uses the existing RLS path.
- A transaction-scoped advisory lock per account, so concurrent workers/targets
  cannot independently pass the same count check and exceed five reservations.

Reservations commit before counting/generation. Provider failures, including failed
token counting, do not refund attempts: an uncertain request may already incur cost.
Switching/deleting a target or restarting an app worker does not reset the budget.

The endpoint returns fixed safe errors: `429 QA_DAILY_LIMIT` on exhaustion, with
private/no-store headers and a conservative `Retry-After: 86400` upper bound;
`503 QA_QUOTA_UNAVAILABLE` on missing/unavailable/malformed quota storage. Logs keep
only operation/category. The UI explains the policy, preserves failed input and
maps these codes to local user-facing copy rather than displaying database text.

## Disabled-Q&A browser test

The review's nonblocking test improvement is addressed. The local review fixture
now supports the real builder's exact-count header and omitted zero offset. The
production-browser test inspects the actual response and asserts **503 with
`error.code === "QA_DISABLED"`**. Its alert also uses the disabled-Q&A copy.
It no longer passes because of an earlier `REVIEW_CONTEXT_UNAVAILABLE` failure.

## Dependency patch decision

The user explicitly confirmed that **the team agreed to retain the local deepmerge
patch until a reviewed upstream fix is available**. Its source, license, package
versions and npm overrides are unchanged by this follow-up. The original security
review's line-by-line assessment is retained as evidence, not treated as approval
of new code. Its six actual-consumer/prototype-poisoning regressions remain in the
full suite. The earlier version-based low-advisory caveat remains documented in
`s2-009-verification.md`; this follow-up did not add or upgrade dependencies.

## Reconciliation and remaining acceptance

Current main now contains S2-010 (#78) and S2-013 (#76). Those changes were merged
locally and conflicts resolved while preserving the newer S2-011-compatible v3
prompt, full provider-count budgeting and expanded production-route tests. The
real context builder remains unchanged from main. No conflict entries remain
against the fetched main tip. S2-011 (#79) is still not in main; its remaining
service changes cannot disappear from the PR diff until it merges and this branch
is reconciled again. No history rewrite, force-push or dependency-PR merge was done.

Keep **`QA_ENABLED=false`** in deployment until the team reviews/applies the quota
migration through its approved Supabase workflow and verifies the hosted RPC.
Missing quota storage also fails closed if Q&A is accidentally enabled. The local
test-only auth shim must never be applied to Supabase. No shared/hosted schema,
deployment environment or model configuration was changed here.

Final security review should include the RPC's identity/privileges/locking and the
new route order. Hosted RLS/auth acceptance and live-model/count-endpoint evaluation
remain separate tracked work. This change does not claim those acceptance gates
are complete or close any dependent story.

## Verification

- Lint, TypeScript, production build and formatting passed. The first sandbox build
  could not download the existing Inter font; the network-enabled retry passed.
- **1,142 Jest tests in 69 suites passed**, including all prior story regressions.
- **102 focused tests passed**. The quota service has 100% statement/branch/function
  coverage; measured route/UI/client/quota coverage is 98.52% lines, 95.08% branches
  and 100% functions.
- The entire native **PostgreSQL 18** database suite passed in a throwaway local
  Ubuntu database, including all existing isolation/ingestion regressions. New tests
  cover grants, empty identity, fifth/sixth attempts, two users, expiry and inability
  to delete reservations directly. Twelve real concurrent sessions produced exactly
  **five allowed and seven denied**, with five persisted reservations. The test
  database was removed by the existing runner's cleanup.
- **12 production-browser tests passed**: four Q&A checks (including explicit
  `QA_DISABLED` and safe quota display) and eight workspace/auth regressions.
  Successful answers remain deterministic HTTP fixtures; no paid provider call was used.

Recorded follow-up: `ai-transcripts/2026-11-14_melissa_S2-009_codex.md`.
