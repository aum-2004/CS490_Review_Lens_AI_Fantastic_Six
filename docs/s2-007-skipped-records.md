# S2-007 skipped or rejected review records

S2-005 already persists `saved_count` and `skipped_count` on each ingestion attempt and exposes
those owner-scoped values through `IngestionSummary`. It also distinguishes not-ingested,
processing, succeeded, partially succeeded, failed, and unavailable states. The ingestion panel
explains that only saved reviews are included in the target dataset when records are skipped, and
it never exposes provider diagnostics or review content.

The S2-007 gap was that a successful run with no rejected records showed the saved count but did
not explicitly show zero skipped records. The panel now reports both values for every successful
run, for example: `3 reviews saved. 0 records were skipped.` Positive counts retain the existing
`unusable records were skipped` wording. Rejection reasons remain intentionally undisclosed because
the persisted contract supplies only a safe aggregate count; inventing categories would not be
reliable and would require unnecessary schema changes.

No migration or ingestion-persistence change was necessary. Existing authenticated target
ownership checks, RLS, and persisted ingestion-attempt records remain the source of truth.
