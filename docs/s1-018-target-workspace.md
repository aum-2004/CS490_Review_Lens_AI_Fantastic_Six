# S1-018 and S1-023 implementation

Implemented locally on `s1-018`, fast-forwarded to merged S1-019 commit `0388c43`.
Implementation commit `0558509` is the original PR #48 baseline. Review corrections
and the creation handoff are now committed as `e5ce0c3`; issue closure still awaits
hosted verification. Current remote publication/CI was not inspected in this review.
The user extended this branch to S1-023 and assigned the
S1-017 card-badge integration to it. Merged S1-019 is now included and integrated.
Main through S1-015 commit `e8839ef` was merged in `366dc01`. Successful creation
now opens the owned workspace with `?created=1` and its required success notice.

## Workspace and shared UI

The existing Open links reach `/analysis-targets/[targetId]`. Each page independently
authenticates and checks target ownership before reading reviews or attempts. The
verified workspace layout preserves AppShell/navigation during content errors;
layouts alone are not relied upon for authorization. Missing, foreign and malformed
IDs share the same safe denial without target data. Refresh reloads stored data.

The header identifies the target, Google Maps source and ingestion state. The body
has ingestion and saved-review cards. Loading uses Skeleton, actions use the shared
Button/Spinner, and errors/empty results reuse the shared components. Inter is loaded
once and success/info semantic tokens support the shared badge. Review text is
escaped React text. Source links use noopener/noreferrer and a no-referrer policy.

S1-017 cards and the workspace use one IngestionStatus component for Not ingested,
Ingesting, Ingested and Failed. The owner-scoped database status view explicitly
confirms no attempt before returning Not ingested. Missing, truncated or unavailable
status stays unavailable. No ingestion outcome is inferred from review presence.

## Durable ingestion and storage boundary

Apply `supabase/migrations/20261107000000_create_ingestion_attempts.sql` through the
team's normal migration workflow before using the feature. It adds attempt storage,
RLS, status views and server-only mutation RPCs. Do not apply the test auth shim to
hosted Supabase.

The lifecycle reserves a target before paid submission, snapshots its stored source
and verified owner, binds accepted provider jobs, and retrieves only that stored job.
Request-body owner/source/job/review data cannot override those bindings. Browser
sessions have read-only attempt access; only service_role can invoke binding RPCs.
Never expose SUPABASE_SERVICE_ROLE_KEY as a NEXT_PUBLIC variable.

Only a completed VerifiedExtractedReviews result enters normalization. Identity is
retained with the attempt. A locked transaction inserts usable reviews and records
success/counts together; failed or repeated completion cannot duplicate or replace
old reviews. A pending provider result contains no review data to save.

Paid submission is disabled unless INGESTION_ENABLED is exactly true. It additionally
requires recorded provider/source storage approval via the two variables documented
in `.env.example`. Those gates stay off by default. No real provider reviews or
paid requests were used in verification. The code does not establish legal/storage
permission by itself.

Provider timeout, quota and unreachable errors have distinct safe messages. A
transient failure checking an accepted job leaves it processing and allows status
retry; it does not authorize another paid submission. An uncertain start blocks
resubmission until an operator reconciles it. A lost binding also remains reserved,
then becomes blocked uncertainty after a minute. A remote provider call and local
database write cannot form one atomic transaction: this failure window deliberately
fails closed instead of exposing an unbound job or silently starting another job.
The follow-up fixes add idempotent binding retries, a provider-authenticated,
per-attempt signed callback and an operator recovery procedure. Unbound expiry
rechecks the binding under its row lock, and storage-approval outages preserve the
active attempt. Details: [job recovery](s1-023-job-recovery.md).

The workspace polls the POST reconciliation endpoint while processing; GET status
is read-only. Navigating away stops UI polling, not the provider job. Returning
loads its stored attempt and resumes reconciliation. Application finalization occurs
when a workspace checks the job; no durable background worker is claimed.

## S1-019 integration

The branch was fast-forwarded to merged S1-019 commit `0388c43` and the saved
S1-018/S1-023 work was restored and reconciled. Its latest identity checks and tests
are retained. The lifecycle uses `submitReviewSource` after reservation, forwards
the recovery callback, and binds the accepted job before returning a public summary.

Source-only targets now work without manual Place ID input. URL results retain
provider-resolved identity and an explicit UI disclosure rather than an assertion
that the original URL's business was independently verified. Results are still
retrieved only through the owner/target/job binding, internally verified, normalized
and atomically persisted. Returned Place IDs never replace the target's configured
identity. Detailed analytics, Q&A, deployment and sophisticated re-ingestion remain
outside this work. See [integration details](s1-019-018-023-integration.md).

## Verification and acceptance

Tests cover backend authentication/ownership, stored-job retrieval despite forged
browser IDs, concurrent/repeated starts, atomic/idempotent completion, failures
preserving reviews, provider identity mismatch, storage gates, unavailable/truncated
status, polling, navigation/refresh and card badges for both users.

The SQL suite is run locally using an isolated PGlite PostgreSQL runtime because
native psql/PostgreSQL is not installed here. The runner removes only psql meta-command
lines, then executes the auth shim, all migrations, and all SQL assertion files.
PGlite is installed only under ignored node_modules; project dependencies and the
lockfile are unchanged. CI retains the existing native PostgreSQL 16 test job.

Final command results and inspected screenshots are recorded with the acceptance
evidence under `docs/acceptance/s1-018/`. Required checks are formatting, lint,
typecheck, Jest, build, database tests and relevant browser tests. The production
build needs network access for the Inter font download.

Before merge: teammate review, the additional authorization/RLS/secret review
required by the engineering standards, passing CI for the corrected head and human
acceptance are required. Hosted verification is required before issue closure;
use Refs #18 and Refs #23. The original available dialogue is retained in
`ai-transcripts/2026-11-06_codex_S1-018-S1-023_original.md`; the review-fix
continuation must also be linked. These are user/assistant dialogue, not raw tool traces.

AI assistance: OpenAI Codex. No sub-agents were used.
