# S3-011 Prevent Duplicate Reviews During Re-Ingestion

Re-ingesting or refreshing an AnalysisTarget never creates a second Review record for a source
review that is already stored for that target. Instead, the stored review is reconciled with the
refreshed source fields. This replaces the Sprint 1 rule (S1-022) that stored repeated source
reviews as separate rows.

| Rule                                                                                                            | How it is met                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-BR-017: re-ingestion must not silently create duplicate reviews                                              | Every write goes through `merge_target_reviews`, which matches by source id, adoption, or fingerprint under a per-target lock. Two partial unique indexes back it up          |
| S3-BR-018: the duplicate strategy must be deterministic and testable                                            | Pure matcher and fingerprint in TS, the same rules in SQL, shared golden vectors, and unit, ingestion, DB, concurrency, and migration tests                                   |
| S3-010 (#116): "existing reviews with the same stable identity should be reconciled with updated source fields" | A match updates the stored row in place (same id and `created_at`). Missing values never erase stored data. Reviews absent from a partial response are never removed (S3-009) |

The canonical text of S3-010's rules (S3-BR-015, S3-BR-019) is not in the repository, so this
work follows the issue text quoted above.

## Identity

Each review row has two identity columns, scoped to its AnalysisTarget and never compared across
targets or accounts:

- **`source_review_id`** (nullable): the source's stable id, for Outscraper `review_id`. It is
  stored normalized: trimmed, with a blank id stored as null. It is not case-folded, because ids
  are opaque. A CHECK constraint enforces the normalized form. Different non-null ids are always
  different reviews.
- **`review_fingerprint`**: `fp2:<sha256 hex>`, stored for every row as a generated column, so no
  caller can set it. It hashes one of two strings:

  ```text
  author-time tier (reviewer name AND review time present):  v2|author-time|f(name)|f(time)
  content tier (either one missing):                          v2|content|f(name)|f(time)|f(rating)|f(text)
  f(x) = <length of x in code points>:x, or ~ when x is absent
  ```

### Why text is (mostly) not in the fingerprint

A refreshed review can be edited, so a fingerprint that includes text or rating would stop
matching and create a new row. When the reviewer name and review time are both known, the
fingerprint uses only those two stable attributes, and edits keep the same identity. When either
one is missing, those attributes alone would merge unrelated reviews: every anonymous, undated
review posted through the owner API would collapse into one. So the content tier also includes
rating and text. The trade-offs are listed under "Known limitations".

Outscraper also returns an `author_id`. It is deliberately not stored or fingerprinted: reviewer
privacy calls for storing as little reviewer data as possible, and source review ids already
identify Outscraper reviews.

### Normalization (fingerprint inputs)

| Field                      | Rule                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reviewer name, review text | Storable-text cleanup (as persisted), Unicode NFC, each whitespace run becomes one space, trim, ASCII-only case folding. An empty result counts as absent. Whitespace is an explicit set: ECMAScript `\s`, which is Unicode White_Space plus BOM |
| Review time                | UTC epoch milliseconds                                                                                                                                                                                                                           |
| Rating (content tier only) | Shortest decimal (`4`, `4.5`), which is `trim_scale(numeric)::text` in SQL                                                                                                                                                                       |

Full Unicode case folding is not used because PostgreSQL `lower()` depends on the database
collation.

## Matching order

`public.merge_target_reviews` reconciles a batch one row at a time, in batch order, under a
per-target advisory lock. `matchStoredReview` in `src/services/reviews/review-identity.ts` is the
same decision as a pure function.

| Incoming review                                                           | Decision                                                                                                                                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Has an id that is already stored                                          | **Update** that row                                                                                                                                              |
| Has an id that is not stored, and an id-less row has the same fingerprint | **Adopt** that row: set its `source_review_id`, keep its id and `created_at`, and refresh its fields. The oldest such row wins, though the index allows only one |
| Has an id, and nothing above matches                                      | **Insert**. A row with a different id is never adopted, even when the fingerprints are equal                                                                     |
| Has no id, and a row has the same fingerprint                             | **Update** that row. An id-less row is preferred, otherwise the oldest row with an id. A stored id is never cleared                                              |
| Has no id, and nothing matches                                            | **Insert**                                                                                                                                                       |

"Oldest" means ordered by `(created_at, id)`. One incoming review adopts at most one row.

## Refresh rule for a matched review (S3-010)

- **Updated in place:** `review_text`, `rating`, `reviewer_name`, `review_date`, `review_url`, and
  `source_metadata`. These are all the source fields ReviewLens stores. The adapter maps no owner
  responses, likes, or edited flags, and this story does not add any.
- **Never changed:** `id`, `created_at`, and `analysis_target_id`, so citations and the review
  browser's `(created_at, id)` order keep working. A stored `source_review_id` is never cleared or
  replaced. The fingerprint is a generated column, so it recomputes from the refreshed fields.
- **Null handling:** text and rating are required on every incoming review, so the incoming value
  is always taken. An optional field that is missing or null keeps the stored value, so a partial
  or throttled response cannot erase data. No provider signal currently says "this field was
  removed at the source", so a removed field is not cleared either.
- **Idempotent:** the row is written only when a value `IS DISTINCT FROM` the stored one. Only
  then does `updated_at` (new, `not null`, backfilled from `created_at`) move. An identical refresh
  writes nothing.
- **Repeats within one batch:** they merge in batch order, so the **last occurrence wins** for
  every field it provides, and fields it omits keep earlier values. Each review keeps the position
  of its first occurrence. The app applies the same rules before writing (`collapseReviews`), and
  the database applies them again.
- **Counts:** `saved_count` and the `insert_reviews` result: `saved_count` counts **new** rows.
  `insert_reviews` returns the rows it created or changed, each once. Unchanged matches are not
  returned. A completion whose reviews were all already stored succeeds with `saved_count = 0`.
  For that case, the succeeded branch of `ingestion_attempt_lifecycle` now allows
  `saved_count >= 0`. Without the change such a completion would raise, keep the paid job
  `processing`, and eventually block the target as `RESULT_WINDOW_EXPIRED`.

## Database guarantees

- `reviews_target_source_review_id_key`: `UNIQUE (analysis_target_id, source_review_id) WHERE source_review_id IS NOT NULL`.
- `reviews_target_idless_fingerprint_key`: `UNIQUE (analysis_target_id, review_fingerprint) WHERE source_review_id IS NULL`.
  Rows with ids are outside this index, so two reviews with different ids are never blocked, even
  when their fingerprints are identical.
- The two indexes cannot see an id-less copy and an id'd copy of the same review racing each
  other. The per-target advisory lock in `merge_target_reviews` serializes reconciliation for
  that case. A two-session test covers both races: the same batch, and an id appearing.
- Both writers (`finish_ingestion_attempt` and `insert_reviews`) call `merge_target_reviews`.
  Both remain `SECURITY DEFINER` with an empty `search_path`, and their grants are unchanged.
  `merge_target_reviews` and the identity helpers run with invoker rights and are not executable
  by `anon`, `authenticated`, or `service_role`.
- Error codes, response shapes, ownership checks, quotas, and RLS are unchanged.

## Existing data

The migration locks `reviews`, normalizes existing ids, and adds the generated fingerprint and
`updated_at`. It then merges duplicates in three passes:

1. Rows sharing a source id.
2. Id-less rows sharing a fingerprint.
3. An id-less row whose fingerprint belongs to **exactly one** row with an id (the id appeared
   after Sprint 1 stored a second copy). Ambiguous fingerprints are left alone.

Each group survives as its **oldest** row by `(created_at, id)`. That row takes the newest
non-null value of every source field, and its `updated_at` is set to the newest copy's
`created_at`. Before any copy is deleted, every single-column foreign key that references
`reviews.id` is re-pointed to the survivor. The migration fails closed if a multi-column reference
exists. Today nothing references `reviews.id`, and Q&A citations are not persisted. The re-point
step protects any table that a team member adds earlier (for example S3-006). A notice reports how
many rows each pass merged. Only after cleanup are the unique indexes and the CHECK constraint
created.

## Known limitations

- **No source id, author-time tier:** two different reviews with the same normalized reviewer name
  and the same review time are treated as one review. This is more likely with day-precision
  dates (for example `2026-10-01` from the owner API) and common names.
- **No source id, content tier:** an edit to the text or rating creates a new review, because
  nothing stable is left to match on. Two genuinely identical reviews (same name, time, rating,
  and text) are stored once.
- **Tier change:** a review without an id whose reviewer name or time first appears or changes in a
  later refresh gets a different fingerprint and is stored as a new review.
- **Ambiguous matches:** a review without an id that matches several rows with different ids
  updates the oldest one. During cleanup, such ambiguous groups are left unmerged.
- **Fields are never cleared:** a field removed at the source stays stored (see the null rule).
- **Non-FK references:** review ids kept outside a foreign key (for example inside JSON) are not
  re-pointed by the cleanup.
- **No refresh flow yet:** `reserve_ingestion_attempt` still allows one successful ingestion per
  target. These guarantees cover the owner review API, retries, and the S3-009 refresh flow once it
  creates new attempts. The DB tests simulate those refreshes.

## One rule, two implementations

`src/services/reviews/review-identity.ts` holds the pure TS side:

- `normalizeSourceReviewId`
- `reviewFingerprint`
- `matchStoredReview`
- `mergeReviewFields`
- `collapseReviews`, used by `reconcileIngestion` and `saveReviews`

The SQL side is `review_source_id`, `review_fingerprint`, and `merge_target_reviews` in
`supabase/migrations/20261126120000_prevent_duplicate_reviews.sql`. The golden vectors in
`tests/fixtures/review-identity-vectors.json` are checked by both Jest and
`tests/db/review-deduplication.test.sql`. Neither side may change in place: a changed rule needs a
new prefix (`fp3:`) and a migration that recomputes stored fingerprints.

## Tests

- `tests/unit/services/reviews/review-identity.test.ts`: golden vectors, fingerprint tiers and
  normalization, every matcher decision (including the oldest of several id-less copies), the
  null-handling merge, and in-batch last-wins collapse.
- `tests/unit/services/ingestion/ingestion-deduplication.test.ts`: synthetic Outscraper payloads
  through the real client, adapter, normalizer, and lifecycle. Covers id appearing and
  disappearing, distinct ids, adoption of the oldest copy, refreshed and identical data, null
  handling, repeats within and across batches, target and account isolation, stable cited ids,
  retries, and counts.
- `tests/db/review-deduplication.test.sql`: indexes, privileges, vector parity, every scenario
  through `insert_reviews` and `finish_ingestion_attempt`, `ctid`/`updated_at` idempotence, and a
  referencing table.
- `tests/db/review-deduplication-concurrency.test.sh`: two real sessions, for the same batch and
  for an id appearing.
- `tests/db/review-deduplication-migration.test.sh`: all three cleanup passes, newest-value merge,
  ambiguous groups, re-pointed foreign keys, and adoption after cleanup.
- Mutation checks: disabling adoption, disabling the refresh update, or removing the merge lock
  each makes these tests fail.
- Four existing tests were updated for the intended behavior change:
  - The Sprint 1 "duplicates are stored as-is" assertions in `reviews.test.sql` and
    `review-service.test.ts` now assert reconciliation.
  - Two DB fixtures that inserted many identical rows to test size and count limits
    (`review-summary.test.sql`, `reviews-security-hardening.test.sql`) now give each row distinct
    text or a same-length timestamp. Their size and count assertions are unchanged.
