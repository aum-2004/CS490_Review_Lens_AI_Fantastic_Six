# `src/services` — Server-side business logic

Domain logic and data access live here, not in React components or directly in Route Handlers.
Services are server-only: never import them from a Client Component (`"use client"`).

Planned folders (created by the stories that need them):

| Folder              | Responsibility                                     | Stories                 |
| ------------------- | -------------------------------------------------- | ----------------------- |
| `auth/`             | Resolve the verified user from the session         | S1-009 – S1-011         |
| `analysis-targets/` | Create, list, and authorize AnalysisTargets        | S1-012, S1-014 – S1-018 |
| `ingestion/`        | Fetch reviews from the source URL, record attempts | S1-019, S1-020, S1-023  |
| `reviews/`          | Normalize and persist Reviews                      | S1-013, S1-021, S1-022  |

Every service that touches user-owned data must take the authenticated user's identity as input
and enforce ownership itself (S1-BR-007 through S1-BR-010).

## S1-019 submission integration

`submitReviewSource` is an independently testable server-only service. Its target lookup and
provider-start function are injectable so unit tests can verify authorization and provider-call
ordering without network access or paid extraction requests. The integrated POST
route calls S1-023's `beginIngestion`, which reserves the target before invoking
`submitReviewSource` with the stored snapshot and a callback-aware provider adapter.

The POST route is disabled unless the server-side environment variable `INGESTION_ENABLED` is
exactly `"true"`; an absent or any other value returns a safe unavailable response before target
lookup or provider access. S1-023 owns enabling this only after server-side job binding and
repeat-submission protection are in place.

The Route Handler must use the shared `requireApiUser()` guard and return its failure response
before doing target or provider work. It must pass `auth.user.id` to the submission service; an
owner/user ID from request data is never authoritative. The target lookup should use the shared
`getOwnedTargetOrThrow(client, targetId, auth.user.id)` ownership helper with the session-scoped
Supabase client. It delegates to the repository, filters by both target ID and owner ID, and maps
nonexistent and foreign-owned targets to the same not-found error. Do not reimplement
authentication or target persistence in the Route Handler. S1-019 keeps `submitReviewSource` as
the ingestion service; the short-lived `startTargetIngestion` duplicate from S1-013 was removed
after the merged route was switched to this service.

The S1-014 `AnalysisTarget` type makes `googlePlaceId` nullable and documents that it is resolved
during ingestion. The submission service therefore sends the stored validated `sourceUrl` to
Outscraper when no Place ID is available, while preferring the stored Place ID when one exists.

Outscraper result retrieval is the identity-verification boundary. A completed result must contain
one unambiguous provider Place ID, a non-empty business name, and internally consistent review
identity fields. When a verified Place ID already exists, it must match every returned record. When
the job was submitted with a URL, the provider-resolved Place ID becomes the verified identity;
URL parameters are never treated as verified IDs. Missing, ambiguous, or mismatched identity fails
before reviews are handed to persistence.

S1-022/S1-023 may persist only the completed `VerifiedExtractedReviews` result from
`getExtractedReviews`. They must not persist raw Outscraper payloads or call the adapter directly.
Pending results contain no reviews, provider failures remain failures, and completed results must
retain the verified identity alongside normalized reviews.

### S1-023 provider-job binding contract

S1-023 must create a server-side record for every accepted provider job before exposing or
retrieving its results. That record must bind the provider job ID to the authenticated
`analysis_target_id` and owner ID derived from the ownership-checked target, along with the
submitted source and lifecycle status. Result retrieval must look up that record by the
authenticated owner, target, and provider job ID; an arbitrary client-supplied job ID must never
be accepted as authority. Repeat submissions must be blocked or made idempotent from that
server-side record before the feature is enabled.

For URL-based jobs, consistency among the provider's returned Place ID, Google ID, location link,
and business name proves only that the returned records agree with each other. It does not prove
that the result belongs to the original stored source URL. S1-023 must retain the verified
identity and must not describe URL-query consistency alone as proof of source-URL ownership.

## Outstanding ingestion integration requirement

- **Provider review-storage permission:** Before persisting Outscraper review content, the team must
  verify that the provider's terms and applicable source terms permit storing and using the returned
  review text. This permission has not been confirmed by evidence in this repository. Track the
  verification and team acceptance as an integration requirement; do not treat S1-020 retrieval as
  approval to persist provider content.

- **Review-ID evidence and uniqueness:** S1-020 maps a provider `review_id` when one is present, but
  real-world review-ID presence and uniqueness remain unverified. The checked-in flat-response
  example is explicitly synthetic and demonstrates adapter mapping only; it is not evidence about
  live provider payloads.

- **S1-022 duplicate handling (Sprint 1 decision):** S1-022 persists reviews as-is, with no
  deduplication, as allowed by [#22](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/22)
  for Sprint 1:
  - A missing provider ID is stored as `source_review_id = null`; the review is still saved.
  - Repeated or non-unique provider IDs, within one batch or across batches, are stored as separate
    rows.
  - The storage layer would store repeated batches as separate rows. S1-023 now
    prevents another ingestion run after a target succeeds, in its RPC and UI;
    it does not introduce review-record deduplication.
  - A non-unique `(analysis_target_id, source_review_id)` index lets a later sprint find and resolve
    duplicates. Deduplication and re-ingestion handling are deferred beyond Sprint 1.

- **Integration gate before persistence:** Provider review-storage permissions must be confirmed and
  recorded before persisting real reviews. The dedicated S1-022 issue is [#22](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/22),
  “Persist Ingested Reviews with Target Ownership”; its guidance calls out future duplicate-source
  review handling, while the S1-020 evidence does not establish live ID uniqueness.

## S1-023 provider-job binding implementation

Re-review follow-up to 40af2a3: the database CI runner now exercises two overlapping
sessions on distinct targets, and removing the owner advisory lock fails the test.
010000 is restored exactly to e69f084; forward migration 030000 installs completion
limits for databases that already ran it. All six migrations are required. The
five-start limit is per account; a global spend-control decision must be recorded
by the team before enabling ingestion. No global protection is claimed here.

Security follow-up to e69f084: browser DELETE on analysis_targets is revoked, so
owners cannot cascade away billing holds or audit records. A server-only database
budget serializes reservations per owner and permits at most five in a rolling
24 hours; rejected/uncertain reservations are conservatively counted. Existing
held/successful attempts are returned before applying the new-reservation cap.
Start-limit feedback is safe HTTP 429 and no provider call follows a denied reservation.

Provider result bodies are streamed with a 2 MiB maximum before parsing. Only
30 reviews may complete an attempt. App and SQL checks independently enforce
2 MiB completion JSON, 10,000-character text, 200-character reviewer/business names,
256-character source IDs, 2,048-character review URLs, 64-character dates and
16 KiB compact metadata/identity budgets in the app. SQL allows 32 KiB of
jsonb::text per metadata value to accommodate PostgreSQL's added spaces; identity
retains its separate 16 KiB SQL guard. A dense 16,306-byte compact metadata fixture
is accepted by both layers and successfully finalized in the SQL suite.
Whole batches are rejected, never silently
truncated. Oversized lookups retain the existing job hold. The existing
manual-review API has separate limits; this does not claim to change its Data API grants.
Business names, googleId and locationLink are made PostgreSQL-safe using the shared
NUL/surrogate cleaner before persistence.
Both start and refresh honor INGESTION_ENABLED; read-only status remains available.

The current branch includes merged S1-019 commit `0388c43`. It retains its submission
service, latest nested identity checks and regression tests, and composes submission
with S1-023's durable lifecycle. A valid stored source URL is sufficient when no
configured Place ID exists. The obsolete `startTargetIngestion` helper stays deleted.

- A database reservation snapshots the ownership-checked target, owner, source URL,
  submitted query, query kind, and expected Place ID before a paid request. Target
  row locking and a unique active-attempt index prevent concurrent paid submissions.
- The accepted provider job ID is attached server-side before returning a public
  summary. UI/API summaries omit provider job IDs, but authenticated owners may
  read their own bindings through RLS-protected SELECT. Result reconciliation queries
  the stored record using verified owner, target, and stored job ID; request bodies
  and query-string job IDs are ignored.
- Browser sessions can only read attempts under RLS. Binding/finalization RPCs are
  executable only by `service_role`, use an empty search path, and independently
  verify target ownership. `SUPABASE_SERVICE_ROLE_KEY` is used only by the server
  ingestion RPC writer, never for page reads or in a browser bundle.
- Completed `VerifiedExtractedReviews` are normalized, then one locked transaction
  inserts reviews and records success/counts. Pending results save nothing. Repeated
  completion calls return the existing terminal result without another insert.
- Verified provider identity is retained with the attempt. When an expected Place
  ID existed, results must match it (`identity_basis=expected_place_id`). URL jobs
  instead retain `identity_basis=provider_resolved`: their source is associated by
  the accepted server-bound request and their returned identities are checked for
  internal consistency. That is not independent proof of correspondence to the URL.
  The workspace discloses this provenance and never writes the returned Place ID
  into the AnalysisTarget's configured identity. No new resolver or manual Place ID
  input is required by S1-019.
- A submission timeout or uncertain provider response is recorded as
  `SUBMISSION_UNCERTAIN` and blocks additional paid jobs. An accepted job whose
  binding cannot be saved remains reserved and is never exposed for retrieval;
  after a minute, reconciliation records the same blocked uncertain outcome.
  An operator must reconcile provider records before clearing that block. There is
  no automatic resubmission across the external-provider/database failure window.
- Binding now retries idempotently and registers a per-attempt callback before paid
  submission. Both provider-body and server-correlation signatures are verified;
  callbacks bind metadata only. Stale expiry is checked under a row lock and a
  storage-approval outage preserves the processing attempt. See
  [accepted-job recovery](../../docs/s1-023-job-recovery.md) for configuration and the
  operator procedure. Browser input cannot select a recovery job.
- A transient timeout/quota/unreachable error while checking an accepted job leaves
  the attempt processing and offers status retry, rather than permitting a new paid
  submission. Definitive extraction failures record failed results without changing
  prior saved reviews.

PR #48 corrections extend retryable lookup handling to auth, billing, missing
configuration, malformed responses and all other errors without definitive failure
evidence. The four-hour database deadline changes overdue jobs to Failed while
retaining a billing hold; only an operator with verified provider evidence can
release that hold. Successful targets are not eligible for another run in Sprint 1.
Clear submission 4xx rejections (except 408) are safe failures, while timeouts,
5xx and malformed acceptance responses remain uncertain. The follow-up migration
explicitly grants service-role recovery reads. See the recovery runbook for details.

`INGESTION_ENABLED` remains false by default. Starting a paid request also requires
`PROVIDER_REVIEW_STORAGE_APPROVED=true` and a non-empty
`PROVIDER_REVIEW_STORAGE_APPROVAL_REFERENCE` identifying recorded team approval of
both provider and source terms. No such approval is asserted by this implementation.
Reconciliation does not fetch or persist real provider reviews without that gate.
New paid requests also require valid server callback configuration from `.env.example`.
Tests use only synthetic fixtures and injected provider functions; there is no
production fake-provider mode.

`GET /api/analysis-targets/[targetId]/ingestion` only reads status.
`POST .../ingestion/refresh` reconciles an existing server-bound job and never starts
a paid extraction. The provider continues while the user is away; returning resumes
reconciliation. No in-process background task is relied upon after a response.

The owner-scoped `analysis_target_ingestion_status` view explicitly emits
`not_ingested` for targets with no attempt. Missing/truncated/unavailable response
rows remain unavailable in the app. S1-017 cards and the S1-018 workspace use the
same four-state `IngestionStatus` component. Unavailable status is separate text,
not a fifth ingestion outcome.

Database/API guidance checked against
[Supabase database functions](https://supabase.com/docs/guides/database/functions)
and [PostgreSQL security-invoker views](https://www.postgresql.org/docs/16/sql-createview.html).
