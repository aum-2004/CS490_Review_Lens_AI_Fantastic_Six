
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

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status
  On branch feature/S3-011-prevent-duplicate-reviews
  Changes not staged for commit:
    (use "git add <file>..." to update what will be committed)
    (use "git restore <file>..." to discard changes in working directory)
          modified:   src/services/README.md
          modified:   src/services/ingestion/ingestion-lifecycle.ts
          modified:   src/services/reviews/review-service.ts
          modified:   src/services/reviews/supabase-review-store.ts
          modified:   tests/db/review-summary.test.sql
          modified:   tests/db/reviews-security-hardening.test.sql
          modified:   tests/db/reviews.test.sql
          modified:   tests/db/run.sh
          modified:   tests/unit/services/reviews/review-service.test.ts

  Untracked files:
    (use "git add <file>..." to include in what will be committed)
          docs/s3-011-duplicate-reviews.md
          s3-011-prevent-duplicate-review.md
          src/services/reviews/review-identity.ts
          supabase/migrations/20261126120000_prevent_duplicate_reviews.sql
          tests/db/review-deduplication-concurrency.test.sh
          tests/db/review-deduplication-migration.test.sh
          tests/db/review-deduplication.test.sql
          tests/fixtures/review-identity-vectors.json
          tests/unit/services/ingestion/ingestion-deduplication.test.ts
          tests/unit/services/reviews/review-identity.test.ts

  no changes added to commit (use "git add" and/or "git commit -a")
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %
  commands to commit and push

  Ran 1 shell command (ctrl+o to expand)

⏺ You're already on feature/S3-011-prevent-duplicate-reviews, so these commands
  commit there and push that branch. main isn't touched.

  One thing first: s3-011-prevent-duplicate-review.md in the repo root is our
  session transcript (1,206 lines). The repo keeps transcripts in
  ai-transcripts/ named YYYY-MM-DD_<name>_<story>_<tool>.md, so the first
  command moves it there. Skim it before committing, since it goes into the
  shared repo as-is. If you'd rather not commit it, skip the mv and leave it out
  of git add.

  # 1. Move the transcript to the repo's convention (optional)
  mv s3-011-prevent-duplicate-review.md \
    ai-transcripts/2026-11-26_deepshah_S3-011_prevent-duplicate-reviews_claude-c
  ode.md

  # 2. Stage only the S3-011 files
  git add \
    src/services/README.md \
    src/services/ingestion/ingestion-lifecycle.ts \
    src/services/reviews/review-service.ts \
    src/services/reviews/supabase-review-store.ts \
    src/services/reviews/review-identity.ts \
    supabase/migrations/20261126120000_prevent_duplicate_reviews.sql \
    tests/db/review-summary.test.sql \
    tests/db/reviews-security-hardening.test.sql \
    tests/db/reviews.test.sql \
    tests/db/run.sh \
    tests/db/review-deduplication.test.sql \
    tests/db/review-deduplication-concurrency.test.sh \
    tests/db/review-deduplication-migration.test.sh \
    tests/fixtures/review-identity-vectors.json \
    tests/unit/services/reviews/review-service.test.ts \
    tests/unit/services/reviews/review-identity.test.ts \
    tests/unit/services/ingestion/ingestion-deduplication.test.ts \
    docs/s3-011-duplicate-reviews.md \
    ai-transcripts/2026-11-26_deepshah_S3-011_prevent-duplicate-reviews_claude-c
  ode.md

  # 3. Check that only these files are staged
  git status

  # 4. Commit
  git commit \
    -m "S3-011: Prevent duplicate reviews during re-ingestion" \
    -m "Each review gets a target-scoped identity key: sid:<source review id>,
  or a normalized SHA-256 fingerprint (fp1:) when the source has no id. The key
  is a stored generated column with a unique index on (analysis_target_id,
  identity_key). finish_ingestion_attempt and insert_reviews use ON CONFLICT DO
  NOTHING, and the app collapses repeats within each batch. The migration keeps
  the oldest copy of any existing duplicates and lets a run that saves 0 new
  reviews still succeed. Covers S3-BR-017 and S3-BR-018. See
  docs/s3-011-duplicate-reviews.md."

  # 5. Push the branch and set its upstream
  git push -u origin feature/S3-011-prevent-duplicate-reviews

  To open the PR afterwards (teammates will see it):

  gh pr create --base main --head feature/S3-011-prevent-duplicate-reviews \
    --title "S3-011: Prevent duplicate reviews during re-ingestion" \
    --body-file docs/s3-011-duplicate-reviews.md

  Before or while the PR is open, mention to reviewers:
  - The migration deletes newer copies of any existing duplicate reviews.
  - The one Jest failure, migration-versions.test.ts, happens only because this
    Mac runs Node v23. CI on Node 24 should pass it.

  I can run these for you if you'd like.

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status
  On branch feature/S3-011-prevent-duplicate-reviews
  Changes not staged for commit:
    (use "git add <file>..." to update what will be committed)
    (use "git restore <file>..." to discard changes in working directory)
          modified:   src/services/README.md
          modified:   src/services/ingestion/ingestion-lifecycle.ts
          modified:   src/services/reviews/review-service.ts
          modified:   src/services/reviews/supabase-review-store.ts
          modified:   tests/db/review-summary.test.sql
          modified:   tests/db/reviews-security-hardening.test.sql
          modified:   tests/db/reviews.test.sql
          modified:   tests/db/run.sh
          modified:   tests/unit/services/reviews/review-service.test.ts

  Untracked files:
    (use "git add <file>..." to include in what will be committed)
          ai-transcripts/s3-011-prevent-duplicate-review.md
          docs/s3-011-duplicate-reviews.md
          src/services/reviews/review-identity.ts
          supabase/migrations/20261126120000_prevent_duplicate_reviews.sql
          tests/db/review-deduplication-concurrency.test.sh
          tests/db/review-deduplication-migration.test.sh
          tests/db/review-deduplication.test.sql
          tests/fixtures/review-identity-vectors.json
          tests/unit/services/ingestion/ingestion-deduplication.test.ts
          tests/unit/services/reviews/review-identity.test.ts

  no changes added to commit (use "git add" and/or "git commit -a")
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %
  once again look and give commands to commit and psuh

⏺ The only change since last time is the transcript, now at
  ai-transcripts/s3-011-prevent-duplicate-review.md. Every file in your git
  status belongs to S3-011, so you can stage all of them:

  # 1. Stage everything in the status above
  git add \
    src/services/README.md \
    src/services/ingestion/ingestion-lifecycle.ts \
    src/services/reviews/review-service.ts \
    src/services/reviews/supabase-review-store.ts \
    src/services/reviews/review-identity.ts \
    supabase/migrations/20261126120000_prevent_duplicate_reviews.sql \
    tests/db/review-summary.test.sql \
    tests/db/reviews-security-hardening.test.sql \
    tests/db/reviews.test.sql \
    tests/db/run.sh \
    tests/db/review-deduplication.test.sql \
    tests/db/review-deduplication-concurrency.test.sh \
    tests/db/review-deduplication-migration.test.sh \
    tests/fixtures/review-identity-vectors.json \
    tests/unit/services/reviews/review-service.test.ts \
    tests/unit/services/reviews/review-identity.test.ts \
    tests/unit/services/ingestion/ingestion-deduplication.test.ts \
    docs/s3-011-duplicate-reviews.md \
    ai-transcripts/s3-011-prevent-duplicate-review.md

  # 2. Check: all 19 files under "Changes to be committed", nothing left over
  git status

  # 3. Commit
  git commit \
    -m "S3-011: Prevent duplicate reviews during re-ingestion" \
    -m "Each review gets a target-scoped identity key: sid:<source review id>,
  or a normalized SHA-256 fingerprint (fp1:) when the source has no id. The key
  is a stored generated column with a unique index on (analysis_target_id,
  identity_key). finish_ingestion_attempt and insert_reviews use ON CONFLICT DO
  NOTHING, and the app collapses repeats within each batch. The migration keeps
  the oldest copy of any existing duplicates and lets a run that saves 0 new
  reviews still succeed. Covers S3-BR-017 and S3-BR-018. See
  docs/s3-011-duplicate-reviews.md."

  # 4. Push the branch (first push sets the upstream)
  git push -u origin feature/S3-011-prevent-duplicate-reviews

  Then, if you want the PR (your teammates will see it):

  gh pr create --base main --head feature/S3-011-prevent-duplicate-reviews \
    --title "S3-011: Prevent duplicate reviews during re-ingestion" \
    --body-file docs/s3-011-duplicate-reviews.md

  The other files in ai-transcripts/ are named
  YYYY-MM-DD_<name>_<story>_<tool>.md. To match that, rename the transcript
  before step 1 and use the new path in git add:

  mv ai-transcripts/s3-011-prevent-duplicate-review.md \
    ai-transcripts/2026-11-26_deepshah_S3-011_prevent-duplicate-reviews_claude-c
  ode.md

❯ deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status
  On branch feature/S3-011-prevent-duplicate-reviews
  Changes not staged for commit:
    (use "git add <file>..." to update what will be committed)
    (use "git restore <file>..." to discard changes in working directory)
          modified:   src/services/README.md
          modified:   src/services/ingestion/ingestion-lifecycle.ts
          modified:   src/services/reviews/review-service.ts
          modified:   src/services/reviews/supabase-review-store.ts
          modified:   tests/db/review-summary.test.sql
          modified:   tests/db/reviews-security-hardening.test.sql
          modified:   tests/db/reviews.test.sql
          modified:   tests/db/run.sh
          modified:   tests/unit/services/reviews/review-service.test.ts

  Untracked files:
    (use "git add <file>..." to include in what will be committed)
          ai-transcripts/s3-011-prevent-duplicate-review.md
          docs/s3-011-duplicate-reviews.md
          src/services/reviews/review-identity.ts
          supabase/migrations/20261126120000_prevent_duplicate_reviews.sql
          tests/db/review-deduplication-concurrency.test.sh
          tests/db/review-deduplication-migration.test.sh
          tests/db/review-deduplication.test.sql
          tests/fixtures/review-identity-vectors.json
          tests/unit/services/ingestion/ingestion-deduplication.test.ts
          tests/unit/services/reviews/review-identity.test.ts

  no changes added to commit (use "git add" and/or "git commit -a")
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % >....


    tests/unit/services/reviews/review-service.test.ts \
    tests/unit/services/reviews/review-identity.test.ts \
    tests/unit/services/ingestion/ingestion-deduplication.test.ts \
    docs/s3-011-duplicate-reviews.md \
    ai-transcripts/s3-011-prevent-duplicate-review.md
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git status
  On branch feature/S3-011-prevent-duplicate-reviews
  Changes to be committed:
    (use "git restore --staged <file>..." to unstage)
          new file:   ai-transcripts/s3-011-prevent-duplicate-review.md
          new file:   docs/s3-011-duplicate-reviews.md
          modified:   src/services/README.md
          modified:   src/services/ingestion/ingestion-lifecycle.ts
          new file:   src/services/reviews/review-identity.ts
          modified:   src/services/reviews/review-service.ts
          modified:   src/services/reviews/supabase-review-store.ts
          new file:
  supabase/migrations/20261126120000_prevent_duplicate_reviews.sql
          new file:   tests/db/review-deduplication-concurrency.test.sh
          new file:   tests/db/review-deduplication-migration.test.sh
          new file:   tests/db/review-deduplication.test.sql
          modified:   tests/db/review-summary.test.sql
          modified:   tests/db/reviews-security-hardening.test.sql
          modified:   tests/db/reviews.test.sql
          modified:   tests/db/run.sh
          new file:   tests/fixtures/review-identity-vectors.json
          new file:
  tests/unit/services/ingestion/ingestion-deduplication.test.ts
          new file:   tests/unit/services/reviews/review-identity.test.ts
          modified:   tests/unit/services/reviews/review-service.test.ts

  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git commit -m "S3-011:
  Prevent duplicate reviews during re-ingestion"
  [feature/S3-011-prevent-duplicate-reviews 85fbe57] S3-011: Prevent duplicate
  reviews during re-ingestion
   19 files changed, 3089 insertions(+), 16 deletions(-)
   create mode 100644 ai-transcripts/s3-011-prevent-duplicate-review.md
   create mode 100644 docs/s3-011-duplicate-reviews.md
   create mode 100644 src/services/reviews/review-identity.ts
   create mode 100644
  supabase/migrations/20261126120000_prevent_duplicate_reviews.sql
   create mode 100644 tests/db/review-deduplication-concurrency.test.sh
   create mode 100644 tests/db/review-deduplication-migration.test.sh
   create mode 100644 tests/db/review-deduplication.test.sql
   create mode 100644 tests/fixtures/review-identity-vectors.json
   create mode 100644
  tests/unit/services/ingestion/ingestion-deduplication.test.ts
   create mode 100644 tests/unit/services/reviews/review-identity.test.ts
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six % git push -u origin
  feature/S3-011-prevent-duplicate-reviews

  Enumerating objects: 59, done.
  Counting objects: 100% (59/59), done.
  Delta compression using up to 12 threads
  Compressing objects: 100% (35/35), done.
  Writing objects: 100% (36/36), 47.64 KiB | 11.91 MiB/s, done.
  Total 36 (delta 20), reused 0 (delta 0), pack-reused 0 (from 0)
  remote: Resolving deltas: 100% (20/20), completed with 20 local objects.
  remote:
  remote: Create a pull request for 'feature/S3-011-prevent-duplicate-reviews'
  on GitHub by visiting:
  remote:      https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/p
  ull/new/feature/S3-011-prevent-duplicate-reviews
  remote:
  To https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six.git
   * [new branch]      feature/S3-011-prevent-duplicate-reviews ->
  feature/S3-011-prevent-duplicate-reviews
  branch 'feature/S3-011-prevent-duplicate-reviews' set up to track
  'origin/feature/S3-011-prevent-duplicate-reviews'.
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %
  deepshah@mac CS490_Review_Lens_AI_Fantastic_Six %

⏺ The commit and push both worked. Commit 85fbe57 is on
  feature/S3-011-prevent-duplicate-reviews with all 19 files, and the branch now
  tracks origin/feature/S3-011-prevent-duplicate-reviews. main is unchanged.

  The next step is the pull request. Either open GitHub's link from your push
  output:

  https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/pull/new/featur
  e/S3-011-prevent-duplicate-reviews

  or run this from the terminal:

  gh pr create --base main --head feature/S3-011-prevent-duplicate-reviews \
    --title "S3-011: Prevent duplicate reviews during re-ingestion" \
    --body-file docs/s3-011-duplicate-reviews.md

  You committed with the subject line only, which is fine because the PR
  description can carry the detail. Two things to point out to reviewers in it:
  - The migration deletes data: on any database that already has duplicate
    reviews, it removes the newer copies and keeps the oldest.
  - One local test failure is expected: migration-versions.test.ts fails on this
    Mac only because it runs Node v23. CI on Node 24 should pass it.

  I can write a shorter PR description than the doc if you'd like.

❯ now I will create a PR in UI give me good PR description

  Ran 1 shell command (ctrl+o to expand)

⏺ Written for: your CS490 teammates reviewing this PR on GitHub.

  The repo has issue #117 for this story, so the description closes it. Paste
  the title into the title field and the block into the description field:

  Title
  S3-011: Prevent duplicate reviews during re-ingestion

  Description
  Closes #117.

  Re-ingesting or retrying an analysis no longer creates a second Review record
  for a source review that is already stored for that target (S3-BR-017). The
  duplicate strategy is deterministic and covered by automated tests at the
  unit, ingestion, database, concurrency, and migration levels (S3-BR-018).

  Full strategy and rationale:
  [`docs/s3-011-duplicate-reviews.md`](docs/s3-011-duplicate-reviews.md)

  ## How it works

  - **Identity key per review, unique within its AnalysisTarget** (never shared
  across targets or accounts):
    - `sid:<source_review_id>` when the source gives a stable id (Outscraper
  `review_id`)
    - `fp1:<sha256>` otherwise: a fingerprint of reviewer name, review time,
  rating, and text. Text is normalized (NFC, collapsed whitespace, trimmed,
  ASCII case folding) and each field is length-prefixed so the encoding is
  delimiter-safe.
    - The `sid:` and `fp1:` prefixes keep the two key types from colliding.
  - **Database guarantee:** `reviews.identity_key` is a `STORED` generated
  column, so no caller can set or forge it. A unique index on
  `(analysis_target_id, identity_key)` holds even for concurrent or retried
  writes.
  - **Writers:** `finish_ingestion_attempt` and `insert_reviews` collapse
  repeats within a batch and insert with `ON CONFLICT DO NOTHING`.
  - **App layer:** `src/services/reviews/review-identity.ts` is a pure TS
  version of the same key function. It dedupes each batch before writing. Golden
  vectors checked by both Jest and SQL keep the two versions identical.

  ### Why `DO NOTHING` instead of updating
  The first stored copy wins. Row ids, text, and `created_at` never change, so
  Q&A citations stay valid and the review browser's `(created_at, id)` order
  stays stable. Trade-off: if the source edits a review, the stored text is not
  refreshed.

  ## ⚠️ Things reviewers should know

  - **The migration deletes data.** If a database already has duplicate reviews,
  `20261126120000_prevent_duplicate_reviews.sql` keeps the oldest copy (by
  `created_at, id`) and deletes the rest, logging the count. Nothing references
  `reviews.id` (no FKs; Q&A citations are never stored), so nothing is left
  dangling.
  - **`saved_count` now counts only new rows.** A run where every review was
  already stored succeeds with `saved_count = 0`, so the migration relaxes that
  check from `> 0` to `>= 0`. Without that, such a run would error, stay
  `processing`, and eventually block the target as `RESULT_WINDOW_EXPIRED`.
  - **Owner reviews API:** `POST /reviews` now returns only newly created
  reviews. The response shape and error codes are unchanged.
  - **Known limitation:** two genuinely different reviews with no source id and
  identical name, time, rating, and text are stored once.
  - Unchanged: RLS, grants, `SECURITY DEFINER`, the empty `search_path`, error
  codes, quotas, and auth/ownership checks. No dependency, env, prompt, or
  OpenAI changes.

  ## Existing tests changed (intentional)

  - `tests/db/reviews.test.sql` and `review-service.test.ts` asserted the Sprint
  1 rule that duplicates are stored as-is. They now assert the dedupe.
  - `tests/db/review-summary.test.sql` and
  `tests/db/reviews-security-hardening.test.sql` seeded many identical rows,
  which are now real duplicates. Each row now has distinct text or a same-length
  timestamp, so the size and count assertions are unchanged.

  ## Test evidence

  | Check | Result |
  |---|---|
  | Format, lint, typecheck, `check:migrations`, `npm run build` | ✅ pass |
  | Focused Jest (reviews, ingestion, API routes) | ✅ 427 / 427 |
  | Full `npm test` | 2,098 / 2,099 (see note) |
  | `npm run test:db` (local Postgres 15) | ✅ all passed, including the 3 new
  suites |

  Note: the one Jest failure is `migration-versions.test.ts`. It fails locally
  only because that machine runs Node v23, which writes a type-stripping warning
  to stderr. The test uses its own temp folder and never reads the new
  migration. It should pass on Node 24 (the repo's required version).

  New tests:
  - `tests/unit/services/reviews/review-identity.test.ts`: key derivation and
  normalization edge cases
  - `tests/unit/services/ingestion/ingestion-deduplication.test.ts`: synthetic
  Outscraper payloads through the real pipeline. Covers repeat refreshes,
  duplicates within and across batches, new reviews, fingerprint fallback,
  isolation between targets and accounts, retries after failure, and final
  counts and order.
  - `tests/db/review-deduplication.test.sql`: constraint, privileges, SQL/TS
  parity, both writers
  - `tests/db/review-deduplication-concurrency.test.sh`: two real sessions
  writing the same review at once
  - `tests/db/review-deduplication-migration.test.sh`: cleanup of pre-existing
  duplicates

  ## Before merging
  - [ ] Apply the migration to a local Supabase stack and run `npm run test:db`
  on Node 24
  - [ ] Manual smoke test: ingest a target, re-run, confirm the review count is
  unchanged
  - [ ] Before applying to a shared/hosted DB, check how many existing
  duplicates the migration would remove

  No live Outscraper, OpenAI, or Supabase calls were made; all tests use local
  fixtures and mocks.

  AI assistance: Claude Code. Session transcript:
  `ai-transcripts/s3-011-prevent-duplicate-review.md`.

  When you create the PR, add the sprint-3 label to match the issue.
❯ who is the best reviwer for this PR

  Ran 2 shell commands (ctrl+o to expand)

⏺ I'd ask ms-00star as the main reviewer and neel-0064 as the second. Each wrote
  one of the two database functions this PR replaces.

  1. ms-00star (main reviewer). The riskiest part of this PR changes their code:
  - They wrote the ingestion-attempt lifecycle
    (20261107000000_create_ingestion_attempts.sql,
    20261107030000_bound_ingestion_completions.sql), including
    finish_ingestion_attempt, which this PR rewrites.
  - They wrote the ingestion_attempt_lifecycle check that I relaxed from
    saved_count > 0 to >= 0. They can best judge whether a successful run with 0
    new reviews breaks any assumption in the ingestion flow.
  - They also wrote parts of ingestion-lifecycle.ts and tests/db/run.sh, both of
    which changed.

  2. neel-0064 (second reviewer).
  - They wrote 20261108000000_harden_review_writes.sql, which created
    insert_reviews. This PR replaces that function and changes what it returns.
  - They also built the Q&A citation and grounded-evidence work. That's the code
    that depends on review ids never changing, which is the main reason for DO
    NOTHING.
  - They review PRs often (#128, #104, #99, #97).

  Optional: Bansi3756. They wrote outscraper-adapter.ts, which maps Outscraper's
  review_id to source_review_id. The sid: key depends on that id being stable,
  so a quick look from them is worthwhile but not essential.

  Shortlist: ms-00star + neel-0064. I picked them by checking who wrote each
  file this PR touches and who reviewed recent PRs.

❯ Address the review feedback on my S3-011 PR
  (feature/S3-011-prevent-duplicate-reviews, "Prevent Duplicate Reviews During
  Re-Ingestion"). Reviewer ms-00star said:

  "Please address two data-integrity gaps before approval: reconcile reviews
  when source IDs appear or disappear so refreshes cannot duplicate them, and
  resolve the first-write-wins policy's conflict with S3-010's requirement to
  refresh existing review fields. Please add regression coverage for both.
  Mergeability and CI are clean, and I found no new dependency or ownership/RLS
  issues."

  RULES: Do NOT run git commit, git push, git add, git stash, git reset, git
  checkout/switch, or anything that changes history or the remote. Leave all
  changes uncommitted. Never run supabase db push or hit any hosted Supabase,
  OpenAI, or Outscraper service. Use mocks and local fixtures only. Don't touch
  quota, OpenAI, billing, env config, or dependencies. Don't weaken, skip, or
  delete existing tests. Ask me nothing unless truly blocked; decide and
  document.

  STEP 1 – READ FIRST (focused)
  - My current implementation on this branch: `git diff main...HEAD`
  (identity-key derivation, ingestion path, migration, tests, docs).
  - S3-010's requirement: grep the repo and docs for "S3-010" and its S3-BR
  rules, and find how refresh is supposed to update existing review fields
  (which fields: text, rating, date, owner response, etc.). Also find the
  S3-010 code if it is already on main, so the refresh logic doesn't diverge.
  - Check whether my migration is merged to main or applied anywhere. If it
  exists only on this branch, edit it in place. If anything already shipped,
  add a new later-versioned migration instead. Never edit a historical
  migration that is on main.

  GAP 1 – SOURCE ID APPEARS OR DISAPPEARS BETWEEN REFRESHES
  Problem: a review first ingested WITHOUT a source id is keyed by fingerprint.
  If a later refresh returns it WITH a source id (or the reverse: first with
  an id, later without), the two identity keys differ, so my current logic
  creates a duplicate.
  Required behavior:
  - Always compute and store the content fingerprint for every review, in
  addition to the nullable source_review_id.
  - Match order inside one target: (1) by source_review_id if present; else (2)
  by fingerprint.
  - ID APPEARS: an incoming review has a source id, no row has that id, but a
  row in the same target with a NULL source id has the same fingerprint → adopt
  it: set source_review_id on that existing row (keep the row id and
  created_at) instead of inserting.
  - ID DISAPPEARS: an incoming review has no source id and matches an existing
  row (which has a source id) by fingerprint → treat it as that row; don't
  insert, and don't clear the stored source id.
  - Never collapse two reviews that both have DIFFERENT non-null source ids,
  even if their fingerprints are identical. Distinct source ids always mean
  distinct reviews.
  - Several existing NULL-id rows with the same fingerprint (genuinely
  identical content): adopt deterministically (oldest first, one incoming
  review adopts one row), and document it.
  - All of this must be atomic and safe under concurrent refreshes: implement
  it in a single SQL statement or RPC (transaction, plus either an advisory
  lock per target or unique indexes that make the race fail safe). Enforce with
  partial unique indexes: unique (target_id, source_review_id) WHERE
  source_review_id IS NOT NULL, and unique (target_id, fingerprint) WHERE
  source_review_id IS NULL. Verify that this combination can't wrongly block
  two distinct reviews that have different source ids. Keep the existing RLS,
  grants, SECURITY DEFINER / empty search_path conventions if the RPC uses
  them.
  - The migration's existing-data cleanup must also account for this (dedupe
  pre-existing duplicates deterministically, keep the oldest row, and preserve
  anything that references review ids such as Q&A citations).

  GAP 2 – FIRST-WRITE-WINS CONFLICTS WITH S3-010 (refresh existing fields)
  Problem: my "on conflict do nothing" means a refresh never updates an
  existing review, which contradicts S3-010's requirement that refreshing
  updates existing review fields.
  Required behavior:
  - On a match, UPDATE the mutable fields that S3-010 says refresh must update
  (determine the exact list from S3-010; e.g. text, rating, owner response,
  likes, edited flag, source-provided timestamps), and keep the row id,
  created_at, target id, and identity columns stable so references and
  citations keep working.
  - Make the update idempotent: if nothing changed, do not write or bump
  updated_at (use IS DISTINCT FROM on the changed columns).
  - Define null handling: an incoming null or missing value must not wipe a
  previously stored non-null value unless S3-010 says otherwise. Document the
  rule.
  - Reconsider the fingerprint inputs: if it includes mutable fields (text,
  rating), an edited review without a source id would stop matching and become
  a new row. Prefer a fingerprint built from the most stable attributes (e.g.
  normalized author identifier, review date, and any other stable field), and
  decide whether text belongs in it. Document the trade-off and any remaining
  limitation (e.g. an edited review with no source id AND no other stable
  attribute can't be matched).
  - Same-batch duplicates and cross-batch duplicates must still produce one
  record, with the LAST occurrence in a batch winning for field values in a
  deterministic way (document the rule).

  TESTS (regression coverage for both gaps; deterministic)
  Unit tests for the key derivation and matching decision logic, plus DB-level
  tests if the repo has them (run `npm run test:db` only if it works locally on
  this Mac, otherwise say you couldn't), and ingestion-level tests:
  1. Review first ingested without a source id, then re-ingested WITH one →
  still exactly one row, source id now set, same row id and created_at.
  2. Review first ingested WITH a source id, then re-ingested WITHOUT one →
  still one row, source id retained.
  3. Two reviews with identical content but different non-null source ids → two
  rows.
  4. Several NULL-id rows with an identical fingerprint plus one incoming
  review with an id → exactly one row adopted, deterministic (oldest).
  5. Refresh with changed text/rating on an existing review → fields updated,
  id and created_at unchanged, no duplicate.
  6. Refresh with identical data → no write (updated_at unchanged).
  7. Incoming null field doesn't wipe a stored value (per the documented rule).
  8. Same review twice in one batch and across two batches → one row; last
  value wins.
  9. Concurrent refreshes of the same target don't create duplicates (DB-level
  if possible).
  10. Reviews in different targets/accounts are never matched to each other.
  11. Row ids referenced by existing citations and the review browser still
  resolve after adoption and update.
  Mutation check: temporarily break the adopt step and the update step, confirm
  the new tests fail, then restore everything.

  DOCS
  Update the duplicate-strategy doc I wrote: the matching order, adoption on id
  appear/disappear, the mutable-field refresh rule, the null-handling rule,
  the fingerprint inputs and their trade-off, the partial unique indexes, and
  the known limitations. Map it to S3-BR-017, S3-BR-018, and the S3-010 rule.

  VERIFY (report real results)
  format check, lint, typecheck, `npm run check:migrations`, the focused tests,
  then full `npm test`. Don't run the production build unless something
  build-sensitive changed.

  FINAL REPORT (concise, no step recap)
  1. How each of the two gaps was resolved, in 2–3 lines each.
  2. Files changed, grouped (source, migration, tests, docs), and whether the
  migration was edited in place or a new one added, and why.
  3. Test and check results with counts, and anything you couldn't run and why.
  4. Remaining limitations or risks, and what I should manually verify.
  5. A ready-to-paste reply to ms-00star (under 100 words, direct): say both
  gaps are addressed with a one-line explanation of each, name the regression
  tests added, and tell them it's ready for re-review. Don't claim anything you
  didn't verify.
  6. Confirm nothing was committed or pushed.

⏺ Starting with the current branch state, since several of my files changed on
  disk after my last read.

  Ran 1 shell command (ctrl+o to expand)

⏺ The working tree is clean, so the on-disk notes match the commit, but
  origin/main has since moved with S3-014 (#133). I'm checking whether it added
  migrations or S3-010 work, and searching for S3-010's requirements next.
  · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ No migrations on main after mine, and no S3-010 code anywhere, only issue
  #116. Reading S3-010 plus its neighbours S3-009, S3-011 and S3-012, since they
  define refresh semantics:

  Ran 1 shell command (ctrl+o to expand)

⏺ Claude writes: The rule in S3-010 says to reconcile existing reviews by stable
  identity and leave reviews missing from a partial response untouched, but it
  names no fields. Before designing, I'm checking whether any in-flight branch
  like S3-006 references reviews.id and whether my migration has been applied
  anywhere. · summary

  Ran 3 shell commands (ctrl+o to expand)

⏺ S3-005 (#134) has a migration versioned before mine. If it also redefines
  finish_ingestion_attempt, my create or replace would silently overwrite it, so
  I'm checking:

  Ran 1 shell command (ctrl+o to expand)

⏺ No conflict: S3-005 only adds delete_owned_analysis and changes an FK on
  ingestion_attempts. My findings:
  - No open branch or PR adds an FK to reviews.id.
  - My migration exists only on this unmerged PR branch (#135), so I'll edit it
    in place.
  - S3-010 isn't implemented anywhere yet; issue #116's text is the spec.

  Design:
  - Columns: keep the nullable source_review_id, normalized and enforced by a
    CHECK. Every row also gets a stored generated review_fingerprint, plus a new
    updated_at.
  - Fingerprint (fp2:):
    - When both reviewer name and review time are present, it uses only those
      two. Text and rating are excluded, so an edited review still matches.
    - When either is missing, it falls back to a content tier (text, rating,
      plus whatever is present). Without the fallback, every anonymous, undated
      owner-API review would collapse into one.
    - I'm not storing Outscraper's author_id, for reviewer-privacy reasons (data
      minimization).
  - Matching order, one row at a time inside one RPC under a per-target advisory
    lock:
    a. Same source id → update it.
    b. Incoming id not stored yet, but an id-less row has the same fingerprint →
       adopt that row.
    c. No incoming id → match by fingerprint, preferring an id-less row, then
       the oldest id'd row. The stored id is never cleared.
    d. Otherwise insert.
  - Indexes: partial unique indexes on (target, source_review_id) WHERE id IS
    NOT NULL and (target, fingerprint) WHERE id IS NULL. Two different ids never
    block each other.
  - Updates: text and rating take the incoming value. Optional fields use
    coalesce(incoming, stored), so a null never wipes a stored value. Rows are
    written only IS DISTINCT FROM, so no-ops leave updated_at alone. Within a
    batch, rows are processed in order, so the last occurrence wins.
  - Cleanup: merges id duplicates, then fingerprint duplicates, then
    id-less/id'd pairs. The oldest row survives with the newest values. Any FK
    pointing at the deleted copies is re-pointed generically.

  Rewriting the pure TS module first:

⏺ Write(src/services/reviews/review-identity.ts)
  ⎿  Added 127 lines, removed 37 lines
       4  import type { NormalizedReview } from "./types";
       5 
       6  /**
       7 - * S3-011 duplicate strategy (S3-BR-017, S3-BR-018). Pure: no I
         -/O, clock, locale, or randomness.                              
       7 + * S3-011 duplicate strategy (S3-BR-017, S3-BR-018) and S3-010 
         +reconciliation. Pure: no I/O, clock,                           
       8 + * locale, or randomness. Full rules: docs/s3-011-duplicate-rev
         +iews.md.                                                       
       9   *
       9 - * Every Review has one identity key, unique per AnalysisTarget
         - (never across targets or users):                              
      10 - * - `sid:<id>` when the source supplied a non-blank review id 
         -(Outscraper `review_id`);                                      
      11 - * - otherwise `fp1:<sha256 hex>` of a normalized fingerprint o
         -f reviewer name, review time,                                  
      12 - *   rating, and review text.                                  
      13 - * The prefixes keep the two identity types from colliding.    
      10 + * Every stored Review keeps its nullable source review id AND 
         +a content fingerprint. Within one                              
      11 + * AnalysisTarget an incoming review is matched (matchStoredRev
         +iew):                                                          
      12 + *   1. by source id;                                          
      13 + *   2. an id not stored yet adopts the oldest id-less row with
         + the same fingerprint;                                         
      14 + *   3. a review without an id matches by fingerprint, preferri
         +ng an id-less row.                                             
      15 + * Distinct non-null source ids are always distinct reviews.   
      16   *
      15 - * PostgreSQL computes the same key in `public.review_identity_
         -key` (migration                                                
      16 - * 20261126120000_prevent_duplicate_reviews.sql) as a stored ge
         -nerated column with a unique index,                            
      17 - * and that database key is authoritative. This twin lets the a
         -pplication collapse duplicates                                 
      18 - * within one batch before it writes anything. Shared golden ve
         -ctors in                                                       
      19 - * tests/fixtures/review-identity-vectors.json keep the two imp
         -lementations identical.                                        
      20 - * Change neither implementation in place: a new rule needs a n
         -ew prefix (for example `fp2:`)                                 
      21 - * and a migration that recomputes stored keys.                
      17 + * PostgreSQL implements the same rules in public.merge_target_
         +reviews and computes the stored                                
      18 + * fingerprint as a generated column (migration 20261126120000_
         +prevent_duplicate_reviews.sql).                                
      19 + * Shared golden vectors in tests/fixtures/review-identity-vect
         +ors.json keep the two fingerprint                              
      20 + * implementations identical. Change neither in place: a new ru
         +le needs a new prefix and a                                    
      21 + * migration that recomputes stored fingerprints.              
      22   */
      23  export type ReviewIdentityInput = Pick<
      24    NormalizedReview,
      25    "text" | "rating" | "sourceReviewId" | "reviewerName" | "revi
          ewDate"
      26  >;
      27 
      28 -export const SOURCE_ID_KEY_PREFIX = "sid:";                    
      29 -export const FINGERPRINT_KEY_PREFIX = "fp1:";                  
      30 -const FINGERPRINT_VERSION = "v1";                              
      28 +export const FINGERPRINT_PREFIX = "fp2:";                      
      29 +const FINGERPRINT_VERSION = "v2";                              
      30  const ABSENT_FIELD = "~";
      31 
      32  // Listed explicitly instead of `\s` so PostgreSQL uses exactly
           the same set. This is the
     ...
      54  }
      55 
      56  /**
      58 - * Source ids are opaque and case-sensitive, so they are only t
         -rimmed. A blank id counts as no                                
      59 - * id, and the review falls back to the fingerprint.           
      57 + * Source ids are opaque and case-sensitive, so they are only t
         +rimmed. A blank id counts as no id.                            
      58 + * PostgreSQL stores ids in this normalized form (public.review
         +_source_id and a CHECK constraint).                            
      59   */
      60  export function normalizeSourceReviewId(value: string | null | 
          undefined): string | undefined {
      61    if (value === null || value === undefined) return undefined;
     ...
       80    return value === undefined ? ABSENT_FIELD : `${Array.from(va
           lue).length}:${value}`;
       81  }
       82 
       84 -/** The exact string whose SHA-256 is the fingerprint. Exporte
          -d for tests and documentation. */                             
       83 +/**                                                           
       84 + * The exact string whose SHA-256 is the fingerprint.         
       85 + * - author-time tier (reviewer name AND review time present):
          + only those two stable attributes,                            
       86 + *   so an edit to the text or rating does not create a new id
          +entity;                                                       
       87 + * - content tier (either is missing): reviewer name, time, ra
          +ting, and text, because without both                          
       88 + *   stable attributes the content is the only thing that tell
          +s reviews apart.                                              
       89 + */                                                           
       90  export function reviewFingerprintSource(review: ReviewIdentity
           Input): string {
       91 +  const author = normalizeIdentityText(review.reviewerName);  
       92 +  const time = canonicalDate(review.reviewDate);              
       93 +  if (author !== undefined && time !== undefined) {           
       94 +    return [FINGERPRINT_VERSION, "author-time", encodeField(au
          +thor), encodeField(time)].join("|");                          
       95 +  }                                                           
       96    return [
       97      FINGERPRINT_VERSION,
       88 -    encodeField(normalizeIdentityText(review.reviewerName)),  
       89 -    encodeField(canonicalDate(review.reviewDate)),            
       98 +    "content",                                                
       99 +    encodeField(author),                                      
      100 +    encodeField(time),                                        
      101      encodeField(canonicalRating(review.rating)),
      102      encodeField(normalizeIdentityText(review.text)),
      103    ].join("|");
      104  }
      105 
       95 -/** Deterministic identity key of one review within its Analys
          -isTarget. */                                                  
       96 -export function reviewIdentityKey(review: ReviewIdentityInput)
          -: string {                                                    
       97 -  const sourceId = normalizeSourceReviewId(review.sourceReview
          -Id);                                                          
       98 -  if (sourceId !== undefined) return `${SOURCE_ID_KEY_PREFIX}$
          -{sourceId}`;                                                  
      106 +/** Deterministic content fingerprint, stored for every review
          + (reviews.review_fingerprint). */                             
      107 +export function reviewFingerprint(review: ReviewIdentityInput)
          +: string {                                                    
      108    const digest = createHash("sha256").update(reviewFingerprint
           Source(review), "utf8").digest("hex");
      100 -  return `${FINGERPRINT_KEY_PREFIX}${digest}`;                
      109 +  return `${FINGERPRINT_PREFIX}${digest}`;                    
      110  }
      111 
      112 +/** What the matcher needs to know about a review already stor
          +ed for the same target. */                                    
      113 +export interface StoredReviewIdentity {                       
      114 +  id: string;                                                 
      115 +  /** Normalized, as stored. */                               
      116 +  sourceReviewId: string | null;                              
      117 +  fingerprint: string;                                        
      118 +  /** Any totally ordered value; ties break on id. Oldest firs
          +t wins every choice. */                                       
      119 +  createdAt: string | number;                                 
      120 +}                                                             
      121 +                                                              
      122 +export type MatchDecision =                                   
      123 +  | { action: "insert" }                                      
      124 +  | { action: "update"; rowId: string; matchedBy: "source_id" 
          +| "fingerprint" }                                             
      125 +  | { action: "adopt"; rowId: string };                       
      126 +                                                              
      127 +const oldestFirst = (a: StoredReviewIdentity, b: StoredReviewI
          +dentity) =>                                                   
      128 +  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ?
          + 1 : a.id < b.id ? -1 : 1;                                    
      129 +                                                              
      130  /**
      104 - * Keeps the first occurrence of each identity key, in input o
          -rder. The caller must pass reviews                            
      105 - * of a single AnalysisTarget: the database scopes uniqueness 
          -by target.                                                    
      131 + * Decides how one incoming review reconciles with the stored 
          +reviews of ONE target. Mirrors                                
      132 + * public.merge_target_reviews; the database enforces the resu
          +lt with partial unique indexes.                               
      133   */
      107 -export function dedupeReviews<T extends ReviewIdentityInput>( 
      134 +export function matchStoredReview(                            
      135 +  stored: readonly StoredReviewIdentity[],                    
      136 +  incoming: ReviewIdentityInput,                              
      137 +): MatchDecision {                                            
      138 +  const sourceId = normalizeSourceReviewId(incoming.sourceRevi
          +ewId);                                                        
      139 +  const fingerprint = reviewFingerprint(incoming);            
      140 +  const rows = [...stored].sort(oldestFirst);                 
      141 +                                                              
      142 +  if (sourceId !== undefined) {                               
      143 +    const sameId = rows.find((row) => row.sourceReviewId === s
          +ourceId);                                                     
      144 +    if (sameId) return { action: "update", rowId: sameId.id, m
          +atchedBy: "source_id" };                                      
      145 +    // The id appeared: claim the oldest id-less copy instead 
          +of inserting a second record.                                 
      146 +    // A row with a DIFFERENT id is a different review and is 
          +never adopted.                                                
      147 +    const idless = rows.find((row) => row.sourceReviewId === n
          +ull && row.fingerprint === fingerprint);                      
      148 +    if (idless) return { action: "adopt", rowId: idless.id }; 
      149 +    return { action: "insert" };                              
      150 +  }                                                           
      151 +                                                              
      152 +  // The id is missing (or disappeared): match by fingerprint,
          + preferring an id-less row.                                   
      153 +  const match =                                               
      154 +    rows.find((row) => row.sourceReviewId === null && row.fing
          +erprint === fingerprint) ??                                   
      155 +    rows.find((row) => row.fingerprint === fingerprint);      
      156 +  return match                                                
      157 +    ? { action: "update", rowId: match.id, matchedBy: "fingerp
          +rint" }                                                       
      158 +    : { action: "insert" };                                   
      159 +}                                                             
      160 +                                                              
      161 +/**                                                           
      162 + * S3-010 refresh rule for a matched review. Text and rating (
          +always present) take the incoming                             
      163 + * value. Optional fields take the incoming value only when it
          + is present: a missing value never                            
      164 + * erases stored data. A stored source id is never cleared; an
          + id-less row gains the incoming id.                           
      165 + */                                                           
      166 +export function mergeReviewFields(stored: NormalizedReview, in
          +coming: NormalizedReview) {                                   
      167 +  return {                                                    
      168 +    text: incoming.text,                                      
      169 +    rating: incoming.rating,                                  
      170 +    sourceReviewId:                                           
      171 +      normalizeSourceReviewId(stored.sourceReviewId) ??       
      172 +      normalizeSourceReviewId(incoming.sourceReviewId),       
      173 +    reviewerName: incoming.reviewerName ?? stored.reviewerName
          +,                                                             
      174 +    reviewDate: incoming.reviewDate ?? stored.reviewDate,     
      175 +    reviewUrl: incoming.reviewUrl ?? stored.reviewUrl,        
      176 +    sourceMetadata: incoming.sourceMetadata ?? stored.sourceMe
          +tadata,                                                       
      177 +  } satisfies NormalizedReview;                               
      178 +}                                                             
      179 +                                                              
      180 +/**                                                           
      181 + * Applies the same matching and merge rules within one batch 
          +(one target), so the database                                 
      182 + * receives each source review once. Output keeps the position
          + of each review's first occurrence;                           
      183 + * field values merge in batch order, so the last occurrence w
          +ins for every field it provides.                              
      184 + */                                                           
      185 +export function collapseReviews<T extends NormalizedReview>(  
      186    reviews: readonly T[],
      109 -): { reviews: T[]; duplicateCount: number } {                 
      110 -  const seen = new Set<string>();                             
      111 -  const unique: T[] = [];                                     
      187 +): { reviews: NormalizedReview[]; duplicateCount: number } {  
      188 +  const merged: NormalizedReview[] = [];                      
      189 +  const identities: StoredReviewIdentity[] = [];              
      190 +  const identityOf = (review: NormalizedReview, index: number)
          +: StoredReviewIdentity => ({                                  
      191 +    id: String(index).padStart(6, "0"),                       
      192 +    sourceReviewId: normalizeSourceReviewId(review.sourceRevie
          +wId) ?? null,                                                 
      193 +    fingerprint: reviewFingerprint(review),                   
      194 +    createdAt: index,                                         
      195 +  });                                                         
      196 +                                                              
      197    for (const review of reviews) {
      113 -    const key = reviewIdentityKey(review);                    
      114 -    if (seen.has(key)) continue;                              
      115 -    seen.add(key);                                            
      116 -    unique.push(review);                                      
      198 +    const decision = matchStoredReview(identities, review);   
      199 +    if (decision.action === "insert") {                       
      200 +      merged.push({ ...review });                             
      201 +      identities.push(identityOf(review, merged.length - 1)); 
      202 +      continue;                                               
      203 +    }                                                         
      204 +    const index = Number(decision.rowId);                     
      205 +    merged[index] = mergeReviewFields(merged[index], review); 
      206 +    identities[index] = identityOf(merged[index], index);     
      207    }
      118 -  return { reviews: unique, duplicateCount: reviews.length - u
          -nique.length };                                               
      208 +  return { reviews: merged, duplicateCount: reviews.length - m
          +erged.length };                                               
      209  }

⏺ Updating the two callers to use the merging collapse:

⏺ Bash(python3 - <<'PY'
      import re…)
  ⎿  Updated src/services/ingestion/ingestion-lifecycle.ts +6 -4
       7  } from "@/services/analysis-targets/target-ownership";
       8  import { normalizeBatch } from "@/services/reviews/normalize";
       9  import { sanitizeMetadata } from "@/services/reviews/review-ser
          vice";
      10 -import { dedupeReviews } from "@/services/reviews/review-identi
         -ty";                                                           
      10 +import { collapseReviews } from "@/services/reviews/review-iden
         +tity";                                                         
      11  import {
      12    createIngestionAttemptWriter,
      13    getBoundAttempt,
     ...
      239        ),
      240      );
      241    }
      242 -  // S3-011: a provider result can repeat a review; keep its f
          -irst occurrence. Reviews already                              
      243 -  // stored for this target are skipped by the database's (tar
          -get, identity_key) unique index.                              
      242 +  // S3-011: a provider result can repeat a review; repeats me
          +rge (last occurrence wins per                                 
      243 +  // provided field). The database then reconciles each review
          + with the target's stored reviews                             
      244 +  // (source id, adoption, fingerprint) and refreshes matched 
          +rows instead of inserting duplicates.                         
      245    // Duplicates are not "skipped" records: they are not unusab
           le, they are already represented.
      245 -  const rows = dedupeReviews(normalized.reviews).reviews.map((
          -review) => ({                                                 
      246 +  const rows = collapseReviews(normalized.reviews).reviews.map
          +((review) => ({                                               
      247      text: review.text,
      248      rating: review.rating,
      249      source_review_id: review.sourceReviewId ?? null,
     ...
      255    assertIngestionResultWithinLimits(rows, extracted.identity);
      256    // Atomic review insert + result state; duplicate polling ca
           nnot save a completed attempt twice.
      257    // saved_count is the number of NEW reviews; it can be 0 whe
           n every review was already stored.
      258 +  // Matched reviews are refreshed in the same transaction (S3
          +-010).                                                        
      259    const completed = await deps.writer.finish(
      260      bound.id,
      261      ownerId,
  ⎿  Updated src/services/reviews/review-service.ts +8 -6
      1  import { InvalidReviewError, TargetNotFoundError } from "./error
         s";
      2 -import { dedupeReviews } from "./review-identity";              
      2 +import { collapseReviews } from "./review-identity";            
      3  import { toStorableText } from "./storable-text";
      4  import { MAX_RATING, MIN_RATING, type NormalizedReview } from ".
         /types";
      5 
     ...
      23    /** True only if the target exists and belongs to `userId`. *
          /
      24    isTargetOwnedBy(targetId: string, userId: string): Promise<bo
          olean>;
      25    /**
      26 -   * Inserts reviews whose identity key (S3-011) is new for the
         - target and returns only those                                 
      27 -   * rows. A review already stored for the target is left uncha
         -nged and is not returned.                                      
      26 +   * Reconciles reviews with the target's stored reviews (S3-01
         +1, S3-010): new reviews are                                    
      27 +   * inserted; matched reviews keep their id and created_at and
         + have their source fields                                      
      28 +   * refreshed. Returns the rows created or changed; unchanged 
         +matches are not returned.                                      
      29     */
      30    insertReviews(targetId: string, reviews: NormalizedReview[]):
           Promise<Review[]>;
      31    aggregateReviews(targetId: string): Promise<ReviewAggregate>;
     ...
      133   *
      134   * userId MUST come from the verified session (S1-011), never
           from the request body (S1-BR-010).
      135   * Persists nothing if any review is invalid, so a bad batch i
           s never partially saved.
      135 - * S3-011: repeated reviews within the batch collapse to their
          - first occurrence, and the database                           
      136 - * skips reviews already stored for the target. Returns only n
          -ewly created Reviews.                                         
      136 + * S3-011: repeated reviews within the batch are merged (last 
          +occurrence wins per provided field),                          
      137 + * and the database reconciles them with reviews already store
          +d for the target instead of                                   
      138 + * inserting duplicates. Returns the Reviews created or change
          +d.                                                            
      139   */
      140  export async function saveReviews(
      141    store: ReviewStore,
     ...
      152 
      153    return store.insertReviews(
      154      targetId,
      153 -    dedupeReviews(reviews).reviews.map((review) => ({         
      155 +    collapseReviews(reviews).reviews.map((review) => ({       
      156        ...review,
      157        sourceMetadata: sanitizeMetadata(review.sourceMetadata),
      158      })),
  ⎿  Updated src/services/reviews/supabase-review-store.ts +1 -1
      72      async insertReviews(targetId, reviews) {
      73        // The user-scoped RPC derives ownership from auth.uid(),
           validates the complete batch, and
      74        // inserts atomically. Authenticated clients have no dire
          ct INSERT privilege on reviews.
      75 -      // S3-011: it returns only newly inserted rows; reviews a
         -lready stored are skipped.                                     
      75 +      // S3-011: matched reviews are refreshed in place; only c
         +reated or changed rows return.                                 
      76        const { data, error } = await client.rpc(INSERT_RPC, {
      77          p_target_id: targetId,
      78          p_rows: reviews.map(toInsertRow),

⏺ Now rewriting the migration in place, keeping the validated parts of both
  writer functions unchanged:

⏺ Write(supabase/migrations/20261126120000_prevent_duplicate_reviews.sql)
  ⎿  Added 367 lines, removed 133 lines
       1 --- S3-011: Prevent duplicate Reviews during re-ingestion (S3-BR
         --017, S3-BR-018).                                              
       1 +-- S3-011: Prevent duplicate Reviews during re-ingestion (S3-BR
         +-017, S3-BR-018), reconciling                                  
       2 +-- refreshed reviews with updated source fields as S3-010 requi
         +res.                                                           
       3  -- Strategy: docs/s3-011-duplicate-reviews.md. Application twin
          : src/services/reviews/review-identity.ts.
       4  --
       4 --- Every review has one deterministic identity key, unique per 
         -AnalysisTarget:                                                
       5 ---   'sid:' || source review id     when the source supplied a 
         -non-blank id (Outscraper review_id)                            
       6 ---   'fp1:' || sha256 hex            of a normalized fingerprin
         -t otherwise:                                                   
       7 ---     'v1|' || field(reviewer name) || '|' || field(review tim
         -e, UTC epoch ms)                                               
       8 ---           || '|' || field(rating, trim_scale text) || '|' ||
         - field(review text)                                            
       9 ---     field(x) = char_length(x) || ':' || x, or '~' when absen
         -t (delimiter-safe).                                            
      10 ---     Text and reviewer name: NFC, collapse each whitespace ru
         -n (explicit set below) to one space,                           
      11 ---     trim, ASCII-only case folding (lower() depends on collat
         -ion, so it is not used).                                       
      12 --- The key is a STORED generated column, so no caller can choos
         -e or forge it. A unique index on                               
      13 --- (analysis_target_id, identity_key) makes repeated or concurr
         -ent ingestion unable to store a                                
      14 --- second row for the same source review. Writers use ON CONFLI
         -CT DO NOTHING: the first stored                                
      15 --- row is kept unchanged, with its id, created_at, and text. No
         -thing is updated or re-pointed.                                
       5 +-- Identity within ONE AnalysisTarget (never across targets or 
         +accounts):                                                     
       6 +--   source_review_id   nullable, normalized (trimmed; blank ->
         + null). Distinct ids = distinct reviews.                       
       7 +--   review_fingerprint 'fp2:' || sha256 hex, a STORED generate
         +d column on every row:                                         
       8 +--     author-time tier (reviewer name AND review time present)
         +: 'v2|author-time|' f(name) '|' f(ms)                          
       9 +--     content tier (either missing): 'v2|content|' f(name) '|'
         + f(ms) '|' f(rating) '|' f(text)                               
      10 +--     f(x) = char_length(x) || ':' || x, or '~' when absent (d
         +elimiter-safe). Name and text: NFC,                            
      11 +--     whitespace runs (explicit set below) -> one space, trimm
         +ed, ASCII-only case folding.                                   
      12  --
      17 --- Existing data: rows that already share a key within a target
         - are reduced to the oldest row by                              
      18 --- (created_at, id) before the index is created. No table, view
         -, or function references                                       
      19 --- reviews.id (Q&A citations are computed per request and never
         - persisted), so removing the                                   
      20 --- newer copies leaves no dangling reference.                  
      13 +-- Matching (public.merge_target_reviews, one row at a time und
         +er a per-target advisory lock):                                
      14 +--   1. incoming id = stored id                                
         +  -> update that row                                           
      15 +--   2. incoming id not stored, an id-less row has the fingerpr
         +int -> adopt it (set its id)                                   
      16 +--   3. no incoming id, a row has the fingerprint              
         +  -> update it, preferring an id-less                          
      17 +--      row, then the oldest; a stored id is never cleared     
      18 +--   4. otherwise                                              
         +  -> insert                                                    
      19 +-- Updates keep id, created_at, and analysis_target_id. Text an
         +d rating take the incoming value;                              
      20 +-- optional fields take it only when non-null. A row is written
         + only when a value is distinct,                                
      21 +-- and then updated_at moves. Enforced by partial unique indexe
         +s: (target, source_review_id) for                              
      22 +-- rows with an id, and (target, review_fingerprint) for rows w
         +ithout one.                                                    
      23  --
      22 --- Known limitation: two genuinely distinct reviews with no sou
         -rce id, the same reviewer name,                                
      23 --- time, rating, and normalized text are indistinguishable and 
         -are stored once.                                               
      24 +-- Existing data: duplicates are merged into the oldest row of 
         +each group (by created_at, id),                                
      25 +-- which takes the newest non-null value of every source field;
         + foreign keys that reference a                                 
      26 +-- removed copy are re-pointed to the surviving row first.     
      27  --
      25 --- Do not replace review_identity_key in place: stored keys wou
         -ld no longer match new rows.                                   
      26 --- A changed rule needs a new prefix (for example 'fp2:') and a
         - migration that recomputes keys.                               
      28 +-- Do not replace review_fingerprint in place: stored fingerpri
         +nts would stop matching new rows.                              
      29 +-- A changed rule needs a new prefix (for example 'fp3:') and a
         + migration that recomputes them.                               
      30 
      31  begin;
      32 
      33 +lock table public.reviews in access exclusive mode;            
      34 +                                                               
      35 +create function public.review_source_id(p_value text)          
      36 +returns text                                                   
      37 +language sql                                                   
      38 +immutable                                                      
      39 +parallel safe                                                  
      40 +set search_path = ''                                           
      41 +as $$                                                          
      42 +  select nullif(pg_catalog.regexp_replace(                     
      43 +    p_value,                                                   
      44 +    '^[\t\n\v\f\r    -   　]+|[\t\n\v\f\r    -   　]+$',   
      45 +    '',                                                        
      46 +    'g'                                                        
      47 +  ), '')                                                       
      48 +$$;                                                            
      49 +                                                               
      50 +comment on function public.review_source_id(text) is           
      51 +  'S3-011 source id normalization (trim; blank -> null). Must s
         +tay identical to '                                             
      52 +  'normalizeSourceReviewId in src/services/reviews/review-ident
         +ity.ts.';                                                      
      53 +                                                               
      54  create function public.review_identity_text(p_value text)
      55  returns text
      56  language sql
     ...
      80    'S3-011 fingerprint normalization: NFC, collapsed whitespace,
           trimmed, ASCII case folded. '
      81    'Must stay identical to normalizeIdentityText in src/services
          /reviews/review-identity.ts.';
      82 
      59 -create function public.review_identity_key(                    
      60 -  p_source_review_id text,                                     
      83 +create function public.review_fingerprint(                     
      84    p_reviewer_name text,
      85    p_review_date timestamptz,
      86    p_rating numeric,
     ...
       92  parallel safe
       93  set search_path = ''
       94  as $$
       72 -  select case                                                 
       73 -    when source_id.value is not null then 'sid:' || source_id.
          -value                                                         
       74 -    else 'fp1:' || pg_catalog.encode(                         
       75 -      pg_catalog.sha256(pg_catalog.convert_to(                
       76 -        'v1'                                                  
       77 -          || '|' || coalesce(pg_catalog.char_length(reviewer.v
          -alue) || ':' || reviewer.value, '~')                          
       78 -          || '|' || coalesce(pg_catalog.char_length(review_tim
          -e.value) || ':' || review_time.value, '~')                    
       79 -          || '|' || coalesce(pg_catalog.char_length(rating.val
          -ue) || ':' || rating.value, '~')                              
       80 -          || '|' || coalesce(pg_catalog.char_length(body.value
          -) || ':' || body.value, '~'),                                 
       81 -        'UTF8'                                                
       82 -      )),                                                     
       83 -      'hex'                                                   
       84 -    )                                                         
       85 -  end                                                         
       95 +  select 'fp2:' || pg_catalog.encode(                         
       96 +    pg_catalog.sha256(pg_catalog.convert_to(                  
       97 +      case                                                    
       98 +        when author.value is not null and review_time.value is
          + not null then                                                
       99 +          'v2|author-time'                                    
      100 +            || '|' || pg_catalog.char_length(author.value) || 
          +':' || author.value                                           
      101 +            || '|' || pg_catalog.char_length(review_time.value
          +) || ':' || review_time.value                                 
      102 +        else                                                  
      103 +          'v2|content'                                        
      104 +            || '|' || coalesce(pg_catalog.char_length(author.v
          +alue) || ':' || author.value, '~')                            
      105 +            || '|' || coalesce(pg_catalog.char_length(review_t
          +ime.value) || ':' || review_time.value, '~')                  
      106 +            || '|' || coalesce(pg_catalog.char_length(rating.v
          +alue) || ':' || rating.value, '~')                            
      107 +            || '|' || coalesce(pg_catalog.char_length(body.val
          +ue) || ':' || body.value, '~')                                
      108 +      end,                                                    
      109 +      'UTF8'                                                  
      110 +    )),                                                       
      111 +    'hex'                                                     
      112 +  )                                                           
      113    from
       87 -    (select nullif(pg_catalog.regexp_replace(                 
       88 -      p_source_review_id,                                     
       89 -      '^[\t\n\v\f\r    -   　]+|[\t\n\v\f\r    -   　]+$',
       90 -      '',                                                     
       91 -      'g'                                                     
       92 -    ), '') as value) as source_id,                            
       93 -    (select public.review_identity_text(p_reviewer_name) as va
          -lue) as reviewer,                                             
      114 +    (select public.review_identity_text(p_reviewer_name) as va
          +lue) as author,                                               
      115      (select pg_catalog.floor(extract(epoch from p_review_date)
            * 1000)::bigint::text as value)
      116        as review_time,
      117      (select pg_catalog.trim_scale(p_rating)::text as value) as
            rating,
      118      (select public.review_identity_text(p_review_text) as valu
           e) as body
      119  $$;
      120 
      100 -comment on function public.review_identity_key(text, text, tim
          -estamptz, numeric, text) is                                   
      101 -  'S3-011 deterministic review identity key, unique per Analys
          -isTarget. Must stay identical to '                            
      102 -  'reviewIdentityKey in src/services/reviews/review-identity.t
          -s (shared golden vectors).';                                  
      121 +comment on function public.review_fingerprint(text, timestampt
          +z, numeric, text) is                                          
      122 +  'S3-011 deterministic review fingerprint. Must stay identica
          +l to reviewFingerprint in '                                   
      123 +  'src/services/reviews/review-identity.ts (shared golden vect
          +ors).';                                                       
      124 
      104 --- Only the table owner evaluates these (generated column, SEC
          -URITY DEFINER writers, migration).                            
      105 -revoke all on function public.review_identity_text(text) from 
          -public, anon, authenticated;                                  
      106 -revoke all on function public.review_identity_key(text, text, 
          -timestamptz, numeric, text)                                   
      107 -  from public, anon, authenticated;                           
      125 +-- Only the table owner evaluates these (generated column, CHE
          +CK, SECURITY DEFINER writers).                                
      126 +revoke all on function public.review_source_id(text) from publ
          +ic, anon, authenticated, service_role;                        
      127 +revoke all on function public.review_identity_text(text) from 
          +public, anon, authenticated, service_role;                    
      128 +revoke all on function public.review_fingerprint(text, timesta
          +mptz, numeric, text)                                          
      129 +  from public, anon, authenticated, service_role;             
      130 
      109 --- ADD COLUMN takes ACCESS EXCLUSIVE until commit, so no row c
          -an be written between the cleanup                             
      110 --- below and the unique index. Existing rows are computed by t
          -he table rewrite.                                             
      131 +-- Existing ids: one normalized form, so uniqueness cannot be 
          +dodged with whitespace.                                       
      132 +update public.reviews                                         
      133 +set source_review_id = public.review_source_id(source_review_i
          +d)                                                            
      134 +where source_review_id is distinct from public.review_source_i
          +d(source_review_id);                                          
      135 +                                                              
      136 +-- The table rewrite computes fingerprints for existing rows. 
      137  alter table public.reviews
      112 -  add column identity_key text not null generated always as ( 
      113 -    public.review_identity_key(source_review_id, reviewer_name
          -, review_date, rating, review_text)                           
      114 -  ) stored;                                                   
      138 +  add column review_fingerprint text not null generated always
          + as (                                                         
      139 +    public.review_fingerprint(reviewer_name, review_date, rati
          +ng, review_text)                                              
      140 +  ) stored,                                                   
      141 +  add column updated_at timestamptz;                          
      142 +update public.reviews set updated_at = created_at;            
      143 +alter table public.reviews                                    
      144 +  alter column updated_at set default now(),                  
      145 +  alter column updated_at set not null;                       
      146 
      116 -do $$                                                         
      147 +-- -----------------------------------------------------------
          +----------------------------------                            
      148 +-- Existing-data cleanup. Three passes, each merging groups in
          +to their oldest row:                                          
      149 +--   1. rows sharing a source id;  2. id-less rows sharing a f
          +ingerprint;                                                   
      150 +--   3. an id-less row whose fingerprint belongs to exactly on
          +e row with an id (the id appeared                             
      151 +--      after Sprint 1 stored a second copy). Ambiguous finger
          +prints are left untouched.                                    
      152 +-- -----------------------------------------------------------
          +----------------------------------                            
      153 +create temporary table review_merge (                         
      154 +  drop_id uuid primary key,                                   
      155 +  keep_id uuid not null                                       
      156 +) on commit drop;                                             
      157 +                                                              
      158 +create function pg_temp.apply_review_merge()                  
      159 +returns bigint                                                
      160 +language plpgsql                                              
      161 +as $$                                                         
      162  declare
      163 +  reference record;                                           
      164    removed bigint;
      165  begin
      120 -  with ranked as (                                            
      121 -    select review.id,                                         
      122 -      pg_catalog.row_number() over (                          
      123 -        partition by review.analysis_target_id, review.identit
          -y_key                                                         
      124 -        order by review.created_at, review.id                 
      125 -      ) as copy_number                                        
      126 -    from public.reviews review                                
      166 +  if exists (                                                 
      167 +    select 1 from pg_catalog.pg_constraint                    
      168 +    where confrelid = 'public.reviews'::regclass and contype =
          + 'f'                                                          
      169 +      and pg_catalog.cardinality(conkey) <> 1                 
      170 +  ) then                                                      
      171 +    raise exception 'S3-011 cleanup cannot re-point a multi-co
          +lumn reference to reviews';                                   
      172 +  end if;                                                     
      173 +                                                              
      174 +  -- Re-point every single-column foreign key (for example per
          +sisted citations) to the survivor.                            
      175 +  for reference in                                            
      176 +    select constraint_row.conrelid::regclass as table_name, at
          +tribute.attname as column_name                                
      177 +    from pg_catalog.pg_constraint constraint_row              
      178 +    join pg_catalog.pg_attribute attribute                    
      179 +      on attribute.attrelid = constraint_row.conrelid and attr
          +ibute.attnum = constraint_row.conkey[1]                       
      180 +    where constraint_row.confrelid = 'public.reviews'::regclas
          +s and constraint_row.contype = 'f'                            
      181 +  loop                                                        
      182 +    execute pg_catalog.format(                                
      183 +      'update %s as referencing set %I = merge.keep_id from pg
          +_temp.review_merge merge where referencing.%I = merge.drop_id'
          +,                                                             
      184 +      reference.table_name, reference.column_name, reference.c
          +olumn_name                                                    
      185 +    );                                                        
      186 +  end loop;                                                   
      187 +                                                              
      188 +  -- The survivor keeps its id and created_at and takes the ne
          +west non-null source values.                                  
      189 +  with member as (                                            
      190 +    select merge.keep_id, review.*                            
      191 +    from (                                                    
      192 +      select keep_id, drop_id as member_id from pg_temp.review
          +_merge                                                        
      193 +      union                                                   
      194 +      select keep_id, keep_id from pg_temp.review_merge       
      195 +    ) merge                                                   
      196 +    join public.reviews review on review.id = merge.member_id 
      197 +  ), merged as (                                              
      198 +    select keep_id,                                           
      199 +      (pg_catalog.array_agg(review_text order by created_at de
          +sc, id desc))[1] as review_text,                              
      200 +      (pg_catalog.array_agg(rating order by created_at desc, i
          +d desc))[1] as rating,                                        
      201 +      (pg_catalog.array_agg(source_review_id order by created_
          +at desc, id desc)                                             
      202 +        filter (where source_review_id is not null))[1] as sou
          +rce_review_id,                                                
      203 +      (pg_catalog.array_agg(reviewer_name order by created_at 
          +desc, id desc)                                                
      204 +        filter (where reviewer_name is not null))[1] as review
          +er_name,                                                      
      205 +      (pg_catalog.array_agg(review_date order by created_at de
          +sc, id desc)                                                  
      206 +        filter (where review_date is not null))[1] as review_d
          +ate,                                                          
      207 +      (pg_catalog.array_agg(review_url order by created_at des
          +c, id desc)                                                   
      208 +        filter (where review_url is not null))[1] as review_ur
          +l,                                                            
      209 +      (pg_catalog.array_agg(source_metadata order by created_a
          +t desc, id desc)                                              
      210 +        filter (where source_metadata is not null))[1] as sour
          +ce_metadata,                                                  
      211 +      pg_catalog.max(created_at) as updated_at                
      212 +    from member                                               
      213 +    group by keep_id                                          
      214    )
      128 -  delete from public.reviews review                           
      129 -  using ranked                                                
      130 -  where ranked.id = review.id and ranked.copy_number > 1;     
      215 +  update public.reviews review                                
      216 +  set review_text = merged.review_text, rating = merged.rating
          +,                                                             
      217 +    source_review_id = merged.source_review_id, reviewer_name 
          += merged.reviewer_name,                                       
      218 +    review_date = merged.review_date, review_url = merged.revi
          +ew_url,                                                       
      219 +    source_metadata = merged.source_metadata, updated_at = mer
          +ged.updated_at                                                
      220 +  from merged                                                 
      221 +  where review.id = merged.keep_id;                           
      222 +                                                              
      223 +  delete from public.reviews review using pg_temp.review_merge
          + merge where review.id = merge.drop_id;                       
      224    get diagnostics removed = row_count;
      132 -  if removed > 0 then                                         
      133 -    raise notice 'S3-011 removed % duplicate review rows; the 
          -oldest row of each was kept', removed;                        
      225 +  truncate pg_temp.review_merge;                              
      226 +  return removed;                                             
      227 +end                                                           
      228 +$$;                                                           
      229 +                                                              
      230 +do $$                                                         
      231 +declare                                                       
      232 +  by_source_id bigint;                                        
      233 +  by_fingerprint bigint;                                      
      234 +  by_adoption bigint;                                         
      235 +begin                                                         
      236 +  insert into pg_temp.review_merge (drop_id, keep_id)         
      237 +  select id, keep_id from (                                   
      238 +    select id, pg_catalog.first_value(id) over (              
      239 +      partition by analysis_target_id, source_review_id order 
          +by created_at, id                                             
      240 +    ) as keep_id                                              
      241 +    from public.reviews where source_review_id is not null    
      242 +  ) ranked                                                    
      243 +  where id <> keep_id;                                        
      244 +  by_source_id := pg_temp.apply_review_merge();               
      245 +                                                              
      246 +  insert into pg_temp.review_merge (drop_id, keep_id)         
      247 +  select id, keep_id from (                                   
      248 +    select id, pg_catalog.first_value(id) over (              
      249 +      partition by analysis_target_id, review_fingerprint orde
          +r by created_at, id                                           
      250 +    ) as keep_id                                              
      251 +    from public.reviews where source_review_id is null        
      252 +  ) ranked                                                    
      253 +  where id <> keep_id;                                        
      254 +  by_fingerprint := pg_temp.apply_review_merge();             
      255 +                                                              
      256 +  insert into pg_temp.review_merge (drop_id, keep_id)         
      257 +  select                                                      
      258 +    case when (idless.created_at, idless.id) < (owner_row.crea
          +ted_at, owner_row.id)                                         
      259 +      then owner_row.id else idless.id end,                   
      260 +    case when (idless.created_at, idless.id) < (owner_row.crea
          +ted_at, owner_row.id)                                         
      261 +      then idless.id else owner_row.id end                    
      262 +  from public.reviews idless                                  
      263 +  join public.reviews owner_row                               
      264 +    on owner_row.analysis_target_id = idless.analysis_target_i
          +d                                                             
      265 +    and owner_row.review_fingerprint = idless.review_fingerpri
          +nt                                                            
      266 +    and owner_row.source_review_id is not null                
      267 +  where idless.source_review_id is null                       
      268 +    and (                                                     
      269 +      select pg_catalog.count(*) from public.reviews other    
      270 +      where other.analysis_target_id = idless.analysis_target_
          +id                                                            
      271 +        and other.review_fingerprint = idless.review_fingerpri
          +nt                                                            
      272 +        and other.source_review_id is not null                
      273 +    ) = 1;                                                    
      274 +  by_adoption := pg_temp.apply_review_merge();                
      275 +                                                              
      276 +  if by_source_id + by_fingerprint + by_adoption > 0 then     
      277 +    raise notice 'S3-011 merged duplicate review rows: % by so
          +urce id, % by fingerprint, % by adoption',                    
      278 +      by_source_id, by_fingerprint, by_adoption;              
      279    end if;
      280  end
      281  $$;
      282 
      138 -create unique index reviews_target_identity_key_idx           
      139 -  on public.reviews (analysis_target_id, identity_key);       
      283 +drop function pg_temp.apply_review_merge();                   
      284 
      141 -comment on column public.reviews.identity_key is              
      142 -  'S3-011 identity: sid:<source id> or fp1:<sha256 fingerprint
          ->. Generated; unique per target.';                            
      285 +-- The unique partial index below covers the same columns and 
          +predicate.                                                    
      286 +drop index public.reviews_target_source_review_idx;           
      287 +                                                              
      288 +create unique index reviews_target_source_review_id_key       
      289 +  on public.reviews (analysis_target_id, source_review_id)    
      290 +  where source_review_id is not null;                         
      291 +create unique index reviews_target_idless_fingerprint_key     
      292 +  on public.reviews (analysis_target_id, review_fingerprint)  
      293 +  where source_review_id is null;                             
      294 +                                                              
      295 +alter table public.reviews add constraint reviews_source_revie
          +w_id_normalized                                               
      296 +  check (source_review_id is null or source_review_id = public
          +.review_source_id(source_review_id));                         
      297 +                                                              
      298  comment on column public.reviews.source_review_id is
      144 -  'Review id from the source platform. A non-blank id is the r
          -eview identity within its target '                            
      145 -  '(S3-011, reviews_target_identity_key_idx).';               
      299 +  'Normalized review id from the source platform; unique per t
          +arget when present (S3-011).';                                
      300 +comment on column public.reviews.review_fingerprint is        
      301 +  'S3-011 content fingerprint (fp2:). Generated; unique per ta
          +rget among rows without a source id.';                        
      302 +comment on column public.reviews.updated_at is                
      303 +  'Last time a refresh changed this review''s source fields (S
          +3-010); created_at when never changed.';                      
      304 
      305  -- A completion whose reviews are all already stored saved 0 n
           ew rows but still succeeded, and
      306  -- the target still has reviews. Before S3-011 a successful co
           mpletion always inserted rows.
     ...
      312    or (status = 'failed' and finished_at is not null and saved_
           count = 0 and error_code is not null)
      313  );
      314 
      157 --- Same as 20261107030000 except the review insert, which now 
          -collapses repeated reviews and                                
      158 --- skips reviews already stored for the target. saved_count co
          -unts new rows only.                                           
      315 +-- -----------------------------------------------------------
          +----------------------------------                            
      316 +-- Shared reconciliation used by both review writers. Invoker 
          +rights: it runs as the owner only                             
      317 +-- inside the SECURITY DEFINER writers below and is not execut
          +able by any API role.                                         
      318 +-- p_rows uses the insert_reviews field names and must already
          + be validated by the caller.                                  
      319 +-- -----------------------------------------------------------
          +----------------------------------                            
      320 +create function public.merge_target_reviews(p_target_id uuid, 
          +p_rows jsonb)                                                 
      321 +returns table (row_ordinal bigint, review_id uuid, merge_actio
          +n text)                                                       
      322 +language plpgsql                                              
      323 +security invoker                                              
      324 +set search_path = ''                                          
      325 +as $$                                                         
      326 +declare                                                       
      327 +  incoming record;                                            
      328 +  matched_id uuid;                                            
      329 +  incoming_source_id text;                                    
      330 +  incoming_fingerprint text;                                  
      331 +begin                                                         
      332 +  -- Serializes reconciliation per target, so concurrent refre
          +shes cannot both decide to insert                             
      333 +  -- the same review (the two partial indexes alone cannot see
          + an id-less copy vs an id'd copy).                            
      334 +  perform pg_catalog.pg_advisory_xact_lock(                   
      335 +    pg_catalog.hashtextextended('reviewlens:review-merge:' || 
          +p_target_id::text, 0)                                         
      336 +  );                                                          
      337 +                                                              
      338 +  for incoming in                                             
      339 +    select element.ordinal, candidate.*                       
      340 +    from pg_catalog.jsonb_array_elements(p_rows) with ordinali
          +ty as element(value, ordinal),                                
      341 +      lateral pg_catalog.jsonb_to_record(element.value) as can
          +didate(                                                       
      342 +        review_text text, rating numeric, source_review_id tex
          +t, reviewer_name text,                                        
      343 +        review_date timestamptz, review_url text, source_metad
          +ata jsonb                                                     
      344 +      )                                                       
      345 +    order by element.ordinal                                  
      346 +  loop                                                        
      347 +    incoming_source_id := public.review_source_id(incoming.sou
          +rce_review_id);                                               
      348 +    incoming_fingerprint := public.review_fingerprint(        
      349 +      incoming.reviewer_name, incoming.review_date, incoming.r
          +ating, incoming.review_text                                   
      350 +    );                                                        
      351 +    matched_id := null;                                       
      352 +    merge_action := null;                                     
      353 +                                                              
      354 +    if incoming_source_id is not null then                    
      355 +      select stored.id into matched_id from public.reviews sto
          +red                                                           
      356 +      where stored.analysis_target_id = p_target_id and stored
          +.source_review_id = incoming_source_id;                       
      357 +      if matched_id is not null then                          
      358 +        merge_action := 'updated';                            
      359 +      else                                                    
      360 +        select stored.id into matched_id from public.reviews s
          +tored                                                         
      361 +        where stored.analysis_target_id = p_target_id and stor
          +ed.source_review_id is null                                   
      362 +          and stored.review_fingerprint = incoming_fingerprint
      363 +        order by stored.created_at, stored.id                 
      364 +        limit 1;                                              
      365 +        if matched_id is not null then merge_action := 'adopte
          +d'; end if;                                                   
      366 +      end if;                                                 
      367 +    else                                                      
      368 +      select stored.id into matched_id from public.reviews sto
          +red                                                           
      369 +      where stored.analysis_target_id = p_target_id           
      370 +        and stored.review_fingerprint = incoming_fingerprint  
      371 +      order by (stored.source_review_id is not null), stored.c
          +reated_at, stored.id                                          
      372 +      limit 1;                                                
      373 +      if matched_id is not null then merge_action := 'updated'
          +; end if;                                                     
      374 +    end if;                                                   
      375 +                                                              
      376 +    if matched_id is null then                                
      377 +      insert into public.reviews as created (                 
      378 +        analysis_target_id, review_text, rating, source_review
          +_id, reviewer_name, review_date,                              
      379 +        review_url, source_metadata                           
      380 +      ) values (                                              
      381 +        p_target_id, incoming.review_text, incoming.rating, in
          +coming_source_id,                                             
      382 +        incoming.reviewer_name, incoming.review_date, incoming
          +.review_url, incoming.source_metadata                         
      383 +      )                                                       
      384 +      returning created.id into matched_id;                   
      385 +      merge_action := 'inserted';                             
      386 +    else                                                      
      387 +      -- Idempotent refresh: no write, and no updated_at chang
          +e, when nothing differs.                                      
      388 +      update public.reviews stored                            
      389 +      set review_text = incoming.review_text,                 
      390 +        rating = incoming.rating,                             
      391 +        source_review_id = coalesce(stored.source_review_id, i
          +ncoming_source_id),                                           
      392 +        reviewer_name = coalesce(incoming.reviewer_name, store
          +d.reviewer_name),                                             
      393 +        review_date = coalesce(incoming.review_date, stored.re
          +view_date),                                                   
      394 +        review_url = coalesce(incoming.review_url, stored.revi
          +ew_url),                                                      
      395 +        source_metadata = coalesce(incoming.source_metadata, s
          +tored.source_metadata),                                       
      396 +        updated_at = pg_catalog.clock_timestamp()             
      397 +      where stored.id = matched_id                            
      398 +        and (stored.review_text, stored.rating, stored.source_
          +review_id, stored.reviewer_name,                              
      399 +          stored.review_date, stored.review_url, stored.source
          +_metadata)                                                    
      400 +        is distinct from (incoming.review_text, incoming.ratin
          +g,                                                            
      401 +          coalesce(stored.source_review_id, incoming_source_id
          +),                                                            
      402 +          coalesce(incoming.reviewer_name, stored.reviewer_nam
          +e),                                                           
      403 +          coalesce(incoming.review_date, stored.review_date), 
      404 +          coalesce(incoming.review_url, stored.review_url),   
      405 +          coalesce(incoming.source_metadata, stored.source_met
          +adata));                                                      
      406 +      if not found then merge_action := 'unchanged'; end if;  
      407 +    end if;                                                   
      408 +                                                              
      409 +    row_ordinal := incoming.ordinal;                          
      410 +    review_id := matched_id;                                  
      411 +    return next;                                              
      412 +  end loop;                                                   
      413 +end                                                           
      414 +$$;                                                           
      415 +                                                              
      416 +comment on function public.merge_target_reviews(uuid, jsonb) i
          +s                                                             
      417 +  'S3-011/S3-010 reconciliation of a validated batch with one 
          +target''s reviews: update by source '                         
      418 +  'id, adopt an id-less copy, match by fingerprint, else inser
          +t. Internal; owner-only.';                                    
      419 +                                                              
      420 +revoke all on function public.merge_target_reviews(uuid, jsonb
          +)                                                             
      421 +  from public, anon, authenticated, service_role;             
      422 +                                                              
      423 +-- Same as 20261107030000 except the review write, which now r
          +econciles through                                             
      424 +-- merge_target_reviews. saved_count counts new rows only.    
      425  create or replace function public.finish_ingestion_attempt(
      426    p_attempt_id uuid, p_owner_id uuid, p_reviews jsonb, p_skipp
           ed_count integer,
      427    p_identity jsonb, p_error_code text
     ...
      463        or coalesce(btrim(p_identity->>'businessName'), '') = ''
      464        or (attempt.query_kind = 'place_id' and p_identity->>'pl
           aceId' is distinct from attempt.expected_place_id)
      465        then raise exception 'Identity mismatch'; end if;
      200 -    -- S3-011: first occurrence of each identity key wins; sto
          -red reviews are never changed.                                
      201 -    insert into public.reviews(analysis_target_id, review_text
          -, rating, source_review_id, reviewer_name, review_date, review
          -_url, source_metadata)                                        
      202 -      select attempt.analysis_target_id, r.text, r.rating, r.s
          -ource_review_id, r.reviewer_name, r.review_date, r.review_url,
          - r.source_metadata                                            
      203 -      from (                                                  
      204 -        select distinct on (public.review_identity_key(candida
          -te.source_review_id, candidate.reviewer_name,                 
      205 -            candidate.review_date, candidate.rating, candidate
          -.text))                                                       
      206 -          candidate.*, element.ordinal                        
      207 -        from jsonb_array_elements(p_reviews) with ordinality a
          -s element(value, ordinal),                                    
      208 -          lateral jsonb_to_record(element.value) as candidate(
          -text text, rating numeric, source_review_id text,             
      209 -            reviewer_name text, review_date timestamptz, revie
          -w_url text, source_metadata jsonb)                            
      210 -        order by public.review_identity_key(candidate.source_r
          -eview_id, candidate.reviewer_name,                            
      211 -            candidate.review_date, candidate.rating, candidate
          -.text), element.ordinal                                       
      212 -      ) as r                                                  
      213 -      order by r.ordinal                                      
      214 -      on conflict (analysis_target_id, identity_key) do nothin
          -g;                                                            
      215 -    get diagnostics saved = row_count;                        
      466 +    -- S3-011/S3-010: reconcile with stored reviews instead of
          + inserting duplicates.                                        
      467 +    select count(*) filter (where merged.merge_action = 'inser
          +ted') into saved                                              
      468 +    from public.merge_target_reviews(                         
      469 +      attempt.analysis_target_id,                             
      470 +      (select jsonb_agg(jsonb_build_object(                   
      471 +          'review_text', r.value->'text', 'rating', r.value->'
          +rating',                                                      
      472 +          'source_review_id', r.value->'source_review_id', 're
          +viewer_name', r.value->'reviewer_name',                       
      473 +          'review_date', r.value->'review_date', 'review_url',
          + r.value->'review_url',                                       
      474 +          'source_metadata', r.value->'source_metadata'       
      475 +        ) order by r.ordinal)                                 
      476 +        from jsonb_array_elements(p_reviews) with ordinality a
          +s r(value, ordinal))                                          
      477 +    ) as merged;                                              
      478    else
      479      if jsonb_array_length(p_reviews) <> 0 then raise exception
            'Failed attempt cannot save reviews'; end if;
      480      saved := 0;
     ...
      492  revoke all on function public.finish_ingestion_attempt(uuid, u
           uid, jsonb, integer, jsonb, text) from public, anon, authentic
           ated;
      493  grant execute on function public.finish_ingestion_attempt(uuid
           , uuid, jsonb, integer, jsonb, text) to service_role;
      494 
      233 --- Same as 20261108000000 except the insert: repeated reviews 
          -in the batch collapse to their first                          
      234 --- occurrence, reviews already stored for the target are skipp
          -ed, and only new rows are returned.                           
      495 +-- Same as 20261108000000 except the write, which now reconcil
          +es through merge_target_reviews and                           
      496 +-- returns the rows created or changed (each once, in first-oc
          +currence order).                                              
      497  create or replace function public.insert_reviews(p_target_id t
           ext, p_rows jsonb)
      498  returns setof public.reviews
      499  language plpgsql
     ...
      592    end if;
      593 
      594    return query
      333 -    insert into public.reviews as inserted (                  
      334 -      analysis_target_id, review_text, rating, source_review_i
          -d, reviewer_name, review_date,                                
      335 -      review_url, source_metadata                             
      595 +    with merged as (                                          
      596 +      select change.review_id, pg_catalog.min(change.row_ordin
          +al) as first_ordinal                                          
      597 +      from public.merge_target_reviews(target_id, p_rows) as c
          +hange                                                         
      598 +      where change.merge_action <> 'unchanged'                
      599 +      group by change.review_id                               
      600      )
      337 -    select                                                    
      338 -      target_id,                                              
      339 -      review.review_text,                                     
      340 -      review.rating,                                          
      341 -      review.source_review_id,                                
      342 -      review.reviewer_name,                                   
      343 -      review.review_date,                                     
      344 -      review.review_url,                                      
      345 -      review.source_metadata                                  
      346 -    from (                                                    
      347 -      select distinct on (public.review_identity_key(         
      348 -          candidate.source_review_id, candidate.reviewer_name,
          - candidate.review_date,                                       
      349 -          candidate.rating, candidate.review_text             
      350 -        ))                                                    
      351 -        candidate.*, element.ordinal                          
      352 -      from jsonb_array_elements(p_rows) with ordinality as ele
          -ment(value, ordinal),                                         
      353 -        lateral jsonb_to_record(element.value) as candidate(  
      354 -          review_text text,                                   
      355 -          rating numeric,                                     
      356 -          source_review_id text,                              
      357 -          reviewer_name text,                                 
      358 -          review_date timestamptz,                            
      359 -          review_url text,                                    
      360 -          source_metadata jsonb                               
      361 -        )                                                     
      362 -      order by public.review_identity_key(                    
      363 -          candidate.source_review_id, candidate.reviewer_name,
          - candidate.review_date,                                       
      364 -          candidate.rating, candidate.review_text             
      365 -        ),                                                    
      366 -        element.ordinal                                       
      367 -    ) as review                                               
      368 -    order by review.ordinal                                   
      369 -    on conflict (analysis_target_id, identity_key) do nothing 
      370 -    returning inserted.*;                                     
      601 +    select review.*                                           
      602 +    from merged                                               
      603 +    join public.reviews review on review.id = merged.review_id
      604 +    order by merged.first_ordinal;                            
      605  end
      606  $$;
      607 
     ...
      609    'Atomically inserts a validated review batch for a target ow
           ned by auth.uid(). This prevents '
      610    'direct table writes but does not establish provider-authent
           icated review provenance: an '
      611    'authenticated owner may submit reviews through the protecte
           d application endpoint. '
      378 -  'S3-011: returns only new rows; reviews already stored for t
          -he target are skipped.';                                      
      612 +  'S3-011: reconciles with stored reviews and returns only row
          +s it created or changed.';                                    
      613 
      614  revoke all on function public.insert_reviews(text, jsonb) from
            public, anon, authenticated;
      615  grant execute on function public.insert_reviews(text, jsonb) t
           o authenticated;

⏺ I found a bug in insert_reviews: a CTE that writes and then joins
  public.reviews in one statement can't see its own new rows, so I'm splitting
  it into two statements first. · summary

⏺ Update(supabase/migrations/20261126120000_prevent_duplicate_reviews.sql)
  ⎿  Added 14 lines, removed 9 lines
      591      raise exception 'Invalid review batch' using errcode = '23
           514';
      592    end if;
      593 
      594 +  -- Two statements on purpose: a query that wrote rows inside
          + a function cannot see them through                           
      595 +  -- its own snapshot, so the changed rows are read back by a 
          +separate statement.                                           
      596 +  select coalesce(pg_catalog.array_agg(changed.review_id order
          + by changed.first_ordinal), '{}')                             
      597 +  into changed_ids                                            
      598 +  from (                                                      
      599 +    select change.review_id, pg_catalog.min(change.row_ordinal
          +) as first_ordinal                                            
      600 +    from public.merge_target_reviews(target_id, p_rows) as cha
          +nge                                                           
      601 +    where change.merge_action <> 'unchanged'                  
      602 +    group by change.review_id                                 
      603 +  ) as changed;                                               
      604 +                                                              
      605    return query
      595 -    with merged as (                                          
      596 -      select change.review_id, pg_catalog.min(change.row_ordin
          -al) as first_ordinal                                          
      597 -      from public.merge_target_reviews(target_id, p_rows) as c
          -hange                                                         
      598 -      where change.merge_action <> 'unchanged'                
      599 -      group by change.review_id                               
      600 -    )                                                         
      606      select review.*
      602 -    from merged                                               
      603 -    join public.reviews review on review.id = merged.review_id
      604 -    order by merged.first_ordinal;                            
      607 +    from pg_catalog.unnest(changed_ids) with ordinality as wan
          +ted(id, position)                                             
      608 +    join public.reviews review on review.id = wanted.id       
      609 +    order by wanted.position;                                 
      610  end
      611  $$;
      612 

⏺ Update(supabase/migrations/20261126120000_prevent_duplicate_reviews.sql)
  ⎿  Added 1 line
      503  declare
      504    target_id uuid;
      505    caller_id uuid := auth.uid();
      506 +  changed_ids uuid[];                                         
      507  begin
      508    begin
      509      target_id := p_target_id::uuid;

⏺ Starting a fresh throwaway Postgres cluster in the scratchpad (TCP only, like
  before) and applying all migrations:

  Ran 1 shell command (ctrl+o to expand)

⏺ Migrations apply. Quick smoke test of the merge scenarios as the DB owner
  before writing formal tests:

  Ran 1 shell command (ctrl+o to expand)

⏺ Adoption, id-disappearance and distinct-id cases all behave as designed, and
  the source id is trimmed. I'm now regenerating the golden vectors for the new
  fp2 fingerprint and source-id normalization. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ The tiers behave as intended: an edited text keeps the same author-time
  fingerprint, and the content tier applies when the reviewer or date is
  missing. Writing the fixture and checking SQL parity:

⏺ Bash(SP=/private/tmp/claude-503/-Users-deepshah-Desktop-CS490-Review-Lens-AI-F
      antastic-Six/35b6d326-901e-49d1-a6d1-2ece2024ea95/scratchpad && python3 -
      <<PY
      import j…)
  ⎿  Updated tests/fixtures/review-identity-vectors.json +84 -17
      1  {
      2 -  "_comment": "S3-011 golden identity vectors shared by tests/un
        -it/services/reviews/review-identity.test.ts and tests/db/review-
        -deduplication.test.sql. Regenerate only with a new key prefix.",
      2 +  "_comment": "S3-011 golden vectors shared by tests/unit/servic
        +es/reviews/review-identity.test.ts and tests/db/review-deduplica
        +tion.test.sql (source id normalization and fp2 fingerprint). Reg
        +enerate only together with a new fingerprint prefix.",          
      3    "vectors": [
      4      {
      5 -      "name": "source id wins",                                 
      5 +      "name": "source id is kept apart from the fingerprint",   
      6        "input": {
      7          "sourceReviewId": "ChZDSUhNMG9nS0VJQ0FnSUQ",
      8          "reviewerName": "Sam",
     ...
      10          "rating": 5,
      11          "text": "Great food"
      12        },
      13 -      "expectedKey": "sid:ChZDSUhNMG9nS0VJQ0FnSUQ"             
      13 +      "expectedSourceId": "ChZDSUhNMG9nS0VJQ0FnSUQ",           
      14 +      "expectedFingerprint": "fp2:3af14646e357d68471b2896d85345
         +bbf21a6635e7a2e7fcdcee0a07015c52153"                           
      15      },
      16      {
      17        "name": "source id is trimmed but case-sensitive",
     ...
      20          "rating": 5,
      21          "text": "Great food"
      22        },
      22 -      "expectedKey": "sid:ChZdsuhm0OGs"                        
      23 +      "expectedSourceId": "ChZdsuhm0OGs",                      
      24 +      "expectedFingerprint": "fp2:526e451be218989e0d480dd82294c
         +cddd34710dae5100bcb6814126540f8931e"                           
      25      },
      26      {
      25 -      "name": "blank source id falls back to fingerprint",     
      27 +      "name": "blank source id normalizes to null",            
      28        "input": {
      29          "sourceReviewId": " \u3000 ",
      30          "reviewerName": "Sam",
     ...
      32          "rating": 5,
      33          "text": "Great food"
      34        },
      33 -      "expectedKey": "fp1:6bd379fbbe27f34d6ccfdc1d9737478a88c11
         -589a581e08743882a0a0b3367b4"                                   
      35 +      "expectedSourceId": null,                                
      36 +      "expectedFingerprint": "fp2:3af14646e357d68471b2896d85345
         +bbf21a6635e7a2e7fcdcee0a07015c52153"                           
      37      },
      38      {
     … +153 lines (ctrl+o to expand)

⏺ All 19 vectors match in SQL. Running the existing DB suite to see what the new
  semantics break:

  Ran 1 shell command (ctrl+o to expand)

⏺ Only my new DB test is outdated, since it still checks the removed
  identity_key. I'm rewriting it around the reviewer's scenarios, detecting
  writes via ctid and updated_at because everything in one transaction shares a
  created_at. · summary
⏺ Write(tests/db/review-deduplication.test.sql)
  ⎿  Added 296 lines, removed 147 lines
       1 --- S3-011 database tests: review identity keys, the (target, id
         -entity_key) unique index, and the                              
       2 --- ON CONFLICT DO NOTHING behavior of both review writers (S3-B
         -R-017, S3-BR-018).                                             
       1 +-- S3-011 database tests: review identity (normalized source id
         + + fingerprint), the partial unique                            
       2 +-- indexes, and reconciliation by both review writers (S3-BR-01
         +7, S3-BR-018, S3-010 refresh).                                 
       3  -- Run with `npm run test:db` (from the repository root, for th
          e shared vector fixture).
       4 +-- Numbers in brackets refer to the PR review's regression list
         +.                                                              
       5  --
       5 --- User A: b3110000-0000-4000-8000-0000000000a1 (targets A1, A2
         -)                                                              
       6 --- User B: b3110000-0000-4000-8000-0000000000b1 (target B)     
       6 +-- User A: b3110000-0000-4000-8000-0000000000a1 (targets 01..08
         +)                                                              
       7 +-- User B: b3110000-0000-4000-8000-0000000000b1 (target b1)    
       8 +-- Everything runs in one transaction, so rows share created_at
         +; writes are detected by ctid                                  
       9 +-- (every UPDATE creates a new row version) and updated_at (clo
         +ck time of the change).                                        
      10 
      11  \set ON_ERROR_STOP on
      12  \set QUIET on
     ...
      19  insert into auth.users (id) values
      20    ('b3110000-0000-4000-8000-0000000000a1'),
      21    ('b3110000-0000-4000-8000-0000000000b1');
      22 +insert into public.analysis_targets (id, owner_id, name, platfo
         +rm, source_url, google_place_id)                               
      23 +select ('b3110000-0000-4000-8000-0000000000' || lpad(n::text, 2
         +, '0'))::uuid,                                                 
      24 +  'b3110000-0000-4000-8000-0000000000a1', 'Dedupe ' || n, 'goog
         +le_maps',                                                      
      25 +  'https://www.google.com/maps/place/Dedupe' || n, 'ChIJDedupe'
         + || n                                                          
      26 +from generate_series(1, 8) n;                                  
      27  insert into public.analysis_targets (id, owner_id, name, platfo
          rm, source_url, google_place_id) values
      20 -  ('b3110000-0000-4000-8000-00000000a1a1', 'b3110000-0000-4000-
         -8000-0000000000a1',                                            
      21 -   'Dedupe A1', 'google_maps', 'https://www.google.com/maps/pla
         -ce/DedupeA1', 'ChIJDedupeA1'),                                 
      22 -  ('b3110000-0000-4000-8000-00000000a2a2', 'b3110000-0000-4000-
         -8000-0000000000a1',                                            
      23 -   'Dedupe A2', 'google_maps', 'https://www.google.com/maps/pla
         -ce/DedupeA2', 'ChIJDedupeA2'),                                 
      24 -  ('b3110000-0000-4000-8000-00000000b1b1', 'b3110000-0000-4000-
         -8000-0000000000b1',                                            
      28 +  ('b3110000-0000-4000-8000-0000000000b1', 'b3110000-0000-4000-
         +8000-0000000000b1',                                            
      29     'Dedupe B', 'google_maps', 'https://www.google.com/maps/plac
          e/DedupeB', 'ChIJDedupeB');
      30 
      31 +-- Stand-in for a future table that references reviews (for exa
         +mple persisted Q&A citations).                                 
      32 +create temporary table citation_fixture (                      
      33 +  citation text primary key,                                   
      34 +  review_id uuid not null references public.reviews (id)       
      35 +);                                                             
      36 +                                                               
      37  -- ------------------------------------------------------------
          ---------------------------------
      38  -- Schema, privileges, and parity with the application implemen
          tation
      39  -- ------------------------------------------------------------
          ---------------------------------
      40  do $$
      41  declare
      32 -  index_definition text;                                       
      42    helper regprocedure;
      43  begin
      35 -  select pg_catalog.pg_get_indexdef(index.indexrelid) into stri
         -ct index_definition                                            
      36 -  from pg_catalog.pg_index index                               
      37 -  where index.indexrelid = 'public.reviews_target_identity_key_
         -idx'::regclass                                                 
      38 -    and index.indisunique;                                     
      39 -  assert index_definition like '%(analysis_target_id, identity_
         -key)%',                                                        
      40 -    'identity uniqueness is not scoped to the target';         
      44 +  assert pg_catalog.pg_get_indexdef('public.reviews_target_sour
         +ce_review_id_key'::regclass)                                   
      45 +    like 'CREATE UNIQUE INDEX % (analysis_target_id, source_rev
         +iew_id) WHERE (source_review_id IS NOT NULL)',                 
      46 +    'source ids are not unique per target';                    
      47 +  assert pg_catalog.pg_get_indexdef('public.reviews_target_idle
         +ss_fingerprint_key'::regclass)                                 
      48 +    like 'CREATE UNIQUE INDEX % (analysis_target_id, review_fin
         +gerprint) WHERE (source_review_id IS NULL)',                   
      49 +    'fingerprints of id-less reviews are not unique per target'
         +;                                                              
      50 +  assert to_regclass('public.reviews_target_source_review_idx')
         + is null,                                                      
      51 +    'the redundant non-unique source id index remains';        
      52 +  assert (select attgenerated = 's' and attnotnull from pg_cata
         +log.pg_attribute                                               
      53 +    where attrelid = 'public.reviews'::regclass and attname = '
         +review_fingerprint'),                                          
      54 +    'review_fingerprint is not a stored, non-null generated col
         +umn';                                                          
      55 +  assert (select attnotnull from pg_catalog.pg_attribute       
      56 +    where attrelid = 'public.reviews'::regclass and attname = '
         +updated_at'), 'updated_at is nullable';                        
      57 
      42 -  assert (                                                     
      43 -    select attgenerated = 's' and attnotnull                   
      44 -    from pg_catalog.pg_attribute                               
      45 -    where attrelid = 'public.reviews'::regclass and attname = '
         -identity_key'                                                  
      46 -  ), 'identity_key is not a stored, non-null generated column';
      47 -                                                               
      58    foreach helper in array array[
      59 +    'public.review_source_id(text)'::regprocedure,             
      60      'public.review_identity_text(text)'::regprocedure,
      50 -    'public.review_identity_key(text,text,timestamptz,numeric,t
         -ext)'::regprocedure                                            
      61 +    'public.review_fingerprint(text,timestamptz,numeric,text)':
         +:regprocedure,                                                 
      62 +    'public.merge_target_reviews(uuid,jsonb)'::regprocedure    
      63    ] loop
      52 -    assert (select provolatile = 'i' and not prosecdef and proc
         -onfig = array['search_path=""']                                
      53 -      from pg_catalog.pg_proc where oid = helper), format('%s i
         -s not a fixed immutable helper', helper);                      
      64 +    assert (select not prosecdef and proconfig = array['search_
         +path=""']                                                      
      65 +      from pg_catalog.pg_proc where oid = helper), format('%s i
         +s not a fixed invoker helper', helper);                        
      66      assert not has_function_privilege('anon', helper, 'EXECUTE'
          ), format('anon can run %s', helper);
      67      assert not has_function_privilege('authenticated', helper,
          'EXECUTE'),
      68        format('authenticated can run %s', helper);
      69 +    assert not has_function_privilege('service_role', helper, '
         +EXECUTE'),                                                     
      70 +      format('service_role can run %s', helper);               
      71    end loop;
      72 
      59 -  assert not has_column_privilege('authenticated', 'public.revi
         -ews', 'identity_key', 'INSERT'),                               
      60 -    'authenticated can insert identity_key';                   
      61 -  assert not has_column_privilege('authenticated', 'public.revi
         -ews', 'identity_key', 'UPDATE'),                               
      62 -    'authenticated can update identity_key';                   
      73 +  foreach helper in array array[                               
      74 +    'public.insert_reviews(text,jsonb)'::regprocedure,         
      75 +    'public.finish_ingestion_attempt(uuid,uuid,jsonb,integer,js
         +onb,text)'::regprocedure                                       
      76 +  ] loop                                                       
      77 +    assert (select prosecdef and proconfig = array['search_path
         +=""']                                                          
      78 +      from pg_catalog.pg_proc where oid = helper), format('%s l
         +ost its definer settings', helper);                            
      79 +  end loop;                                                    
      80 +  assert has_function_privilege('authenticated', 'public.insert
         +_reviews(text,jsonb)', 'EXECUTE');                             
      81 +  assert not has_function_privilege('authenticated',           
      82 +    'public.finish_ingestion_attempt(uuid,uuid,jsonb,integer,js
         +onb,text)', 'EXECUTE');                                        
      83 +                                                               
      84 +  assert not has_column_privilege('authenticated', 'public.revi
         +ews', 'review_fingerprint', 'INSERT');                         
      85 +  assert not has_column_privilege('authenticated', 'public.revi
         +ews', 'updated_at', 'UPDATE');                                 
      86  end
      87  $$;
      65 -\echo 'ok - identity_key is generated, target-scoped unique, an
         -d its helpers are owner-only'                                  
      88 +\echo 'ok - partial unique indexes, generated fingerprint, and 
         +owner-only helpers are in place'                               
      89 
      90  do $$
      91  declare
     ...
       94  begin
       95    for vector in select value from jsonb_array_elements((curren
           t_setting('test.vectors'))::jsonb->'vectors')
       96    loop
       74 -    if public.review_identity_key(                            
       75 -      vector->'input'->>'sourceReviewId',                     
       76 -      vector->'input'->>'reviewerName',                       
       77 -      (vector->'input'->>'reviewDate')::timestamptz,          
       78 -      (vector->'input'->>'rating')::numeric,                  
       79 -      vector->'input'->>'text'                                
       80 -    ) is distinct from vector->>'expectedKey' then            
       97 +    if public.review_fingerprint(                             
       98 +        vector->'input'->>'reviewerName',                     
       99 +        (vector->'input'->>'reviewDate')::timestamptz,        
      100 +        (vector->'input'->>'rating')::numeric,                
      101 +        vector->'input'->>'text'                              
      102 +      ) is distinct from vector->>'expectedFingerprint'       
      103 +      or public.review_source_id(vector->'input'->>'sourceRevi
          +ewId')                                                        
      104 +        is distinct from vector->>'expectedSourceId' then     
      105        raise warning 'identity vector mismatch: %', vector->>'n
           ame';
      106        mismatches := mismatches + 1;
      107      end if;
      108    end loop;
       85 -  assert mismatches = 0, 'SQL identity keys differ from the ap
          -plication golden vectors';                                    
       86 -  assert (select count(*) from jsonb_array_elements((current_s
          -etting('test.vectors'))::jsonb->'vectors')) >= 10,            
      109 +  assert mismatches = 0, 'SQL identity differs from the applic
          +ation golden vectors';                                        
      110 +  assert (select count(*) from jsonb_array_elements((current_s
          +etting('test.vectors'))::jsonb->'vectors')) >= 15,            
      111      'golden vectors were not loaded';
      112  end
      113  $$;
       90 -\echo 'ok - SQL identity keys match the shared application gol
          -den vectors'                                                  
      114 +\echo 'ok - SQL fingerprints and source id normalization match
          + the shared golden vectors'                                   
      115 
      116  do $$
      117  begin
       94 -  insert into public.reviews (analysis_target_id, review_text,
          - rating, identity_key)                                        
       95 -  values ('b3110000-0000-4000-8000-00000000a1a1', 'forged', 4,
          - 'sid:forged');                                               
       96 -  raise exception 'a caller chose identity_key';              
       97 -exception                                                     
       98 -  when generated_always then null;                            
      118 +  begin                                                       
      119 +    insert into public.reviews (analysis_target_id, review_tex
          +t, rating, review_fingerprint)                                
      120 +    values ('b3110000-0000-4000-8000-000000000001', 'forged', 
          +4, 'fp2:forged');                                             
      121 +    raise exception 'a caller chose review_fingerprint';      
      122 +  exception when generated_always then null;                  
      123 +  end;                                                        
      124 +  begin                                                       
      125 +    insert into public.reviews (analysis_target_id, review_tex
          +t, rating, source_review_id)                                  
      126 +    values ('b3110000-0000-4000-8000-000000000001', 'padded id
          +', 4, ' g-padded ');                                          
      127 +    raise exception 'a non-normalized source id was stored';  
      128 +  exception when check_violation then null;                   
      129 +  end;                                                        
      130  end
      131  $$;
      101 -\echo 'ok - no writer can choose or forge identity_key'       
      132 +\echo 'ok - fingerprints cannot be forged and stored source id
          +s are always normalized'                                      
      133 
      134  -- -----------------------------------------------------------
           ----------------------------------
      104 --- insert_reviews: within a batch, across repeated batches, an
          -d across targets and users                                    
      135 +-- Reconciliation through insert_reviews, as the owning user  
      136  -- -----------------------------------------------------------
           ----------------------------------
      137  set role authenticated;
      138  set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-000
           0000000a1"}';
      139 
      140 +create temporary table observed (label text primary key, revie
          +w_id uuid, created_at timestamptz,                            
      141 +  updated_at timestamptz, row_version tid);                   
      142 +grant all on observed to authenticated;                       
      143 +                                                              
      144 +-- [1] + [11]: first without an id, then with one.            
      145  do $$
      146  declare
      111 -  first_batch jsonb := '[                                     
      112 -    {"review_text":"Loved it","rating":5,"source_review_id":"g
          --1","reviewer_name":"Ana"},                                   
      113 -    {"review_text":"Edited copy of g-1","rating":1,"source_rev
          -iew_id":"g-1"},                                               
      114 -    {"review_text":"No id here","rating":3,"reviewer_name":"Bo
          -","review_date":"2026-10-02T08:00:00.000Z"},                  
      115 -    {"review_text":"  NO   id here ","rating":3,"reviewer_name
          -":" bo ","review_date":"2026-10-02T08:00:00.000Z"},           
      116 -    {"review_text":"No id here","rating":4,"reviewer_name":"Bo
          -","review_date":"2026-10-02T08:00:00.000Z"}                   
      117 -  ]';                                                         
      118 -  saved text[];                                               
      147 +  saved public.reviews;                                       
      148  begin
      120 -  select array_agg(review_text) into saved                    
      121 -  from public.insert_reviews('b3110000-0000-4000-8000-00000000
          -a1a1', first_batch);                                          
      122 -  assert saved = array['Loved it', 'No id here', 'No id here']
          -,                                                             
      123 -    format('within-batch duplicates were not collapsed to firs
          -t occurrences in order: %s', saved);                          
      124 -  assert (select rating from public.reviews where source_revie
          -w_id = 'g-1') = 5,                                            
      125 -    'a later duplicate in the batch replaced the first occurre
          -nce';                                                         
      149 +  select * into strict saved from public.insert_reviews('b3110
          +000-0000-4000-8000-000000000001',                             
      150 +    '[{"review_text":"Lovely terrace","rating":4,"reviewer_nam
          +e":"Ann","review_date":"2026-10-01T09:00:00Z"}]');            
      151 +  assert saved.source_review_id is null;                      
      152 +  insert into observed values ('id-appears', saved.id, saved.c
          +reated_at, saved.updated_at, null);                           
      153 +end                                                           
      154 +$$;                                                           
      155 +reset role;                                                   
      156 +insert into citation_fixture                                  
      157 +  select 'cites-id-appears', review_id from observed where lab
          +el = 'id-appears';                                            
      158 +set role authenticated;                                       
      159 +do $$                                                         
      160 +declare                                                       
      161 +  saved public.reviews;                                       
      162 +  before observed;                                            
      163 +begin                                                         
      164 +  select * into strict before from observed where label = 'id-
          +appears';                                                     
      165 +  select * into strict saved from public.insert_reviews('b3110
          +000-0000-4000-8000-000000000001',                             
      166 +    '[{"review_text":"Lovely terrace, great staff","rating":5,
          +"source_review_id":"g-1","reviewer_name":" ANN ","review_date"
          +:"2026-10-01T09:00:00Z"}]');                                  
      167 +  assert saved.id = before.review_id, 'the id-less review was 
          +not adopted';                                                 
      168 +  assert saved.created_at = before.created_at, 'adoption chang
          +ed created_at';                                               
      169 +  assert saved.source_review_id = 'g-1', 'adoption did not rec
          +ord the source id';                                           
      170 +  assert saved.review_text = 'Lovely terrace, great staff' and
          + saved.rating = 5,                                            
      171 +    'adoption did not refresh the source fields';             
      172 +  assert (select count(*) from public.reviews                 
      173 +    where analysis_target_id = 'b3110000-0000-4000-8000-000000
          +000001') = 1, 'adoption inserted a row';                      
      174 +end                                                           
      175 +$$;                                                           
      176 +\echo 'ok - [1] an id that appears adopts the id-less row: one
          + row, same id and created_at'                                 
      177 
      127 -  -- (a) the same batch again creates nothing and changes noth
          -ing.                                                          
      128 -  assert (select count(*) from public.insert_reviews('b3110000
          --0000-4000-8000-00000000a1a1', first_batch)) = 0,             
      129 -    'a repeated batch stored new rows';                       
      130 -  assert (select count(*) from public.reviews where analysis_t
          -arget_id = 'b3110000-0000-4000-8000-00000000a1a1') = 3,       
      131 -    'a repeated batch changed the target review count';       
      178 +-- [2]: first with an id, then without one.                   
      179 +do $$                                                         
      180 +declare                                                       
      181 +  saved public.reviews;                                       
      182 +begin                                                         
      183 +  select * into strict saved from public.insert_reviews('b3110
          +000-0000-4000-8000-000000000002',                             
      184 +    '[{"review_text":"Fine","rating":3,"source_review_id":"g-2
          +","reviewer_name":"Bo","review_date":"2026-10-02T10:00:00Z"}]'
          +);                                                            
      185 +  assert (select count(*) from public.insert_reviews('b3110000
          +-0000-4000-8000-000000000002',                                
      186 +    '[{"review_text":"Fine","rating":3,"reviewer_name":"Bo","r
          +eview_date":"2026-10-02T10:00:00Z"}]')) = 0,                  
      187 +    'an id-less copy of a stored review was written';         
      188 +  assert (select review_text from public.insert_reviews('b3110
          +000-0000-4000-8000-000000000002',                             
      189 +    '[{"review_text":"Fine, actually good","rating":4,"reviewe
          +r_name":"Bo","review_date":"2026-10-02T10:00:00Z"}]'))        
      190 +    = 'Fine, actually good', 'an id-less edit did not refresh 
          +the stored review';                                           
      191 +  assert (select array_agg(id::text || ':' || source_review_id
          +) from public.reviews                                         
      192 +    where analysis_target_id = 'b3110000-0000-4000-8000-000000
          +000002') = array[saved.id::text || ':g-2'],                   
      193 +    'an id that disappeared created a row or cleared the store
          +d id';                                                        
      194 +end                                                           
      195 +$$;                                                           
      196 +\echo 'ok - [2] an id that disappears matches by fingerprint a
          +nd keeps the stored id'                                       
      197 
      133 -  -- (c)/(d) a later batch repeats an id and a fingerprint, an
          -d adds one genuinely new review.                              
      134 -  select array_agg(review_text) into saved                    
      135 -  from public.insert_reviews('b3110000-0000-4000-8000-00000000
          -a1a1', '[                                                     
      136 -    {"review_text":"Loved it (provider edit)","rating":4,"sour
          -ce_review_id":"g-1"},                                         
      137 -    {"review_text":"no id here","rating":3,"reviewer_name":"BO
          -","review_date":"2026-10-02T08:00:00.000Z"},                  
      138 -    {"review_text":"Brand new","rating":2,"source_review_id":"
          -g-2"}                                                         
      139 -  ]');                                                        
      140 -  assert saved = array['Brand new'], format('a later batch sto
          -red %s', saved);                                              
      141 -  assert (select review_text from public.reviews where source_
          -review_id = 'g-1') = 'Loved it',                              
      142 -    'ON CONFLICT changed a stored review';                    
      198 +-- [3]: identical content, different ids.                     
      199 +do $$                                                         
      200 +begin                                                         
      201 +  assert (select count(*) from public.insert_reviews('b3110000
          +-0000-4000-8000-000000000003', '[                             
      202 +    {"review_text":"Same words","rating":4,"source_review_id":
          +"g-3a","reviewer_name":"Cy","review_date":"2026-10-03T08:00:00
          +Z"},                                                          
      203 +    {"review_text":"Same words","rating":4,"source_review_id":
          +"g-3b","reviewer_name":"Cy","review_date":"2026-10-03T08:00:00
          +Z"}                                                           
      204 +  ]')) = 2, 'distinct source ids were collapsed';             
      205 +  perform public.insert_reviews('b3110000-0000-4000-8000-00000
          +0000003',                                                     
      206 +    '[{"review_text":"Same words","rating":4,"reviewer_name":"
          +Cy","review_date":"2026-10-03T08:00:00Z"}]');                 
      207 +  assert (select array_agg(source_review_id order by source_re
          +view_id) from public.reviews                                  
      208 +    where analysis_target_id = 'b3110000-0000-4000-8000-000000
          +000003') = array['g-3a', 'g-3b'],                             
      209 +    'reviews with different ids were merged or an id-less copy
          + was inserted';                                               
      210 +end                                                           
      211 +$$;                                                           
      212 +\echo 'ok - [3] identical content with different source ids st
          +ays two reviews'                                              
      213 
      144 -  -- (f) the same reviews under another target of the same use
          -r are separate records.                                       
      145 -  assert (select count(*) from public.insert_reviews('b3110000
          --0000-4000-8000-00000000a2a2', first_batch)) = 3,             
      146 -    'identity was not scoped to the target';                  
      214 +-- [4] (runtime part): at most one id-less row per fingerprint
          +, and an id adopts exactly it.                                
      215 +reset role;                                                   
      216 +do $$                                                         
      217 +declare                                                       
      218 +  adopted uuid;                                               
      219 +begin                                                         
      220 +  insert into public.reviews (analysis_target_id, review_text,
          + rating, reviewer_name)                                       
      221 +  values ('b3110000-0000-4000-8000-000000000004', 'Nice', 4, '
          +Dee') returning id into adopted;                              
      222 +  begin                                                       
      223 +    insert into public.reviews (analysis_target_id, review_tex
          +t, rating, reviewer_name)                                     
      224 +    values ('b3110000-0000-4000-8000-000000000004', '  NICE ',
          + 4, 'dee');                                                   
      225 +    raise exception 'a second id-less row with the same finger
          +print was stored';                                            
      226 +  exception when unique_violation then null;                  
      227 +  end;                                                        
      228 +  -- Different ids never block each other, even with an identi
          +cal fingerprint.                                              
      229 +  insert into public.reviews (analysis_target_id, review_text,
          + rating, reviewer_name, source_review_id)                     
      230 +  values ('b3110000-0000-4000-8000-000000000004', 'Nice', 4, '
          +Dee', 'g-4x'),                                                
      231 +    ('b3110000-0000-4000-8000-000000000004', 'Nice', 4, 'Dee',
          + 'g-4y');                                                     
      232 +  assert (select review_id from public.merge_target_reviews('b
          +3110000-0000-4000-8000-000000000004',                         
      233 +    '[{"review_text":"Nice","rating":4,"reviewer_name":"Dee","
          +source_review_id":"g-4"}]')) = adopted,                       
      234 +    'the id-less row was not the one adopted';                
      235 +  assert (select count(*) from public.reviews where analysis_t
          +arget_id = 'b3110000-0000-4000-8000-000000000004') = 3;       
      236  end
      237  $$;
      149 -\echo 'ok - insert_reviews collapses repeats in a batch, skips
          - stored reviews, and inserts new ones'                        
      238 +\echo 'ok - [4] an incoming id adopts the single id-less copy;
          + ids never block each other'                                  
      239 
      151 -set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-000
          -0000000b1"}';                                                 
      240 +set role authenticated;                                       
      241 +set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-000
          +0000000a1"}';                                                 
      242 +                                                              
      243 +-- [5] + [7]: refreshed fields update in place; missing fields
          + keep stored values.                                          
      244  do $$
      245 +declare                                                       
      246 +  first_save public.reviews;                                  
      247 +  refreshed public.reviews;                                   
      248  begin
      154 -  assert (select count(*) from public.insert_reviews('b3110000
          --0000-4000-8000-00000000b1b1', '[                             
      155 -    {"review_text":"Loved it","rating":5,"source_review_id":"g
          --1","reviewer_name":"Ana"},                                   
      156 -    {"review_text":"No id here","rating":3,"reviewer_name":"Bo
          -","review_date":"2026-10-02T08:00:00.000Z"}                   
      157 -  ]')) = 2, 'another user''s identical reviews were treated as
          - duplicates';                                                 
      158 -  assert (select count(*) from public.reviews) = 2, 'User B ca
          -n see User A''s reviews';                                     
      249 +  select * into strict first_save from public.insert_reviews('
          +b3110000-0000-4000-8000-000000000005',                        
      250 +    '[{"review_text":"Old text","rating":2,"source_review_id":
          +"g-5","reviewer_name":"Di","review_date":"2026-10-05T07:00:00Z
          +","review_url":"https://maps.google.com/review/5","source_meta
          +data":{"platform":"google_maps"}}]');                         
      251 +  select * into strict refreshed from public.insert_reviews('b
          +3110000-0000-4000-8000-000000000005',                         
      252 +    '[{"review_text":"New text","rating":5,"source_review_id":
          +"g-5"}]');                                                    
      253 +  assert refreshed.id = first_save.id and refreshed.created_at
          + = first_save.created_at                                      
      254 +    and refreshed.analysis_target_id = first_save.analysis_tar
          +get_id, 'refresh replaced the row';                           
      255 +  assert refreshed.review_text = 'New text' and refreshed.rati
          +ng = 5, 'refresh did not update fields';                      
      256 +  assert refreshed.reviewer_name = 'Di' and refreshed.review_d
          +ate = '2026-10-05T07:00:00Z'                                  
      257 +    and refreshed.review_url = 'https://maps.google.com/review
          +/5'                                                           
      258 +    and refreshed.source_metadata = '{"platform":"google_maps"
          +}', 'a missing field erased stored data';                     
      259 +  assert refreshed.updated_at > first_save.updated_at, 'refres
          +h did not move updated_at';                                   
      260 +  insert into observed select 'refreshed', id, created_at, upd
          +ated_at, ctid                                                 
      261 +    from public.reviews where id = refreshed.id;              
      262  end
      263  $$;
      161 -\echo 'ok - identical reviews of different users are never ded
          -uplicated across accounts'                                    
      264 +\echo 'ok - [5][7] a refresh updates text and rating in place 
          +and never erases stored fields'                               
      265 
      163 -reset role;                                                   
      266 +-- [6]: an identical refresh writes nothing.                  
      267 +do $$                                                         
      268 +declare                                                       
      269 +  before observed;                                            
      270 +begin                                                         
      271 +  select * into strict before from observed where label = 'ref
          +reshed';                                                      
      272 +  assert (select count(*) from public.insert_reviews('b3110000
          +-0000-4000-8000-000000000005',                                
      273 +    '[{"review_text":"New text","rating":5.0,"source_review_id
          +":"g-5","reviewer_name":"Di"}]')) = 0,                        
      274 +    'an identical refresh reported a change';                 
      275 +  assert (select ctid = before.row_version and updated_at = be
          +fore.updated_at                                               
      276 +    from public.reviews where id = before.review_id), 'an iden
          +tical refresh rewrote the row';                               
      277 +end                                                           
      278 +$$;                                                           
      279 +\echo 'ok - [6] an identical refresh does not write or move up
          +dated_at'                                                     
      280 
      281 +-- [8]: repeats within one batch and across batches; the last 
          +occurrence wins.                                              
      282  do $$
      283 +declare                                                       
      284 +  returned text[];                                            
      285  begin
      167 -  insert into public.reviews (analysis_target_id, review_text,
          - rating, source_review_id)                                    
      168 -  values ('b3110000-0000-4000-8000-00000000a1a1', 'Direct dupl
          -icate', 5, 'g-2');                                            
      169 -  raise exception 'a direct duplicate insert bypassed the uniq
          -ue index';                                                    
      170 -exception                                                     
      171 -  when unique_violation then null;                            
      286 +  select array_agg(review_text) into returned from public.inse
          +rt_reviews('b3110000-0000-4000-8000-000000000006', '[         
      287 +    {"review_text":"first","rating":1,"source_review_id":"g-8"
          +,"reviewer_name":"Eve"},                                      
      288 +    {"review_text":"v1","rating":3,"reviewer_name":"Fay","revi
          +ew_date":"2026-10-06T06:00:00Z"},                             
      289 +    {"review_text":"second","rating":2,"source_review_id":"g-8
          +"},                                                           
      290 +    {"review_text":"v2","rating":4,"reviewer_name":" fay","rev
          +iew_date":"2026-10-06T06:00:00Z"}                             
      291 +  ]');                                                        
      292 +  assert returned = array['second', 'v2'], format('batch repea
          +ts were not merged last-wins: %s', returned);                 
      293 +  perform public.insert_reviews('b3110000-0000-4000-8000-00000
          +0000006',                                                     
      294 +    '[{"review_text":"third","rating":3,"source_review_id":"g-
          +8"}]');                                                       
      295 +  assert (select array_agg(review_text || '/' || rating || '/'
          + || coalesce(reviewer_name, '-') order by review_text)        
      296 +    from public.reviews where analysis_target_id = 'b3110000-0
          +000-4000-8000-000000000006')                                  
      297 +    = array['third/3/Eve', 'v2/4/ fay'], 'cross-batch repeats 
          +were not merged last-wins';                                   
      298  end
      299  $$;
      300 +\echo 'ok - [8] repeats in one batch and across batches are on
          +e row; the last value wins'                                   
      301 
      302 +-- [10]: never matched across targets or accounts.            
      303  do $$
      304  begin
      177 -  -- A source id and a fingerprint never collide, even for oth
          -erwise identical content.                                     
      178 -  insert into public.reviews (analysis_target_id, review_text,
          - rating, source_review_id)                                    
      179 -  values ('b3110000-0000-4000-8000-00000000a1a1', 'Same words'
          -, 4, 'g-3');                                                  
      180 -  insert into public.reviews (analysis_target_id, review_text,
          - rating)                                                      
      181 -  values ('b3110000-0000-4000-8000-00000000a1a1', 'Same words'
          -, 4);                                                         
      182 -  assert (select count(*) from public.reviews                 
      183 -    where analysis_target_id = 'b3110000-0000-4000-8000-000000
          -00a1a1' and review_text = 'Same words') = 2;                  
      305 +  assert (select count(*) from public.insert_reviews('b3110000
          +-0000-4000-8000-000000000007', '[                             
      306 +    {"review_text":"New text","rating":5,"source_review_id":"g
          +-5"},                                                         
      307 +    {"review_text":"Fine","rating":3,"reviewer_name":"Bo","rev
          +iew_date":"2026-10-02T10:00:00Z"}                             
      308 +  ]')) = 2, 'a review of another target of the same user was m
          +atched';                                                      
      309  end
      310  $$;
      186 -\echo 'ok - the unique index rejects direct duplicates; id and
          - fingerprint keys never collide'                              
      311 +set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-000
          +0000000b1"}';                                                 
      312 +do $$                                                         
      313 +begin                                                         
      314 +  assert (select count(*) from public.insert_reviews('b3110000
          +-0000-4000-8000-0000000000b1', '[                             
      315 +    {"review_text":"New text","rating":5,"source_review_id":"g
          +-5"},                                                         
      316 +    {"review_text":"Fine","rating":3,"reviewer_name":"Bo","rev
          +iew_date":"2026-10-02T10:00:00Z"}                             
      317 +  ]')) = 2, 'another account''s review was matched';          
      318 +  assert (select count(*) from public.reviews) = 2, 'User B ca
          +n see User A''s reviews';                                     
      319 +end                                                           
      320 +$$;                                                           
      321 +\echo 'ok - [10] reviews of different targets and accounts are
          + never matched'                                               
      322 
      323 +reset role;                                                   
      324 +                                                              
      325 +-- [11]: references and browser order survive adoption and ref
          +resh.                                                         
      326 +do $$                                                         
      327 +begin                                                         
      328 +  assert (select review.review_text from citation_fixture cita
          +tion                                                          
      329 +    join public.reviews review on review.id = citation.review_
          +id                                                            
      330 +    where citation.citation = 'cites-id-appears') = 'Lovely te
          +rrace, great staff',                                          
      331 +    'a citation no longer resolves to the adopted and refreshe
          +d review';                                                    
      332 +  assert (select array_agg(id order by created_at, id) from pu
          +blic.reviews                                                  
      333 +      where analysis_target_id = 'b3110000-0000-4000-8000-0000
          +00000001')                                                    
      334 +    = array[(select review_id from observed where label = 'id-
          +appears')],                                                   
      335 +    'the review browser order changed after adoption';        
      336 +end                                                           
      337 +$$;                                                           
      338 +\echo 'ok - [11] citations and browser ordering still resolve 
          +after adoption and refresh'                                   
      339 +                                                              
      340  -- -----------------------------------------------------------
           ----------------------------------
      189 --- finish_ingestion_attempt: repeated refreshes, retries, and 
          -an all-duplicate completion                                   
      341 +-- finish_ingestion_attempt: repeated refreshes, retries, and 
          +an all-duplicate completion.                                  
      342 +-- Runs as the database owner so it can count rows; ingestion-
          +attempts.test.sql covers the                                  
      343 +-- service_role-only EXECUTE boundary.                        
      344  -- -----------------------------------------------------------
           ----------------------------------
      191 --- These run as the database owner so they can count rows. ing
          -estion-attempts.test.sql covers the                           
      192 --- service_role-only EXECUTE boundary of these SECURITY DEFINE
          -R functions.                                                  
      345  create temporary table refresh_batch (name text primary key, r
           ows jsonb not null);
      346  insert into refresh_batch values
      347    ('first', '[
      196 -    {"text":"Crispy fries","rating":5,"source_review_id":"o-1"
          -,"reviewer_name":"Cy"},                                       
      197 -    {"text":"Crispy fries","rating":5,"source_review_id":"o-1"
          -,"reviewer_name":"Cy"},                                       
      348 +    {"text":"Crispy fries","rating":5,"reviewer_name":"Cy","re
          +view_date":"2026-10-03T09:00:00.000Z"},                       
      349 +    {"text":"Crispy fries","rating":5,"source_review_id":"o-1"
          +,"reviewer_name":"Cy","review_date":"2026-10-03T09:00:00.000Z"
          +},                                                            
      350      {"text":"Cold coffee","rating":2,"reviewer_name":"Di","rev
           iew_date":"2026-10-03T09:30:00.000Z"},
      351      {"text":"cold  COFFEE","rating":2,"reviewer_name":"di","re
           view_date":"2026-10-03T09:30:00.000Z"}
      352    ]'),
      353    ('second', '[
      202 -    {"text":"Cold coffee","rating":2,"reviewer_name":"Di","rev
          -iew_date":"2026-10-03T09:30:00.000Z"},                        
      203 -    {"text":"Crispy fries","rating":5,"source_review_id":"o-1"
          -,"reviewer_name":"Cy"},                                       
      204 -    {"text":"Friendly staff","rating":4,"source_review_id":"o-
          -2"}                                                           
      354 +    {"text":"Cold coffee, warm staff","rating":3,"source_revie
          +w_id":"o-2","reviewer_name":"Di","review_date":"2026-10-03T09:
          +30:00.000Z"},                                                 
      355 +    {"text":"Crispy fries","rating":4,"reviewer_name":"Cy","re
          +view_date":"2026-10-03T09:00:00.000Z"},                       
      356 +    {"text":"Friendly staff","rating":4,"source_review_id":"o-
          +3"}                                                           
      357    ]');
      358 
      359  do $$
      360  declare
      361    owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
      210 -  target_id uuid := 'b3110000-0000-4000-8000-00000000a2a2';   
      211 -  identity jsonb := '{"placeId":"ChIJDedupeA2","businessName":
          -"Dedupe A2"}';                                                
      362 +  target_id uuid := 'b3110000-0000-4000-8000-000000000008';   
      363 +  identity jsonb := '{"placeId":"ChIJDedupe8","businessName":"
          +Dedupe 8"}';                                                  
      364    reserved jsonb;
      365    attempt public.ingestion_attempts;
      214 -  before_count bigint;                                        
      366  begin
      216 -  select count(*) into before_count from public.reviews where 
          -analysis_target_id = target_id;                               
      217 -                                                              
      218 -  -- (b) The first refresh repeats a review by id and by finge
          -rprint inside its own batch.                                  
      367    reserved := public.reserve_ingestion_attempt(target_id, owne
           r_id);
      368    attempt := public.bind_ingestion_job((reserved->'attempt'->>
           'id')::uuid, owner_id, 'dedupe-job-1');
      369 
      222 -  -- (g) A failure after the insert rolls the whole completion
          - back; the retry stores it once.                              
      370 +  -- A failure after the review write rolls the whole completi
          +on back; the retry stores it once.                            
      371    begin
      372      perform public.finish_ingestion_attempt(attempt.id, owner_
           id,
      373        (select rows from refresh_batch where name = 'first'), 0
           , identity, null);
      226 -    raise exception 'simulated failure after review insert';  
      374 +    raise exception 'simulated failure after review write';   
      375    exception
      376      when raise_exception then
      229 -      if sqlerrm <> 'simulated failure after review insert' th
          -en raise; end if;                                             
      377 +      if sqlerrm <> 'simulated failure after review write' the
          +n raise; end if;                                              
      378    end;
      231 -  assert (select count(*) from public.reviews where analysis_t
          -arget_id = target_id) = before_count,                         
      379 +  assert (select count(*) from public.reviews where analysis_t
          +arget_id = target_id) = 0,                                    
      380      'a failed completion left reviews behind';
      381    assert (select status from public.ingestion_attempts where i
           d = attempt.id) = 'processing';
      382 
     ...
      384      (select rows from refresh_batch where name = 'first'), 0,
           identity, null);
      385    assert attempt.status = 'succeeded' and attempt.saved_count
           = 2,
      386      format('first refresh saved %s rows, expected 2 distinct r
           eviews', attempt.saved_count);
      387 +  assert (select source_review_id from public.reviews         
      388 +    where analysis_target_id = target_id and review_text = 'Cr
          +ispy fries') = 'o-1',                                         
      389 +    'an id that appeared within one batch was not adopted';   
      390 
      391    -- A repeated poll of the finished attempt is a no-op.
      392    attempt := public.finish_ingestion_attempt(attempt.id, owner
           _id,
      393      (select rows from refresh_batch where name = 'first'), 0,
           identity, null);
      394    assert attempt.saved_count = 2;
      244 -  assert (select count(*) from public.reviews where analysis_t
          -arget_id = target_id) = before_count + 2;                     
      395 +  assert (select count(*) from public.reviews where analysis_t
          +arget_id = target_id) = 2;                                    
      396  end
      397  $$;
      398 
      399  -- Later refresh runs of the same target. reserve_ingestion_at
           tempt still returns the succeeded
      249 --- attempt, so these stand in for a future refresh flow by rec
          -ording new bound attempts directly.                           
      400 +-- attempt, so these stand in for the S3-009 refresh flow by r
          +ecording new bound attempts directly.                         
      401  insert into public.ingestion_attempts (analysis_target_id, own
           er_id, source_url, submitted_query,
      402    query_kind, expected_place_id, provider_request_id)
      252 -values ('b3110000-0000-4000-8000-00000000a2a2', 'b3110000-0000
          --4000-8000-0000000000a1',                                     
      253 -  'https://www.google.com/maps/place/DedupeA2', 'ChIJDedupeA2'
          -, 'place_id', 'ChIJDedupeA2',                                 
      403 +values ('b3110000-0000-4000-8000-000000000008', 'b3110000-0000
          +-4000-8000-0000000000a1',                                     
      404 +  'https://www.google.com/maps/place/Dedupe8', 'ChIJDedupe8', 
          +'place_id', 'ChIJDedupe8',                                    
      405    'dedupe-job-2');
      406 
      407  do $$
      408  declare
      409    owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
      259 -  target_id uuid := 'b3110000-0000-4000-8000-00000000a2a2';   
      260 -  identity jsonb := '{"placeId":"ChIJDedupeA2","businessName":
          -"Dedupe A2"}';                                                
      410 +  target_id uuid := 'b3110000-0000-4000-8000-000000000008';   
      411    attempt public.ingestion_attempts;
      262 -  before_count bigint;                                        
      412 +  before_ids uuid[];                                          
      413  begin
      264 -  select count(*) into before_count from public.reviews where 
          -analysis_target_id = target_id;                               
      414 +  select array_agg(id order by id) into before_ids from public
          +.reviews where analysis_target_id = target_id;                
      415    select * into strict attempt from public.ingestion_attempts
           where provider_request_id = 'dedupe-job-2';
      266 -  -- (c)/(d) Two reviews repeat the first refresh; only the ge
          -nuinely new one is inserted.                                  
      416    attempt := public.finish_ingestion_attempt(attempt.id, owner
           _id,
      268 -    (select rows from refresh_batch where name = 'second'), 0,
          - identity, null);                                             
      417 +    (select rows from refresh_batch where name = 'second'), 0,
      418 +    '{"placeId":"ChIJDedupe8","businessName":"Dedupe 8"}', nul
          +l);                                                           
      419    assert attempt.status = 'succeeded' and attempt.saved_count
           = 1,
      420      format('second refresh saved %s rows, expected 1 new revie
           w', attempt.saved_count);
      271 -  assert (select count(*) from public.reviews where analysis_t
          -arget_id = target_id) = before_count + 1;                     
      421 +  assert (select array_agg(id order by id) from public.reviews
      422 +    where analysis_target_id = target_id and review_text <> 'F
          +riendly staff') = before_ids,                                 
      423 +    'a refresh replaced existing rows';                       
      424 +  assert (select array_agg(source_review_id || '=' || review_t
          +ext || '/' || rating order by source_review_id)               
      425 +    from public.reviews where analysis_target_id = target_id) 
      426 +    = array['o-1=Crispy fries/4', 'o-2=Cold coffee, warm staff
          +/3', 'o-3=Friendly staff/4'],                                 
      427 +    'the refresh did not adopt, update, and insert as expected
          +';                                                            
      428  end
      429  $$;
      430 
      431  insert into public.ingestion_attempts (analysis_target_id, own
           er_id, source_url, submitted_query,
      432    query_kind, expected_place_id, provider_request_id)
      277 -values ('b3110000-0000-4000-8000-00000000a2a2', 'b3110000-0000
          --4000-8000-0000000000a1',                                     
      278 -  'https://www.google.com/maps/place/DedupeA2', 'ChIJDedupeA2'
          -, 'place_id', 'ChIJDedupeA2',                                 
      433 +values ('b3110000-0000-4000-8000-000000000008', 'b3110000-0000
          +-4000-8000-0000000000a1',                                     
      434 +  'https://www.google.com/maps/place/Dedupe8', 'ChIJDedupe8', 
          +'place_id', 'ChIJDedupe8',                                    
      435    'dedupe-job-3');
      436 
      437  do $$
      438  declare
      283 -  owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';    
      284 -  target_id uuid := 'b3110000-0000-4000-8000-00000000a2a2';   
      439    attempt public.ingestion_attempts;
      286 -  before_count bigint;                                        
      440  begin
      288 -  select count(*) into before_count from public.reviews where 
          -analysis_target_id = target_id;                               
      441    select * into strict attempt from public.ingestion_attempts
           where provider_request_id = 'dedupe-job-3';
      290 -  -- (a) A refresh that returns only stored reviews succeeds w
          -ith zero new rows.                                            
      291 -  attempt := public.finish_ingestion_attempt(attempt.id, owner
          -_id,                                                          
      442 +  attempt := public.finish_ingestion_attempt(attempt.id, 'b311
          +0000-0000-4000-8000-0000000000a1',                            
      443      (select rows from refresh_batch where name = 'second'), 0,
      293 -    '{"placeId":"ChIJDedupeA2","businessName":"Dedupe A2"}', n
          -ull);                                                         
      444 +    '{"placeId":"ChIJDedupe8","businessName":"Dedupe 8"}', nul
          +l);                                                           
      445    assert attempt.status = 'succeeded' and attempt.saved_count
           = 0,
      446      'an all-duplicate refresh did not succeed with zero new re
           views';
      296 -  assert (select count(*) from public.reviews where analysis_t
          -arget_id = target_id) = before_count;                         
      447 +  assert (select count(*) from public.reviews where analysis_t
          +arget_id = 'b3110000-0000-4000-8000-000000000008') = 3;       
      448  end
      449  $$;
      450 
      300 --- (h) Final dataset: one row per identity, ordered as before 
          -by (created_at, id).                                          
      451  do $$
      452  begin
      303 -  assert not exists (                                         
      304 -    select 1 from public.reviews group by analysis_target_id, 
          -identity_key having count(*) > 1                              
      305 -  ), 'duplicate identities exist';                            
      306 -  assert (select count(*) from public.reviews where analysis_t
          -arget_id = 'b3110000-0000-4000-8000-00000000a2a2') = 6,       
      307 -    'target A2 should hold its 3 API reviews and 3 distinct in
          -gested reviews';                                              
      453 +  assert not exists (select 1 from public.reviews where source
          +_review_id is not null                                        
      454 +    group by analysis_target_id, source_review_id having count
          +(*) > 1), 'duplicate source ids exist';                       
      455 +  assert not exists (select 1 from public.reviews where source
          +_review_id is null                                            
      456 +    group by analysis_target_id, review_fingerprint having cou
          +nt(*) > 1), 'duplicate id-less reviews exist';                
      457  end
      458  $$;
      310 -\echo 'ok - refreshes and retries of finish_ingestion_attempt 
          -never store a review twice'                                   
      459 +\echo 'ok - finish_ingestion_attempt reconciles refreshes and 
          +retries without duplicates'                                   
      460 
      461  rollback;

  Ran 1 shell command · 1 failed (ctrl+o to expand)

⏺ Temp tables can't reference permanent tables, so the citation stand-in becomes
  a regular table inside the rolled-back test transaction:

⏺ Bash(python3 - <<'PY'
      p='tests/db/review-deduplication.test.sql'…)
  ⎿  Updated tests/db/review-deduplication.test.sql +4 -3
      29     'Dedupe B', 'google_maps', 'https://www.google.com/maps/plac
          e/DedupeB', 'ChIJDedupeB');
      30 
      31  -- Stand-in for a future table that references reviews (for exa
          mple persisted Q&A citations).
      32 -create temporary table citation_fixture (                      
      32 +-- A regular table: temporary tables cannot reference permanent
         + ones. The final rollback drops it.                            
      33 +create table public.citation_fixture (                         
      34    citation text primary key,
      35    review_id uuid not null references public.reviews (id)
      36  );
     ...
      154  end
      155  $$;
      156  reset role;
      156 -insert into citation_fixture                                  
      157 +insert into public.citation_fixture                           
      158    select 'cites-id-appears', review_id from observed where lab
           el = 'id-appears';
      159  set role authenticated;
      160  do $$
     ...
      326  -- [11]: references and browser order survive adoption and ref
           resh.
      327  do $$
      328  begin
      328 -  assert (select review.review_text from citation_fixture cita
          -tion                                                          
      329 +  assert (select review.review_text from public.citation_fixtu
          +re citation                                                   
      330      join public.reviews review on review.id = citation.review_
           id
      331      where citation.citation = 'cites-id-appears') = 'Lovely te
           rrace, great staff',
      332      'a citation no longer resolves to the adopted and refreshe
           d review';

⏺ All 13 checks pass, and I'm writing the migration test next to cover
  duplicates, a padded id, an ambiguous group, and re-pointed foreign keys.
  · summary

⏺ Write(tests/db/review-deduplication-migration.test.sh)
  ⎿  Added 71 lines, removed 22 lines
      1  #!/usr/bin/env bash
      2  # S3-011: the duplicate-review migration must clean up rows stor
         ed before uniqueness existed.
      3  # Builds a separate throwaway database with every migration BEFO
         RE S3-011, stores duplicates the
      4 -# Sprint 1 schema allowed, applies the S3-011 migration, and che
        -cks that the oldest row of each                                 
      5 -# identity survives, distinct and cross-target reviews are untou
        -ched, and the index exists.                                     
      4 +# Sprint 1 schema allowed (plus a table that references reviews)
        +, applies the S3-011 migration,                                 
      5 +# and checks each cleanup pass, the re-pointed references, and a
        +doption afterwards.                                             
      6  set -euo pipefail
      7 
      8  cd "$(dirname "$0")/../.."
     ...
       28    ('c3110000-0000-4000-8000-00000000a2a2', 'c3110000-0000-4000
           -8000-0000000000a1',
       29     'Cleanup A2', 'google_maps', 'https://www.google.com/maps/p
           lace/CleanupA2');
       30 
       31 --- Sprint 1 stored these as separate rows. created_at is expli
          -cit so "oldest" is unambiguous;                               
       32 --- the 0002 rows share a created_at with a later copy to exerc
          -ise the id tie-break.                                         
       33 -insert into public.reviews (id, analysis_target_id, review_tex
          -t, rating, source_review_id, reviewer_name, created_at) values
       34 -  ('c3110000-0000-4000-8000-000000000001', 'c3110000-0000-4000
          --8000-00000000a1a1', 'Original', 5, 'dup-id', 'Ann', '2026-11-
          -01T00:00:00Z'),                                               
       35 -  ('c3110000-0000-4000-8000-000000000011', 'c3110000-0000-4000
          --8000-00000000a1a1', 'Re-ingested copy', 4, 'dup-id', 'Ann', '
          -2026-11-02T00:00:00Z'),                                       
       36 -  ('c3110000-0000-4000-8000-000000000012', 'c3110000-0000-4000
          --8000-00000000a1a1', 'Third copy', 3, 'dup-id', 'Ann', '2026-1
          -1-03T00:00:00Z'),                                             
       37 -  ('c3110000-0000-4000-8000-000000000002', 'c3110000-0000-4000
          --8000-00000000a1a1', 'No id review', 4, null, 'Ben', '2026-11-
          -01T00:00:00Z'),                                               
       38 -  ('c3110000-0000-4000-8000-000000000021', 'c3110000-0000-4000
          --8000-00000000a1a1', '  no ID   review ', 4, null, 'BEN', '202
          -6-11-01T00:00:00Z'),                                          
       39 -  ('c3110000-0000-4000-8000-000000000003', 'c3110000-0000-4000
          --8000-00000000a1a1', 'No id review', 2, null, 'Ben', '2026-11-
          -04T00:00:00Z'),                                               
       40 -  ('c3110000-0000-4000-8000-000000000004', 'c3110000-0000-4000
          --8000-00000000a2a2', 'Original', 5, 'dup-id', 'Ann', '2026-11-
          -05T00:00:00Z');                                               
       31 +-- Stand-in for a table that references reviews (for example p
          +ersisted Q&A citations).                                      
       32 +create table public.citation_fixture (                        
       33 +  citation text primary key,                                  
       34 +  review_id uuid not null references public.reviews (id) on de
          +lete cascade                                                  
       35 +);                                                            
       36 +                                                              
       37 +-- Sprint 1 stored all of these as separate rows. created_at i
          +s explicit so "oldest" is fixed.                              
       38 +insert into public.reviews (id, analysis_target_id, review_tex
          +t, rating, source_review_id,                                  
       39 +  reviewer_name, review_date, review_url, created_at) values  
       40 +  -- Pass 1, same source id (one padded with whitespace): surv
          +ivor 0001 takes the newest values.                            
       41 +  ('c3110000-0000-4000-8000-000000000001', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Original', 5, 'dup-id', 'Ann', null, nul
          +l, '2026-11-01T00:00:00Z'),                                   
       42 +  ('c3110000-0000-4000-8000-000000000011', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Second copy', 4, 'dup-id', 'Ann', null, 
          +'https://maps.google.com/r/11', '2026-11-02T00:00:00Z'),      
       43 +  ('c3110000-0000-4000-8000-000000000012', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Newest copy', 3, E' dup-id\t', null, nul
          +l, null, '2026-11-04T00:00:00Z'),                             
       44 +  -- Pass 2, id-less rows with one fingerprint; 0002 and 0021 
          +tie on created_at, so id decides.                             
       45 +  ('c3110000-0000-4000-8000-000000000002', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'No id review', 4, null, 'Ben', null, nul
          +l, '2026-11-01T00:00:00Z'),                                   
       46 +  ('c3110000-0000-4000-8000-000000000021', 'c3110000-0000-4000
          +-8000-00000000a1a1', '  no ID   review ', 4, null, 'BEN', null
          +, null, '2026-11-01T00:00:00Z'),                              
       47 +  ('c3110000-0000-4000-8000-000000000022', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'No id review', 4, '   ', 'Ben', null, nu
          +ll, '2026-11-02T00:00:00Z'),                                  
       48 +  ('c3110000-0000-4000-8000-000000000003', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'No id review', 2, null, 'Ben', null, nul
          +l, '2026-11-04T00:00:00Z'),                                   
       49 +  -- Pass 3, an id that appeared later: the older id-less row 
          +survives and takes the id.                                    
       50 +  ('c3110000-0000-4000-8000-000000000005', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Good', 4, null, 'Pat', '2026-10-05T12:00
          +:00Z', null, '2026-11-01T00:00:00Z'),                         
       51 +  ('c3110000-0000-4000-8000-000000000051', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Good (edited)', 5, 'late-id', 'Pat', '20
          +26-10-05T12:00:00Z', null, '2026-11-03T00:00:00Z'),           
       52 +  -- Ambiguous: one id-less row shares its fingerprint with TW
          +O different ids. Left untouched.                              
       53 +  ('c3110000-0000-4000-8000-000000000006', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Hi', 4, null, 'Quinn', '2026-10-06T12:00
          +:00Z', null, '2026-11-01T00:00:00Z'),                         
       54 +  ('c3110000-0000-4000-8000-000000000061', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Hi', 4, 'q-1', 'Quinn', '2026-10-06T12:0
          +0:00Z', null, '2026-11-02T00:00:00Z'),                        
       55 +  ('c3110000-0000-4000-8000-000000000062', 'c3110000-0000-4000
          +-8000-00000000a1a1', 'Hi', 4, 'q-2', 'Quinn', '2026-10-06T12:0
          +0:00Z', null, '2026-11-03T00:00:00Z'),                        
       56 +  -- Another target: never merged with target A1.             
       57 +  ('c3110000-0000-4000-8000-000000000004', 'c3110000-0000-4000
          +-8000-00000000a2a2', 'Original', 5, 'dup-id', 'Ann', null, nul
          +l, '2026-11-05T00:00:00Z');                                   
       58 +                                                              
       59 +insert into public.citation_fixture values                    
       60 +  ('cites-second-copy', 'c3110000-0000-4000-8000-000000000011'
          +),                                                            
       61 +  ('cites-idless-copy', 'c3110000-0000-4000-8000-000000000021'
          +),                                                            
       62 +  ('cites-late-id', 'c3110000-0000-4000-8000-000000000051'),  
       63 +  ('cites-survivor', 'c3110000-0000-4000-8000-000000000001'); 
       64  SQL
       65 
       66  psql "${psql_args[@]}" --file "$s3011_migration"
       67 
       68  psql "${psql_args[@]}" <<'SQL'
       69  do $$
       70 +declare                                                       
       71 +  survivor public.reviews;                                    
       72  begin
       48 -  assert (select array_agg(id::text order by id) from public.r
          -eviews) = array[                                              
       49 -    'c3110000-0000-4000-8000-000000000001',                   
       50 -    'c3110000-0000-4000-8000-000000000002',                   
       51 -    'c3110000-0000-4000-8000-000000000003',                   
       52 -    'c3110000-0000-4000-8000-000000000004'                    
       53 -  ], 'cleanup did not keep exactly the oldest row of each iden
          -tity per target';                                             
       54 -  assert (select review_text from public.reviews where id = 'c
          -3110000-0000-4000-8000-000000000001') = 'Original',           
       55 -    'the surviving row was modified';                         
       56 -  assert to_regclass('public.reviews_target_identity_key_idx')
          - is not null, 'unique index missing';                         
       73 +  assert (select array_agg(right(id::text, 2) order by id) fro
          +m public.reviews) =                                           
       74 +    array['01', '02', '03', '04', '05', '06', '61', '62'],    
       75 +    'cleanup did not keep exactly the oldest row of each dupli
          +cate group';                                                  
       76 +                                                              
       77 +  select * into strict survivor from public.reviews where id =
          + 'c3110000-0000-4000-8000-000000000001';                      
       78 +  assert survivor.source_review_id = 'dup-id' and survivor.rev
          +iew_text = 'Newest copy'                                      
       79 +    and survivor.rating = 3 and survivor.reviewer_name = 'Ann'
       80 +    and survivor.review_url = 'https://maps.google.com/r/11'  
       81 +    and survivor.created_at = '2026-11-01T00:00:00Z' and survi
          +vor.updated_at = '2026-11-04T00:00:00Z',                      
       82 +    'pass 1 survivor did not keep its id/created_at and take t
          +he newest non-null values';                                   
       83 +                                                              
       84 +  select * into strict survivor from public.reviews where id =
          + 'c3110000-0000-4000-8000-000000000005';                      
       85 +  assert survivor.source_review_id = 'late-id' and survivor.re
          +view_text = 'Good (edited)'                                   
       86 +    and survivor.rating = 5, 'pass 3 survivor did not adopt th
          +e late id and its newest values';                             
       87 +                                                              
       88 +  assert (select source_review_id from public.reviews where id
          + = 'c3110000-0000-4000-8000-000000000006') is null,           
       89 +    'an ambiguous id-less row was merged';                    
       90 +  assert (select updated_at = created_at from public.reviews w
          +here id = 'c3110000-0000-4000-8000-000000000003'),            
       91 +    'a row without duplicates was changed';                   
       92 +                                                              
       93 +  assert (select array_agg(citation || '>' || right(review_id:
          +:text, 2) order by citation)                                  
       94 +    from public.citation_fixture) = array[                    
       95 +      'cites-idless-copy>02', 'cites-late-id>05', 'cites-secon
          +d-copy>01', 'cites-survivor>01'                               
       96 +    ], 'references to removed copies were not re-pointed to th
          +e survivors';                                                 
       97 +                                                              
       98 +  -- [4] After cleanup, an incoming id adopts the oldest of th
          +e formerly duplicated id-less rows.                           
       99 +  assert (select review_id from public.merge_target_reviews('c
          +3110000-0000-4000-8000-00000000a1a1',                         
      100 +      '[{"review_text":"No id review","rating":4,"reviewer_nam
          +e":"Ben","source_review_id":"ben-1"}]'))                      
      101 +    = 'c3110000-0000-4000-8000-000000000002', 'the oldest id-l
          +ess copy was not the one adopted';                            
      102 +  assert (select count(*) from public.reviews) = 8, 'adoption 
          +inserted a row';                                              
      103 +                                                              
      104 +  assert to_regclass('public.reviews_target_source_review_id_k
          +ey') is not null                                              
      105 +    and to_regclass('public.reviews_target_idless_fingerprint_
          +key') is not null, 'unique indexes missing';                  
      106  end
      107  $$;
      108  SQL
       60 -echo 'ok - the migration keeps the oldest row of each pre-exis
          -ting duplicate and adds the index'                            
      109 +echo 'ok - the migration merges pre-existing duplicates into t
          +he oldest row and re-points references'                       

  Ran 1 shell command (ctrl+o to expand)

⏺ The cleanup notice matches the fixture with 2/2/1 merges. I'm now adding the
  concurrency script for the race the advisory lock is needed for, where an
  id-less copy in one session and an id-carrying submission in another slip past
  both partial indexes. · summary

⏺ Write(tests/db/review-deduplication-concurrency.test.sh)
  ⎿  Added 66 lines, removed 52 lines
       1  #!/usr/bin/env bash
       2 -# S3-011, real PostgreSQL sessions: session A has inserted a re
         -view but not committed while                                   
       3 -# session B submits the same review. B must wait on A's unique-
         -index entry and then skip the                                  
       4 -# review (ON CONFLICT DO NOTHING). Without the unique index bot
         -h sessions would store a row.                                  
       2 +# S3-011, real PostgreSQL sessions. Session A has reconciled a 
         +batch but not committed while                                  
       3 +# session B submits the same reviews. B must wait for A's per-t
         +arget merge lock and then                                      
       4 +# reconcile against A's committed rows instead of inserting dup
         +licates.                                                       
       5 +#   race 1: the same batch twice (also guarded by the unique in
         +dexes);                                                        
       6 +#   race 2: A stores a review WITHOUT a source id, B the same r
         +eview WITH one. Only the merge lock                            
       7 +#           prevents this duplicate: the two copies fall under 
         +different partial unique indexes.                              
       8  set -euo pipefail
       9  psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "
          ${1:?throwaway database required}")
      10  work_dir=$(mktemp -d)
      11  session_a_pid=""
      12  session_b_pid=""
      13  owner='d3110000-0000-4000-8000-0000000000a1'
      11 -target='d3110000-0000-4000-8000-00000000a1a1'                  
      12 -batch='[{"review_text":"Concurrent review","rating":4,"source_r
         -eview_id":"race-1"},{"review_text":"Concurrent fingerprint","ra
         -ting":3}]'                                                     
      14  cleanup() {
      15    exec 9>&- || true
      16    for pid in "$session_a_pid" "$session_b_pid"; do
     ...
      24 
      25  psql "${psql_args[@]}" <<SQL
      26  insert into auth.users(id) values ('$owner');
      26 -insert into public.analysis_targets(id, owner_id, name, platfor
         -m, source_url)                                                 
      27 -values ('$target', '$owner', 'Concurrent dedupe', 'google_maps'
         -, 'https://www.google.com/maps/place/Race');                   
      27 +insert into public.analysis_targets(id, owner_id, name, platfor
         +m, source_url) values                                          
      28 +  ('d3110000-0000-4000-8000-00000000a1a1', '$owner', 'Race one'
         +, 'google_maps', 'https://www.google.com/maps/place/Race1'),   
      29 +  ('d3110000-0000-4000-8000-00000000a2a2', '$owner', 'Race two'
         +, 'google_maps', 'https://www.google.com/maps/place/Race2');   
      30  SQL
      31 
      30 -mkfifo "$work_dir/input"                                       
      31 -exec 9<>"$work_dir/input"                                      
      32 -psql "${psql_args[@]}" <"$work_dir/input" >"$work_dir/a.log" 2>
         -&1 &                                                           
      33 -session_a_pid=$!                                               
      34 -printf '%s\n' \                                                
      35 -  'begin;' \                                                   
      36 -  "set idle_in_transaction_session_timeout = '20s';" \         
      37 -  'set role authenticated;' \                                  
      38 -  "set request.jwt.claims to '{\"sub\":\"$owner\"}';" \        
      39 -  "select count(*) from public.insert_reviews('$target', '$batc
         -h');" \                                                        
      40 -  '\echo session_a_inserted' >&9                               
      41 -ready=false                                                    
      42 -for ((poll = 0; poll < 100; poll++)); do                       
      43 -  if grep -q '^session_a_inserted$' "$work_dir/a.log"; then rea
         -dy=true; break; fi                                             
      44 -  if ! kill -0 "$session_a_pid" 2>/dev/null; then break; fi    
      45 -  sleep 0.05                                                   
      46 -done                                                           
      47 -if [[ "$ready" != true ]]; then cat "$work_dir/a.log"; echo 'Se
         -ssion A did not insert'; exit 1; fi                            
      32 +# race <name> <target> <batch for A> <batch for B> <SQL conditi
         +on that must hold afterwards>                                  
      33 +race() {                                                       
      34 +  local name=$1 target=$2 batch_a=$3 batch_b=$4 final_check=$5 
      35 +  rm -f "$work_dir/input"                                      
      36 +  mkfifo "$work_dir/input"                                     
      37 +  exec 9<>"$work_dir/input"                                    
      38 +  psql "${psql_args[@]}" <"$work_dir/input" >"$work_dir/a.log" 
         +2>&1 &                                                         
      39 +  session_a_pid=$!                                             
      40 +  printf '%s\n' \                                              
      41 +    'begin;' \                                                 
      42 +    "set idle_in_transaction_session_timeout = '20s';" \       
      43 +    'set role authenticated;' \                                
      44 +    "set request.jwt.claims to '{\"sub\":\"$owner\"}';" \      
      45 +    "select count(*) from public.insert_reviews('$target', '$ba
         +tch_a');" \                                                    
      46 +    '\echo session_a_merged' >&9                               
      47 +  local ready=false                                            
      48 +  for ((poll = 0; poll < 100; poll++)); do                     
      49 +    if grep -q '^session_a_merged$' "$work_dir/a.log"; then rea
         +dy=true; break; fi                                             
      50 +    if ! kill -0 "$session_a_pid" 2>/dev/null; then break; fi  
      51 +    sleep 0.05                                                 
      52 +  done                                                         
      53 +  if [[ "$ready" != true ]]; then cat "$work_dir/a.log"; echo "
         +$name: session A did not merge"; exit 1; fi                    
      54 
      49 -psql "${psql_args[@]}" >"$work_dir/b.log" 2>&1 <<SQL &         
      55 +  psql "${psql_args[@]}" >"$work_dir/b.log" 2>&1 <<SQL &       
      56  set application_name = 'reviewlens_dedupe_session_b';
      57  set statement_timeout = '15s';
      58  set role authenticated;
      59  set request.jwt.claims to '{"sub":"$owner"}';
      54 -do \$\$ begin                                                  
      55 -  assert (select count(*) from public.insert_reviews('$target',
         - '$batch')) = 0,                                               
      56 -    'Concurrent session stored a review that another session wa
         -s inserting';                                                  
      57 -end \$\$;                                                      
      60 +select count(*) from public.insert_reviews('$target', '$batch_b
         +');                                                            
      61  SQL
      59 -session_b_pid=$!                                               
      60 -blocked=false                                                  
      61 -for ((poll = 0; poll < 100; poll++)); do                       
      62 -  if [[ $(psql "${psql_args[@]}" -Atc "select count(*) from pg_
         -stat_activity where datname = current_database() and applicatio
         -n_name = 'reviewlens_dedupe_session_b' and wait_event_type = 'L
         -ock'") == 1 ]]; then                                           
      63 -    blocked=true; break                                        
      62 +  session_b_pid=$!                                             
      63 +  local blocked=false                                          
      64 +  for ((poll = 0; poll < 100; poll++)); do                     
      65 +    if [[ $(psql "${psql_args[@]}" -Atc "select count(*) from p
         +g_stat_activity where datname = current_database() and applicat
         +ion_name = 'reviewlens_dedupe_session_b' and wait_event_type = 
         +'Lock'") == 1 ]]; then                                         
      66 +      blocked=true; break                                      
      67 +    fi                                                         
      68 +    if ! kill -0 "$session_b_pid" 2>/dev/null; then break; fi  
      69 +    sleep 0.05                                                 
      70 +  done                                                         
      71 +  # Release A only after observing B's lock wait (or its errone
         +ous completion).                                               
      72 +  printf '%s\n' 'commit;' '\q' >&9                             
      73 +  exec 9>&-                                                    
      74 +  wait "$session_a_pid"                                        
      75 +  session_a_pid=""                                             
      76 +  if ! wait "$session_b_pid"; then cat "$work_dir/b.log"; exit 
         +1; fi                                                          
      77 +  session_b_pid=""                                             
      78 +  if [[ "$blocked" != true ]]; then echo "$name: session B did 
         +not wait for session A"; exit 1; fi                            
      79 +  if [[ $(psql "${psql_args[@]}" -Atc "select ($final_check)") 
         +!= t ]]; then                                                  
      80 +    psql "${psql_args[@]}" -c "select source_review_id, review_
         +text from public.reviews where analysis_target_id = '$target'" 
      81 +    echo "$name: concurrent submissions stored duplicates"; exi
         +t 1                                                            
      82    fi
      65 -  if ! kill -0 "$session_b_pid" 2>/dev/null; then break; fi    
      66 -  sleep 0.05                                                   
      67 -done                                                           
      68 -# Release A only after observing B's lock wait on A's uncommitt
         -ed index entry.                                                
      69 -printf '%s\n' 'commit;' '\q' >&9                               
      70 -wait "$session_a_pid"                                          
      71 -session_a_pid=""                                               
      72 -if ! wait "$session_b_pid"; then cat "$work_dir/b.log"; exit 1;
         - fi                                                            
      73 -session_b_pid=""                                               
      74 -if [[ "$blocked" != true ]]; then echo 'Session B did not wait 
         -for the unique index'; exit 1; fi                              
      75 -psql "${psql_args[@]}" <<SQL                                   
      76 -do \$\$ begin                                                  
      77 -  assert (select count(*) from public.reviews where analysis_ta
         -rget_id = '$target') = 2,                                      
      78 -    'Concurrent submissions stored duplicate reviews';         
      79 -end \$\$;                                                      
      80 -SQL                                                            
      81 -echo 'ok - concurrent submissions of the same reviews store eac
         -h review once'                                                 
      83 +}                                                              
      84 +                                                               
      85 +race 'same batch' 'd3110000-0000-4000-8000-00000000a1a1' \     
      86 +  '[{"review_text":"Concurrent review","rating":4,"source_revie
         +w_id":"race-1"},{"review_text":"Concurrent fingerprint","rating
         +":3}]' \                                                       
      87 +  '[{"review_text":"Concurrent review","rating":4,"source_revie
         +w_id":"race-1"},{"review_text":"Concurrent fingerprint","rating
         +":3}]' \                                                       
      88 +  "select count(*) = 2 from public.reviews where analysis_targe
         +t_id = 'd3110000-0000-4000-8000-00000000a1a1'"                 
      89 +                                                               
      90 +race 'id appears' 'd3110000-0000-4000-8000-00000000a2a2' \     
      91 +  '[{"review_text":"Racing adoption","rating":5,"reviewer_name"
         +:"Rae","review_date":"2026-10-07T07:00:00Z"}]' \               
      92 +  '[{"review_text":"Racing adoption","rating":5,"source_review_
         +id":"race-2","reviewer_name":"Rae","review_date":"2026-10-07T07
         +:00:00Z"}]' \                                                  
      93 +  "select array_agg(source_review_id) = array['race-2'] from pu
         +blic.reviews where analysis_target_id = 'd3110000-0000-4000-800
         +0-00000000a2a2'"                                               
      94 +                                                               
      95 +echo 'ok - concurrent refreshes of one target never store a rev
         +iew twice, including id adoption'                              

⏺ Updating my own earlier assertion in reviews.test.sql, which said a repeated
  source id leaves the original unchanged. Under the S3-010 refresh rule it now
  refreshes in place:

⏺ Bash(python3 - <<'PY'
      p='tests/db/reviews.test.sql'…)
  ⎿  Updated tests/db/reviews.test.sql +13 -8
      72  $$;
      73  \echo 'ok - reviews of one target do not appear under another t
          arget of the same user'
      74 
      75 --- S3-011 intentionally replaced the Sprint 1 rule that stored 
         -duplicate source ids as-is.                                    
      75 +-- S3-011 intentionally replaced the Sprint 1 rule that stored 
         +duplicate source ids as-is: a                                  
      76 +-- repeated source id refreshes the stored review in place (S3-
         +010).                                                          
      77  do $$
      78  declare
      78 -  saved_rows bigint;                                           
      79 +  original public.reviews;                                     
      80 +  refreshed public.reviews;                                    
      81  begin
      80 -  select count(*) into saved_rows from public.insert_reviews(  
      82 +  select * into strict original from public.reviews where sourc
         +e_review_id = 'src-1';                                         
      83 +  select * into strict refreshed from public.insert_reviews(   
      84      '77777777-7777-4777-8777-777777777771',
      85      '[{"review_text":"Same source review again","rating":5,"sou
          rce_review_id":"src-1"}]'
      86    );
      84 -  assert saved_rows = 0, 'a repeated source_review_id was store
         -d again';                                                      
      85 -  assert (                                                     
      86 -    select review_text from public.reviews where source_review_
         -id = 'src-1'                                                   
      87 -  ) = 'Great food', 'a repeated source_review_id changed the st
         -ored review';                                                  
      87 +  assert refreshed.id = original.id and refreshed.created_at = 
         +original.created_at,                                           
      88 +    'a repeated source_review_id created a new review';        
      89 +  assert refreshed.review_text = 'Same source review again' and
         + refreshed.rating = 5,                                         
      90 +    'a repeated source_review_id did not refresh the stored rev
         +iew';                                                          
      91 +  assert refreshed.reviewer_name = 'Sam' and refreshed.review_u
         +rl = 'https://maps.google.com/review/1',                       
      92 +    'a repeated source_review_id erased fields it did not provi
         +de';                                                           
      93  end
      94  $$;
      90 -\echo 'ok - a repeated source_review_id is not stored again and
         - the original is unchanged'                                    
      95 +\echo 'ok - a repeated source_review_id refreshes the stored re
         +view instead of adding one'                                    
      96 
      97  -- ------------------------------------------------------------
          ---------------------------------
      98  -- Cross-user isolation: User B against User A's target (S1-BR-
          008)

  Ran 1 shell command (ctrl+o to expand)

⏺ DB suite passes: 73 checks, including both concurrency races and the cleanup.
  Now the Jest side, starting with the unit tests for the pure fingerprint,
  matcher, merge, and collapse logic:

⏺ Write(tests/unit/services/reviews/review-identity.test.ts)
  ⎿  Added 217 lines, removed 103 lines
       2  import { createHash } from "node:crypto";
       3 
       4  import {
       5 -  dedupeReviews,                                               
       6 -  FINGERPRINT_KEY_PREFIX,                                      
       5 +  collapseReviews,                                             
       6 +  FINGERPRINT_PREFIX,                                          
       7 +  matchStoredReview,                                           
       8 +  mergeReviewFields,                                           
       9    normalizeIdentityText,
      10    normalizeSourceReviewId,
      11 +  reviewFingerprint,                                           
      12    reviewFingerprintSource,
      10 -  reviewIdentityKey,                                           
      11 -  SOURCE_ID_KEY_PREFIX,                                        
      13    type ReviewIdentityInput,
      14 +  type StoredReviewIdentity,                                   
      15  } from "@/services/reviews/review-identity";
      16  import { normalizeReview } from "@/services/reviews/normalize";
      17 +import type { NormalizedReview } from "@/services/reviews/types
         +";                                                             
      18  import vectorFixture from "../../../fixtures/review-identity-ve
          ctors.json";
      19 
      20  type Vector = {
     ...
      26      rating: number;
      27      text: string;
      28    };
      26 -  expectedKey: string;                                         
      29 +  expectedSourceId: string | null;                             
      30 +  expectedFingerprint: string;                                 
      31  };
      32 
      33  const vectors = vectorFixture.vectors as Vector[];
     ...
       37  });
       38  const sha256 = (value: string) => createHash("sha256").update(
           value, "utf8").digest("hex");
       39 
       36 -const base: ReviewIdentityInput = {                           
       40 +const base: NormalizedReview = {                              
       41    text: "Great food",
       42    rating: 4.5,
       43    reviewerName: "Sam",
       44    reviewDate: new Date("2026-10-01T12:00:00.123Z"),
       45  };
       46 +const anonymous: NormalizedReview = { text: "Fine", rating: 3 
          +};                                                            
       47 
       48 +const stored = (                                              
       49 +  id: string,                                                 
       50 +  review: ReviewIdentityInput,                                
       51 +  createdAt: number,                                          
       52 +  sourceReviewId: string | null = null,                       
       53 +): StoredReviewIdentity => ({                                 
       54 +  id,                                                         
       55 +  sourceReviewId,                                             
       56 +  fingerprint: reviewFingerprint(review),                     
       57 +  createdAt,                                                  
       58 +});                                                           
       59 +                                                              
       60  describe("golden vectors shared with PostgreSQL", () => {
       61    test.each(vectors.map((vector) => [vector.name, vector] as c
           onst))("%s", (_name, vector) => {
       45 -    expect(reviewIdentityKey(toInput(vector))).toBe(vector.exp
          -ectedKey);                                                    
       62 +    expect(reviewFingerprint(toInput(vector))).toBe(vector.exp
          +ectedFingerprint);                                            
       63 +    expect(normalizeSourceReviewId(vector.input.sourceReviewId
          +) ?? null).toBe(                                              
       64 +      vector.expectedSourceId,                                
       65 +    );                                                        
       66    });
       67 
       48 -  test("cover both identity types and the documented equivalen
          -ces", () => {                                                 
       49 -    const keyOf = (name: string) => vectors.find((vector) => v
          -ector.name === name)!.expectedKey;                            
       50 -    expect(vectors.some((vector) => vector.expectedKey.startsW
          -ith(SOURCE_ID_KEY_PREFIX))).toBe(                             
       51 -      true,                                                   
       68 +  test("cover the documented equivalences and differences", ()
          + => {                                                         
       69 +    const fp = (name: string) => vectors.find((vector) => vect
          +or.name === name)!.expectedFingerprint;                       
       70 +    expect(fp("fingerprint whitespace and ASCII case variant")
          +).toBe(                                                       
       71 +      fp("fingerprint with every field"),                     
       72      );
       53 -    expect(keyOf("fingerprint whitespace and ASCII case varian
          -t")).toBe(                                                    
       54 -      keyOf("fingerprint with every field"),                  
       55 -    );                                                        
       56 -    expect(keyOf("fingerprint decomposed accent")).toBe(keyOf(
          -"fingerprint composed accent"));                              
       57 -    expect(keyOf("fingerprint delimiter shift")).not.toBe(    
       58 -      keyOf("fingerprint emoji and delimiters"),              
       59 -    );                                                        
       73 +    expect(fp("author-time tier ignores an edited text")).toBe
          +(fp("fingerprint with every field"));                         
       74 +    expect(fp("author-time tier ignores source id")).toBe(fp("
          +fingerprint with every field"));                              
       75 +    expect(fp("fingerprint decomposed accent")).toBe(fp("finge
          +rprint composed accent"));                                    
       76 +    expect(fp("content tier without date, edited text")).not.t
          +oBe(fp("content tier without date"));                         
       77 +    expect(fp("fingerprint delimiter shift")).not.toBe(fp("fin
          +gerprint emoji and delimiters"));                             
       78    });
       79  });
       80 
       63 -describe("reviewIdentityKey", () => {                         
       64 -  test("is deterministic for the same input", () => {         
       65 -    expect(reviewIdentityKey(base)).toBe(reviewIdentityKey({ .
          -..base }));                                                   
       66 -    expect(reviewIdentityKey(base)).toBe(                     
       67 -      reviewIdentityKey({ ...base, reviewDate: new Date(base.r
          -eviewDate!.getTime()) }),                                     
       81 +describe("reviewFingerprint", () => {                         
       82 +  test("is deterministic", () => {                            
       83 +    expect(reviewFingerprint(base)).toBe(reviewFingerprint({ .
          +..base }));                                                   
       84 +    expect(reviewFingerprint(base)).toBe(                     
       85 +      reviewFingerprint({ ...base, reviewDate: new Date(base.r
          +eviewDate!.getTime()) }),                                     
       86      );
       87    });
       88 
       71 -  test("hashes the documented, length-prefixed canonical strin
          -g", () => {                                                   
       72 -    const source = "v1|3:sam|13:1790856000123|3:4.5|10:great f
          -ood";                                                         
       89 +  test("author-time tier hashes only reviewer and time, so edi
          +ts keep the identity", () => {                                
       90 +    const source = "v2|author-time|3:sam|13:1790856000123";   
       91      expect(reviewFingerprintSource(base)).toBe(source);
       74 -    expect(reviewIdentityKey(base)).toBe(`${FINGERPRINT_KEY_PR
          -EFIX}${sha256(source)}`);                                     
       75 -    expect(reviewFingerprintSource({ text: "Fine", rating: 3 }
          -)).toBe("v1|~|~|1:3|4:fine");                                 
       92 +    expect(reviewFingerprint(base)).toBe(`${FINGERPRINT_PREFIX
          +}${sha256(source)}`);                                         
       93 +    expect(reviewFingerprint({ ...base, text: "Edited: awful",
          + rating: 1 })).toBe(                                          
       94 +      reviewFingerprint(base),                                
       95 +    );                                                        
       96    });
       97 
       78 -  test("a stable source id wins over every other field", () =>
          - {                                                            
       79 -    const a = reviewIdentityKey({ ...base, sourceReviewId: "g-
          -1" });                                                        
       80 -    const b = reviewIdentityKey({                             
       81 -      text: "Completely different",                           
       82 -      rating: 1,                                              
       83 -      reviewerName: "Someone else",                           
       84 -      sourceReviewId: "g-1",                                  
       85 -    });                                                       
       86 -    expect(a).toBe("sid:g-1");                                
       87 -    expect(b).toBe(a);                                        
       88 -  });                                                         
       89 -                                                              
       90 -  test("source ids are trimmed but never case-folded or Unicod
          -e-normalized", () => {                                        
       91 -    expect(reviewIdentityKey({ ...base, sourceReviewId: "  Ab-
          -1 \n" })).toBe("sid:Ab-1");                                   
       92 -    expect(reviewIdentityKey({ ...base, sourceReviewId: "ab-1"
          - })).not.toBe(                                                
       93 -      reviewIdentityKey({ ...base, sourceReviewId: "AB-1" }), 
       98 +  test("content tier applies when the reviewer or the time is 
          +missing", () => {                                             
       99 +    expect(reviewFingerprintSource(anonymous)).toBe("v2|conten
          +t|~|~|1:3|4:fine");                                           
      100 +    expect(reviewFingerprintSource({ ...base, reviewDate: unde
          +fined })).toBe(                                               
      101 +      "v2|content|3:sam|~|3:4.5|10:great food",               
      102      );
       95 -    expect(normalizeSourceReviewId("Café")).toBe("Café");     
      103 +    expect(reviewFingerprint({ ...anonymous, text: "Fine!" }))
          +.not.toBe(                                                    
      104 +      reviewFingerprint(anonymous),                           
      105 +    );                                                        
      106 +    expect(reviewFingerprint({ ...anonymous, rating: 4 })).not
          +.toBe(reviewFingerprint(anonymous));                          
      107    });
      108 
       98 -  test.each([[""], ["   "], ["　\t"], [null], [undefined]])(  
       99 -    "a blank or missing source id (%j) falls back to the finge
          -rprint",                                                      
      100 -    (sourceReviewId) => {                                     
      101 -      expect(reviewIdentityKey({ ...base, sourceReviewId: sour
          -ceReviewId as string })).toBe(                                
      102 -        reviewIdentityKey(base),                              
      103 -      );                                                      
      104 -    },                                                        
      105 -  );                                                          
      106 -                                                              
      107 -  test("id and fingerprint keys never collide, even for a craf
          -ted id", () => {                                              
      108 -    const fingerprint = reviewIdentityKey(base);              
      109 -    const crafted = reviewIdentityKey({ ...base, sourceReviewI
          -d: fingerprint });                                            
      110 -    expect(fingerprint.startsWith(FINGERPRINT_KEY_PREFIX)).toB
          -e(true);                                                      
      111 -    expect(crafted).toBe(`${SOURCE_ID_KEY_PREFIX}${fingerprint
          -}`);                                                          
      112 -    expect(crafted).not.toBe(fingerprint);                    
      113 -  });                                                         
      114 -                                                              
      115 -  test.each<[string, Partial<ReviewIdentityInput>]>([         
      116 -    ["text", { text: "Great fool" }],                         
      117 -    ["rating", { rating: 4 }],                                
      109 +  test.each<[string, Partial<NormalizedReview>]>([            
      110      ["reviewer", { reviewerName: "Sasha" }],
      119 -    ["missing reviewer", { reviewerName: undefined }],        
      120 -    ["date", { reviewDate: new Date("2026-10-01T12:00:00.124Z"
          -) }],                                                         
      121 -    ["missing date", { reviewDate: undefined }],              
      122 -    ["source id", { sourceReviewId: "g-9" }],                 
      123 -  ])("different %s gives a different key", (_label, change) =>
          - {                                                            
      124 -    expect(reviewIdentityKey({ ...base, ...change })).not.toBe
          -(reviewIdentityKey(base));                                    
      111 +    ["time", { reviewDate: new Date("2026-10-01T12:00:00.124Z"
          +) }],                                                         
      112 +    ["missing reviewer (tier change)", { reviewerName: undefin
          +ed }],                                                        
      113 +    ["missing time (tier change)", { reviewDate: undefined }],
      114 +  ])("a different %s gives a different fingerprint", (_label, 
          +change) => {                                                  
      115 +    expect(reviewFingerprint({ ...base, ...change })).not.toBe
          +(reviewFingerprint(base));                                    
      116    });
      117 
      127 -  test("whitespace, ASCII case, and NFC/NFD differences do not
          - create a new identity", () => {                              
      128 -    const variant = reviewIdentityKey({                       
      129 -      ...base,                                                
      130 -      text: "  GREAT  food \r\n",                             
      131 -      reviewerName: " sAM\t",                                 
      132 -    });                                                       
      133 -    expect(variant).toBe(reviewIdentityKey(base));            
      134 -    expect(reviewIdentityKey({ text: "Café", rating: 5 })).toB
          -e(                                                            
      135 -      reviewIdentityKey({ text: "Café", rating: 5 }),         
      118 +  test("whitespace, ASCII case, and NFC/NFD differences do not
          + change it", () => {                                          
      119 +    expect(reviewFingerprint({ ...base, reviewerName: " sAM\t"
          + })).toBe(reviewFingerprint(base));                           
      120 +    expect(reviewFingerprint({ text: "Café", rating: 5 })).toB
          +e(                                                            
      121 +      reviewFingerprint({ text: "Café", rating: 5 }),         
      122      );
      123 +    expect(reviewFingerprint({ ...anonymous, text: "  FINE " }
          +)).toBe(                                                      
      124 +      reviewFingerprint(anonymous),                           
      125 +    );                                                        
      126    });
      127 
      128    test("an invalid date counts as a missing date", () => {
      140 -    expect(reviewIdentityKey({ ...base, reviewDate: new Date("
          -nope") })).toBe(                                              
      141 -      reviewIdentityKey({ ...base, reviewDate: undefined }),  
      129 +    expect(reviewFingerprint({ ...base, reviewDate: new Date("
          +nope") })).toBe(                                              
      130 +      reviewFingerprint({ ...base, reviewDate: undefined }),  
      131      );
      132    });
      133 +});                                                           
      134 
      145 -  test("normalizer output for a numeric Outscraper id matches 
          -its string form", () => {                                     
      135 +describe("normalizeSourceReviewId / normalizeIdentityText", ()
          + => {                                                         
      136 +  test("source ids are trimmed, never case-folded or Unicode-n
          +ormalized; blank is none", () => {                            
      137 +    expect(normalizeSourceReviewId("  Ab-1 \n")).toBe("Ab-1");
      138 +    expect(normalizeSourceReviewId("Café")).toBe("Café");     
      139 +    expect(normalizeSourceReviewId(" 　\t")).toBeUndefined(); 
      140 +    expect(normalizeSourceReviewId(null)).toBeUndefined();    
      141 +  });                                                         
      142 +                                                              
      143 +  test("a numeric Outscraper id normalizes to its string form"
          +, () => {                                                     
      144      const numeric = normalizeReview({ text: "ok", rating: 5, s
           ourceReviewId: 12345 });
      147 -    const text = normalizeReview({ text: "ok", rating: 5, sour
          -ceReviewId: "12345" });                                       
      148 -    if (!numeric.ok || !text.ok) throw new Error("fixture shou
          -ld normalize");                                               
      149 -    expect(reviewIdentityKey(numeric.review)).toBe(reviewIdent
          -ityKey(text.review));                                         
      145 +    if (!numeric.ok) throw new Error("fixture should normalize
          +");                                                           
      146 +    expect(normalizeSourceReviewId(numeric.review.sourceReview
          +Id)).toBe("12345");                                           
      147    });
      151 -});                                                           
      148 
      153 -describe("normalizeIdentityText", () => {                     
      149    test.each<[string | null | undefined, string | undefined]>([
      150      ["  Hello   World  ", "hello world"],
      151      ["Tabs\tand\nnew\r\nlines", "tabs and new lines"],
     ...
      155      ["nul\u0000byte", "nulbyte"],
      156      ["cut \ud83d", "cut �"],
      157      ["   ", undefined],
      163 -    ["", undefined],                                          
      158      [null, undefined],
      165 -    [undefined, undefined],                                   
      166 -  ])("%j -> %j", (input, expected) => {                       
      159 +  ])("text %j -> %j", (input, expected) => {                  
      160      expect(normalizeIdentityText(input)).toBe(expected);
      161    });
      162  });
      163 
      171 -describe("dedupeReviews", () => {                             
      172 -  test("keeps the first occurrence of each identity, in input 
          -order", () => {                                               
      173 -    const first = { ...base, sourceReviewId: "g-1", text: "fir
          -st" };                                                        
      174 -    const editedLater = { ...base, sourceReviewId: "g-1", text
          -: "edited later" };                                           
      175 -    const noId = { text: "No id", rating: 3 };                
      176 -    const noIdVariant = { text: "  NO  ID ", rating: 3 };     
      177 -    const other = { text: "No id", rating: 4 };               
      164 +describe("matchStoredReview", () => {                         
      165 +  test("an incoming id matches the row with that id first", ()
          + => {                                                         
      166 +    const rows = [stored("idless", base, 1), stored("with-id",
          + { ...base, text: "x" }, 2, "g-1")];                          
      167 +    expect(matchStoredReview(rows, { ...base, sourceReviewId: 
          +" g-1 " })).toEqual({                                         
      168 +      action: "update",                                       
      169 +      rowId: "with-id",                                       
      170 +      matchedBy: "source_id",                                 
      171 +    });                                                       
      172 +  });                                                         
      173 
      179 -    const result = dedupeReviews([first, noId, editedLater, no
          -IdVariant, other]);                                           
      174 +  test("[1] an id that appears adopts the id-less row with the
          + same fingerprint", () => {                                   
      175 +    const rows = [stored("idless", base, 1)];                 
      176 +    expect(matchStoredReview(rows, { ...base, text: "edited", 
          +sourceReviewId: "g-1" })).toEqual({                           
      177 +      action: "adopt",                                        
      178 +      rowId: "idless",                                        
      179 +    });                                                       
      180 +  });                                                         
      181 
      181 -    expect(result.reviews).toEqual([first, noId, other]);     
      182 -    expect(result.reviews[0]).toBe(first);                    
      182 +  test("[2] an id that disappears matches the id'd row by fing
          +erprint", () => {                                             
      183 +    const rows = [stored("with-id", base, 1, "g-1")];         
      184 +    expect(matchStoredReview(rows, base)).toEqual({           
      185 +      action: "update",                                       
      186 +      rowId: "with-id",                                       
      187 +      matchedBy: "fingerprint",                               
      188 +    });                                                       
      189 +  });                                                         
      190 +                                                              
      191 +  test("[3] identical content with a different id is a differe
          +nt review", () => {                                           
      192 +    const rows = [stored("with-id", base, 1, "g-1")];         
      193 +    expect(matchStoredReview(rows, { ...base, sourceReviewId: 
          +"g-2" })).toEqual({                                           
      194 +      action: "insert",                                       
      195 +    });                                                       
      196 +  });                                                         
      197 +                                                              
      198 +  test("[4] several id-less copies: the oldest is adopted (tie
          +s break on id)", () => {                                      
      199 +    const rows = [                                            
      200 +      stored("c-newest", base, 3),                            
      201 +      stored("b-oldest", base, 1),                            
      202 +      stored("a-oldest", base, 1),                            
      203 +      stored("other", anonymous, 0),                          
      204 +    ];                                                        
      205 +    expect(matchStoredReview(rows, { ...base, sourceReviewId: 
          +"g-1" })).toEqual({                                           
      206 +      action: "adopt",                                        
      207 +      rowId: "a-oldest",                                      
      208 +    });                                                       
      209 +  });                                                         
      210 +                                                              
      211 +  test("without an id, an id-less row is preferred over an old
          +er id'd row", () => {                                         
      212 +    const rows = [stored("with-id", base, 1, "g-1"), stored("i
          +dless", base, 2)];                                            
      213 +    expect(matchStoredReview(rows, base)).toMatchObject({ acti
          +on: "update", rowId: "idless" });                             
      214 +  });                                                         
      215 +                                                              
      216 +  test("a new review is inserted", () => {                    
      217 +    expect(matchStoredReview([stored("x", base, 1, "g-1")], an
          +onymous)).toEqual({                                           
      218 +      action: "insert",                                       
      219 +    });                                                       
      220 +    expect(matchStoredReview([], { ...base, sourceReviewId: "g
          +-1" })).toEqual({                                             
      221 +      action: "insert",                                       
      222 +    });                                                       
      223 +  });                                                         
      224 +});                                                           
      225 +                                                              
      226 +describe("mergeReviewFields", () => {                         
      227 +  const storedReview: NormalizedReview = {                    
      228 +    ...base,                                                  
      229 +    sourceReviewId: "g-1",                                    
      230 +    reviewUrl: "https://maps.google.com/r/1",                 
      231 +    sourceMetadata: { platform: "google_maps" },              
      232 +  };                                                          
      233 +                                                              
      234 +  test("[5] text and rating take the incoming value", () => { 
      235 +    expect(mergeReviewFields(storedReview, { text: "New", rati
          +ng: 1 })).toMatchObject({                                     
      236 +      text: "New",                                            
      237 +      rating: 1,                                              
      238 +    });                                                       
      239 +  });                                                         
      240 +                                                              
      241 +  test("[7] a missing incoming field never erases a stored val
          +ue; the id is never cleared", () => {                         
      242 +    expect(mergeReviewFields(storedReview, { text: "New", rati
          +ng: 1 })).toEqual({                                           
      243 +      ...storedReview,                                        
      244 +      text: "New",                                            
      245 +      rating: 1,                                              
      246 +    });                                                       
      247 +  });                                                         
      248 +                                                              
      249 +  test("present optional fields replace stored ones; an id-les
          +s row gains the incoming id", () => {                         
      250 +    const merged = mergeReviewFields(                         
      251 +      { text: "Old", rating: 2, reviewerName: "Sam" },        
      252 +      { text: "Old", rating: 2, reviewerName: "Samuel", source
          +ReviewId: " g-9 " },                                          
      253 +    );                                                        
      254 +    expect(merged).toMatchObject({ reviewerName: "Samuel", sou
          +rceReviewId: "g-9" });                                        
      255 +  });                                                         
      256 +});                                                           
      257 +                                                              
      258 +describe("collapseReviews", () => {                           
      259 +  test("[8] repeats in one batch become one review; the last o
          +ccurrence wins", () => {                                      
      260 +    const result = collapseReviews([                          
      261 +      { ...base, sourceReviewId: "g-1", text: "first", reviewU
          +rl: "https://maps.google.com/r/1" },                          
      262 +      anonymous,                                              
      263 +      { ...base, sourceReviewId: "g-1", text: "second", rating
          +: 2 },                                                        
      264 +      { ...anonymous, text: "  FINE " },                      
      265 +    ]);                                                       
      266      expect(result.duplicateCount).toBe(2);
      267 +    expect(result.reviews).toEqual([                          
      268 +      {                                                       
      269 +        ...base,                                              
      270 +        sourceReviewId: "g-1",                                
      271 +        text: "second",                                       
      272 +        rating: 2,                                            
      273 +        reviewUrl: "https://maps.google.com/r/1",             
      274 +        sourceMetadata: undefined,                            
      275 +      },                                                      
      276 +      { ...anonymous, text: "  FINE ", sourceReviewId: undefin
          +ed },                                                         
      277 +    ]);                                                       
      278    });
      279 
      280 +  test("an id appearing or disappearing inside one batch is st
          +ill one review", () => {                                      
      281 +    const appears = collapseReviews([base, { ...base, sourceRe
          +viewId: "g-1", text: "edited" }]);                            
      282 +    const disappears = collapseReviews([{ ...base, sourceRevie
          +wId: "g-1" }, base]);                                         
      283 +    expect(appears.reviews).toHaveLength(1);                  
      284 +    expect(appears.reviews[0]).toMatchObject({ sourceReviewId:
          + "g-1", text: "edited" });                                    
      285 +    expect(disappears.reviews).toHaveLength(1);               
      286 +    expect(disappears.reviews[0].sourceReviewId).toBe("g-1"); 
      287 +  });                                                         
      288 +                                                              
      289 +  test("[3] identical content with different ids stays separat
          +e", () => {                                                   
      290 +    const result = collapseReviews([                          
      291 +      { ...base, sourceReviewId: "g-1" },                     
      292 +      { ...base, sourceReviewId: "g-2" },                     
      293 +    ]);                                                       
      294 +    expect(result.reviews.map((review) => review.sourceReviewI
          +d)).toEqual(["g-1", "g-2"]);                                  
      295 +    expect(result.duplicateCount).toBe(0);                    
      296 +  });                                                         
      297 +                                                              
      298    test("returns everything when nothing repeats, and handles a
           n empty batch", () => {
      187 -    const reviews = [base, { ...base, rating: 1 }];           
      188 -    expect(dedupeReviews(reviews)).toEqual({ reviews, duplicat
          -eCount: 0 });                                                 
      189 -    expect(dedupeReviews([])).toEqual({ reviews: [], duplicate
          -Count: 0 });                                                  
      299 +    expect(collapseReviews([base, anonymous])).toEqual({      
      300 +      reviews: [base, anonymous],                             
      301 +      duplicateCount: 0,                                      
      302 +    });                                                       
      303 +    expect(collapseReviews([])).toEqual({ reviews: [], duplica
          +teCount: 0 });                                                
      304    });
      305  });

⏺ I'm rewriting the fake database to model merge_target_reviews on top of the
  pure matcher, with the DB tests checking that the SQL makes the same
  decisions. · summary

  Read 1 file (ctrl+o to expand)

⏺ Write(tests/unit/services/ingestion/ingestion-deduplication.test.ts)
  ⎿  Added 214 lines, removed 117 lines
       1  /** @jest-environment node */
       2  /**
       3 - * S3-011 ingestion re-run behavior, end to end through the rea
         -l Outscraper client, adapter,                                  
       4 - * normalizer, and application dedupe. Only the network and Pos
         -tgreSQL are replaced:                                          
       3 + * S3-011 / S3-010 refresh behavior, end to end through the rea
         +l Outscraper client, adapter,                                  
       4 + * normalizer, and in-batch collapse. Only the network and Post
         +greSQL are replaced:                                           
       5   * - the provider is a local synthetic payload served by a fake
           fetch (no live calls);
       6 - * - FakeReviewDatabase models finish_ingestion_attempt: one at
         -omic completion per attempt, a                                 
       7 - *   (target, identity_key) unique index, and ON CONFLICT DO NO
         -THING. It derives keys with                                    
       8 - *   reviewIdentityKey, which tests/db/review-deduplication.tes
         -t.sql proves equal to the SQL                                  
       9 - *   generated column through shared golden vectors. The real c
         -onstraint is tested there.                                     
       6 + * - FakeReviewDatabase models finish_ingestion_attempt + publi
         +c.merge_target_reviews: one atomic                             
       7 + *   completion per attempt, reconciliation by the shared match
         +StoredReview/mergeReviewFields                                 
       8 + *   rules, and no write (no updated_at change) when nothing di
         +ffers.                                                         
       9 + * tests/db/review-deduplication.test.sql proves the SQL makes 
         +the same decisions, enforces them                              
      10 + * with partial unique indexes, and computes the same fingerpri
         +nts (shared golden vectors).                                   
      11 + * Numbers in brackets refer to the PR review's regression list
         +; [9] concurrency is DB-only                                   
      12 + * (tests/db/review-deduplication-concurrency.test.sh).        
      13   */
      14  import { reconcileIngestion } from "@/services/ingestion/ingest
          ion-lifecycle";
      15  import { getOwnedTargetOrThrow } from "@/services/analysis-targ
          ets/target-ownership";
     ...
      20    type IngestionAttemptRow,
      21  } from "@/services/ingestion/ingestion-attempt-repository";
      22  import { getExtractedReviews } from "@/services/ingestion/outsc
          raper-service";
      20 -import { reviewIdentityKey } from "@/services/reviews/review-id
         -entity";                                                       
      23 +import {                                                       
      24 +  matchStoredReview,                                           
      25 +  mergeReviewFields,                                           
      26 +  reviewFingerprint,                                           
      27 +} from "@/services/reviews/review-identity";                   
      28 +import type { NormalizedReview } from "@/services/reviews/types
         +";                                                             
      29 
      30  jest.mock("@/services/analysis-targets/target-ownership", () =>
           ({
      31    getOwnedTargetOrThrow: jest.fn(),
     ...
      36    getBoundAttempt: jest.fn(),
      37  }));
      38 
      31 -type Owner = "user-a" | "user-b";                              
      32 -type Target = { id: string; ownerId: Owner; placeId: string; na
         -me: string };                                                  
      33 -const TARGET_A: Target = {                                     
      34 -  id: "target-a",                                              
      35 -  ownerId: "user-a",                                           
      36 -  placeId: "ChIJTargetA",                                      
      37 -  name: "Cafe A",                                              
      38 -};                                                             
      39 +type Target = { id: string; ownerId: string; placeId: string; n
         +ame: string };                                                 
      40 +const TARGET_A: Target = { id: "target-a", ownerId: "user-a", p
         +laceId: "ChIJTargetA", name: "A" };                            
      41  const TARGET_A2: Target = {
      42    id: "target-a2",
      43    ownerId: "user-a",
      44    placeId: "ChIJTargetA2",
      43 -  name: "Cafe A2",                                             
      45 +  name: "A2",                                                  
      46  };
      45 -const TARGET_B: Target = {                                     
      46 -  id: "target-b",                                              
      47 -  ownerId: "user-b",                                           
      48 -  placeId: "ChIJTargetB",                                      
      49 -  name: "Cafe B",                                              
      50 -};                                                             
      47 +const TARGET_B: Target = { id: "target-b", ownerId: "user-b", p
         +laceId: "ChIJTargetB", name: "B" };                            
      48  const TARGETS = [TARGET_A, TARGET_A2, TARGET_B];
      49 
      53 -interface StoredReview {                                       
      50 +interface StoredReview extends NormalizedReview {              
      51    id: string;
      52    analysisTargetId: string;
      53    createdAt: number;
      57 -  identityKey: string;                                         
      58 -  text: string;                                                
      59 -  rating: number;                                              
      60 -  sourceReviewId: string | null;                               
      61 -  reviewerName: string | null;                                 
      54 +  updatedAt: number;                                           
      55 +  /** Incremented on every write, like a new row version in Pos
         +tgreSQL. */                                                    
      56 +  version: number;                                             
      57  }
      58 
      59 +const SOURCE_FIELDS = [                                        
      60 +  "text",                                                      
      61 +  "rating",                                                    
      62 +  "sourceReviewId",                                            
      63 +  "reviewerName",                                              
      64 +  "reviewDate",                                                
      65 +  "reviewUrl",                                                 
      66 +  "sourceMetadata",                                            
      67 +] as const;                                                    
      68 +const sourceFields = (review: NormalizedReview) =>             
      69 +  JSON.stringify(SOURCE_FIELDS.map((field) => review[field] ?? 
         +null));                                                        
      70 +                                                               
      71  class FakeReviewDatabase {
      72    readonly reviews: StoredReview[] = [];
      73    readonly attempts = new Map<string, IngestionAttemptRow>();
     ...
       98      return attempt;
       99    }
      100 
      101 +  /** Stores a row directly, like data written before S3-011 o
          +r by another refresh. */                                      
      102 +  seed(target: Target, review: NormalizedReview): StoredReview
          + {                                                            
      103 +    const now = ++this.clock;                                 
      104 +    const row: StoredReview = {                               
      105 +      ...review,                                              
      106 +      id: `review-${String(++this.nextId).padStart(4, "0")}`, 
      107 +      analysisTargetId: target.id,                            
      108 +      createdAt: now,                                         
      109 +      updatedAt: now,                                         
      110 +      version: 1,                                             
      111 +    };                                                        
      112 +    this.reviews.push(row);                                   
      113 +    return row;                                               
      114 +  }                                                           
      115 +                                                              
      116    latestFor(targetId: string) {
      117      return [...this.attempts.values()].filter((a) => a.analysi
           s_target_id === targetId).at(-1)!;
      118    }
      119 
       98 -  /** Browser ordering contract: (created_at, id). */         
      120 +  /** Review browser contract: every review of the target, ord
          +ered by (created_at, id). */                                  
      121    list(targetId: string) {
      122      return this.reviews
      123        .filter((review) => review.analysisTargetId === targetId
           )
      102 -      .sort((a, b) => a.createdAt - b.createdAt || a.id.locale
          -Compare(b.id));                                               
      124 +      .sort((a, b) => a.createdAt - b.createdAt || a.id.locale
          +Compare(b.id))                                                
      125 +      .map((review) => ({ ...review }));                      
      126    }
      127 
      128 +  /** Mirrors public.merge_target_reviews for one row; returns
          + whether it inserted. */                                      
      129 +  private merge(targetId: string, incoming: NormalizedReview, 
          +createdAt: number): boolean {                                 
      130 +    const rows = this.reviews.filter((review) => review.analys
          +isTargetId === targetId);                                     
      131 +    const decision = matchStoredReview(                       
      132 +      rows.map((row) => ({                                    
      133 +        id: row.id,                                           
      134 +        sourceReviewId: row.sourceReviewId ?? null,           
      135 +        fingerprint: reviewFingerprint(row),                  
      136 +        createdAt: row.createdAt,                             
      137 +      })),                                                    
      138 +      incoming,                                               
      139 +    );                                                        
      140 +    if (decision.action === "insert") {                       
      141 +      this.reviews.push({                                     
      142 +        ...incoming,                                          
      143 +        id: `review-${String(++this.nextId).padStart(4, "0")}`
          +,                                                             
      144 +        analysisTargetId: targetId,                           
      145 +        createdAt,                                            
      146 +        updatedAt: createdAt,                                 
      147 +        version: 1,                                           
      148 +      });                                                     
      149 +      return true;                                            
      150 +    }                                                         
      151 +    const row = rows.find((candidate) => candidate.id === deci
          +sion.rowId)!;                                                 
      152 +    const merged = mergeReviewFields(row, incoming);          
      153 +    if (sourceFields(merged) !== sourceFields(row)) {         
      154 +      Object.assign(row, merged, { updatedAt: ++this.clock, ve
          +rsion: row.version + 1 });                                    
      155 +    }                                                         
      156 +    return false;                                             
      157 +  }                                                           
      158 +                                                              
      159    finish = jest.fn(
      160      async (
      161        attemptId: string,
     ...
      174        if (failure === "before-commit") throw new IngestionPers
           istenceError();
      175 
      176        const createdAt = ++this.clock;
      123 -      const staged: StoredReview[] = [];                      
      177 +      let saved = 0;                                          
      178        for (const row of errorCode ? [] : rows) {
      125 -        const identityKey = reviewIdentityKey({               
      179 +        const incoming: NormalizedReview = {                  
      180            text: row.text as string,
      181            rating: row.rating as number,
      182            sourceReviewId: (row.source_review_id as string | nu
           ll) ?? undefined,
      183            reviewerName: (row.reviewer_name as string | null) ?
           ? undefined,
      184            reviewDate: row.review_date ? new Date(row.review_da
           te as string) : undefined,
      131 -        });                                                   
      132 -        const exists = [...this.reviews, ...staged].some(     
      133 -          (review) =>                                         
      134 -            review.analysisTargetId === attempt.analysis_targe
          -t_id &&                                                       
      135 -            review.identityKey === identityKey,               
      136 -        );                                                    
      137 -        if (exists) continue; // ON CONFLICT (analysis_target_
          -id, identity_key) DO NOTHING                                  
      138 -        staged.push({                                         
      139 -          id: `review-${String(++this.nextId).padStart(4, "0")
          -}`,                                                           
      140 -          analysisTargetId: attempt.analysis_target_id,       
      141 -          createdAt,                                          
      142 -          identityKey,                                        
      143 -          text: row.text as string,                           
      144 -          rating: row.rating as number,                       
      145 -          sourceReviewId: (row.source_review_id as string | nu
          -ll) ?? null,                                                  
      146 -          reviewerName: (row.reviewer_name as string | null) ?
          -? null,                                                       
      147 -        });                                                   
      185 +          reviewUrl: (row.review_url as string | null) ?? unde
          +fined,                                                        
      186 +          sourceMetadata: (row.source_metadata as Record<strin
          +g, unknown> | null) ?? undefined,                             
      187 +        };                                                    
      188 +        if (this.merge(attempt.analysis_target_id, incoming, c
          +reatedAt)) saved++;                                           
      189        }
      149 -      this.reviews.push(...staged);                           
      190        Object.assign(attempt, {
      191          status: errorCode ? "failed" : "succeeded",
      192          finished_at: new Date().toISOString(),
      153 -        saved_count: staged.length,                           
      193 +        saved_count: saved,                                   
      194          skipped_count: skippedCount,
      195          verified_identity: identity,
      196          error_code: errorCode,
     ...
      209    review_rating?: number | null;
      210    author_title?: string | null;
      211    review_timestamp?: number | null;
      212 +  review_link?: string | null;                                
      213  };
      214 
      215  let db: FakeReviewDatabase;
     ...
      226            place_id: target.placeId,
      227            name: target.name,
      228            google_id: `google-${target.id}`,
      188 -          review_link: null,                                  
      229            ...review,
      230          })),
      231        }),
     ...
      274    review_rating: 5,
      275    author_title: "Cy",
      276    review_timestamp: 1_790_000_000,
      277 +  review_link: "https://maps.google.com/review/crispy",       
      278  };
      279  const coffee: ProviderReview = {
      280    review_id: "ChZ-coffee",
     ...
      290    author_title: "Ed",
      291    review_timestamp: 1_790_000_200,
      292  };
      252 -const noId: ProviderReview = {                                
      253 -  review_text: "Great patio, slow kitchen",                   
      254 -  review_rating: 3,                                           
      255 -  author_title: "Flo",                                        
      256 -  review_timestamp: 1_790_000_300,                            
      257 -};                                                            
      293 +const withoutId = (review: ProviderReview): ProviderReview => 
          +({ ...review, review_id: null });                             
      294 
      295  const originalKey = process.env.OUTSCRAPER_API_KEY;
      296  beforeEach(() => {
     ...
      324    else process.env.OUTSCRAPER_API_KEY = originalKey;
      325  });
      326 
      291 -it("(a) re-running the same refresh creates zero new reviews a
          -nd still succeeds", async () => {                             
      292 -  const first = await refresh(TARGET_A, [crispy, coffee]);    
      293 -  const before = db.list(TARGET_A.id);                        
      327 +it("[1] a review first seen without an id adopts the id when i
          +t appears", async () => {                                     
      328 +  await refresh(TARGET_A, [withoutId(crispy)]);               
      329 +  const [before] = db.list(TARGET_A.id);                      
      330 
      295 -  const second = await refresh(TARGET_A, [crispy, coffee]);   
      331 +  const result = await refresh(TARGET_A, [crispy]);           
      332 
      297 -  expect(first).toMatchObject({ state: "succeeded", savedCount
          -: 2, skippedCount: 0 });                                      
      298 -  expect(second).toMatchObject({ state: "succeeded", savedCoun
          -t: 0, skippedCount: 0 });                                     
      299 -  expect(db.list(TARGET_A.id)).toEqual(before);               
      333 +  expect(result).toMatchObject({ state: "succeeded", savedCoun
          +t: 0 });                                                      
      334 +  const stored = db.list(TARGET_A.id);                        
      335 +  expect(stored).toHaveLength(1);                             
      336 +  expect(stored[0]).toMatchObject({                           
      337 +    id: before.id,                                            
      338 +    createdAt: before.createdAt,                              
      339 +    sourceReviewId: "ChZ-crispy",                             
      340 +  });                                                         
      341  });
      342 
      302 -it("(b) the same review twice in one provider batch is stored 
          -once and is not 'skipped'", async () => {                     
      303 -  const result = await refresh(TARGET_A, [crispy, coffee, { ..
          -.crispy }, staff]);                                           
      343 +it("[2] a review first seen with an id keeps it when a refresh
          + omits the id", async () => {                                 
      344 +  await refresh(TARGET_A, [crispy]);                          
      345 +  const [before] = db.list(TARGET_A.id);                      
      346 
      305 -  expect(result).toMatchObject({ state: "succeeded", savedCoun
          -t: 3, skippedCount: 0 });                                     
      306 -  expect(db.list(TARGET_A.id).map((review) => review.text)).to
          -Equal([                                                       
      307 -    "Crispy fries",                                           
      308 -    "Cold coffee",                                            
      309 -    "Friendly staff",                                         
      347 +  await refresh(TARGET_A, [withoutId(crispy)]);               
      348 +                                                              
      349 +  expect(db.list(TARGET_A.id)).toEqual([before]);             
      350 +});                                                           
      351 +                                                              
      352 +it("[3] identical content with different source ids stays two 
          +reviews", async () => {                                       
      353 +  const result = await refresh(TARGET_A, [crispy, { ...crispy,
          + review_id: "ChZ-other" }]);                                  
      354 +                                                              
      355 +  expect(result).toMatchObject({ savedCount: 2 });            
      356 +  expect(db.list(TARGET_A.id).map((review) => review.sourceRev
          +iewId)).toEqual([                                             
      357 +    "ChZ-crispy",                                             
      358 +    "ChZ-other",                                              
      359    ]);
      311 -  // The application collapses the repeat before the database 
          -sees the batch.                                               
      312 -  expect(db.finish.mock.calls[0][2]).toHaveLength(3);         
      360  });
      361 
      315 -it("(c)/(d) a review repeated in a later refresh is stored onc
          -e; a new review is inserted", async () => {                   
      362 +it("[4] with several stored id-less copies, the incoming id ad
          +opts the oldest one only", async () => {                      
      363 +  const copy: NormalizedReview = {                            
      364 +    text: "Crispy fries",                                     
      365 +    rating: 5,                                                
      366 +    reviewerName: "Cy",                                       
      367 +    reviewDate: new Date(1_790_000_000_000),                  
      368 +  };                                                          
      369 +  const oldest = db.seed(TARGET_A, copy);                     
      370 +  const newer = db.seed(TARGET_A, { ...copy, text: "crispy FRI
          +ES" });                                                       
      371 +                                                              
      372 +  await refresh(TARGET_A, [crispy]);                          
      373 +                                                              
      374 +  const stored = db.list(TARGET_A.id);                        
      375 +  expect(stored.map((review) => [review.id, review.sourceRevie
          +wId ?? null])).toEqual([                                      
      376 +    [oldest.id, "ChZ-crispy"],                                
      377 +    [newer.id, null],                                         
      378 +  ]);                                                         
      379 +});                                                           
      380 +                                                              
      381 +it("[5] a refresh with changed text and rating updates the rev
          +iew in place", async () => {                                  
      382    await refresh(TARGET_A, [crispy, coffee]);
      317 -  const original = db.list(TARGET_A.id);                      
      383 +  const before = db.list(TARGET_A.id);                        
      384 
      319 -  // The provider edited crispy's text; its stable review_id s
          -till identifies it.                                           
      385    const result = await refresh(TARGET_A, [
      321 -    { ...crispy, review_text: "Crispy fries (edited)" },      
      322 -    staff,                                                    
      386 +    { ...crispy, review_text: "Crispy fries, soggy buns", revi
          +ew_rating: 3 },                                               
      387      coffee,
      388    ]);
      389 
      326 -  expect(result).toMatchObject({ state: "succeeded", savedCoun
          -t: 1 });                                                      
      327 -  const stored = db.list(TARGET_A.id);                        
      328 -  expect(stored.map((review) => review.sourceReviewId)).toEqua
          -l([                                                           
      329 -    "ChZ-crispy",                                             
      330 -    "ChZ-coffee",                                             
      331 -    "ChZ-staff",                                              
      332 -  ]);                                                         
      333 -  // First write wins: existing ids, positions, and text are n
          -ever changed by a refresh.                                    
      334 -  expect(stored.slice(0, 2)).toEqual(original);               
      335 -  expect(stored[0].text).toBe("Crispy fries");                
      390 +  expect(result).toMatchObject({ state: "succeeded", savedCoun
          +t: 0 });                                                      
      391 +  const after = db.list(TARGET_A.id);                         
      392 +  expect(after.map(({ id, createdAt }) => [id, createdAt])).to
          +Equal(                                                        
      393 +    before.map(({ id, createdAt }) => [id, createdAt]),       
      394 +  );                                                          
      395 +  expect(after[0]).toMatchObject({ text: "Crispy fries, soggy 
          +buns", rating: 3 });                                          
      396 +  expect(after[0].updatedAt).toBeGreaterThan(before[0].updated
          +At);                                                          
      397 +  expect(after[1]).toEqual(before[1]);                        
      398  });
      399 
      338 -it("(e) a review without a source id is deduplicated by its no
          -rmalized fingerprint", async () => {                          
      339 -  await refresh(TARGET_A, [noId]);                            
      400 +it("[6] a refresh with identical data writes nothing", async (
          +) => {                                                        
      401 +  await refresh(TARGET_A, [crispy, coffee]);                  
      402 +  const before = db.list(TARGET_A.id);                        
      403 
      341 -  const result = await refresh(TARGET_A, [                    
      342 -    { ...noId, review_text: "  GREAT patio,  slow   kitchen\n"
          -, author_title: " flo " },                                    
      343 -    { ...noId, review_rating: 2 },                            
      404 +  const result = await refresh(TARGET_A, [crispy, coffee]);   
      405 +                                                              
      406 +  expect(result).toMatchObject({ state: "succeeded", savedCoun
          +t: 0, skippedCount: 0 });                                     
      407 +  expect(db.list(TARGET_A.id)).toEqual(before);               
      408 +});                                                           
      409 +                                                              
      410 +it("[7] a missing field in a refresh never erases the stored v
          +alue", async () => {                                          
      411 +  await refresh(TARGET_A, [crispy]);                          
      412 +                                                              
      413 +  await refresh(TARGET_A, [{ ...crispy, review_link: null, rev
          +iew_text: "Crispy fries!" }]);                                
      414 +                                                              
      415 +  expect(db.list(TARGET_A.id)[0]).toMatchObject({             
      416 +    text: "Crispy fries!",                                    
      417 +    reviewUrl: "https://maps.google.com/review/crispy",       
      418 +  });                                                         
      419 +});                                                           
      420 +                                                              
      421 +it("[8] repeats in one batch and across batches are one review
          +; the last value wins", async () => {                         
      422 +  const first = await refresh(TARGET_A, [                     
      423 +    crispy,                                                   
      424 +    coffee,                                                   
      425 +    { ...crispy, review_text: "Crispy fries (2nd copy)", revie
          +w_rating: 4 },                                                
      426    ]);
      427 +  expect(first).toMatchObject({ savedCount: 2, skippedCount: 0
          + });                                                          
      428 +  // The application merges the repeat before the database see
          +s the batch.                                                  
      429 +  expect(db.finish.mock.calls[0][2]).toHaveLength(2);         
      430 +  expect(db.list(TARGET_A.id)[0]).toMatchObject({ text: "Crisp
          +y fries (2nd copy)", rating: 4 });                            
      431 
      346 -  expect(result).toMatchObject({ state: "succeeded", savedCoun
          -t: 1 });                                                      
      432 +  await refresh(TARGET_A, [{ ...crispy, review_text: "Crispy f
          +ries (3rd)" }]);                                              
      433 +                                                              
      434    const stored = db.list(TARGET_A.id);
      435    expect(stored).toHaveLength(2);
      349 -  expect(stored.every((review) => review.sourceReviewId === nu
          -ll)).toBe(true);                                              
      350 -  expect(stored.map((review) => review.rating)).toEqual([3, 2]
          -);                                                            
      436 +  expect(stored[0]).toMatchObject({ text: "Crispy fries (3rd)"
          +, rating: 5 });                                               
      437  });
      438 
      353 -it("(f) identical reviews of different targets and different a
          -ccounts are never merged", async () => {                      
      354 -  await refresh(TARGET_A, [crispy, noId]);                    
      355 -  const sameUserOtherTarget = await refresh(TARGET_A2, [crispy
          -, noId]);                                                     
      356 -  const otherAccount = await refresh(TARGET_B, [crispy, noId])
          -;                                                             
      439 +it("[10] identical reviews of different targets and accounts a
          +re never matched", async () => {                              
      440 +  await refresh(TARGET_A, [crispy, withoutId(coffee)]);       
      441 +  const sameUserOtherTarget = await refresh(TARGET_A2, [crispy
          +, withoutId(coffee)]);                                        
      442 +  const otherAccount = await refresh(TARGET_B, [crispy, withou
          +tId(coffee)]);                                                
      443 
      444    expect(sameUserOtherTarget).toMatchObject({ state: "succeede
           d", savedCount: 2 });
      445    expect(otherAccount).toMatchObject({ state: "succeeded", sav
           edCount: 2 });
      360 -  expect(db.list(TARGET_A.id)).toHaveLength(2);               
      361 -  expect(db.list(TARGET_A2.id)).toHaveLength(2);              
      362 -  expect(db.list(TARGET_B.id)).toHaveLength(2);               
      446 +  expect(db.reviews).toHaveLength(6);                         
      447  });
      448 
      365 -it("(g) a storage failure before commit saves nothing, and the
          - retry stores each review once", async () => {                
      449 +it("[11] ids cited earlier still resolve, in browser order, af
          +ter adoption and refresh", async () => {                      
      450 +  await refresh(TARGET_A, [withoutId(crispy), coffee]);       
      451 +  const cited = db.list(TARGET_A.id).map((review) => review.id
          +);                                                            
      452 +                                                              
      453 +  await refresh(TARGET_A, [{ ...crispy, review_text: "Crispy f
          +ries (edited)" }, coffee, staff]);                            
      454 +                                                              
      455 +  const stored = db.list(TARGET_A.id);                        
      456 +  expect(stored.slice(0, 2).map((review) => review.id)).toEqua
          +l(cited);                                                     
      457 +  expect(stored.find((review) => review.id === cited[0])).toMa
          +tchObject({                                                   
      458 +    sourceReviewId: "ChZ-crispy",                             
      459 +    text: "Crispy fries (edited)",                            
      460 +  });                                                         
      461 +  expect(stored[2].text).toBe("Friendly staff");              
      462 +});                                                           
      463 +                                                              
      464 +it("a storage failure before commit saves nothing, and the ret
          +ry stores each review once", async () => {                    
      465    db.failNextFinish = "before-commit";
      466    await expect(refresh(TARGET_A, [crispy, coffee, crispy])).re
           jects.toBeInstanceOf(
      467      IngestionPersistenceError,
     ...
      475    expect(db.list(TARGET_A.id)).toHaveLength(2);
      476  });
      477 
      379 -it("(g) a lost response after commit is not saved again by the
          - retry or later polls", async () => {                         
      478 +it("a lost response after commit is not saved again by the ret
          +ry or later polls", async () => {                             
      479    db.failNextFinish = "after-commit";
      480    await expect(refresh(TARGET_A, [crispy, coffee])).rejects.to
           BeInstanceOf(
      481      IngestionPersistenceError,
     ...
      489    expect(db.list(TARGET_A.id)).toHaveLength(2);
      490  });
      491 
      393 -it("(h) counts and ordering stay correct across several refres
          -hes", async () => {                                           
      492 +it("counts and ordering stay correct across several refreshes"
          +, async () => {                                               
      493    const unusable: ProviderReview = { review_id: "ChZ-empty", r
           eview_text: "", review_rating: 4 };
      494    const runs = [
      396 -    await refresh(TARGET_A, [crispy, coffee, unusable]),      
      397 -    await refresh(TARGET_A, [coffee, staff, staff, noId]),    
      398 -    await refresh(TARGET_A, [noId, crispy, staff, coffee]),   
      495 +    await refresh(TARGET_A, [crispy, withoutId(coffee), unusab
          +le]),                                                         
      496 +    await refresh(TARGET_A, [coffee, staff, staff]),          
      497 +    await refresh(TARGET_A, [staff, crispy, withoutId(coffee)]
          +),                                                            
      498    ];
      499 
      500    expect(runs.map(({ savedCount, skippedCount }) => [savedCoun
           t, skippedCount])).toEqual([
      501      [2, 1],
      403 -    [2, 0],                                                   
      502 +    [1, 0],                                                   
      503      [0, 0],
      504    ]);
      505    const stored = db.list(TARGET_A.id);
      407 -  expect(stored.map((review) => review.text)).toEqual([       
      408 -    "Crispy fries",                                           
      409 -    "Cold coffee",                                            
      410 -    "Friendly staff",                                         
      411 -    "Great patio, slow kitchen",                              
      506 +  expect(stored.map((review) => [review.text, review.sourceRev
          +iewId])).toEqual([                                            
      507 +    ["Crispy fries", "ChZ-crispy"],                           
      508 +    ["Cold coffee", "ChZ-coffee"],                            
      509 +    ["Friendly staff", "ChZ-staff"],                          
      510    ]);
      413 -  expect(new Set(stored.map((review) => review.identityKey)).s
          -ize).toBe(stored.length);                                     
      511    expect(runs.reduce((sum, run) => sum + run.savedCount, 0)).t
           oBe(stored.length);
      512  });

⏺ Updating my earlier review-service.test.ts case: in-batch repeats now merge
  with the last occurrence winning, where before the first occurrence was kept.

  Searched for 1 pattern (ctrl+o to expand)

⏺ Bash(python3 - <<'PY'
      p='tests/unit/services/reviews/review-service.test.ts'…)
  ⎿  Updated src/services/reviews/review-identity.ts +3 -1
      144      if (sameId) return { action: "update", rowId: sameId.id, m
           atchedBy: "source_id" };
      145      // The id appeared: claim the oldest id-less copy instead 
           of inserting a second record.
      146      // A row with a DIFFERENT id is a different review and is 
           never adopted.
      147 -    const idless = rows.find((row) => row.sourceReviewId === n
          -ull && row.fingerprint === fingerprint);                      
      147 +    const idless = rows.find(                                 
      148 +      (row) => row.sourceReviewId === null && row.fingerprint 
          +=== fingerprint,                                              
      149 +    );                                                        
      150      if (idless) return { action: "adopt", rowId: idless.id };
      151      return { action: "insert" };
      152    }
  ⎿  Updated tests/unit/services/reviews/review-identity.test.ts +2 -1
      66    });
      67 
      68    test("cover the documented equivalences and differences", ()
          => {
      69 -    const fp = (name: string) => vectors.find((vector) => vecto
         -r.name === name)!.expectedFingerprint;                         
      69 +    const fp = (name: string) =>                               
      70 +      vectors.find((vector) => vector.name === name)!.expectedF
         +ingerprint;                                                    
      71      expect(fp("fingerprint whitespace and ASCII case variant"))
          .toBe(
      72        fp("fingerprint with every field"),
      73      );
  ⎿  Updated tests/unit/services/reviews/review-service.test.ts +4 -4
      173    });
      174 
      175    // S3-011 intentionally replaced the Sprint 1 rule that stor
           ed repeated source ids as-is.
      176 -  test("a review repeated within one batch is sent to the stor
          -e once (S3-011)", async () => {                               
      176 +  test("a review repeated within one batch is sent to the stor
          +e once, last value winning (S3-011)", async () => {           
      177      const duplicate = { text: "Again", rating: 4, sourceReview
           Id: "src-1" };
      178      const edited = { text: "Edited again", rating: 2, sourceRe
           viewId: "src-1" };
      179      const noId = { text: "No id", rating: 3 };
     ...
      185        { text: "  NO   ID ", rating: 3 },
      186      ]);
      187 
      188 -    expect(saved.map((r) => [r.sourceReviewId, r.text])).toEqu
          -al([                                                          
      189 -      ["src-1", "Again"],                                     
      190 -      [null, "No id"],                                        
      188 +    expect(saved.map((r) => [r.sourceReviewId, r.text, r.ratin
          +g])).toEqual([                                                
      189 +      ["src-1", "Edited again", 2],                           
      190 +      [null, "  NO   ID ", 3],                                
      191      ]);
      192      expect(inserted).toHaveLength(1);
      193      expect(inserted[0]).toHaveLength(2);
  ⎿  (timeout 5m)

⏺ 336/336 focused tests pass. Now the mutation checks, starting with TS. Each
  mutation is applied to a backed-up file and then restored.

  Ran 1 shell command (ctrl+o to expand)

⏺ Both TypeScript mutations were caught, and with the file restored the suite is
  back to 54/54. Next I'll run the SQL mutations, each against a fresh database
  built from the mutated migration. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ Adoption and update mutations are both caught, by the DB test and by the "id
  appears" race. The lock-removal result printed nothing my filter matched, so
  I'm re-running it with full output:

  Ran 2 shell commands (ctrl+o to expand)

⏺ Without the lock, the duplicate-id race fails safely with a unique-index
  error, which stops the script before race 2. I'm now running a scratch copy
  with only race 2 against the lock-less version to confirm the lock is what
  prevents the silent duplicate. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ The mutant is caught by the failing test, though I haven't inspected the
  leftover rows, so duplicates aren't confirmed. The migration is restored
  byte-for-byte, and I'm moving on to the doc rewrite. · summary

⏺ Write(docs/s3-011-duplicate-reviews.md)
  ⎿  Added 165 lines, removed 94 lines
        1  # S3-011 Prevent Duplicate Reviews During Re-Ingestion
        2 
        3  Re-ingesting or refreshing an AnalysisTarget never creates a s
           econd Review record for a source
        4 -review that is already stored for that target. This replaces t
          -he Sprint 1 rule (S1-022) that                                
        5 -stored repeated source reviews as separate rows.              
        4 +review that is already stored for that target. Instead, the st
          +ored review is reconciled with the                            
        5 +refreshed source fields. This replaces the Sprint 1 rule (S1-0
          +22) that stored repeated source                               
        6 +reviews as separate rows.                                     
        7 
        7 -| Rule                                                        
          -         | How it is met                                      
          -                                                              
          -                |                                             
        8 -| ------------------------------------------------------------
          --------- | ---------------------------------------------------
          ---------------------------------------------------------------
          ---------------- |                                             
        9 -| S3-BR-017: re-ingestion must not silently create duplicate r
          -eviews   | Unique index on `(analysis_target_id, identity_key)
          -`. Both writers use `ON CONFLICT DO NOTHING`. The app also ded
          -upes each batch |                                             
       10 -| S3-BR-018: the duplicate strategy must be deterministic and 
          -testable | Pure key function in TS and SQL, with shared golden
          - vectors and unit, ingestion, DB, concurrency, and migration t
          -ests            |                                             
        8 +| Rule                                                        
          +                                         | How it is met      
          +                                                              
          +                                                              
          +                                   |                          
        9 +| ------------------------------------------------------------
          +---------------------------------------- | -------------------
          +--------------------------------------------------------------
          +--------------------------------------------------------------
          +---------------------------------- |                          
       10 +| S3-BR-017: re-ingestion must not silently create duplicate r
          +eviews                                   | Every write goes th
          +rough `merge_target_reviews`, which matches by source id, adop
          +tion, or fingerprint under a per-target lock. Two partial uniq
          +ue indexes back it up              |                          
       11 +| S3-BR-018: the duplicate strategy must be deterministic and 
          +testable                                 | Pure matcher and fi
          +ngerprint in TS, the same rules in SQL, shared golden vectors,
          + and unit, ingestion, DB, concurrency, and migration tests    
          +                                     |                        
       12 +| S3-010 (#116): "existing reviews with the same stable identi
          +ty should be reconciled with updated source fields" | A match 
          +updates the stored row in place (same id and `created_at`). Mi
          +ssing values never erase stored data. Reviews absent from a pa
          +rtial response are never removed (S3-009) |                   
       13 
       12 -## Identity key                                               
       14 +The canonical text of S3-010's rules (S3-BR-015, S3-BR-019) is
          + not in the repository, so this                               
       15 +work follows the issue text quoted above.                     
       16 
       14 -Each review has one identity key. The key is unique only withi
          -n its AnalysisTarget, never across                            
       15 -targets or accounts.                                          
       17 +## Identity                                                   
       18 
       17 -1. **Stable source id:** `sid:<source_review_id>` when the sou
          -rce supplies a non-blank id. For                              
       18 -   Outscraper this is `review_id`, mapped by the adapter, and 
          -numeric ids become strings. The id is                         
       19 -   only trimmed: it is opaque, so it is not case-folded or Uni
          -code-normalized.                                              
       20 -2. **Fingerprint:** `fp1:<sha256 hex>` when there is no usable
          - id. It hashes this UTF-8 string:                             
       19 +Each review row has two identity columns, scoped to its Analys
          +isTarget and never compared across                            
       20 +targets or accounts:                                          
       21 
       22 -   ```text                                                    
       23 -   v1|field(reviewer name)|field(review time)|field(rating)|fi
          -eld(review text)                                              
       24 -   field(x) = <length of x in code points>:x, or ~ when x is a
          -bsent                                                         
       25 -   ```                                                        
       22 +- **`source_review_id`** (nullable): the source's stable id, f
          +or Outscraper `review_id`. It is                              
       23 +  stored normalized: trimmed, with a blank id stored as null. 
          +It is not case-folded, because ids                            
       24 +  are opaque. A CHECK constraint enforces the normalized form.
          + Different non-null ids are always                            
       25 +  different reviews.                                          
       26 +- **`review_fingerprint`**: `fp2:<sha256 hex>`, stored for eve
          +ry row as a generated column, so no                           
       27 +  caller can set it. It hashes one of two strings:            
       28 
       27 -   The length prefix keeps the encoding safe from delimiters: 
          -a `|` inside the text cannot shift                            
       28 -   one field into another.                                    
       29 +  ```text                                                     
       30 +  author-time tier (reviewer name AND review time present):  v
          +2|author-time|f(name)|f(time)                                 
       31 +  content tier (either one missing):                          
          +v2|content|f(name)|f(time)|f(rating)|f(text)                  
       32 +  f(x) = <length of x in code points>:x, or ~ when x is absent
       33 +  ```                                                         
       34 
       30 -The `sid:` and `fp1:` prefixes keep the two identity types fro
          -m colliding, even when an id happens                          
       31 -to look like a fingerprint.                                   
       35 +### Why text is (mostly) not in the fingerprint               
       36 
       33 -### Normalization rules (fingerprint only)                    
       37 +A refreshed review can be edited, so a fingerprint that includ
          +es text or rating would stop                                  
       38 +matching and create a new row. When the reviewer name and revi
          +ew time are both known, the                                   
       39 +fingerprint uses only those two stable attributes, and edits k
          +eep the same identity. When either                            
       40 +one is missing, those attributes alone would merge unrelated r
          +eviews: every anonymous, undated                              
       41 +review posted through the owner API would collapse into one. S
          +o the content tier also includes                              
       42 +rating and text. The trade-offs are listed under "Known limita
          +tions".                                                       
       43 
       35 -| Field                      | Rule                           
          -                                                              
          -                                                              
          -                                                              
          -                        |                                     
       36 -| -------------------------- | -------------------------------
          ---------------------------------------------------------------
          ---------------------------------------------------------------
          ---------------------------------------------------------------
          ------------------------ |                                     
       37 -| Review text, reviewer name | Storable-text cleanup (as persi
          -sted), Unicode NFC, each whitespace run becomes one space, tri
          -m, ASCII-only case folding. An empty result counts as absent. 
          -Whitespace is an explicit set: ECMAScript `\s`, which is Unico
          -de White_Space plus BOM |                                     
       38 -| Review time                | UTC epoch milliseconds, the pre
          -cision of a JavaScript `Date`                                 
          -                                                              
          -                                                              
          -                        |                                     
       39 -| Rating                     | Shortest decimal (`4`, `4.5`), 
          -which is `trim_scale(numeric)::text` in SQL                   
          -                                                              
          -                                                              
          -                        |                                     
       40 -| Missing optional fields    | Encoded as `~`, which is distin
          -ct from any present value                                     
          -                                                              
          -                                                              
          -                        |                                     
       44 +Outscraper also returns an `author_id`. It is deliberately not
          + stored or fingerprinted: reviewer                            
       45 +privacy calls for storing as little reviewer data as possible,
          + and source review ids already                                
       46 +identify Outscraper reviews.                                  
       47 
       42 -Full Unicode case folding is deliberately not used: PostgreSQL
          - `lower()` depends on the database                            
       43 -collation, so the result could differ between environments. No
          -n-ASCII letters keep their case.                              
       48 +### Normalization (fingerprint inputs)                        
       49 
       45 -### One rule, two implementations                             
       50 +| Field                      | Rule                           
          +                                                              
          +                                                              
          +                                                |             
       51 +| -------------------------- | -------------------------------
          +--------------------------------------------------------------
          +--------------------------------------------------------------
          +----------------------------------------------- |             
       52 +| Reviewer name, review text | Storable-text cleanup (as persi
          +sted), Unicode NFC, each whitespace run becomes one space, tri
          +m, ASCII-only case folding. An empty result counts as absent. 
          +Whitespace is an explicit set: ECMAScript `\s`, which is Unico
          +de White_Space plus BOM |                                     
       53 +| Review time                | UTC epoch milliseconds         
          +                                                              
          +                                                              
          +                                                |             
       54 +| Rating (content tier only) | Shortest decimal (`4`, `4.5`), 
          +which is `trim_scale(numeric)::text` in SQL                   
          +                                                              
          +                                                |             
       55 
       47 -- `src/services/reviews/review-identity.ts` (pure, no I/O) col
          -lapses repeats inside a batch before                          
       48 -  anything is written. Both the ingestion path (`reconcileInge
          -stion`) and the owner review API                              
       49 -  (`saveReviews`) use it, keeping the first occurrence in inpu
          -t order.                                                      
       50 -- `public.review_identity_key(...)` in `supabase/migrations/20
          -261126120000_prevent_duplicate_reviews.sql`                   
       51 -  computes `reviews.identity_key`, a `STORED` generated column
          -. No caller can choose or forge the                           
       52 -  key. This database value is the one the unique index enforce
          -s, so it is authoritative.                                    
       53 -- `tests/fixtures/review-identity-vectors.json` holds golden v
          -ectors. Jest and                                              
       54 -  `tests/db/review-deduplication.test.sql` both check every ve
          -ctor, so the two implementations                              
       55 -  cannot drift without a test failing.                        
       56 +Full Unicode case folding is not used because PostgreSQL `lowe
          +r()` depends on the database                                  
       57 +collation.                                                    
       58 
       57 -Neither implementation may change in place. A changed rule nee
          -ds a new prefix (for example `fp2:`)                          
       58 -and a migration that recomputes the stored keys.              
       59 +## Matching order                                             
       60 
       60 -## Database guarantee and conflict behavior                   
       61 +`public.merge_target_reviews` reconciles a batch one row at a 
          +time, in batch order, under a                                 
       62 +per-target advisory lock. `matchStoredReview` in `src/services
          +/reviews/review-identity.ts` is the                           
       63 +same decision as a pure function.                             
       64 
       62 -- `reviews_target_identity_key_idx` is a unique index on `(ana
          -lysis_target_id, identity_key)`. It                           
       63 -  holds for repeated, retried, and concurrent writers. A two-s
          -ession test shows a second                                    
       64 -  concurrent writer waiting on the first, then skipping the re
          -view.                                                         
       65 -- `finish_ingestion_attempt` and `insert_reviews` collapse rep
          -eats within the payload (first                                
       66 -  occurrence wins) and insert with `ON CONFLICT (analysis_targ
          -et_id, identity_key) DO NOTHING`.                             
       67 -- **Do nothing, not update.** Reviews are immutable for client
          -s (no UPDATE grant). Grounded Q&A                             
       68 -  citations refer to a review's id and text, so changing text 
          -under an existing id would silently                           
       69 -  change the evidence behind earlier answers. Do nothing also 
          -keeps each row's id and                                       
       70 -  `created_at`, so the review browser's `(created_at, id)` ord
          -er stays stable across refreshes.                             
       71 -  The trade-off: if the source edits a review, the stored text
          - is not refreshed.                                            
       72 -- `saved_count` and the `insert_reviews` result count **new** 
          -rows only. Repeats are not added to                           
       73 -  `skipped_count`, which still means unusable records. A compl
          -etion whose reviews were all already                          
       74 -  stored succeeds with `saved_count = 0`, and the target still
          - has reviews. For this case the                               
       75 -  migration relaxes the succeeded branch of `ingestion_attempt
          -_lifecycle` from `saved_count > 0`                            
       76 -  to `saved_count >= 0`. Without that change, such a completio
          -n would raise, keep the paid job                              
       77 -  `processing`, and finally block the target as `RESULT_WINDOW
          -_EXPIRED`.                                                    
       78 -- Error codes, response shapes, ownership checks, quotas, RLS,
          - grants, `SECURITY DEFINER`, and the                          
       79 -  empty `search_path` are unchanged. The key helpers are owner
          --only (no EXECUTE for                                         
       80 -  `anon` or `authenticated`).                                 
       65 +| Incoming review                                             
          +            | Decision                                        
          +                                                              
          + |                                                            
       66 +| ------------------------------------------------------------
          +----------- | ------------------------------------------------
          +--------------------------------------------------------------
          + |                                                            
       67 +| Has an id that is already stored                            
          +            | **Update** that row                             
          +                                                              
          + |                                                            
       68 +| Has an id that is not stored, and an id-less row has the sam
          +e fingerprint | **Adopt** that row: set its `source_review_id`
          +, keep its id and `created_at`, and refresh its fields. The ol
          +dest such row wins, though the index allows only one |        
       69 +| Has an id, and nothing above matches                        
          +            | **Insert**. A row with a different id is never a
          +dopted, even when the fingerprints are equal                  
          + |                                                            
       70 +| Has no id, and a row has the same fingerprint               
          +            | **Update** that row. An id-less row is preferred
          +, otherwise the oldest row with an id. A stored id is never cl
          +eared |                                                       
       71 +| Has no id, and nothing matches                              
          +            | **Insert**                                      
          +                                                              
          + |                                                            
       72 
       73 +"Oldest" means ordered by `(created_at, id)`. One incoming rev
          +iew adopts at most one row.                                   
       74 +                                                              
       75 +## Refresh rule for a matched review (S3-010)                 
       76 +                                                              
       77 +- **Updated in place:** `review_text`, `rating`, `reviewer_nam
          +e`, `review_date`, `review_url`, and                          
       78 +  `source_metadata`. These are all the source fields ReviewLen
          +s stores. The adapter maps no owner                           
       79 +  responses, likes, or edited flags, and this story does not a
          +dd any.                                                       
       80 +- **Never changed:** `id`, `created_at`, and `analysis_target_
          +id`, so citations and the review                              
       81 +  browser's `(created_at, id)` order keep working. A stored `s
          +ource_review_id` is never cleared or                          
       82 +  replaced. The fingerprint is a generated column, so it recom
          +putes from the refreshed fields.                              
       83 +- **Null handling:** text and rating are required on every inc
          +oming review, so the incoming value                           
       84 +  is always taken. An optional field that is missing or null k
          +eeps the stored value, so a partial                           
       85 +  or throttled response cannot erase data. No provider signal 
          +currently says "this field was                                
       86 +  removed at the source", so a removed field is not cleared ei
          +ther.                                                         
       87 +- **Idempotent:** the row is written only when a value `IS DIS
          +TINCT FROM` the stored one. Only                              
       88 +  then does `updated_at` (new, `not null`, backfilled from `cr
          +eated_at`) move. An identical refresh                         
       89 +  writes nothing.                                             
       90 +- **Repeats within one batch:** they merge in batch order, so 
          +the **last occurrence wins** for                              
       91 +  every field it provides, and fields it omits keep earlier va
          +lues. Each review keeps the position                          
       92 +  of its first occurrence. The app applies the same rules befo
          +re writing (`collapseReviews`), and                           
       93 +  the database applies them again.                            
       94 +- **Counts:** `saved_count` and the `insert_reviews` result: `
          +saved_count` counts **new** rows.                             
       95 +  `insert_reviews` returns the rows it created or changed, eac
          +h once. Unchanged matches are not                             
       96 +  returned. A completion whose reviews were all already stored
          + succeeds with `saved_count = 0`.                             
       97 +  For that case, the succeeded branch of `ingestion_attempt_li
          +fecycle` now allows                                           
       98 +  `saved_count >= 0`. Without the change such a completion wou
          +ld raise, keep the paid job                                   
       99 +  `processing`, and eventually block the target as `RESULT_WIN
          +DOW_EXPIRED`.                                                 
      100 +                                                              
      101 +## Database guarantees                                        
      102 +                                                              
      103 +- `reviews_target_source_review_id_key`: `UNIQUE (analysis_tar
          +get_id, source_review_id) WHERE source_review_id IS NOT NULL`.
      104 +- `reviews_target_idless_fingerprint_key`: `UNIQUE (analysis_t
          +arget_id, review_fingerprint) WHERE source_review_id IS NULL`.
      105 +  Rows with ids are outside this index, so two reviews with di
          +fferent ids are never blocked, even                           
      106 +  when their fingerprints are identical.                      
      107 +- The two indexes cannot see an id-less copy and an id'd copy 
          +of the same review racing each                                
      108 +  other. The per-target advisory lock in `merge_target_reviews
          +` serializes reconciliation for                               
      109 +  that case. A two-session test covers both races: the same ba
          +tch, and an id appearing.                                     
      110 +- Both writers (`finish_ingestion_attempt` and `insert_reviews
          +`) call `merge_target_reviews`.                               
      111 +  Both remain `SECURITY DEFINER` with an empty `search_path`, 
          +and their grants are unchanged.                               
      112 +  `merge_target_reviews` and the identity helpers run with inv
          +oker rights and are not executable                            
      113 +  by `anon`, `authenticated`, or `service_role`.              
      114 +- Error codes, response shapes, ownership checks, quotas, and 
          +RLS are unchanged.                                            
      115 +                                                              
      116  ## Existing data
      117 
       84 -The migration adds the generated column, which computes keys f
          -or existing rows. Within each target                          
       85 -it then deletes every row except the oldest of each identity, 
          -ordered by `(created_at, id)`, and                            
       86 -raises a notice with the number removed. Only after that does 
          -it create the unique index. Adding                            
       87 -the column holds an exclusive lock, so no write can land betwe
          -en cleanup and index creation.                                
      118 +The migration locks `reviews`, normalizes existing ids, and ad
          +ds the generated fingerprint and                              
      119 +`updated_at`. It then merges duplicates in three passes:      
      120 
       89 -Nothing persisted references `reviews.id`. There are no foreig
          -n keys to it, and Q&A citations are                           
       90 -computed per request and never stored. Removing the newer copi
          -es therefore leaves no dangling                               
       91 -reference. An answer already open in a browser may cite a remo
          -ved copy until the page reloads.                              
       92 -Historical `saved_count` values of earlier attempts are left a
          -s recorded.                                                   
      121 +1. Rows sharing a source id.                                  
      122 +2. Id-less rows sharing a fingerprint.                        
      123 +3. An id-less row whose fingerprint belongs to **exactly one**
          + row with an id (the id appeared                              
      124 +   after Sprint 1 stored a second copy). Ambiguous fingerprint
          +s are left alone.                                             
      125 
      126 +Each group survives as its **oldest** row by `(created_at, id)
          +`. That row takes the newest                                  
      127 +non-null value of every source field, and its `updated_at` is 
          +set to the newest copy's                                      
      128 +`created_at`. Before any copy is deleted, every single-column 
          +foreign key that references                                   
      129 +`reviews.id` is re-pointed to the survivor. The migration fail
          +s closed if a multi-column reference                          
      130 +exists. Today nothing references `reviews.id`, and Q&A citatio
          +ns are not persisted. The re-point                            
      131 +step protects any table that a team member adds earlier (for e
          +xample S3-006). A notice reports how                          
      132 +many rows each pass merged. Only after cleanup are the unique 
          +indexes and the CHECK constraint                              
      133 +created.                                                      
      134 +                                                              
      135  ## Known limitations
      136 
       96 -- **Fingerprint collisions are intentional merges.** Two genui
          -nely distinct reviews without a                               
       97 -  source id, with the same reviewer name, review time, rating,
          - and normalized text, are stored                              
       98 -  once.                                                       
       99 -- A review seen once without an id and later with an id (or th
          -e reverse) gets two different keys,                           
      100 -  so it is stored twice.                                      
      101 -- If the source changes a fingerprinted review's text, rating,
          - or time, it gets a new fingerprint                           
      102 -  and is stored as a new row. With a stable id, the edit is ig
          -nored instead (see do nothing above).                         
      103 -- `reserve_ingestion_attempt` still allows only one successful
          - ingestion per target. These                                  
      104 -  guarantees cover the owner review API, retries, and any futu
          -re refresh flow that creates new                              
      105 -  attempts. The DB tests simulate that by recording later atte
          -mpts directly.                                                
      137 +- **No source id, author-time tier:** two different reviews wi
          +th the same normalized reviewer name                          
      138 +  and the same review time are treated as one review. This is 
          +more likely with day-precision                                
      139 +  dates (for example `2026-10-01` from the owner API) and comm
          +on names.                                                     
      140 +- **No source id, content tier:** an edit to the text or ratin
          +g creates a new review, because                               
      141 +  nothing stable is left to match on. Two genuinely identical 
          +reviews (same name, time, rating,                             
      142 +  and text) are stored once.                                  
      143 +- **Tier change:** a review without an id whose reviewer name 
          +or time first appears or changes in a                         
      144 +  later refresh gets a different fingerprint and is stored as 
          +a new review.                                                 
      145 +- **Ambiguous matches:** a review without an id that matches s
          +everal rows with different ids                                
      146 +  updates the oldest one. During cleanup, such ambiguous group
          +s are left unmerged.                                          
      147 +- **Fields are never cleared:** a field removed at the source 
          +stays stored (see the null rule).                             
      148 +- **Non-FK references:** review ids kept outside a foreign key
          + (for example inside JSON) are not                            
      149 +  re-pointed by the cleanup.                                  
      150 +- **No refresh flow yet:** `reserve_ingestion_attempt` still a
          +llows one successful ingestion per                            
      151 +  target. These guarantees cover the owner review API, retries
          +, and the S3-009 refresh flow once it                         
      152 +  creates new attempts. The DB tests simulate those refreshes.
      153 
      154 +## One rule, two implementations                              
      155 +                                                              
      156 +`src/services/reviews/review-identity.ts` holds the pure TS si
          +de:                                                           
      157 +                                                              
      158 +- `normalizeSourceReviewId`                                   
      159 +- `reviewFingerprint`                                         
      160 +- `matchStoredReview`                                         
      161 +- `mergeReviewFields`                                         
      162 +- `collapseReviews`, used by `reconcileIngestion` and `saveRev
          +iews`                                                         
      163 +                                                              
      164 +The SQL side is `review_source_id`, `review_fingerprint`, and 
          +`merge_target_reviews` in                                     
      165 +`supabase/migrations/20261126120000_prevent_duplicate_reviews.
          +sql`. The golden vectors in                                   
      166 +`tests/fixtures/review-identity-vectors.json` are checked by b
          +oth Jest and                                                  
      167 +`tests/db/review-deduplication.test.sql`. Neither side may cha
          +nge in place: a changed rule needs a                          
      168 +new prefix (`fp3:`) and a migration that recomputes stored fin
          +gerprints.                                                    
      169 +                                                              
      170  ## Tests
      171 
      109 -- `tests/unit/services/reviews/review-identity.test.ts`: golde
          -n vectors, determinism, id wins over                          
      110 -  the fingerprint, normalization edge cases, distinct inputs, 
          -no cross-type collisions, and batch                           
      111 -  dedupe order.                                               
      172 +- `tests/unit/services/reviews/review-identity.test.ts`: golde
          +n vectors, fingerprint tiers and                              
      173 +  normalization, every matcher decision (including the oldest 
          +of several id-less copies), the                               
      174 +  null-handling merge, and in-batch last-wins collapse.       
      175  - `tests/unit/services/ingestion/ingestion-deduplication.test.
           ts`: synthetic Outscraper payloads
      113 -  run through the real client, adapter, normalizer, and lifecy
          -cle. Covers repeated refreshes,                               
      114 -  in-batch and cross-batch repeats, new reviews, fingerprint f
          -allback, target and account                                   
      115 -  isolation, failures before and after commit, and final count
          -s and order.                                                  
      116 -- `tests/db/review-deduplication.test.sql`, `review-deduplicat
          -ion-concurrency.test.sh`, and                                 
      117 -  `review-deduplication-migration.test.sh` (all run by `npm ru
          -n test:db`): constraint, privileges,                          
      118 -  vector parity, both writers, two concurrent sessions, and cl
          -eanup of pre-existing duplicates.                             
      119 -- Three existing tests were updated for the intended behavior 
          -change. The Sprint 1 "duplicates are                          
      120 -  stored as-is" assertions in `reviews.test.sql` and `review-s
          -ervice.test.ts` now assert the                                
      121 -  dedupe. Two DB fixtures that inserted many identical rows to
          - test size and count limits                                   
      122 -  (`review-summary.test.sql`, `reviews-security-hardening.test
          -.sql`) now give each row a distinct                           
      123 -  text or same-length timestamp, so their size and count asser
          -tions are unchanged.                                          
      176 +  through the real client, adapter, normalizer, and lifecycle.
          + Covers id appearing and                                      
      177 +  disappearing, distinct ids, adoption of the oldest copy, ref
          +reshed and identical data, null                               
      178 +  handling, repeats within and across batches, target and acco
          +unt isolation, stable cited ids,                              
      179 +  retries, and counts.                                        
      180 +- `tests/db/review-deduplication.test.sql`: indexes, privilege
          +s, vector parity, every scenario                              
      181 +  through `insert_reviews` and `finish_ingestion_attempt`, `ct
          +id`/`updated_at` idempotence, and a                           
      182 +  referencing table.                                          
      183 +- `tests/db/review-deduplication-concurrency.test.sh`: two rea
          +l sessions, for the same batch and                            
      184 +  for an id appearing.                                        
      185 +- `tests/db/review-deduplication-migration.test.sh`: all three
          + cleanup passes, newest-value merge,                          
      186 +  ambiguous groups, re-pointed foreign keys, and adoption afte
          +r cleanup.                                                    
      187 +- Mutation checks: disabling adoption, disabling the refresh u
          +pdate, or removing the merge lock                             
      188 +  each makes these tests fail.                                
      189 +- Four existing tests were updated for the intended behavior c
          +hange:                                                        
      190 +  - The Sprint 1 "duplicates are stored as-is" assertions in `
          +reviews.test.sql` and                                         
      191 +    `review-service.test.ts` now assert reconciliation.       
      192 +  - Two DB fixtures that inserted many identical rows to test 
          +size and count limits                                         
      193 +    (`review-summary.test.sql`, `reviews-security-hardening.te
          +st.sql`) now give each row distinct                           
      194 +    text or a same-length timestamp. Their size and count asse
          +rtions are unchanged.                                         

⏺ Small fix to the services README pointer, then verification:
⏺ Bash(python3 - <<'PY'
      p='src/services/README.md'…)
  ⎿  Updated docs/s3-011-duplicate-reviews.md +14 -14
       5  refreshed source fields. This replaces the Sprint 1 rule (S1-02
          2) that stored repeated source
       6  reviews as separate rows.
       7 
       8 -| Rule                                                         
         -                                        | How it is met        
         -                                                               
         -                                                               
         -                               |                               
       9 -| -------------------------------------------------------------
         ---------------------------------------- | ---------------------
         ----------------------------------------------------------------
         ----------------------------------------------------------------
         ------------------------------- |                               
      10 -| S3-BR-017: re-ingestion must not silently create duplicate re
         -views                                   | Every write goes thro
         -ugh `merge_target_reviews`, which matches by source id, adoptio
         -n, or fingerprint under a per-target lock. Two partial unique i
         -ndexes back it up              |                               
      11 -| S3-BR-018: the duplicate strategy must be deterministic and t
         -estable                                 | Pure matcher and fing
         -erprint in TS, the same rules in SQL, shared golden vectors, an
         -d unit, ingestion, DB, concurrency, and migration tests        
         -                                 |                             
       8 +| Rule                                                         
         +                                                   | How it is 
         +met                                                            
         +                                                               
         +                                      |                        
       9 +| -------------------------------------------------------------
         +-------------------------------------------------- | ----------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +------------------------------------- |                        
      10 +| S3-BR-017: re-ingestion must not silently create duplicate re
         +views                                              | Every writ
         +e goes through `merge_target_reviews`, which matches by source 
         +id, adoption, or fingerprint under a per-target lock. Two parti
         +al unique indexes back it up          |                        
      11 +| S3-BR-018: the duplicate strategy must be deterministic and t
         +estable                                            | Pure match
         +er and fingerprint in TS, the same rules in SQL, shared golden 
         +vectors, and unit, ingestion, DB, concurrency, and migration te
         +sts                                   |                        
      12  | S3-010 (#116): "existing reviews with the same stable identit
          y should be reconciled with updated source fields" | A match up
          dates the stored row in place (same id and `created_at`). Missi
          ng values never erase stored data. Reviews absent from a partia
          l response are never removed (S3-009) |
      13 
      14  The canonical text of S3-010's rules (S3-BR-015, S3-BR-019) is
          not in the repository, so this
     ...
      47 
      48  ### Normalization (fingerprint inputs)
      49 
      50 -| Field                      | Rule                            
         -                                                               
         -                                                               
         -                                             |                 
      51 -| -------------------------- | --------------------------------
         ----------------------------------------------------------------
         ----------------------------------------------------------------
         --------------------------------------------- |                 
      50 +| Field                      | Rule                            
         +                                                               
         +                                                               
         +                                                               
         +                    |                                          
      51 +| -------------------------- | --------------------------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +------------------- |                                          
      52  | Reviewer name, review text | Storable-text cleanup (as persis
          ted), Unicode NFC, each whitespace run becomes one space, trim,
           ASCII-only case folding. An empty result counts as absent. Whi
          tespace is an explicit set: ECMAScript `\s`, which is Unicode W
          hite_Space plus BOM |
      53 -| Review time                | UTC epoch milliseconds          
         -                                                               
         -                                                               
         -                                             |                 
      54 -| Rating (content tier only) | Shortest decimal (`4`, `4.5`), w
         -hich is `trim_scale(numeric)::text` in SQL                     
         -                                                               
         -                                             |                 
      53 +| Review time                | UTC epoch milliseconds          
         +                                                               
         +                                                               
         +                                                               
         +                    |                                          
      54 +| Rating (content tier only) | Shortest decimal (`4`, `4.5`), w
         +hich is `trim_scale(numeric)::text` in SQL                     
         +                                                               
         +                                                               
         +                    |                                          
      55 
      56  Full Unicode case folding is not used because PostgreSQL `lower
          ()` depends on the database
      57  collation.
     ...
      62  per-target advisory lock. `matchStoredReview` in `src/services/
          reviews/review-identity.ts` is the
      63  same decision as a pure function.
      64 
      65 -| Incoming review                                              
         -           | Decision                                          
         -                                                             | 
      66 -| -------------------------------------------------------------
         ----------- | --------------------------------------------------
         ------------------------------------------------------------- | 
      67 -| Has an id that is already stored                             
         -           | **Update** that row                               
         -                                                             | 
      65 +| Incoming review                                              
         +             | Decision                                        
         +                                                               
         +                                                  |            
      66 +| -------------------------------------------------------------
         +------------ | ------------------------------------------------
         +---------------------------------------------------------------
         +------------------------------------------------- |            
      67 +| Has an id that is already stored                             
         +             | **Update** that row                             
         +                                                               
         +                                                  |            
      68  | Has an id that is not stored, and an id-less row has the same
           fingerprint | **Adopt** that row: set its `source_review_id`,
          keep its id and `created_at`, and refresh its fields. The oldes
          t such row wins, though the index allows only one |
      69 -| Has an id, and nothing above matches                         
         -           | **Insert**. A row with a different id is never ado
         -pted, even when the fingerprints are equal                   | 
     … +8 lines (ctrl+o to expand)
  ⎿  Updated src/services/README.md +2 -2
      83    example is explicitly synthetic and demonstrates adapter mapp
          ing only; it is not evidence about
      84    live provider payloads.
      85 
      86 -- **Superseded by S3-011:** reviews are now deduplicated per ta
         -rget by a source-id or fingerprint                             
      87 -  identity key with a database unique index. See [docs/s3-011-d
         -uplicate-reviews.md](../../docs/s3-011-duplicate-reviews.md).  
      86 +- **Superseded by S3-011:** reviews are now reconciled per targ
         +et by source id, id adoption, or                               
      87 +  fingerprint, refreshed in place (S3-010), and backed by parti
         +al unique indexes. See [docs/s3-011-duplicate-reviews.md](../..
         +/docs/s3-011-duplicate-reviews.md).                            
      88    The Sprint 1 decision below is kept for history.
      89 
      90  - **S1-022 duplicate handling (Sprint 1 decision):** S1-022 per
          sists reviews as-is, with no
  ⎿  (timeout 6m 40s)

⏺ Format, lint, typecheck, and the migration check are all clean. Now the
  focused tests, the full suite, and a final full test:db:

  Ran 1 shell command (ctrl+o to expand)

⏺ The one full-suite failure should be the same Node v23 stderr warning as last
  time. Confirming:

  Ran 1 shell command (ctrl+o to expand)

⏺ The Node v23.10.0 type-stripping warning is the same environmental failure as
  before, so I'm skipping the production build since nothing build-sensitive
  changed. I'm shutting down, removing the scratch database, and checking git
  state next. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ Both of ms-00star's gaps are fixed, with regression tests for each. Everything
  passes except the same Node v23 test failure as before, and nothing was
  committed or pushed.

  1. How the two gaps were fixed

  Source id appearing or disappearing. Every review now stores a fingerprint as
  well as its source id. One DB function, holding a per-target lock, matches
  each incoming review in this order:
  1. same source id → update that row;
  2. an id we haven't stored yet, but an id-less row with the same fingerprint →
     that row takes the id ("adoption"), keeping its row id and created_at;
  3. no id → match by fingerprint; the stored id is never cleared;
  4. otherwise insert.

  Two partial unique indexes back this up: one on (target, source_review_id) for
  rows with an id, one on (target, fingerprint) for rows without. Two different
  ids never block each other. The lock covers the one race the indexes can't
  see: an id-less copy and an id'd copy of the same review written at the same
  moment.

  Conflict with S3-010. A match now updates the stored row in place:
  - Refreshed fields are text, rating, reviewer name, date, URL and metadata.
    Those are all the source fields we store; the adapter maps no owner
    responses, likes or edited flags, so there was nothing more to refresh.
  - A missing or null value never erases a stored one.
  - An identical refresh writes nothing and leaves the new updated_at alone.
  - Within a batch, the last occurrence wins.

  The fingerprint now uses only reviewer name + review time when both are known,
  so edited text no longer creates a new row. When either is missing it falls
  back to also hashing text and rating. Without that fallback, every anonymous,
  undated owner-API review would merge into one.

  2. Files changed

  - Source: review-identity.ts (rewritten), review-service.ts,
    ingestion-lifecycle.ts, supabase-review-store.ts.
  - Migration: 20261126120000_prevent_duplicate_reviews.sql, edited in place. It
    exists only on this unmerged PR, nothing on main is later, and no open PR
    touches the functions it replaces (I checked S3-005's migration). The
    existing-data cleanup merges duplicates into the oldest row, which takes the
    newest values, and re-points any foreign key to a deleted copy first.
    Nothing references reviews today; this protects a future table such as
    S3-006's.
  - Tests: review-identity.test.ts, ingestion-deduplication.test.ts,
    review-deduplication.test.sql, the concurrency and migration scripts, and
    the golden-vector fixture. I also changed one assertion I had added earlier
    in reviews.test.sql and review-service.test.ts: it said a repeated id leaves
    the row unchanged, and now it says the row is refreshed. No test from main
    was weakened.
  - Docs: docs/s3-011-duplicate-reviews.md and the services README pointer.

  3. Results

  ┌───────────────────────────────────────────────┬─────────────────────────┐
  │                     Check                     │         Result          │
  ├───────────────────────────────────────────────┼─────────────────────────┤
  │ Format, lint, typecheck, check:migrations     │ pass                    │
  ├───────────────────────────────────────────────┼─────────────────────────┤
  │ Focused Jest                                  │ 438 / 438               │
  ├───────────────────────────────────────────────┼─────────────────────────┤
  │ Full npm test                                 │ 2,109 / 2,110           │
  ├───────────────────────────────────────────────┼─────────────────────────┤
  │ npm run test:db (throwaway local Postgres 15, │ 73 / 73 checks          │
  │  now deleted)                                 │                         │
  ├───────────────────────────────────────────────┼─────────────────────────┤
  │ Mutation checks (TS adoption, TS update, SQL  │ all 5 make the tests    │
  │ adoption, SQL update, lock removed)           │ fail; files restored    │
  └───────────────────────────────────────────────┴─────────────────────────┘

  - The one Jest failure is still migration-versions.test.ts, caused only by
    this Mac's Node v23 printing a warning; it has nothing to do with this
    change.
  - The lock-removal mutation showed session B no longer waiting for A. I didn't
    inspect the rows it left, so I'm not claiming a duplicate was observed.
  - Production build skipped: no imports or build-sensitive code changed since
    it last passed.

  4. Remaining limitations and what to check

  - Fingerprint collisions: without a source id, two reviews by the same
    reviewer name at the same time count as one review. This is more likely with
    day-only dates from the owner API.
  - Content-tier edits: for a review with no id and no reviewer or date, an edit
    to its text or rating creates a new row.
  - Counts: "reviews saved" counts new rows only, so a refresh that only updated
    reviews shows "0 reviews saved". Making the summary reflect the refreshed
    data is S3-010's job.
  - Data loss risk: the cleanup's third pass merges an id-less row into the
    single id'd row with the same fingerprint. Check its notice counts before
    applying the migration to any shared database.
  - Coordination with S3-006: if it adds a table referencing reviews, the
    re-point only covers single-column foreign keys, and only if S3-006's
    migration runs before this one. Mention it to that branch's owner.
  - Manual checks: run npm run test:db on Node 24, apply the migration to a
    local Supabase stack, and do a refresh smoke test: ingest, re-ingest with an
    edited review, and confirm the same row id with updated text.

  5. Reply to ms-00star

  ▎ Thanks, both gaps are addressed. Source ids appearing or disappearing: every
  ▎ review now stores a fingerprint alongside its source id. A newly seen id
  ▎ adopts the matching id-less row (same id and created_at), and an id-less
  ▎ refresh matches by fingerprint without clearing the stored id. Partial
  ▎ unique indexes and a per-target lock enforce this. S3-010: matches now
  ▎ update fields in place. Nulls never erase stored values, and identical
  ▎ refreshes don't write. New coverage: review-identity and
  ▎ ingestion-deduplication unit tests, plus DB tests for both writers,
  ▎ two-session races, and migration cleanup. Ready for re-review.

  6. Git

  Nothing was committed, pushed or staged. 15 files are modified on
  feature/S3-011-prevent-duplicate-reviews, and HEAD is still 85fbe57.