Addressed the re-review of **31ad6f3** locally:

- Added the failed-start budget SQL regression: five reservations finish as
  PROVIDER_REJECTED, SUBMISSION_UNCERTAIN, PROVIDER_QUOTA, PROVIDER_AUTH and
  PROVIDER_BILLING; a sixth new target must receive INGESTION_START_LIMIT. The
  baseline passes and excluding failed rows from the count fails this test.
- Added app source_review_id boundary coverage (256 accepted / 257 rejected).
  Removing its guard fails the regression. Removed the unreachable app date-length
  check; dates come from toISOString(), and SQL retains its defensive bound.
- Corrected metadata wording: sanitizeMetadata omits oversized optional metadata
  and stores null while otherwise valid reviews may save. Added a lifecycle test
  proving that behavior; retained data still has final limits.
- Documented intentional late callbacks while INGESTION_ENABLED is off. Tests for
  unset/false flags confirm signed binding recovery only, with no fetch or other
  RPC, and forged callbacks remain denied before privileged access.
- Updated the local PR description and verification document: the prior transcript
  is committed in 31ad6f3, and CI passed on that head as confirmed in your review.

Validation: **633 unit tests / 47 suites**, all nine SQL files plus the two-session
concurrency regression across six migrations on local PostgreSQL 18, lint,
formatting, typecheck and build passed. Provider data was synthetic; no paid calls.

Fresh CI and both reviewers' approvals must cover the final published commit.
Ingestion remains off, with all live-use prerequisites retained. No commit, push,
GitHub edit or hosted migration was performed. The updated PR description is in
`docs/pr-48-description.md`; hosted verification is still required for closure.

Refs #18
Refs #23
