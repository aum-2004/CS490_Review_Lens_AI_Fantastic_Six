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
ordering without network access or paid extraction requests.

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
  live provider payloads. S1-022 must define and implement the deduplication/persistence behavior,
  including the safe handling of missing or non-unique provider IDs, before real reviews are stored.

- **S1-022 duplicate handling (Sprint 1 decision):** S1-022 persists reviews as-is, with no
  deduplication, as allowed by [#22](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/22)
  for Sprint 1:
  - A missing provider ID is stored as `source_review_id = null`; the review is still saved.
  - Repeated or non-unique provider IDs, within one batch or across batches, are stored as separate
    rows.
  - Ingesting the same target again stores its reviews again, creating duplicate rows.
  - A non-unique `(analysis_target_id, source_review_id)` index lets a later sprint find and resolve
    duplicates. Deduplication and re-ingestion handling are deferred beyond Sprint 1.

- **Integration gate before persistence:** Provider review-storage permissions must be confirmed and
  recorded before persisting real reviews. The dedicated S1-022 issue is [#22](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/22),
  “Persist Ingested Reviews with Target Ownership”; its guidance calls out future duplicate-source
  review handling, while the S1-020 evidence does not establish live ID uniqueness.
