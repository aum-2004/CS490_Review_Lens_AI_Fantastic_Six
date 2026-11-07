# S1-019 integration with S1-018 / S1-023

The `s1-018` branch includes merged S1-019 commit `0388c43` and implementation
commit `0558509`, published as PR #48. The obsolete startTargetIngestion helper
stays deleted. The PR #48 review corrections are committed in `e5ce0c3`; passing
CI on the actual PR head and normal/security re-review remain required. Current
remote publication and CI were not inspected during this local review.
Main through S1-015 commit `e8839ef` was subsequently merged into this branch in
`366dc01`; the creation/workspace handoff is integrated in `e5ce0c3`.

## Submission

The latest reviewed baseline is `e69f084`. Its local security follow-up prevents
browser deletion from erasing billing holds/audit, tests both expiry ownership
predicates, caps reservations at five per owner per rolling 24 hours, bounds result
transport/completion, gates refresh on INGESTION_ENABLED and cleans business-name
NULs. See the recovery runbook and local PR security-review response. These changes
have not been committed or pushed by this follow-up; fresh CI and §7 re-review remain
required.

One POST route owns submission. It authenticates, applies the existing live/storage/
recovery gates, and invokes S1-023 beginIngestion. Ownership and stored source input
are checked before a database reservation. Only a newly reserved attempt may call
S1-019 submitReviewSource, using its saved target/source snapshot. The injected
provider adapter forwards the signed recovery URL. The accepted job is bound before
the browser receives a public status summary. UI/API summaries omit provider job IDs;
owners can read their own provider_request_id through authenticated SELECT under RLS.
This read access never authorizes a browser to select or bind the job for reconciliation.

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
Failures preserve prior reviews; repeated completion is idempotent. A successful
target cannot start another run in Sprint 1, in either the RPC or UI. Both source URL
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

## PR #48 lifecycle review corrections

Polling ends an accepted job only on explicit provider failure, verified identity
failure, no usable reviews, or the separate four-hour application deadline. Other
lookup, configuration, parsing and transport errors preserve its binding and active
submission lock and return safe retry feedback. Restoring access resumes that job.

Expiry is checked by database time under the attempt row lock, before fetching
and again when finalizing results. Expired jobs show Failed and retain a billing
safety hold until an operator records verified provider evidence with the restricted
resolve_ingestion_no_job RPC. Expiry alone never authorizes another paid request.
Definitive submission 4xx rejections, except HTTP 408, allow a normal retry;
timeouts, 5xx and invalid acceptance responses remain uncertain and blocked.

Apply both ingestion migrations, including
`20261107010000_harden_ingestion_lifecycle.sql`. It also explicitly grants the
service-role SELECT used by callback recovery. See the operator runbook before
releasing a hold. PR #48 should use Refs #18 and Refs #23 until hosted acceptance;
it must not automatically close unverified stories.

## S1-015 and S1-017 deferred integration

Successful creation now navigates to `/analysis-targets/{id}?created=1`. The owned
workspace displays an availability-aware success notice, and the temporary
workspace-unavailable message is removed. Stale form completions after navigation
cannot redirect another page. Creation never starts a provider job automatically.
The client clears created=1 after consuming it, without a server navigation;
reload does not replay the notice. Starting collection is suggested only when
configuration and attempt state allow it. A completed run hides the notice.

The S1-017 follow-up is implemented by the shared IngestionStatus component on
every target card. The owner-scoped status view confirms Not ingested only when
no attempt exists; missing/unavailable/truncated state stays unavailable. Browser
coverage includes new target creation, card status, refresh, all four badge states,
status outages and User A/User B isolation.

## Review follow-up on 4e0ff89

The latest local corrections restrict authenticated table reads to named lifecycle
and binding columns. Operator resolution_reference and resolved_at are excluded;
service_role retains explicit recovery reads. The unchanged status views expose
only their originally defined columns, under security-invoker RLS.

The workspace has one status badge, in its header. Empty review copy no longer
prompts starting collection while it is disabled. Submission auth/billing/missing
key errors describe an account/configuration issue rather than blaming the source.
Polling now uses a five-second interval, two automatic retries delayed ten and
twenty seconds, then manual status retry; it never submits a second provider job.
