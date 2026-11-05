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

The Route Handler must use the shared `requireApiUser()` guard and return its failure response
before doing target or provider work. It must pass `auth.user.id` to the submission service; an
owner/user ID from request data is never authoritative. The target lookup should use the shared
`getAnalysisTargetById(client, auth.user.id, targetId)` repository function with the
session-scoped Supabase client. That repository filters by both target ID and owner ID and
intentionally returns `null` for both nonexistent and foreign-owned targets. Do not reimplement
authentication or target persistence in the Route Handler.

These interfaces are currently in open teammate PRs: [S1-009 #37](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/pull/37)
and [S1-010 #39](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/pull/39) provide
authentication and protected-route helpers; [S1-011 #40](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/pull/40)
shows the owner-derived route pattern; [S1-014 #35](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/pull/35)
provides the AnalysisTarget repository. Integrate these shared modules when available rather than
copying them into S1-019.

The S1-014 `AnalysisTarget` type makes `googlePlaceId` nullable and documents that it is resolved
during ingestion. Therefore, an AnalysisTarget containing a validated Google Maps `sourceUrl` but
no Place ID is intended to be ingestible; requiring a Place ID before submission would conflict
with that contract. The current S1-020 Outscraper client and results lookup are Place-ID-based,
however, and S1-014 does not yet expose a repository operation to persist a resolved Place ID.
The current submission service consequently fails closed with `SOURCE_NOT_CONFIGURED` for such a
target and does not call Outscraper. This is an interim safety behavior, not end-to-end URL support.
Before the Route Handler is considered integrated, the team must agree on a safe URL-to-Place-ID
resolution and persistence boundary and connect it to the provider/results workflow.
