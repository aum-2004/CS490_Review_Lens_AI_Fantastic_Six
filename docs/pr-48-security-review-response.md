Addressed the §7 review of **e69f084** in local follow-up changes:

- **Deletion/audit blocker:** revoked authenticated DELETE on analysis_targets and
  removed its delete policy. SQL tests prove owners cannot erase uncertain or
  succeeded attempts and their audit/review rows. Administrative cleanup remains
  privileged; there is no browser deletion route.
- **Expiry owner checks:** added foreign-owner assertions for both expiry RPCs,
  plus independent checks of attempt and parent ownership. Mutation probes reject
  removing each predicate.
- **Before-enable safeguards:** added a database-serialized limit of five
  reservations per owner per rolling 24 hours, streamed provider results capped at
  2 MiB, and completion limits of 30 reviews with bounded fields/metadata enforced
  again in SQL. Rejections and uncertain submissions count toward the budget;
  oversized lookups retain the existing job and hold without partial insertion.
- Refresh now checks INGESTION_ENABLED before database/provider work. Provider
  business names use the shared PostgreSQL-safe NUL cleaner before verification
  and persistence.

**Validation:** 625 tests / 47 Jest suites, all 22 local Edge browser tests, all nine
SQL files across five migrations, lint, formatting, typecheck and production build
passed. The SQL mutation baseline passed and all eight weakened variants failed.
Provider data was synthetic; no paid calls were made. Local PGlite checks still
require the native PostgreSQL CI job.

Nothing was committed, pushed or posted to GitHub by this follow-up. Live flags
remain off. Apply all three ingestion migrations and retain the recovery/storage
approval gates. The next published head needs fresh CI and the separate §7
security re-review; issue closure still awaits hosted verification.

Refs #18
Refs #23
