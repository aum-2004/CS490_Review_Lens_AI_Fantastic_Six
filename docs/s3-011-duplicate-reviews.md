# S3-011 Prevent Duplicate Reviews During Re-Ingestion

Re-ingesting or refreshing an AnalysisTarget never creates a second Review record for a source
review that is already stored for that target. This replaces the Sprint 1 rule (S1-022) that
stored repeated source reviews as separate rows.

| Rule                                                                 | How it is met                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| S3-BR-017: re-ingestion must not silently create duplicate reviews   | Unique index on `(analysis_target_id, identity_key)`. Both writers use `ON CONFLICT DO NOTHING`. The app also dedupes each batch |
| S3-BR-018: the duplicate strategy must be deterministic and testable | Pure key function in TS and SQL, with shared golden vectors and unit, ingestion, DB, concurrency, and migration tests            |

## Identity key

Each review has one identity key. The key is unique only within its AnalysisTarget, never across
targets or accounts.

1. **Stable source id:** `sid:<source_review_id>` when the source supplies a non-blank id. For
   Outscraper this is `review_id`, mapped by the adapter, and numeric ids become strings. The id is
   only trimmed: it is opaque, so it is not case-folded or Unicode-normalized.
2. **Fingerprint:** `fp1:<sha256 hex>` when there is no usable id. It hashes this UTF-8 string:

   ```text
   v1|field(reviewer name)|field(review time)|field(rating)|field(review text)
   field(x) = <length of x in code points>:x, or ~ when x is absent
   ```

   The length prefix keeps the encoding safe from delimiters: a `|` inside the text cannot shift
   one field into another.

The `sid:` and `fp1:` prefixes keep the two identity types from colliding, even when an id happens
to look like a fingerprint.

### Normalization rules (fingerprint only)

| Field                      | Rule                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Review text, reviewer name | Storable-text cleanup (as persisted), Unicode NFC, each whitespace run becomes one space, trim, ASCII-only case folding. An empty result counts as absent. Whitespace is an explicit set: ECMAScript `\s`, which is Unicode White_Space plus BOM |
| Review time                | UTC epoch milliseconds, the precision of a JavaScript `Date`                                                                                                                                                                                     |
| Rating                     | Shortest decimal (`4`, `4.5`), which is `trim_scale(numeric)::text` in SQL                                                                                                                                                                       |
| Missing optional fields    | Encoded as `~`, which is distinct from any present value                                                                                                                                                                                         |

Full Unicode case folding is deliberately not used: PostgreSQL `lower()` depends on the database
collation, so the result could differ between environments. Non-ASCII letters keep their case.

### One rule, two implementations

- `src/services/reviews/review-identity.ts` (pure, no I/O) collapses repeats inside a batch before
  anything is written. Both the ingestion path (`reconcileIngestion`) and the owner review API
  (`saveReviews`) use it, keeping the first occurrence in input order.
- `public.review_identity_key(...)` in `supabase/migrations/20261126120000_prevent_duplicate_reviews.sql`
  computes `reviews.identity_key`, a `STORED` generated column. No caller can choose or forge the
  key. This database value is the one the unique index enforces, so it is authoritative.
- `tests/fixtures/review-identity-vectors.json` holds golden vectors. Jest and
  `tests/db/review-deduplication.test.sql` both check every vector, so the two implementations
  cannot drift without a test failing.

Neither implementation may change in place. A changed rule needs a new prefix (for example `fp2:`)
and a migration that recomputes the stored keys.

## Database guarantee and conflict behavior

- `reviews_target_identity_key_idx` is a unique index on `(analysis_target_id, identity_key)`. It
  holds for repeated, retried, and concurrent writers. A two-session test shows a second
  concurrent writer waiting on the first, then skipping the review.
- `finish_ingestion_attempt` and `insert_reviews` collapse repeats within the payload (first
  occurrence wins) and insert with `ON CONFLICT (analysis_target_id, identity_key) DO NOTHING`.
- **Do nothing, not update.** Reviews are immutable for clients (no UPDATE grant). Grounded Q&A
  citations refer to a review's id and text, so changing text under an existing id would silently
  change the evidence behind earlier answers. Do nothing also keeps each row's id and
  `created_at`, so the review browser's `(created_at, id)` order stays stable across refreshes.
  The trade-off: if the source edits a review, the stored text is not refreshed.
- `saved_count` and the `insert_reviews` result count **new** rows only. Repeats are not added to
  `skipped_count`, which still means unusable records. A completion whose reviews were all already
  stored succeeds with `saved_count = 0`, and the target still has reviews. For this case the
  migration relaxes the succeeded branch of `ingestion_attempt_lifecycle` from `saved_count > 0`
  to `saved_count >= 0`. Without that change, such a completion would raise, keep the paid job
  `processing`, and finally block the target as `RESULT_WINDOW_EXPIRED`.
- Error codes, response shapes, ownership checks, quotas, RLS, grants, `SECURITY DEFINER`, and the
  empty `search_path` are unchanged. The key helpers are owner-only (no EXECUTE for
  `anon` or `authenticated`).

## Existing data

The migration adds the generated column, which computes keys for existing rows. Within each target
it then deletes every row except the oldest of each identity, ordered by `(created_at, id)`, and
raises a notice with the number removed. Only after that does it create the unique index. Adding
the column holds an exclusive lock, so no write can land between cleanup and index creation.

Nothing persisted references `reviews.id`. There are no foreign keys to it, and Q&A citations are
computed per request and never stored. Removing the newer copies therefore leaves no dangling
reference. An answer already open in a browser may cite a removed copy until the page reloads.
Historical `saved_count` values of earlier attempts are left as recorded.

## Known limitations

- **Fingerprint collisions are intentional merges.** Two genuinely distinct reviews without a
  source id, with the same reviewer name, review time, rating, and normalized text, are stored
  once.
- A review seen once without an id and later with an id (or the reverse) gets two different keys,
  so it is stored twice.
- If the source changes a fingerprinted review's text, rating, or time, it gets a new fingerprint
  and is stored as a new row. With a stable id, the edit is ignored instead (see do nothing above).
- `reserve_ingestion_attempt` still allows only one successful ingestion per target. These
  guarantees cover the owner review API, retries, and any future refresh flow that creates new
  attempts. The DB tests simulate that by recording later attempts directly.

## Tests

- `tests/unit/services/reviews/review-identity.test.ts`: golden vectors, determinism, id wins over
  the fingerprint, normalization edge cases, distinct inputs, no cross-type collisions, and batch
  dedupe order.
- `tests/unit/services/ingestion/ingestion-deduplication.test.ts`: synthetic Outscraper payloads
  run through the real client, adapter, normalizer, and lifecycle. Covers repeated refreshes,
  in-batch and cross-batch repeats, new reviews, fingerprint fallback, target and account
  isolation, failures before and after commit, and final counts and order.
- `tests/db/review-deduplication.test.sql`, `review-deduplication-concurrency.test.sh`, and
  `review-deduplication-migration.test.sh` (all run by `npm run test:db`): constraint, privileges,
  vector parity, both writers, two concurrent sessions, and cleanup of pre-existing duplicates.
- Three existing tests were updated for the intended behavior change. The Sprint 1 "duplicates are
  stored as-is" assertions in `reviews.test.sql` and `review-service.test.ts` now assert the
  dedupe. Two DB fixtures that inserted many identical rows to test size and count limits
  (`review-summary.test.sql`, `reviews-security-hardening.test.sql`) now give each row a distinct
  text or same-length timestamp, so their size and count assertions are unchanged.
