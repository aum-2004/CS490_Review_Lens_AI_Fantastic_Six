## Summary

Adds the owned AnalysisTarget workspace and persistent ingestion results for
S1-018/S1-023. Includes both deferred integrations: S1-015 creation opens the new
workspace with confirmation, and S1-017 cards use authoritative ingestion badges.

Refs #18
Refs #23

Issues remain open until hosted verification is complete.

Reviewed baseline: `4e0ff89`, including the earlier main/S1-015 integration and
spacing correction. This description also covers the subsequent local reviewer
fixes listed below; those follow-up changes have not been committed or pushed by
this agent. Require fresh CI and the separate security review on the next published
head. No current-head GitHub checks were asserted or changed during this follow-up.

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
  through RLS-protected, named-column SELECT; this never authorizes a browser-supplied job ID.
- Excludes operator resolution_reference and resolved_at from authenticated reads;
  service_role retains explicit recovery access. Adds actual SQL denial/read tests.
- Consumes the creation marker after display, preserves other URL parameters,
  hides the notice on reload/completion, and offers collection only when available.
  Empty review copy no longer suggests a disabled start. One badge appears in the
  workspace header; cards use the same shared badge component.
- Uses account/configuration feedback for submission auth, billing and missing-key
  failures. Polling runs every five seconds, with two bounded backoff retries
  before manual status retry. All checks remain bound-job refreshes, never starts.
- Redacts local-user paths in the three affected AI transcripts while preserving
  the dialogue with documented privacy replacements.

## Reviewer guidance: include the deferred integrations

Please review **both stories and both integration handoffs**. This PR is broader
than a standalone workspace page or status-table change:

1. **S1-015 creation to workspace:** Start with TargetForm and
   ProtectedTargetWorkspace. After a genuine saved creation, expect navigation to
   the encoded `/analysis-targets/{id}?created=1` handoff, its consumed URL marker and
   the new target's context. Check refresh, a second creation, navigation away
   while creation is pending, and a 120-character mobile title. The notice is
   presentation only: a forged marker must not disclose another user's target,
   start ingestion, or create data. When collection is off, expect only "Target created."
   without a start invitation. When available, expect the full start notice. The
   notice is absent after reload or successful ingestion. Reopening normally has no creation notice.
2. **S1-017 card badge integration:** Follow TargetCard through
   listTargetsWithIngestion and getTargetIngestionSummaries to the security-invoker
   status view. Verify all four shared badge states and owner scoping. A successful
   backend confirmation of no attempt is required for Not ingested; failed,
   missing or truncated status reads must show unavailable status while preserving
   the target list. Newly created targets must use this same authoritative path.
3. **Standard S1-018 review:** Verify the shared shell, target/platform/source,
   saved reviews, ingestion path, loading/empty/error states, refresh, keyboard
   navigation, mobile wrapping and direct cross-user denial. No invented reviews
   or ingestion outcome may substitute for failed reads.
4. **Standard S1-023 and previous findings:** Trace reservation, accepted binding,
   lookup, completion, expiry and operator resolution in the lifecycle and both
   ingestion migrations. Check atomic/idempotent finalization and unchanged old
   reviews on failure. Lookup 401/402/403/404/502, missing keys and invalid JSON
   must preserve the same accepted job and prevent another paid start. A succeeded
   target cannot start again. Confirm the four-hour application deadline is
   checked under the row lock, including a fetch that crosses it; expiry retains
   the billing hold until an evidenced operator release. Submission 4xx rejections
   except 408 must be distinguished from uncertain acceptance.

The final UI/UX follow-up is resolved: TargetForm uses space-y-4 between fields
and grid gap-1.5 within each field group, matching UI/UX sections 3.2 and 7.3.
Please include this spacing and the mobile creation flow in the normal UI review.

Useful test entry points:

- `tests/e2e/auth/analysis-targets.spec.ts`: real local SDK creation/handoff,
  confirmation, refresh, fresh form navigation, card state and mobile layout.
- `tests/e2e/auth/target-workspace.spec.ts`: context, shared badges, status outage,
  URL provenance, cross-user access and logout.
- `tests/unit/services/ingestion/ingestion-lifecycle.test.ts`: paid-start counters,
  lookup recovery, rejection versus uncertainty and expiry behavior.
- `tests/db/ingestion-review-regressions.test.sql`: actual RPC owner checks,
  expected Place ID mismatch, recovery SELECT, post-success blocking, expiry and
  restricted operator release. Run the complete database suite as well.
- `tests/db/ingestion-privacy-and-resolution.test.sql`: denied owner reads of
  operator evidence/time, valid allowed-column/status reads, service-role access,
  operator state rejection and direct expired-hold unique-index enforcement.

## Additional section 7 security review

Please independently inspect verified session identity and parent ownership before
child/provider work, RLS and RPC execution grants, empty function search paths,
service-role confinement, callback HMACs over the raw bounded body, and safe logs
and responses. Verify forged owner/source/job inputs cannot influence the stored
binding. Owner-readable job IDs are not authorization. Verify URL identity remains
qualified provenance and that provider/source storage approval and ingestion flags
remain off by default. Use synthetic provider responses for failure probes; a paid
provider call or enabling live ingestion is not required for this review.
Verify operator evidence stays inaccessible to authenticated owners, including
direct Data API requests; job-ID readability does not imply operator-note access.

## Validation

Current local follow-up checks on top of reviewed baseline 4e0ff89:

- 608 unit tests passed across 46 suites.
- All 22 local Edge authentication/creation/workspace browser tests passed.
- All eight SQL test files passed in isolated PGlite with all four migrations.
- New mutation probes passed the baseline and rejected weakened operator-state
  checks, removal of expired-hold index protection and operator-column privacy.
  Prior owner/identity/recovery-read mutation evidence remains in the verification.
- Formatting, lint, explicit typecheck and production build passed.
- No current-head CI result is asserted. Require fresh application and native
  PostgreSQL checks on the next published head, plus the separate security review.
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
