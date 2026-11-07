Addressed the §7 re-review of **40af2a3** locally:

- **Concurrent start cap:** added a real two-session PostgreSQL test to
  `npm run test:db`. One session holds the fifth reservation uncommitted; another
  reserves a different target. The test observes the advisory-lock wait, commits
  the fifth slot, and requires INGESTION_START_LIMIT with exactly five attempts.
  It passes normally and fails when the owner advisory lock is removed.
- **Forward migration:** restored 010000 exactly to e69f084 and moved completion
  size/count/field guards into `20261107030000_bound_ingestion_completions.sql`.
  Databases that already ran 010000 receive the checks through the new migration.
- **Identity:** googleId and locationLink now use toStorableText alongside business
  names. Tests cover NULs in flat/nested responses and at the persistence boundary.
- **Finite stream:** the lying-Content-Length test now ends after 2 MiB + 1 byte,
  so removing the byte guard produces a prompt assertion failure rather than an
  infinite stream.
  Removing the streamed byte guard now fails an assertion in about two seconds.
- Updated the local PR description for 40af2a3 and these corrections. It is ready
  to copy to GitHub; no remote description was changed.

With the accompanying normal-review follow-up, validation is now 629 unit tests /
47 suites; all nine SQL files plus the two-session
regression across six migrations on local PostgreSQL 18; lint, formatting,
typecheck and production build passed. Fresh PostgreSQL 16 CI and the separate
security re-review are still required on the next published head.

The five-start limit is per account. A global paid-start/spend-control policy remains
a team decision required before enabling ingestion; it is recorded in the runbook.
Ingestion stays off, with recovery/storage approval and hosted verification still
required. No commit, push, GitHub edit, paid call or hosted migration was performed.

Refs #18
Refs #23
