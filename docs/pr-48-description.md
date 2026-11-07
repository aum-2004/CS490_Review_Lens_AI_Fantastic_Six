## Summary

Adds the owned AnalysisTarget workspace and persistent ingestion results for
S1-018/S1-023. Includes both deferred integrations: S1-015 creation opens the new
workspace with confirmation, and S1-017 cards use authoritative ingestion badges.

Refs #18
Refs #23

Issues remain open until hosted verification is complete.

Review target: local commit `e5ce0c3` plus the final form-spacing correction,
including main merge `366dc01` and S1-015 `e8839ef`. This description was prepared locally. Remote publication and current
GitHub checks were not inspected or changed during this review.

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

## Reviewer guidance: include the deferred integrations

Please review **both stories and both integration handoffs**. This PR is broader
than a standalone workspace page or status-table change:

1. **S1-015 creation to workspace:** Start with TargetForm and
   ProtectedTargetWorkspace. After a genuine saved creation, expect navigation to
   the encoded `/analysis-targets/{id}?created=1`, the exact success notice and
   the new target's context. Check refresh, a second creation, navigation away
   while creation is pending, and a 120-character mobile title. The notice is
   presentation only: a forged marker must not disclose another user's target,
   start ingestion, or create data. Reopening normally has no creation notice.
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

## Additional section 7 security review

Please independently inspect verified session identity and parent ownership before
child/provider work, RLS and RPC execution grants, empty function search paths,
service-role confinement, callback HMACs over the raw bounded body, and safe logs
and responses. Verify forged owner/source/job inputs cannot influence the stored
binding. Owner-readable job IDs are not authorization. Verify URL identity remains
qualified provenance and that provider/source storage approval and ingestion flags
remain off by default. Use synthetic provider responses for failure probes; a paid
provider call or enabling live ingestion is not required for this review.

## Validation

The following evidence covers the implementation now committed as `e5ce0c3`.
The preceding pass reviewed code, requirements and transcript accuracy without
changing application code. The subsequent local correction only aligns TargetForm
spacing; its focused verification is recorded in the acceptance evidence.

Final spacing verification: all 28 TargetForm tests, the existing mobile creation
browser test with a 120-character title, focused ESLint and formatting passed.

- 600 unit tests passed across 45 suites.
- All 22 local Edge authentication/creation/workspace browser tests passed.
- All seven SQL test files passed in isolated PGlite with all four migrations.
- Mutation probes rejected removal of the reservation owner filter, each finish
  owner predicate, the expected Place ID comparison and service-role SELECT grant.
- Formatting, lint, explicit typecheck and production build passed.
- CI #112 passed for reviewed commit `0558509`, including
  [application checks](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/actions/runs/42333931440/job/128286455006)
  and [PostgreSQL checks](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/actions/runs/42333931440/job/128286454770).
  That green result predates these corrections. Require passing checks on the
  actual PR head; current-head CI is not asserted by this local review.
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
