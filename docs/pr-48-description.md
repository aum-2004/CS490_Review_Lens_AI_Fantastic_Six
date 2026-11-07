## Summary

Adds the owned AnalysisTarget workspace and persistent ingestion results for
S1-018/S1-023. Includes both deferred integrations: S1-015 creation opens the new
workspace with confirmation, and S1-017 cards use authoritative ingestion badges.

Refs #18
Refs #23

Issues remain open until hosted verification is complete.

Publication status: the remote PR head is `0558509`. The review corrections and
S1-015 main integration described below are prepared locally and have not yet been
pushed. This description does not claim those corrections are in the reviewed head.

## Implementation

- Verifies authentication and target ownership before workspace, review, status or
  ingestion operations. Foreign, missing and malformed IDs share a safe denial.
- Integrates main through S1-015 `e8839ef`. Creation navigates to
  `/analysis-targets/{id}?created=1`, shows the required workspace notice, and
  removes the temporary workspace-unavailable message. A stale form completion
  after navigation cannot redirect another page.
- Uses one shared Not ingested / Ingesting / Ingested / Failed badge on cards and
  workspace. Missing or unavailable status never becomes Not ingested.
- Persists ownership/source snapshots and accepted provider bindings with RLS and
  restricted mutation RPCs. Browser input cannot choose a reconciliation job.
- Blocks further ingestion after a target succeeds, both in the reservation RPC
  and UI. Review insertion and success state remain atomic and idempotent.
- Preserves accepted jobs across auth, billing, configuration, JSON, HTTP and
  transport lookup failures. Safe status retry resumes the same job without a
  second paid start. Only explicit provider failure, identity failure or no usable
  reviews are terminal result failures.
- Adds a four-hour application deadline checked under the database row lock before
  lookup and finalization. Overdue attempts become Failed with a clear message;
  their billing hold requires documented operator reconciliation before retry.
- Treats clear submission 4xx rejections, except 408, as normal failures. Timeouts,
  5xx and malformed acceptance responses remain uncertain and blocked.
- Explicitly grants service-role recovery SELECT and adds an operator-only,
  ownership-checked release RPC with retained binding and recorded evidence.
- Retains provider-resolved URL identity with an explicit disclosure. It is not
  independent proof of a match to the saved URL and never overwrites target identity.
- UI/API summaries omit job IDs. Owners can read their own provider_request_id
  through RLS-protected SELECT; this never authorizes a browser-supplied job ID.

## Validation

- 600 unit tests passed across 45 suites.
- All 22 local Edge authentication/creation/workspace browser tests passed.
- All seven SQL test files passed in isolated PGlite with all four migrations.
- Mutation probes rejected removal of the reservation owner filter, each finish
  owner predicate, the expected Place ID comparison and service-role SELECT grant.
- Formatting, lint, explicit typecheck and production build passed.
- CI #112 passed for reviewed commit `0558509`, including
  [application checks](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/actions/runs/42333931440/job/128286455006)
  and [PostgreSQL checks](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/actions/runs/42333931440/job/128286454770).
  That green result predates these corrections. Fresh CI is required after the
  corrected changes and main merge are published.
- Tests use synthetic provider data and no paid calls. Local PGlite verification
  does not replace the PR's native PostgreSQL job or hosted acceptance.

Evidence: [verification](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/docs/acceptance/s1-018/s1-018-s1-023-verification.md),
[final review](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/docs/s1-018-s1-023-final-review.md),
[recovery runbook](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/docs/s1-023-job-recovery.md).

## Deployment and review requirements

Apply both ingestion migrations, including
`20261107010000_harden_ingestion_lifecycle.sql`, before using the feature.
INGESTION_ENABLED and provider-review storage approval remain off by default.
No hosted migration, paid extraction or real provider-review persistence was
performed in this follow-up. Live use requires recovery configuration and recorded
provider/source storage approval. Normal code re-review, the additional section 7
security review, human acceptance and fresh CI are required before merge; hosted
verification is required before manually closing either issue.

## AI usage disclaimer

OpenAI Codex assisted with implementation, tests, integration, review remediation
and documentation. The author remains responsible for reviewing the code and tests;
automated checks do not replace human/security approval.

- [Original dialogue](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/ai-transcripts/2026-11-06_codex_S1-018-S1-023_original.md)
- [Review and main-integration continuation](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/ai-transcripts/2026-11-07_codex_S1-018-S1-023_review-integration.md)
