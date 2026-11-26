
❯ Implement story S3-011 "Prevent Duplicate Reviews During Re-Ingestion" in
  this repo (ReviewLens AI: Next.js, TypeScript, Supabase/Postgres, Jest,
  Playwright). Work on the current branch. Do NOT run git commit, git push, git
  add, git stash, git reset, or any command that changes git history or the
  remote. Leave all changes uncommitted in the working tree. Don't create or
  switch branches.

  STORY
  Outcome: Refreshing an analysis does not silently create duplicate Review
  records for the same source review.
  - Prefer stable source review identifiers when the source provides them.
  - When a source provides no stable identifier, use another deterministic
  strategy, such as a normalized fingerprint derived from stable review
  attributes.
  - The duplicate strategy must be documented and automatically tested.
  - Re-ingestion must not create a second record for an existing source review,
  even when the same review is returned in multiple refresh batches.
  Rules:
  - S3-BR-017: Re-ingestion must not silently create duplicate review records
  representing the same source review.
  - S3-BR-018: The duplicate strategy must be deterministic and testable.

  STEP 1 – EXPLORE FIRST (read-only, keep it focused)
  Find and read: the ingestion/refresh pipeline (Outscraper client,
  normalization/mapping into Review objects, the batch/refresh flow, and where
  reviews are inserted), the reviews table schema and existing migrations
  (supabase/migrations), RLS policies and helper functions, the Review type,
  and the existing ingestion tests and fixtures. Also check docs/ and existing
  "S3-BR-xxx" references for conventions. Determine: which fields Outscraper
  returns that could be a stable source id (e.g. review_id), how re-ingestion
  currently inserts (insert vs upsert), whether any unique constraint already
  exists, what else references review rows (Q&A citations, review browser,
  counts), and how batches/pagination work. Don't ask me questions unless truly
  blocked. Make reasonable decisions and document them.

  STEP 2 – DESIGN (briefly, before coding)
  State the design in a few lines, then implement it:
  - Identity key per Review, scoped to the AnalysisTarget (never global across
  accounts/targets): use the source's stable review id when present and
  non-empty. Otherwise use a deterministic fingerprint (e.g. SHA-256 of
  normalized, delimiter-safe fields such as author identifier, review
  timestamp, rating, and normalized text). Normalization must be explicit and
  tested: trim, Unicode NFC, collapse whitespace, case-fold where appropriate,
  consistent date format and rating type.
  - Keep the two identity types from colliding (store an identity
  type/namespace or prefix).
  - Enforce at BOTH levels: application-level dedupe (within a batch and across
  batches in one refresh) AND a database-level uniqueness guarantee so
  concurrent or repeated refreshes can't create duplicates. Use insert ... on
  conflict (target_id, identity key) with a defined, documented behavior (do
  nothing vs update mutable fields; choose one and justify it, and never change
  the row id that other records reference).
  - Handle existing data safely: if duplicates may already exist in the table,
  the migration must dedupe deterministically before adding the unique index,
  keep the oldest row, and re-point or preserve any references (Q&A citations
  etc.) so nothing breaks. If nothing can reference them, say so.
  - Document the known limitation of fingerprinting: two genuinely identical
  reviews with no source id collapse to one. State this explicitly.

  STEP 3 – IMPLEMENT
  - Pure, unit-testable functions for identity-key derivation and
  normalization, kept separate from I/O.
  - Update the ingestion/refresh path to use them. Preserve existing error
  codes, response shapes, quota/auth/ownership behavior, and the review
  ordering and counts that the UI and the review browser rely on.
  - If a migration is needed: a new timestamped file in supabase/migrations
  following the existing naming convention (version later than the latest
  existing). Don't edit historical migrations. Keep RLS, grants, and any
  SECURITY DEFINER / empty search_path conventions the repo already uses.
  Include a comment documenting the strategy.
  - Don't touch: OpenAI/Q&A quota code, prompts, billing or env configuration,
  dependencies (unless unavoidable, and then say so).
  - Never run supabase db push or anything against a hosted project. Never make
  live Outscraper, OpenAI, or Supabase calls. Use mocks and the local fixtures
  only.

  STEP 4 – TESTS (automatic, deterministic)
  - Unit tests for the key derivation: same input → same key; a stable id wins
  over the fingerprint; normalization edge cases (whitespace, case, Unicode,
  missing optional fields); different reviews → different keys; no
  id/fingerprint collisions across types.
  - Ingestion tests: (a) re-running the same refresh creates zero new rows; (b)
  the same review appearing twice in one batch → one record; (c) the same
  review in two different refresh batches → one record; (d) a genuinely new
  review in a later refresh is still inserted; (e) a review without a source id
  is deduped by fingerprint; (f) the same review text in two different
  AnalysisTargets or accounts is NOT deduped across them; (g) partial failure
  or retry mid-refresh doesn't produce duplicates; (h) final counts and
  ordering stay correct.
  - If the repo has DB-level tests (e.g. npm run test:db), add migration and
  constraint tests for the unique index and the on-conflict behavior, and for
  the dedupe of pre-existing duplicates. Run them if the environment allows.
  Otherwise say clearly that you couldn't.
  - Don't weaken, skip, or delete any existing test. If an existing test must
  change because behavior intentionally changed, explain why.

  STEP 5 – DOCS
  Add or update a short doc (follow the repo's docs/ conventions) describing
  the duplicate strategy, mapping it to S3-BR-017 and S3-BR-018, the
  normalization rules, the DB constraint, the on-conflict behavior, the
  existing-data cleanup, and the known limitation. Keep it concise.

  STEP 6 – VERIFY
  Run, in this order, and report the real results: format check, lint,
  typecheck, npm run check:migrations (if a migration was added), the focused
  tests for what you changed, then the full `npm test`. Run the production
  build only if you changed anything build-sensitive. Fix anything you broke.

  FINAL REPORT (concise; no recap of the steps)
  1. Chosen strategy in 3–4 lines, and why.
  2. Files changed (grouped: source, migration, tests, docs).
  3. Test and check results (pass/fail counts) and anything you could not run,
  with the reason.
  4. Risks, open questions, and anything I should manually verify before
  opening a PR (e.g. applying the migration locally, running test:db, a manual
  re-ingestion smoke test).
  5. Confirm that nothing was committed or pushed.

⏺ I'll start by exploring the ingestion pipeline, schema, and tests.

  Read 3 files, listed 1 directory, ran 1 shell command (ctrl+o to expand)

⏺ Now the DB functions for ingestion (finish_ingestion_attempt) and refresh
  route.

  Searched for 2 patterns, read 2 files, listed 1 directory, ran 3 shell commands (ctrl+o to expand)

⏺ I've reviewed the Outscraper client, normalizer, review store, and both SQL
  write paths. Next I'm checking the README's dedupe notes, the Q&A citation
  path, and the existing tests. · summary

  Ran 5 shell commands (ctrl+o to expand)

⏺ Duplicate review inserts have no uniqueness guard, since both write paths use
  plain INSERT and the only index is non-unique, and two existing tests assert
  duplicates are stored as-is. I'm checking which DB tests and e2e seeds insert
  identical rows before adding a unique index. · summary

  Searched for 1 pattern, ran 1 shell command (ctrl+o to expand)

⏺ Port 5432 needs a password I don't have, so I'm starting a throwaway local
  trust-auth Postgres on another port in the scratchpad, then running a baseline
  test:db on the unchanged tree. · summary

  Ran 2 shell commands · 1 failed (ctrl+o to expand)

⏺ Socket path too long; I'll use TCP only.

  Ran 2 shell commands (ctrl+o to expand)

⏺ Baseline test:db passes. Now I'll check a few Postgres behaviors the design
  relies on: a generated column under ON CONFLICT, normalize(), and \u escapes
  inside regex brackets.

  Ran 1 shell command (ctrl+o to expand)

⏺ Postgres checks out for the design: the helper functions are immutable and the
  generated-column unique index works with ON CONFLICT DO NOTHING. I'm checking
  a couple of build constraints next. · summary

  Ran 2 shell commands (ctrl+o to expand)

⏺ Exploration and design are done; writing code now, starting with the pure
  identity module.

⏺ Write(src/services/reviews/review-identity.ts)
  ⎿  Wrote 119 lines to src/services/reviews/review-identity.ts
       1 import { createHash } from "node:crypto";
       2
       3 import { toStorableText } from "./storable-text";
       4 import type { NormalizedReview } from "./types";
       5
       6 /**
       7  * S3-011 duplicate strategy (S3-BR-017, S3-BR-018). Pure: no I/
         O, clock, locale, or randomness.
       8  *
       9  * Every Review has one identity key, unique per AnalysisTarget
     … +111 lines (~5 KB) (ctrl+o to expand)

⏺ Now wiring it into saveReviews and the ingestion lifecycle.

⏺ Bash(python3 - <<'PY'
      import re,io…)
  ⎿  Updated src/services/ingestion/ingestion-lifecycle.ts +6 -1
       7  } from "@/services/analysis-targets/target-ownership";
       8  import { normalizeBatch } from "@/services/reviews/normalize";
       9  import { sanitizeMetadata } from "@/services/reviews/review-ser
          vice";
      10 +import { dedupeReviews } from "@/services/reviews/review-identi
         +ty";                                                           
      11  import {
      12    createIngestionAttemptWriter,
      13    getBoundAttempt,
     ...
      239        ),
      240      );
      241    }
      241 -  const rows = normalized.reviews.map((review) => ({          
      242 +  // S3-011: a provider result can repeat a review; keep its f
          +irst occurrence. Reviews already                              
      243 +  // stored for this target are skipped by the database's (tar
          +get, identity_key) unique index.                              
      244 +  // Duplicates are not "skipped" records: they are not unusab
          +le, they are already represented.                             
      245 +  const rows = dedupeReviews(normalized.reviews).reviews.map((
          +review) => ({                                                 
      246      text: review.text,
      247      rating: review.rating,
      248      source_review_id: review.sourceReviewId ?? null,
     ...
      253    }));
      254    assertIngestionResultWithinLimits(rows, extracted.identity);
      255    // Atomic review insert + result state; duplicate polling ca
           nnot save a completed attempt twice.
      256 +  // saved_count is the number of NEW reviews; it can be 0 whe
          +n every review was already stored.                            
      257    const completed = await deps.writer.finish(
      258      bound.id,
      259      ownerId,
  ⎿  Updated src/services/reviews/review-service.ts +8 -2
      1  import { InvalidReviewError, TargetNotFoundError } from "./error
         s";
      2 +import { dedupeReviews } from "./review-identity";              
      3  import { toStorableText } from "./storable-text";
      4  import { MAX_RATING, MIN_RATING, type NormalizedReview } from ".
         /types";
      5 
     ...
      22  export interface ReviewStore {
      23    /** True only if the target exists and belongs to `userId`. *
          /
      24    isTargetOwnedBy(targetId: string, userId: string): Promise<bo
          olean>;
      25 +  /**                                                          
      26 +   * Inserts reviews whose identity key (S3-011) is new for the
         + target and returns only those                                 
      27 +   * rows. A review already stored for the target is left uncha
         +nged and is not returned.                                      
      28 +   */                                                          
      29    insertReviews(targetId: string, reviews: NormalizedReview[]):
           Promise<Review[]>;
      30    aggregateReviews(targetId: string): Promise<ReviewAggregate>;
      31    listReviews(targetId: string): Promise<Review[]>;
     ...
      132   *
      133   * userId MUST come from the verified session (S1-011), never
           from the request body (S1-BR-010).
      134   * Persists nothing if any review is invalid, so a bad batch i
           s never partially saved.
      130 - * Duplicate sourceReviewIds are stored as-is in Sprint 1 (no 
          -re-ingestion or dedupe).                                      
      135 + * S3-011: repeated reviews within the batch collapse to their
          + first occurrence, and the database                           
      136 + * skips reviews already stored for the target. Returns only n
          +ewly created Reviews.                                         
      137   */
      138  export async function saveReviews(
      139    store: ReviewStore,
     ...
      150 
      151    return store.insertReviews(
      152      targetId,
      147 -    reviews.map((review) => ({                                
      153 +    dedupeReviews(reviews).reviews.map((review) => ({         
      154        ...review,
      155        sourceMetadata: sanitizeMetadata(review.sourceMetadata),
      156      })),
  ⎿  Updated src/services/reviews/supabase-review-store.ts +1
      72      async insertReviews(targetId, reviews) {
      73        // The user-scoped RPC derives ownership from auth.uid(),
           validates the complete batch, and
      74        // inserts atomically. Authenticated clients have no dire
          ct INSERT privilege on reviews.
      75 +      // S3-011: it returns only newly inserted rows; reviews a
         +lready stored are skipped.                                     
      76        const { data, error } = await client.rpc(INSERT_RPC, {
      77          p_target_id: targetId,
      78          p_rows: reviews.map(toInsertRow),
  ⎿  (files that changed while this command ran, by the command or by
     another process; a convenience view, not a review or audit of the
     command)

⏺ Now the migration.

⏺ Write(supabase/migrations/20261126120000_prevent_duplicate_reviews.sql)
  ⎿  Wrote 382 lines to
     supabase/migrations/20261126120000_prevent_duplicate_reviews.sql
      1 -- S3-011: Prevent duplicate Reviews during re-ingestion (S3-BR-0
        17, S3-BR-018).
      2 -- Strategy: docs/s3-011-duplicate-reviews.md. Application twin:
        src/services/reviews/review-identity.ts.
      3 --
      4 -- Every review has one deterministic identity key, unique per An
        alysisTarget:
      5 --   'sid:' || source review id     when the source supplied a no
        n-blank id (Outscraper review_id)
      6 --   'fp1:' || sha256 hex            of a normalized fingerprint
     … +377 lines (~18 KB) (ctrl+o to expand)

⏺ Renaming a few aliases that clash with SQL keywords (row.*, position), and
  switching to extract(epoch …), which returns an exact numeric where date_part
  returns a float.

⏺ Bash(python3 - <<'PY'
      p='supabase/migrations/20261126120000_prevent_duplicate_reviews.sql'…)
  ⎿  Updated
     supabase/migrations/20261126120000_prevent_duplicate_reviews.sql +14
     -13
      91        'g'
      92      ), '') as value) as source_id,
      93      (select public.review_identity_text(p_reviewer_name) as val
          ue) as reviewer,
      94 -    (select pg_catalog.floor(pg_catalog.date_part('epoch', p_re
         -view_date)::numeric * 1000)                                    
      95 -      ::bigint::text as value) as review_time,                 
      94 +    (select pg_catalog.floor(extract(epoch from p_review_date) 
         +* 1000)::bigint::text as value)                                
      95 +      as review_time,                                          
      96      (select pg_catalog.trim_scale(p_rating)::text as value) as
          rating,
      97      (select public.review_identity_text(p_review_text) as value
          ) as body
      98  $$;
     ...
      201      insert into public.reviews(analysis_target_id, review_text
           , rating, source_review_id, reviewer_name, review_date, review
           _url, source_metadata)
      202        select attempt.analysis_target_id, r.text, r.rating, r.s
           ource_review_id, r.reviewer_name, r.review_date, r.review_url,
            r.source_metadata
      203        from (
      204 -        select distinct on (public.review_identity_key(row.sou
          -rce_review_id, row.reviewer_name, row.review_date, row.rating,
          - row.text))                                                   
      205 -          row.*, element.position                             
      206 -        from jsonb_array_elements(p_reviews) with ordinality a
          -s element(value, position),                                   
      207 -          lateral jsonb_to_record(element.value) as row(text t
          -ext, rating numeric, source_review_id text,                   
      204 +        select distinct on (public.review_identity_key(candida
          +te.source_review_id, candidate.reviewer_name,                 
      205 +            candidate.review_date, candidate.rating, candidate
          +.text))                                                       
      206 +          candidate.*, element.ordinal                        
      207 +        from jsonb_array_elements(p_reviews) with ordinality a
          +s element(value, ordinal),                                    
      208 +          lateral jsonb_to_record(element.value) as candidate(
          +text text, rating numeric, source_review_id text,             
      209              reviewer_name text, review_date timestamptz, revie
           w_url text, source_metadata jsonb)
      209 -        order by public.review_identity_key(row.source_review_
          -id, row.reviewer_name, row.review_date, row.rating, row.text),
      210 -          element.position                                    
      210 +        order by public.review_identity_key(candidate.source_r
          +eview_id, candidate.reviewer_name,                            
      211 +            candidate.review_date, candidate.rating, candidate
          +.text), element.ordinal                                       
      212        ) as r
      212 -      order by r.position                                     
      213 +      order by r.ordinal                                      
      214        on conflict (analysis_target_id, identity_key) do nothin
           g;
      215      get diagnostics saved = row_count;
      216    else
     ...
      348            candidate.source_review_id, candidate.reviewer_name,
            candidate.review_date,
      349            candidate.rating, candidate.review_text
      350          ))
      350 -        candidate.*, element.position                         
      351 -      from jsonb_array_elements(p_rows) with ordinality as ele
          -ment(value, position),                                        
      351 +        candidate.*, element.ordinal                          
      352 +      from jsonb_array_elements(p_rows) with ordinality as ele
          +ment(value, ordinal),                                         
     … +14 lines (ctrl+o to expand)

  Ran 1 shell command · 1 failed (ctrl+o to expand)

⏺ Bash(sed -i '' "s/pg_catalog.normalize(p_value,
      nfc)/pg_catalog.normalize(p_value, 'NFC')/"
      supabase/migrations/20261126120000_prevent_duplicate_reviews.sql &&
      expor…)
  ⎿  Updated
     supabase/migrations/20261126120000_prevent_duplicate_reviews.sql +1 -1
      38      pg_catalog.translate(
      39        pg_catalog.btrim(
      40          pg_catalog.regexp_replace(
      41 -          pg_catalog.normalize(p_value, nfc),                  
      41 +          pg_catalog.normalize(p_value, 'NFC'),                
      42            '[\t\n\v\f\r    -   　]+',
      43            ' ',
      44            'g'

⏺ Migrations apply. Checking TS parity on the same inputs:

  Ran 1 shell command (ctrl+o to expand)

⏺ TS and SQL agree. Next I'll build the shared golden-vector fixture, which pins
  the edge cases both implementations must match.

  Ran 1 shell command (ctrl+o to expand)

⏺ Key matching is right for whitespace, case and NFC/NFD variants and wrong for
  delimiter shifts and non-ASCII case; I'm writing the fixture with escaped
  characters so nothing invisible lands in the file. · summary

⏺ Bash(SP=/private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-F
      antastic-Six/35b6d326-901e-49d1-a6d1-2ece2024ea95/scratchpad && python3 -
      <<PY
      import j…)  ⎿  Created tests/fixtures/review-identity-vectors.json +131
        1 +{                                                             
        2 +  "_comment": "S3-011 golden identity vectors shared by tests/
          +unit/services/reviews/review-identity.test.ts and tests/db/rev
          +iew-deduplication.test.sql. Regenerate only with a new key pre
          +fix.",                                                        
        3 +  "vectors": [                                                
        4 +    {                                                         
        5 +      "name": "source id wins",                               
        6 +      "input": {                                              
        7 +        "sourceReviewId": "ChZDSUhNMG9nS0VJQ0FnSUQ",          
        8 +        "reviewerName": "Sam",                                
        9 +        "reviewDate": "2026-10-01T12:00:00.000Z",             
       10 +        "rating": 5,                                          
       11 +        "text": "Great food"                                  
       12 +      },                                                      
       13 +      "expectedKey": "sid:ChZDSUhNMG9nS0VJQ0FnSUQ"            
       14 +    },                                                        
       15 +    {                                                         
       16 +      "name": "source id is trimmed but case-sensitive",      
       17 +      "input": {                                              
       18 +        "sourceReviewId": " \t ChZdsuhm0OGs \u00a0",          
       19 +        "rating": 5,                                          
       20 +        "text": "Great food"                                  
       21 +      },                                                      
       22 +      "expectedKey": "sid:ChZdsuhm0OGs"                       
       23 +    },                                                        
       24 +    {                                                         
       25 +      "name": "blank source id falls back to fingerprint",    
       26 +      "input": {                                              
       27 +        "sourceReviewId": " \u3000 ",                         
       28 +        "reviewerName": "Sam",                                
       29 +        "reviewDate": "2026-10-01T12:00:00.000Z",             
       30 +        "rating": 5,                                          
       31 +        "text": "Great food"                                  
       32 +      },                                                      
       33 +      "expectedKey": "fp1:6bd379fbbe27f34d6ccfdc1d9737478a88c1
          +1589a581e08743882a0a0b3367b4"                                 
       34 +    },                                                        
       35 +    {                                                         
       36 +      "name": "fingerprint with every field",                 
       37 +      "input": {                                              
       38 +        "reviewerName": "Sam",                                
       39 +        "reviewDate": "2026-10-01T12:00:00.123Z",             
       40 +        "rating": 4.5,                                        
     … +91 lines (ctrl+o to expand)

⏺ All 14 golden vectors match between SQL and TS. Running the existing DB suite
  against the new migration to see what the unique index breaks:

  Ran 1 shell command (ctrl+o to expand)

⏺ As expected, review-summary.test.sql seeds 1,001 rows with identical text,
  which are now real duplicates. I'll make each fixture row distinct; the count
  and average assertions don't change.

⏺ Bash(python3 - <<'PY'
      p='tests/db/review-summary.test.sql'…)
  ⎿  Updated tests/db/review-summary.test.sql +3 -1
      17    ('56000000-0000-4000-8000-000000000013', '56000000-0000-4000-
          8000-000000000001',
      18     'Empty summary target', 'google_maps', 'https://maps.google.
          com/?cid=5603');
      19 
      20 +-- Each row is a distinct review: S3-011 stores identical revie
         +ws of one target only once.                                    
      21  insert into public.reviews (analysis_target_id, review_text, ra
          ting)
      21 -select '56000000-0000-4000-8000-000000000011', 'large dataset r
         -eview', ((series % 5) + 1)::numeric                            
      22 +select '56000000-0000-4000-8000-000000000011', 'large dataset r
         +eview ' || series,                                             
      23 +  ((series % 5) + 1)::numeric                                  
      24  from generate_series(1, 1001) series;
      25 
      26  insert into public.reviews (analysis_target_id, review_text, ra
          ting)

  Ran 1 shell command (ctrl+o to expand)

⏺ The near-2-MiB batch test sends 100 identical reviews, so I'm giving each row
  a distinct, same-length review_date to keep the byte-size assertions exact
  while still proving the whole batch persists. · summary

⏺ Bash(python3 - <<'PY'
      p='tests/db/reviews-security-hardening.test.sql'…)
  ⎿  Updated tests/db/reviews-security-hardening.test.sql +6 -3
      179    assert char_length(raw_text) <= 10000, 'API review text exce
           eds its character limit';
      180    assert octet_length(app_metadata) <= 16384, 'API metadata ex
           ceeds its compact byte limit';
      181 
      182 +  -- S3-011 stores identical reviews of one target once, so ea
          +ch row gets a distinct review time.                           
      183 +  -- Every timestamp has the same length, so the byte-size ass
          +ertions below are unchanged.                                  
      184    select jsonb_agg(jsonb_build_object(
      185      'review_text', raw.value->>'text',
      186      'rating', (raw.value->>'rating')::numeric,
      187      'source_review_id', null,
      188      'reviewer_name', null,
      187 -    'review_date', '2026-01-01T00:00:00.000Z',                
      189 +    'review_date', '2026-01-01T00:' || lpad(((raw.position - 1
          +) / 60)::text, 2, '0') || ':'                                 
      190 +      || lpad(((raw.position - 1) % 60)::text, 2, '0') || '.00
          +0Z',                                                          
      191      'review_url', null,
      192      'source_metadata', raw.value->'metadata'
      190 -  ))                                                          
      193 +  ) order by raw.position)                                    
      194    into normalized_rows
      192 -  from jsonb_array_elements((api_request::jsonb)->'reviews') r
          -aw(value);                                                    
      195 +  from jsonb_array_elements((api_request::jsonb)->'reviews') w
          +ith ordinality raw(value, position);                          
      196 
      197    assert octet_length((normalized_rows->0->'source_metadata'):
           :text) <= 32768,
      198      'normalized metadata exceeds its database limit';

⏺ Now the intentional behavior change in reviews.test.sql, where the Sprint 1
  "duplicates are allowed" step becomes "duplicate is not stored":

⏺ Bash(python3 - <<'PY'
      p='tests/db/reviews.test.sql'…)
  ⎿  Updated tests/db/reviews.test.sql +17 -6
      72  $$;
      73  \echo 'ok - reviews of one target do not appear under another t
          arget of the same user'
      74 
      75 -select * from public.insert_reviews(                           
      76 -  '77777777-7777-4777-8777-777777777771',                      
      77 -  '[{"review_text":"Same source review again","rating":5,"sourc
         -e_review_id":"src-1"}]'                                        
      78 -);                                                             
      79 -\echo 'ok - duplicate source_review_id values are allowed in Sp
         -rint 1'                                                        
      75 +-- S3-011 intentionally replaced the Sprint 1 rule that stored 
         +duplicate source ids as-is.                                    
      76 +do $$                                                          
      77 +declare                                                        
      78 +  saved_rows bigint;                                           
      79 +begin                                                          
      80 +  select count(*) into saved_rows from public.insert_reviews(  
      81 +    '77777777-7777-4777-8777-777777777771',                    
      82 +    '[{"review_text":"Same source review again","rating":5,"sou
         +rce_review_id":"src-1"}]'                                      
      83 +  );                                                           
      84 +  assert saved_rows = 0, 'a repeated source_review_id was store
         +d again';                                                      
      85 +  assert (                                                     
      86 +    select review_text from public.reviews where source_review_
         +id = 'src-1'                                                   
      87 +  ) = 'Great food', 'a repeated source_review_id changed the st
         +ored review';                                                  
      88 +end                                                            
      89 +$$;                                                            
      90 +\echo 'ok - a repeated source_review_id is not stored again and
         + the original is unchanged'                                    
      91 
      92  -- ------------------------------------------------------------
          ---------------------------------
      93  -- Cross-user isolation: User B against User A's target (S1-BR-
          008)
     ...
      150    assert (
      151      select count(*) from public.reviews
      152      where analysis_target_id = '77777777-7777-4777-8777-777777
           777771'
      142 -  ) = 3, 'User A''s reviews changed after User B''s update and
          - delete attempts';                                            
      153 +  ) = 2, 'User A''s reviews changed after User B''s update and
          + delete attempts';                                            
      154    assert not exists (
      155      select 1 from public.reviews where review_text = 'Edited b
           y B'
      156    ), 'User B''s update changed a review';

⏺ All existing DB tests pass with three intentional updates. Next I'll write the
  new DB tests, modeled on the existing concurrency script. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ Write(tests/db/review-deduplication.test.sql)
  ⎿  Wrote 315 lines to tests/db/review-deduplication.test.sql
       1 -- S3-011 database tests: review identity keys, the (target, ide
         ntity_key) unique index, and the
       2 -- ON CONFLICT DO NOTHING behavior of both review writers (S3-BR
         -017, S3-BR-018).
       3 -- Run with `npm run test:db` (from the repository root, for the
          shared vector fixture).
       4 --
       5 -- User A: b3110000-0000-4000-8000-0000000000a1 (targets A1, A2)
       6 -- User B: b3110000-0000-4000-8000-0000000000b1 (target B)
       7
     … +308 lines (ctrl+o to expand)

⏺ The \set psql variable isn't visible inside DO blocks, so I'll pass it through
  a session setting instead:

  Ran 1 shell command · 1 failed (ctrl+o to expand)

⏺ The finish section will run as the database owner, since service_role can't
  read reviews in the test shim. The RPCs are SECURITY DEFINER regardless, and
  ingestion-attempts.test.sql already covers their execute privileges. · summary

⏺ Bash(python3 - <<'PY'
      p='tests/db/review-deduplication.test.sql'…)
  ⎿  Updated tests/db/review-deduplication.test.sql +2 -7
      188  -- -----------------------------------------------------------
           ----------------------------------
      189  -- finish_ingestion_attempt: repeated refreshes, retries, and 
           an all-duplicate completion
      190  -- -----------------------------------------------------------
           ----------------------------------
      191 +-- These run as the database owner so they can count rows. ing
          +estion-attempts.test.sql covers the                           
      192 +-- service_role-only EXECUTE boundary of these SECURITY DEFINE
          +R functions.                                                  
      193  create temporary table refresh_batch (name text primary key, r
           ows jsonb not null);
      192 -grant select on refresh_batch to service_role;                
      194  insert into refresh_batch values
      195    ('first', '[
      196      {"text":"Crispy fries","rating":5,"source_review_id":"o-1"
           ,"reviewer_name":"Cy"},
     ...
      204      {"text":"Friendly staff","rating":4,"source_review_id":"o-
           2"}
      205    ]');
      206 
      206 -set role service_role;                                        
      207  do $$
      208  declare
      209    owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
     ...
      244    assert (select count(*) from public.reviews where analysis_t
           arget_id = target_id) = before_count + 2;
      245  end
      246  $$;
      247 -reset role;                                                   
      247 
      248  -- Later refresh runs of the same target. reserve_ingestion_at
           tempt still returns the succeeded
      249  -- attempt, so these stand in for a future refresh flow by rec
           ording new bound attempts directly.
     ...
      253    'https://www.google.com/maps/place/DedupeA2', 'ChIJDedupeA2'
           , 'place_id', 'ChIJDedupeA2',
      254    'dedupe-job-2');
      255 
      257 -set role service_role;                                        
      256  do $$
      257  declare
      258    owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
     ...
      271    assert (select count(*) from public.reviews where analysis_t
           arget_id = target_id) = before_count + 1;
      272  end
      273  $$;
      276 -reset role;                                                   
      274 
      275  insert into public.ingestion_attempts (analysis_target_id, own
           er_id, source_url, submitted_query,
      276    query_kind, expected_place_id, provider_request_id)
     ...
      278    'https://www.google.com/maps/place/DedupeA2', 'ChIJDedupeA2'
           , 'place_id', 'ChIJDedupeA2',
      279    'dedupe-job-3');
     … +12 lines (ctrl+o to expand)

⏺ All 7 new DB checks pass. Now the migration test for pre-existing duplicates.
  It builds the schema as it was before S3-011, seeds duplicates, then applies
  the new migration:

⏺ Write(tests/db/review-deduplication-migration.test.sh)
  ⎿  Wrote 60 lines to tests/db/review-deduplication-migration.test.sh
       1 #!/usr/bin/env bash
       2 # S3-011: the duplicate-review migration must clean up rows stor
         ed before uniqueness existed.
       3 # Builds a separate throwaway database with every migration BEFO
         RE S3-011, stores duplicates the
       4 # Sprint 1 schema allowed, applies the S3-011 migration, and che
         cks that the oldest row of each
       5 # identity survives, distinct and cross-target reviews are untou
         ched, and the index exists.
       6 set -euo pipefail
     … +54 lines (ctrl+o to expand)

⏺ Now the two-session concurrency test: session A inserts a review and holds its
  transaction open, and session B tries the same review.

⏺ Write(tests/db/review-deduplication-concurrency.test.sh)
  ⎿  Wrote 81 lines to tests/db/review-deduplication-concurrency.test.sh
       1 #!/usr/bin/env bash
       2 # S3-011, real PostgreSQL sessions: session A has inserted a rev
         iew but not committed while
       3 # session B submits the same review. B must wait on A's unique-i
         ndex entry and then skip the
       4 # review (ON CONFLICT DO NOTHING). Without the unique index both
          sessions would store a row.
       5 set -euo pipefail
       6 psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "$
         {1:?throwaway database required}")
     … +75 lines (ctrl+o to expand)

⏺ Registering both scripts in tests/db/run.sh:

⏺ Bash(python3 - <<'PY'
      p='tests/db/run.sh'…)
  ⎿  Updated tests/db/run.sh +6
      38  echo "Running concurrent paid Q&A reservation regression"
      39  bash tests/db/review-question-quota-concurrency.test.sh "$db"
      40 
      41 +echo "Running two-session duplicate review regression"         
      42 +bash tests/db/review-deduplication-concurrency.test.sh "$db"   
      43 +                                                               
      44 +echo "Running pre-existing duplicate review migration regressio
         +n"                                                             
      45 +bash tests/db/review-deduplication-migration.test.sh "$db"     
      46 +                                                               
      47  echo "All database tests passed."
  ⎿  … +2 files changed
     tests/db/review-deduplication-concurrency.test.sh
     tests/db/review-deduplication-migration.test.sh

⏺ All DB tests pass, including the 3 new suites. Setting the new scripts back to
  non-executable to match the existing .sh tests (the runner calls them via
  bash). Then on to the Jest tests.

⏺ Bash(chmod -x tests/db/review-deduplication-*.test.sh && git diff --stat &&
      git status --short)
  ⎿  2 files changed (binary, mode only or too large to show)
     tests/db/review-deduplication-concurrency.test.sh
     tests/db/review-deduplication-migration.test.sh

⏺ Now the unit tests for key derivation:

⏺ Write(tests/unit/services/reviews/review-identity.test.ts)
  ⎿  Wrote 190 lines to tests/unit/services/reviews/review-identity.test.ts
       1 /** @jest-environment node */
       2 import { createHash } from "node:crypto";
       3
       4 import {
       5   dedupeReviews,
       6   FINGERPRINT_KEY_PREFIX,
       7   normalizeIdentityText,
       8   normalizeSourceReviewId,
       9   reviewFingerprintSource,
      10   reviewIdentityKey,
     … +180 lines (ctrl+o to expand)

⏺ I'm writing end-to-end ingestion tests for reconcileIngestion with synthetic
  payloads, a fake fetch and an in-memory store, and first checking how the
  existing tests fake the provider. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ Write(tests/unit/services/ingestion/ingestion-deduplication.test.ts)  ⎿  Wrote 414 lines to
     tests/unit/services/ingestion/ingestion-deduplication.test.ts
       1 /** @jest-environment node */
       2 /**
       3  * S3-011 ingestion re-run behavior, end to end through the real
          Outscraper client, adapter,
       4  * normalizer, and application dedupe. Only the network and Post
         greSQL are replaced:
       5  * - the provider is a local synthetic payload served by a fake
         fetch (no live calls);
       6  * - FakeReviewDatabase models finish_ingestion_attempt: one ato
         mic completion per attempt, a
     … +408 lines (ctrl+o to expand)

⏺ Now updating the Sprint 1 unit test whose behavior intentionally changed:

⏺ Bash(python3 - <<'PY'
      p='tests/unit/services/reviews/review-service.test.ts'…)
  ⎿  Updated tests/unit/services/reviews/review-service.test.ts +16 -3
      172      expect(inserted).toEqual([]);
      173    });
      174 
      175 -  test("duplicate source review ids are stored as-is in Sprint
          - 1", async () => {                                            
      175 +  // S3-011 intentionally replaced the Sprint 1 rule that stor
          +ed repeated source ids as-is.                                 
      176 +  test("a review repeated within one batch is sent to the stor
          +e once (S3-011)", async () => {                               
      177      const duplicate = { text: "Again", rating: 4, sourceReview
           Id: "src-1" };
      178 +    const edited = { text: "Edited again", rating: 2, sourceRe
          +viewId: "src-1" };                                            
      179 +    const noId = { text: "No id", rating: 3 };                
      180 
      178 -    const saved = await saveReviews(store, userA, "target-a", 
          -[duplicate, duplicate]);                                      
      181 +    const saved = await saveReviews(store, userA, "target-a", 
          +[                                                             
      182 +      duplicate,                                              
      183 +      noId,                                                   
      184 +      edited,                                                 
      185 +      { text: "  NO   ID ", rating: 3 },                      
      186 +    ]);                                                       
      187 
      180 -    expect(saved.map((r) => r.sourceReviewId)).toEqual(["src-1
          -", "src-1"]);                                                 
      188 +    expect(saved.map((r) => [r.sourceReviewId, r.text])).toEqu
          +al([                                                          
      189 +      ["src-1", "Again"],                                     
      190 +      [null, "No id"],                                        
      191 +    ]);                                                       
      192 +    expect(inserted).toHaveLength(1);                         
      193 +    expect(inserted[0]).toHaveLength(2);                      
      194    });
      195 
      196    test.each<[string, NormalizedReview]>([

⏺ 325/325 pass across the reviews and ingestion suites. Quick mutation check
  that the new tests actually catch a regression (removing the app-level dedupe
  in the lifecycle):

  Ran 1 shell command (ctrl+o to expand)

⏺ The mutation failed test (b) as intended, and the other cases still pass
  because the DB layer also dedupes; I've restored the file. Next I'm writing a
  story doc and adding a pointer in the services README's outdated Sprint 1
  note. · summary

⏺ Write(docs/s3-011-duplicate-reviews.md)
  ⎿  Wrote 123 lines to docs/s3-011-duplicate-reviews.md
      1 # S3-011 Prevent Duplicate Reviews During Re-Ingestion
      2
      3 Re-ingesting or refreshing an AnalysisTarget never creates a seco
        nd Review record for a source
      4 review that is already stored for that target. This replaces the
        Sprint 1 rule (S1-022) that
      5 stored repeated source reviews as separate rows.
      6
      7 | Rule
              | How it is met
     … +117 lines (~9 KB) (ctrl+o to expand)

⏺ Bash(python3 - <<'PY'
      p='src/services/README.md'…)
  ⎿  Updated docs/s3-011-duplicate-reviews.md +8 -8
       4  review that is already stored for that target. This replaces th
          e Sprint 1 rule (S1-022) that
       5  stored repeated source reviews as separate rows.
       6 
       7 -| Rule                                                         
         -        | How it is met                                        
         -                                                               
         -     |                                                         
       8 -| -------------------------------------------------------------
         -------- | -----------------------------------------------------
         ----------------------------------------------------------------
         ----- |                                                         
       7 +| Rule                                                         
         +        | How it is met                                        
         +                                                               
         +             |                                                 
       8 +| -------------------------------------------------------------
         +------- | -----------------------------------------------------
         +---------------------------------------------------------------
         +------------ |                                                 
       9  | S3-BR-017: re-ingestion must not silently create duplicate re
          views   | Unique index on `(analysis_target_id, identity_key)`.
           Both writers use `ON CONFLICT DO NOTHING`. The app also dedupe
          s each batch |
      10 -| S3-BR-018: the duplicate strategy must be deterministic and t
         -estable | Pure key function in TS and SQL, with shared golden v
         -ectors and unit, ingestion, DB, concurrency, and migration test
         -s        |                                                     
      10 +| S3-BR-018: the duplicate strategy must be deterministic and t
         +estable | Pure key function in TS and SQL, with shared golden v
         +ectors and unit, ingestion, DB, concurrency, and migration test
         +s            |                                                 
      11 
      12  ## Identity key
      13 
     ...
      32 
      33  ### Normalization rules (fingerprint only)
      34 
      35 -| Field                      | Rule                            
         -                                                               
         -                                                               
         -                                             |                 
      36 -| -------------------------- | --------------------------------
         ----------------------------------------------------------------
         ----------------------------------------------------------------
         --------------------------------------------- |                 
      35 +| Field                      | Rule                            
         +                                                               
         +                                                               
         +                                                               
         +                    |                                          
      36 +| -------------------------- | --------------------------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +------------------- |                                          
      37  | Review text, reviewer name | Storable-text cleanup (as persis
          ted), Unicode NFC, each whitespace run becomes one space, trim,
           ASCII-only case folding. An empty result counts as absent. Whi
          tespace is an explicit set: ECMAScript `\s`, which is Unicode W
          hite_Space plus BOM |
      38 -| Review time                | UTC epoch milliseconds, the prec
         -ision of a JavaScript `Date`                                   
         -                                                               
         -                                              |                
      39 -| Rating                     | Shortest decimal (`4`, `4.5`), w
         -hich is `trim_scale(numeric)::text` in SQL                     
         -                                                               
         -                                             |                 
      40 -| Missing optional fields    | Encoded as `~`, which is distinc
         -t from any present value                                       
         -                                                               
         -                                             |                 
      38 +| Review time                | UTC epoch milliseconds, the prec
         +ision of a JavaScript `Date`                                   
         +                                                               
         +                                                               
         +                    |                                          
      39 +| Rating                     | Shortest decimal (`4`, `4.5`), w
         +hich is `trim_scale(numeric)::text` in SQL                     
         +                                                               
         +                                                               
         +                    |                                          
      40 +| Missing optional fields    | Encoded as `~`, which is distinc
         +t from any present value                                       
         +                                                               
         +                                                               
         +                    |                                          
      41 
      42  Full Unicode case folding is deliberately not used: PostgreSQL
          `lower()` depends on the database
      43  collation, so the result could differ between environments. Non
          -ASCII letters keep their case.
  ⎿  Updated src/services/README.md +4
      83    example is explicitly synthetic and demonstrates adapter mapp
          ing only; it is not evidence about
      84    live provider payloads.
      85 
      86 +- **Superseded by S3-011:** reviews are now deduplicated per ta
         +rget by a source-id or fingerprint                             
      87 +  identity key with a database unique index. See [docs/s3-011-d
         +uplicate-reviews.md](../../docs/s3-011-duplicate-reviews.md).  
      88 +  The Sprint 1 decision below is kept for history.             
      89 +                                                               
      90  - **S1-022 duplicate handling (Sprint 1 decision):** S1-022 per
          sists reviews as-is, with no
      91    deduplication, as allowed by [#22](https://github.com/aum-200
          4/CS490_Review_Lens_AI_Fantastic_Six/issues/22)
      92    for Sprint 1:
  ⎿  Updated tests/unit/services/ingestion/ingestion-deduplication.test.ts
     +8 -5
      205        finish: db.finish,
      206      },
      207      extract: ((requestId, expected) =>
      208 -      getExtractedReviews(requestId, expected, providerFetch(r
          -equestId))) as typeof getExtractedReviews,                    
      208 +      getExtractedReviews(                                    
      209 +        requestId,                                            
      210 +        expected,                                             
      211 +        providerFetch(requestId),                             
      212 +      )) as typeof getExtractedReviews,                       
      213      storageApproved: true,
      214      recoveryUrl: jest.fn(),
      215    };
     ...
      280      .mockImplementation(async (_client, _owner, targetId) => (
           { ...db.latestFor(targetId) }));
      281    jest
      282      .mocked(getBoundAttempt)
      279 -    .mockImplementation(                                      
      280 -      async (_client, _owner, _target, jobId) =>              
      281 -        ({ ...[...db.attempts.values()].find((a) => a.provider
          -_request_id === jobId)! }),                                   
      282 -    );                                                        
      283 +    .mockImplementation(async (_client, _owner, _target, jobId
          +) => ({                                                       
      284 +      ...[...db.attempts.values()].find((a) => a.provider_requ
          +est_id === jobId)!,                                           
      285 +    }));                                                      
      286  });
      287  afterEach(() => {
      288    jest.restoreAllMocks();
  ⎿  Updated tests/unit/services/reviews/review-identity.test.ts +3 -1
      54        keyOf("fingerprint with every field"),
      55      );
      56      expect(keyOf("fingerprint decomposed accent")).toBe(keyOf("
          fingerprint composed accent"));
      57 -    expect(keyOf("fingerprint delimiter shift")).not.toBe(keyOf
         -("fingerprint emoji and delimiters"));                         
      57 +    expect(keyOf("fingerprint delimiter shift")).not.toBe(     
      58 +      keyOf("fingerprint emoji and delimiters"),               
      59 +    );                                                         
      60    });
      61  });
      62 

⏺ Bash(npx prettier --write
      tests/unit/services/ingestion/ingestion-deduplication.test.ts && npx
      prettier --check tests/unit/services/ingestion/ingestion-deduplication…)
  ⎿  Updated tests/unit/services/ingestion/ingestion-deduplication.test.ts
     +3 -5
      278    jest
      279      .mocked(getLatestAttempt)
      280      .mockImplementation(async (_client, _owner, targetId) => (
           { ...db.latestFor(targetId) }));
      281 -  jest                                                        
      282 -    .mocked(getBoundAttempt)                                  
      283 -    .mockImplementation(async (_client, _owner, _target, jobId
          -) => ({                                                       
      284 -      ...[...db.attempts.values()].find((a) => a.provider_requ
          -est_id === jobId)!,                                           
      285 -    }));                                                      
      281 +  jest.mocked(getBoundAttempt).mockImplementation(async (_clie
          +nt, _owner, _target, jobId) => ({                             
      282 +    ...[...db.attempts.values()].find((a) => a.provider_reques
          +t_id === jobId)!,                                             
      283 +  }));                                                        
      284  });
      285  afterEach(() => {
      286    jest.restoreAllMocks();

⏺ Formatting is clean (that file needed two Prettier passes). Running lint,
  typecheck, and the migration check:

  Ran 1 shell command (ctrl+o to expand)

⏺ Bash(python3 - <<'PY'
      p='tests/unit/services/reviews/review-identity.test.ts'…)
  ⎿  Updated tests/unit/services/reviews/review-identity.test.ts +1 -2
      137    });
      138 
      139    test("an invalid date counts as a missing date", () => {
      140 -    const { reviewDate: _omit, ...withoutDate } = base;       
      140      expect(reviewIdentityKey({ ...base, reviewDate: new Date("
           nope") })).toBe(
      142 -      reviewIdentityKey(withoutDate),                         
      141 +      reviewIdentityKey({ ...base, reviewDate: undefined }),  
      142      );
      143    });
      144 
  ⎿  (timeout 5m)

⏺ Lint, typecheck, and migration check are clean. Running the focused tests,
  then the full suite:

  Ran 2 shell commands (ctrl+o to expand)

⏺ The one failure is a Node ExperimentalWarning on stderr, not a migration
  problem: the checker exits 0 and prints "valid and unique". Confirming it's
  environmental rather than caused by my change:

  Ran 1 shell command (ctrl+o to expand)

⏺ The failing test fails only because this machine runs Node v23.10.0 while the
  repo requires 24, so it's environmental and unrelated to this change. Next
  I'll check whether any client bundle can reach node:crypto through
  review-service. · summary

  Searched for 1 pattern (ctrl+o to expand)

⏺ Client components only use import type from it, which is erased at compile
  time. Still, a new node:crypto import in route-handler code is
  build-sensitive, so I'll run the production build.

  Ran 1 shell command (ctrl+o to expand)

⏺ Build passed. Final full test:db run, then I'll shut down and delete the
  scratch Postgres cluster and check that the build didn't leave stray tracked
  changes:

  Did not run 1 call (ctrl+o to expand)
  ⎿  $ PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres npm run test:db 2>&1 | grep -cE "^ok - " ; PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres npm run test:db 2>&1 | tail -1; S=/private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantastic-Six/35b6d326-901e-49d1-a6d1-2ece2024ea95/scratchp…
  ⎿  Not run · permission denied
     │ Reason: Permission for this command was denied by a built-in Claude Code safety check

⏺ Using literal absolute paths, as the safety check suggests:

  Ran 2 shell commands (ctrl+o to expand)

⏺ S3-011 is implemented and uncommitted. Re-ingesting a target can no longer
  create a second row for a review it already stores. Everything passes (test:db
  included) except one Jest test that fails because this machine's Node is too
  old.

  1. Strategy

  - Identity key per review:
    - sid:<source_review_id> when Outscraper gives a review_id.
    - Otherwise fp1:<sha256> of the reviewer name, review time (epoch ms),
      rating and text. Each field is length-prefixed so the encoding is
      delimiter-safe. Text gets NFC, collapsed whitespace and trimming. Case
      folding is ASCII-only, because Postgres lower() depends on the database's
      locale.
    - The key only has to be unique within one AnalysisTarget, so targets and
      accounts never share it.
  - Database guarantee: the key is a stored generated column, so no caller can
    set or forge it. A unique index on (analysis_target_id, identity_key) blocks
    duplicates even from concurrent or retried writes.
  - App-level dedupe: a TS copy of the key function collapses repeats inside a
    batch before anything is written. Golden vectors that both Jest and SQL
    check keep the two copies identical.
  - Conflict behavior is ON CONFLICT DO NOTHING (first write wins). Row ids,
    text and created_at never change, so Q&A citations and the review browser's
    order stay stable. The cost is that a review the source later edits keeps
    its old text.
  - Existing duplicates: the migration keeps the oldest row of each, ordered by
    (created_at, id), and deletes the rest. Nothing references reviews.id (Q&A
    citations are never stored), so there's nothing to re-point.
  - Known limitation: two genuinely distinct reviews with no source id and the
    same name, time, rating and text are stored once.

  2. Files changed

  - Source: src/services/reviews/review-identity.ts (new); review-service.ts,
    ingestion-lifecycle.ts and supabase-review-store.ts now dedupe or have
    updated comments.
  - Migration: supabase/migrations/20261126120000_prevent_duplicate_reviews.sql.
    It adds the key functions (owner-only), the generated column, the cleanup
    and the unique index. It also replaces finish_ingestion_attempt and
    insert_reviews (still SECURITY DEFINER with an empty search_path, grants
    unchanged), and relaxes one check to allow a successful run with saved_count
    = 0.
  - Tests (new):
    - tests/unit/services/reviews/review-identity.test.ts
    - tests/unit/services/ingestion/ingestion-deduplication.test.ts, covering
      your cases (a)–(h)
    - tests/db/review-deduplication.test.sql
    - review-deduplication-concurrency.test.sh and
      review-deduplication-migration.test.sh, both added to tests/db/run.sh
    - tests/fixtures/review-identity-vectors.json
  - Existing tests I had to change:
    - reviews.test.sql and review-service.test.ts asserted the Sprint 1 rule
      that duplicates are stored as-is. They now assert the dedupe.
    - review-summary.test.sql and reviews-security-hardening.test.sql seeded
      many identical rows, which are now real duplicates. Each row now gets
      distinct text or a same-length timestamp, so their size and count
      assertions are unchanged.
  - Docs: docs/s3-011-duplicate-reviews.md (new); src/services/README.md notes
    the old Sprint 1 rule is superseded.

  3. Results

  ┌──────────────────────────────────────────────────────┬───────────────────┐
  │                        Check                         │      Result       │
  ├──────────────────────────────────────────────────────┼───────────────────┤
  │ format:check, lint, typecheck                        │ pass              │
  ├──────────────────────────────────────────────────────┼───────────────────┤
  │ check:migrations                                     │ pass              │
  ├──────────────────────────────────────────────────────┼───────────────────┤
  │ Focused Jest (reviews, ingestion, API routes)        │ 427/427           │
  ├──────────────────────────────────────────────────────┼───────────────────┤
  │ Full npm test                                        │ 2,098/2,099       │
  ├──────────────────────────────────────────────────────┼───────────────────┤
  │ npm run test:db (throwaway local Postgres 15, now    │ all 67 checks     │
  │ deleted)                                             │ pass              │
  ├──────────────────────────────────────────────────────┼───────────────────┤
  │ npm run build                                        │ pass              │
  └──────────────────────────────────────────────────────┴───────────────────┘

  The one Jest failure is migration-versions.test.ts. This machine runs Node
  v23.10.0 (the repo requires 24 or later), which prints a type-stripping
  warning that the test treats as an error. The test uses its own temp folder,
  not the new migration. Nothing touched a hosted Supabase project, Outscraper
  or OpenAI.

  4. Risks and what to verify before the PR

  - Behavior change: saved counts and the owner reviews API now report new rows
    only. A run where every review was already stored succeeds with "0 reviews
    saved". You may want a separate "duplicates ignored" count in the UI later.
  - The migration deletes data: if production already has duplicates, it removes
    the newer copies and logs a notice with how many. Check that count before
    applying it to a real project.
  - No real refresh flow exists yet. Starting a new ingestion still returns the
    earlier successful attempt, so today the guarantee covers retries, the owner
    reviews API, and future refresh work. The DB tests simulate later refreshes
    by recording new attempts directly.
  - Run npm run test:db on Node 24 and on the database collation your Supabase
    project uses.
  - Do one manual re-ingestion smoke test on a local Supabase stack before you
    open the PR.
  - Leftovers: two scratch files,
    /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantast
    ic-Six/35b6d326-901e-49d1-a6d1-2ece2024ea95/scratchpad/db.log and
    /private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-Fantast
    ic-Six/35b6d326-901e-49d1-a6d1-2ece2024ea95/scratchpad/pg.log, which you can
    delete.

  5. Git

  Nothing was committed, pushed, staged or stashed. All changes are uncommitted
  on feature/S3-011-prevent-duplicate-reviews, and HEAD is still 3538ea9.