## Summary

Adds the owned AnalysisTarget workspace and persistent ingestion results for S1-018 and S1-023. Includes both deferred integrations:

- **S1-015:** successful target creation opens `/analysis-targets/{id}?created=1` with confirmation.
- **S1-017:** target cards display authoritative, owner-scoped ingestion badges.

Refs #18

Refs #23

Issues remain open until hosted verification is complete.

Reviewed baseline: `40af2a3`. This description includes the subsequent security and normal-review corrections. Fresh CI and review are required on the final PR head.

## Implementation

- Verifies authentication and target ownership before workspace, review, status or ingestion operations. Foreign, missing and malformed IDs share a safe denial.
- Integrates main through S1-015 `e8839ef`. Creation confirmation offers ingestion only when available, consumes the URL marker after display and does not replay after reload or successful ingestion. Stale form completions cannot redirect another page.
- Uses one shared **Not ingested / Ingesting / Ingested / Failed** badge on cards and the workspace. Missing or unavailable status never becomes **Not ingested**.
- Persists owner, target, source and provider-job bindings with RLS and restricted mutation RPCs. Browser-supplied job IDs cannot select or authorize reconciliation.
- Blocks repeat ingestion after success in both the database and UI. Review insertion and successful finalization remain atomic and idempotent.
- Preserves accepted jobs and submission holds across lookup, account, configuration, transport and malformed-response errors. Retries resume the same job without another paid start.
- Applies a four-hour deadline under the database row lock before lookup and finalization. Expired attempts retain their billing hold until documented operator reconciliation.
- Distinguishes clear submission rejections from uncertain acceptance. Submission 4xx responses other than 408 fail normally; timeouts, 5xx and malformed acceptance responses remain blocked.
- Provides service-role recovery access and an operator-only release RPC that retains bindings and records evidence. Authenticated owners cannot read operator resolution notes or timestamps.
- Revokes authenticated target deletion so owners cannot erase billing holds or audit records through the Data API.
- Limits reservations to **five per account per rolling 24 hours**, serialized across targets. Rejected and uncertain reservations count toward the limit.
- Limits streamed provider results to **2 MiB** and completion to **30 reviews**, with field, metadata and identity limits independently enforced in application code and SQL.
- Keeps the application metadata limit at **16 KiB of compact JSON**, with a **32 KiB PostgreSQL-rendered allowance** in migration `030000` to accommodate `jsonb::text` spacing. The same dense 16,306-byte fixture passes application validation and successfully finalizes in PostgreSQL.
- Adds independent SQL boundary regressions for `review_url`, `source_review_id` and `review_date`, and application regressions for `review_url` and `reviewer_name`. Restores the distinct cross-user `getExtractedReviews` assertion.
- Requires `INGESTION_ENABLED` for both submission and refresh. Cleans provider business names, `googleId` and `locationLink` with `toStorableText`.
- Restores migration `20261107010000` to its `e69f084` version and installs completion limits through the new forward migration `20261107030000_bound_ingestion_completions.sql`.
- Retains provider-resolved URL identity as qualified provenance, without treating it as independent proof of a match to the saved URL or overwriting target identity.

## Reviewer guidance

Please review **both stories and both deferred integrations**:

1. **Creation handoff:** verify successful creation, availability-aware confirmation, marker removal, reload, mobile wrapping and navigation away while creation is pending.
2. **Card badges:** verify all four states and owner scoping. **Not ingested** requires successful backend confirmation that no attempt exists; failed or incomplete status reads must remain unavailable.
3. **Workspace:** verify target context, saved reviews, loading/empty/error states, keyboard navigation, refresh and cross-user denial.
4. **Ingestion lifecycle:** verify reservation, binding, retry, completion, expiry and operator recovery. Failed lookups must preserve accepted jobs; successful targets must remain blocked from another run.
5. **Concurrency and migration:** inspect the two-session start-limit regression and confirm existing databases receive completion limits through migration `030000`.
6. **Metadata and field boundaries:** verify dense application-valid metadata saves successfully, oversized metadata is rejected, and the URL, source-ID, date and reviewer-name limits have independent coverage.
7. **Additional §7 security review:** inspect ownership predicates, RLS/RPC grants, operator-note privacy, deletion restrictions, callback signatures, result limits and server-only secrets.

## Validation

- **629 unit tests passed across 47 suites.**
- **Nine SQL test files plus the two-session concurrency regression passed across six migrations on local PostgreSQL 18.**
- The concurrency test passed normally and failed when the owner advisory lock was removed.
- The finite streaming test rejected removal of the byte guard through a prompt assertion failure.
- NUL-cleaning tests cover flat and nested provider responses and the persistence boundary.
- Independent mutations removing each of the five requested field guards fail their corresponding tests. Restoring the old SQL metadata threshold also fails the dense-metadata success case.
- Formatting, lint, typecheck and production build passed.
- The preceding implementation pass passed all **22 authentication, creation and workspace browser tests**. This follow-up changes server ingestion and database tests; browsers were not rerun.
- Fresh application and PostgreSQL 16 CI results are required on the final PR head.
- Tests use synthetic provider data and no paid calls. Local [verification](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/docs/acceptance/s1-018/s1-018-s1-023-verification.md) does not replace hosted acceptance.

Evidence: [verification](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/docs/acceptance/s1-018/s1-018-s1-023-verification.md), [final review](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/docs/s1-018-s1-023-final-review.md), [recovery runbook](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/docs/s1-023-job-recovery.md).

## Deployment and review requirements

Apply all **six repository migrations**, including all **four ingestion migrations** through `20261107030000_bound_ingestion_completions.sql`.

`INGESTION_ENABLED` and provider-review storage approval remain off by default. Live use requires configured recovery, recorded provider/source storage approval and a team decision on the global paid-start/spend-control policy. The implemented five-start limit is per account and does not provide a global cap.

No hosted migration, paid extraction or real provider-review persistence was performed during these corrections.

Normal code re-review, the separate §7 security review, human acceptance and fresh CI are required before merge. Both reviewers must approve the final published commit. Hosted verification is required before manually closing either issue.

## AI usage disclaimer

The retained original dialogue and follow-up execution records have been updated locally. Include the changed continuation transcript in the next commit to meet the Definition of Done.

OpenAI Codex assisted with implementation, tests, integration, review remediation and documentation. The author remains responsible for reviewing the code and tests; automated checks do not replace human or security approval.

- [Original dialogue](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/ai-transcripts/2026-11-06_codex_S1-018-S1-023_original.md)
- [Review and main-integration continuation](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/s1-018/ai-transcripts/2026-11-07_codex_S1-018-S1-023_review-integration.md)
