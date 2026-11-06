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

- **Integration gate before persistence:** Provider review-storage permissions must be confirmed and
  recorded before persisting real reviews. The dedicated S1-022 issue is [#22](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/22),
  “Persist Ingested Reviews with Target Ownership”; its guidance calls out future duplicate-source
  review handling, while the S1-020 evidence does not establish live ID uniqueness.
