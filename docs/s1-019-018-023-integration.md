# S1-019 integration with S1-018 / S1-023

The local `s1-018` branch now includes merged S1-019 commit `0388c43`. The previous
working changes were saved to the retained safety stash named
`s1-018-s1-023-before-s1-019-integration`, then restored over that commit. Conflicts
were resolved, the obsolete startTargetIngestion helper stayed deleted, and the
index was cleared while preserving working files. No new commit or push was made.

## Submission

One POST route owns submission. It authenticates, applies the existing live/storage/
recovery gates, and invokes S1-023 beginIngestion. Ownership and stored source input
are checked before a database reservation. Only a newly reserved attempt may call
S1-019 submitReviewSource, using its saved target/source snapshot. The injected
provider adapter forwards the signed recovery URL. The accepted job is bound before
the browser receives a public status summary; raw provider job IDs remain server-side.

A valid source URL is sufficient when no configured Place ID exists. A known Place
ID is preferred and must match returned results. Neither a request body nor browser
job ID can override the reservation, owner, target, source or recovery binding.

## Identity and URL-result policy

The merged S1-019 nested identity checks and all their regression tests are retained:
blank names, malformed identity fields, conflicting names, Google IDs, links and
Place IDs are rejected by the provider result-verification boundary.

Only completed VerifiedExtractedReviews results are normalized and persisted. For
URL jobs, application ownership/source association comes from the stored submission
and accepted job binding. Provider identity consistency is not independent proof
that the result matches the original URL's business.

The database computes identity_basis from the stored query kind, not browser or
provider claims. A configured-ID match is `expected_place_id`; a URL result is
`provider_resolved`. The returned identity is retained on the attempt, and the
workspace displays the provider's business name with an explicit statement that it
has not been independently matched to the saved link. The returned Place ID is never
promoted into the target's configured google_place_id. This implements the supplied
S1-019/S1-023 provenance contract without inventing a new manual identity-input or
independent resolver requirement for S1-019.

Successful completion still inserts reviews and records counts/state atomically.
Failures preserve prior reviews; repeated completion is idempotent. Both source URL
and expected-ID jobs use the same owner-scoped status readers, four-state badge,
callback authentication, uncertain-job block and recovery procedure.

## Validation and release boundary

Unit and SQL integration tests cover valid source-only submission and completion,
provider-resolved provenance, no identity promotion, configured-ID mismatch, forged
job/owner input, repeat paid-start protection and storage gates. Browser tests cover
the provenance disclosure through real local SDK queries. No paid extraction or
real provider review storage was enabled, and no hosted migration was applied.

Storage permission, recovery configuration, security review, PR CI and the existing
team merge requirements remain prerequisites for live operation/issue closure.
Local verification results are retained in
`docs/acceptance/s1-018/s1-018-s1-023-verification.md`.
