-- S3-011 database tests: review identity keys, the (target, identity_key) unique index, and the
-- ON CONFLICT DO NOTHING behavior of both review writers (S3-BR-017, S3-BR-018).
-- Run with `npm run test:db` (from the repository root, for the shared vector fixture).
--
-- User A: b3110000-0000-4000-8000-0000000000a1 (targets A1, A2)
-- User B: b3110000-0000-4000-8000-0000000000b1 (target B)

\set ON_ERROR_STOP on
\set QUIET on
\set vectors `cat tests/fixtures/review-identity-vectors.json`

begin;
-- psql variables are not expanded inside DO bodies, so the fixture travels as a setting.
set test.vectors to :'vectors';

insert into auth.users (id) values
  ('b3110000-0000-4000-8000-0000000000a1'),
  ('b3110000-0000-4000-8000-0000000000b1');
insert into public.analysis_targets (id, owner_id, name, platform, source_url, google_place_id) values
  ('b3110000-0000-4000-8000-00000000a1a1', 'b3110000-0000-4000-8000-0000000000a1',
   'Dedupe A1', 'google_maps', 'https://www.google.com/maps/place/DedupeA1', 'ChIJDedupeA1'),
  ('b3110000-0000-4000-8000-00000000a2a2', 'b3110000-0000-4000-8000-0000000000a1',
   'Dedupe A2', 'google_maps', 'https://www.google.com/maps/place/DedupeA2', 'ChIJDedupeA2'),
  ('b3110000-0000-4000-8000-00000000b1b1', 'b3110000-0000-4000-8000-0000000000b1',
   'Dedupe B', 'google_maps', 'https://www.google.com/maps/place/DedupeB', 'ChIJDedupeB');

-- ---------------------------------------------------------------------------------------------
-- Schema, privileges, and parity with the application implementation
-- ---------------------------------------------------------------------------------------------
do $$
declare
  index_definition text;
  helper regprocedure;
begin
  select pg_catalog.pg_get_indexdef(index.indexrelid) into strict index_definition
  from pg_catalog.pg_index index
  where index.indexrelid = 'public.reviews_target_identity_key_idx'::regclass
    and index.indisunique;
  assert index_definition like '%(analysis_target_id, identity_key)%',
    'identity uniqueness is not scoped to the target';

  assert (
    select attgenerated = 's' and attnotnull
    from pg_catalog.pg_attribute
    where attrelid = 'public.reviews'::regclass and attname = 'identity_key'
  ), 'identity_key is not a stored, non-null generated column';

  foreach helper in array array[
    'public.review_identity_text(text)'::regprocedure,
    'public.review_identity_key(text,text,timestamptz,numeric,text)'::regprocedure
  ] loop
    assert (select provolatile = 'i' and not prosecdef and proconfig = array['search_path=""']
      from pg_catalog.pg_proc where oid = helper), format('%s is not a fixed immutable helper', helper);
    assert not has_function_privilege('anon', helper, 'EXECUTE'), format('anon can run %s', helper);
    assert not has_function_privilege('authenticated', helper, 'EXECUTE'),
      format('authenticated can run %s', helper);
  end loop;

  assert not has_column_privilege('authenticated', 'public.reviews', 'identity_key', 'INSERT'),
    'authenticated can insert identity_key';
  assert not has_column_privilege('authenticated', 'public.reviews', 'identity_key', 'UPDATE'),
    'authenticated can update identity_key';
end
$$;
\echo 'ok - identity_key is generated, target-scoped unique, and its helpers are owner-only'

do $$
declare
  vector jsonb;
  mismatches integer := 0;
begin
  for vector in select value from jsonb_array_elements((current_setting('test.vectors'))::jsonb->'vectors')
  loop
    if public.review_identity_key(
      vector->'input'->>'sourceReviewId',
      vector->'input'->>'reviewerName',
      (vector->'input'->>'reviewDate')::timestamptz,
      (vector->'input'->>'rating')::numeric,
      vector->'input'->>'text'
    ) is distinct from vector->>'expectedKey' then
      raise warning 'identity vector mismatch: %', vector->>'name';
      mismatches := mismatches + 1;
    end if;
  end loop;
  assert mismatches = 0, 'SQL identity keys differ from the application golden vectors';
  assert (select count(*) from jsonb_array_elements((current_setting('test.vectors'))::jsonb->'vectors')) >= 10,
    'golden vectors were not loaded';
end
$$;
\echo 'ok - SQL identity keys match the shared application golden vectors'

do $$
begin
  insert into public.reviews (analysis_target_id, review_text, rating, identity_key)
  values ('b3110000-0000-4000-8000-00000000a1a1', 'forged', 4, 'sid:forged');
  raise exception 'a caller chose identity_key';
exception
  when generated_always then null;
end
$$;
\echo 'ok - no writer can choose or forge identity_key'

-- ---------------------------------------------------------------------------------------------
-- insert_reviews: within a batch, across repeated batches, and across targets and users
-- ---------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-0000000000a1"}';

do $$
declare
  first_batch jsonb := '[
    {"review_text":"Loved it","rating":5,"source_review_id":"g-1","reviewer_name":"Ana"},
    {"review_text":"Edited copy of g-1","rating":1,"source_review_id":"g-1"},
    {"review_text":"No id here","rating":3,"reviewer_name":"Bo","review_date":"2026-10-02T08:00:00.000Z"},
    {"review_text":"  NO   id here ","rating":3,"reviewer_name":" bo ","review_date":"2026-10-02T08:00:00.000Z"},
    {"review_text":"No id here","rating":4,"reviewer_name":"Bo","review_date":"2026-10-02T08:00:00.000Z"}
  ]';
  saved text[];
begin
  select array_agg(review_text) into saved
  from public.insert_reviews('b3110000-0000-4000-8000-00000000a1a1', first_batch);
  assert saved = array['Loved it', 'No id here', 'No id here'],
    format('within-batch duplicates were not collapsed to first occurrences in order: %s', saved);
  assert (select rating from public.reviews where source_review_id = 'g-1') = 5,
    'a later duplicate in the batch replaced the first occurrence';

  -- (a) the same batch again creates nothing and changes nothing.
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-00000000a1a1', first_batch)) = 0,
    'a repeated batch stored new rows';
  assert (select count(*) from public.reviews where analysis_target_id = 'b3110000-0000-4000-8000-00000000a1a1') = 3,
    'a repeated batch changed the target review count';

  -- (c)/(d) a later batch repeats an id and a fingerprint, and adds one genuinely new review.
  select array_agg(review_text) into saved
  from public.insert_reviews('b3110000-0000-4000-8000-00000000a1a1', '[
    {"review_text":"Loved it (provider edit)","rating":4,"source_review_id":"g-1"},
    {"review_text":"no id here","rating":3,"reviewer_name":"BO","review_date":"2026-10-02T08:00:00.000Z"},
    {"review_text":"Brand new","rating":2,"source_review_id":"g-2"}
  ]');
  assert saved = array['Brand new'], format('a later batch stored %s', saved);
  assert (select review_text from public.reviews where source_review_id = 'g-1') = 'Loved it',
    'ON CONFLICT changed a stored review';

  -- (f) the same reviews under another target of the same user are separate records.
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-00000000a2a2', first_batch)) = 3,
    'identity was not scoped to the target';
end
$$;
\echo 'ok - insert_reviews collapses repeats in a batch, skips stored reviews, and inserts new ones'

set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-0000000000b1"}';
do $$
begin
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-00000000b1b1', '[
    {"review_text":"Loved it","rating":5,"source_review_id":"g-1","reviewer_name":"Ana"},
    {"review_text":"No id here","rating":3,"reviewer_name":"Bo","review_date":"2026-10-02T08:00:00.000Z"}
  ]')) = 2, 'another user''s identical reviews were treated as duplicates';
  assert (select count(*) from public.reviews) = 2, 'User B can see User A''s reviews';
end
$$;
\echo 'ok - identical reviews of different users are never deduplicated across accounts'

reset role;

do $$
begin
  insert into public.reviews (analysis_target_id, review_text, rating, source_review_id)
  values ('b3110000-0000-4000-8000-00000000a1a1', 'Direct duplicate', 5, 'g-2');
  raise exception 'a direct duplicate insert bypassed the unique index';
exception
  when unique_violation then null;
end
$$;

do $$
begin
  -- A source id and a fingerprint never collide, even for otherwise identical content.
  insert into public.reviews (analysis_target_id, review_text, rating, source_review_id)
  values ('b3110000-0000-4000-8000-00000000a1a1', 'Same words', 4, 'g-3');
  insert into public.reviews (analysis_target_id, review_text, rating)
  values ('b3110000-0000-4000-8000-00000000a1a1', 'Same words', 4);
  assert (select count(*) from public.reviews
    where analysis_target_id = 'b3110000-0000-4000-8000-00000000a1a1' and review_text = 'Same words') = 2;
end
$$;
\echo 'ok - the unique index rejects direct duplicates; id and fingerprint keys never collide'

-- ---------------------------------------------------------------------------------------------
-- finish_ingestion_attempt: repeated refreshes, retries, and an all-duplicate completion
-- ---------------------------------------------------------------------------------------------
-- These run as the database owner so they can count rows. ingestion-attempts.test.sql covers the
-- service_role-only EXECUTE boundary of these SECURITY DEFINER functions.
create temporary table refresh_batch (name text primary key, rows jsonb not null);
insert into refresh_batch values
  ('first', '[
    {"text":"Crispy fries","rating":5,"source_review_id":"o-1","reviewer_name":"Cy"},
    {"text":"Crispy fries","rating":5,"source_review_id":"o-1","reviewer_name":"Cy"},
    {"text":"Cold coffee","rating":2,"reviewer_name":"Di","review_date":"2026-10-03T09:30:00.000Z"},
    {"text":"cold  COFFEE","rating":2,"reviewer_name":"di","review_date":"2026-10-03T09:30:00.000Z"}
  ]'),
  ('second', '[
    {"text":"Cold coffee","rating":2,"reviewer_name":"Di","review_date":"2026-10-03T09:30:00.000Z"},
    {"text":"Crispy fries","rating":5,"source_review_id":"o-1","reviewer_name":"Cy"},
    {"text":"Friendly staff","rating":4,"source_review_id":"o-2"}
  ]');

do $$
declare
  owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
  target_id uuid := 'b3110000-0000-4000-8000-00000000a2a2';
  identity jsonb := '{"placeId":"ChIJDedupeA2","businessName":"Dedupe A2"}';
  reserved jsonb;
  attempt public.ingestion_attempts;
  before_count bigint;
begin
  select count(*) into before_count from public.reviews where analysis_target_id = target_id;

  -- (b) The first refresh repeats a review by id and by fingerprint inside its own batch.
  reserved := public.reserve_ingestion_attempt(target_id, owner_id);
  attempt := public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, owner_id, 'dedupe-job-1');

  -- (g) A failure after the insert rolls the whole completion back; the retry stores it once.
  begin
    perform public.finish_ingestion_attempt(attempt.id, owner_id,
      (select rows from refresh_batch where name = 'first'), 0, identity, null);
    raise exception 'simulated failure after review insert';
  exception
    when raise_exception then
      if sqlerrm <> 'simulated failure after review insert' then raise; end if;
  end;
  assert (select count(*) from public.reviews where analysis_target_id = target_id) = before_count,
    'a failed completion left reviews behind';
  assert (select status from public.ingestion_attempts where id = attempt.id) = 'processing';

  attempt := public.finish_ingestion_attempt(attempt.id, owner_id,
    (select rows from refresh_batch where name = 'first'), 0, identity, null);
  assert attempt.status = 'succeeded' and attempt.saved_count = 2,
    format('first refresh saved %s rows, expected 2 distinct reviews', attempt.saved_count);

  -- A repeated poll of the finished attempt is a no-op.
  attempt := public.finish_ingestion_attempt(attempt.id, owner_id,
    (select rows from refresh_batch where name = 'first'), 0, identity, null);
  assert attempt.saved_count = 2;
  assert (select count(*) from public.reviews where analysis_target_id = target_id) = before_count + 2;
end
$$;

-- Later refresh runs of the same target. reserve_ingestion_attempt still returns the succeeded
-- attempt, so these stand in for a future refresh flow by recording new bound attempts directly.
insert into public.ingestion_attempts (analysis_target_id, owner_id, source_url, submitted_query,
  query_kind, expected_place_id, provider_request_id)
values ('b3110000-0000-4000-8000-00000000a2a2', 'b3110000-0000-4000-8000-0000000000a1',
  'https://www.google.com/maps/place/DedupeA2', 'ChIJDedupeA2', 'place_id', 'ChIJDedupeA2',
  'dedupe-job-2');

do $$
declare
  owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
  target_id uuid := 'b3110000-0000-4000-8000-00000000a2a2';
  identity jsonb := '{"placeId":"ChIJDedupeA2","businessName":"Dedupe A2"}';
  attempt public.ingestion_attempts;
  before_count bigint;
begin
  select count(*) into before_count from public.reviews where analysis_target_id = target_id;
  select * into strict attempt from public.ingestion_attempts where provider_request_id = 'dedupe-job-2';
  -- (c)/(d) Two reviews repeat the first refresh; only the genuinely new one is inserted.
  attempt := public.finish_ingestion_attempt(attempt.id, owner_id,
    (select rows from refresh_batch where name = 'second'), 0, identity, null);
  assert attempt.status = 'succeeded' and attempt.saved_count = 1,
    format('second refresh saved %s rows, expected 1 new review', attempt.saved_count);
  assert (select count(*) from public.reviews where analysis_target_id = target_id) = before_count + 1;
end
$$;

insert into public.ingestion_attempts (analysis_target_id, owner_id, source_url, submitted_query,
  query_kind, expected_place_id, provider_request_id)
values ('b3110000-0000-4000-8000-00000000a2a2', 'b3110000-0000-4000-8000-0000000000a1',
  'https://www.google.com/maps/place/DedupeA2', 'ChIJDedupeA2', 'place_id', 'ChIJDedupeA2',
  'dedupe-job-3');

do $$
declare
  owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
  target_id uuid := 'b3110000-0000-4000-8000-00000000a2a2';
  attempt public.ingestion_attempts;
  before_count bigint;
begin
  select count(*) into before_count from public.reviews where analysis_target_id = target_id;
  select * into strict attempt from public.ingestion_attempts where provider_request_id = 'dedupe-job-3';
  -- (a) A refresh that returns only stored reviews succeeds with zero new rows.
  attempt := public.finish_ingestion_attempt(attempt.id, owner_id,
    (select rows from refresh_batch where name = 'second'), 0,
    '{"placeId":"ChIJDedupeA2","businessName":"Dedupe A2"}', null);
  assert attempt.status = 'succeeded' and attempt.saved_count = 0,
    'an all-duplicate refresh did not succeed with zero new reviews';
  assert (select count(*) from public.reviews where analysis_target_id = target_id) = before_count;
end
$$;

-- (h) Final dataset: one row per identity, ordered as before by (created_at, id).
do $$
begin
  assert not exists (
    select 1 from public.reviews group by analysis_target_id, identity_key having count(*) > 1
  ), 'duplicate identities exist';
  assert (select count(*) from public.reviews where analysis_target_id = 'b3110000-0000-4000-8000-00000000a2a2') = 6,
    'target A2 should hold its 3 API reviews and 3 distinct ingested reviews';
end
$$;
\echo 'ok - refreshes and retries of finish_ingestion_attempt never store a review twice'

rollback;
