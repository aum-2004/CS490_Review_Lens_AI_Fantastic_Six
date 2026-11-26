-- S3-011 database tests: review identity (normalized source id + fingerprint), the partial unique
-- indexes, and reconciliation by both review writers (S3-BR-017, S3-BR-018, S3-010 refresh).
-- Run with `npm run test:db` (from the repository root, for the shared vector fixture).
-- Numbers in brackets refer to the PR review's regression list.
--
-- User A: b3110000-0000-4000-8000-0000000000a1 (targets 01..08)
-- User B: b3110000-0000-4000-8000-0000000000b1 (target b1)
-- Everything runs in one transaction, so rows share created_at; writes are detected by ctid
-- (every UPDATE creates a new row version) and updated_at (clock time of the change).

\set ON_ERROR_STOP on
\set QUIET on
\set vectors `cat tests/fixtures/review-identity-vectors.json`

begin;
-- psql variables are not expanded inside DO bodies, so the fixture travels as a setting.
set test.vectors to :'vectors';

insert into auth.users (id) values
  ('b3110000-0000-4000-8000-0000000000a1'),
  ('b3110000-0000-4000-8000-0000000000b1');
insert into public.analysis_targets (id, owner_id, name, platform, source_url, google_place_id)
select ('b3110000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'b3110000-0000-4000-8000-0000000000a1', 'Dedupe ' || n, 'google_maps',
  'https://www.google.com/maps/place/Dedupe' || n, 'ChIJDedupe' || n
from generate_series(1, 8) n;
insert into public.analysis_targets (id, owner_id, name, platform, source_url, google_place_id) values
  ('b3110000-0000-4000-8000-0000000000b1', 'b3110000-0000-4000-8000-0000000000b1',
   'Dedupe B', 'google_maps', 'https://www.google.com/maps/place/DedupeB', 'ChIJDedupeB');

-- Stand-in for a future table that references reviews (for example persisted Q&A citations).
-- A regular table: temporary tables cannot reference permanent ones. The final rollback drops it.
create table public.citation_fixture (
  citation text primary key,
  review_id uuid not null references public.reviews (id)
);

-- ---------------------------------------------------------------------------------------------
-- Schema, privileges, and parity with the application implementation
-- ---------------------------------------------------------------------------------------------
do $$
declare
  helper regprocedure;
begin
  assert pg_catalog.pg_get_indexdef('public.reviews_target_source_review_id_key'::regclass)
    like 'CREATE UNIQUE INDEX % (analysis_target_id, source_review_id) WHERE (source_review_id IS NOT NULL)',
    'source ids are not unique per target';
  assert pg_catalog.pg_get_indexdef('public.reviews_target_idless_fingerprint_key'::regclass)
    like 'CREATE UNIQUE INDEX % (analysis_target_id, review_fingerprint) WHERE (source_review_id IS NULL)',
    'fingerprints of id-less reviews are not unique per target';
  assert to_regclass('public.reviews_target_source_review_idx') is null,
    'the redundant non-unique source id index remains';
  assert (select attgenerated = 's' and attnotnull from pg_catalog.pg_attribute
    where attrelid = 'public.reviews'::regclass and attname = 'review_fingerprint'),
    'review_fingerprint is not a stored, non-null generated column';
  assert (select attnotnull from pg_catalog.pg_attribute
    where attrelid = 'public.reviews'::regclass and attname = 'updated_at'), 'updated_at is nullable';

  foreach helper in array array[
    'public.review_source_id(text)'::regprocedure,
    'public.review_identity_text(text)'::regprocedure,
    'public.review_fingerprint(text,timestamptz,numeric,text)'::regprocedure,
    'public.merge_target_reviews(uuid,jsonb)'::regprocedure
  ] loop
    assert (select not prosecdef and proconfig = array['search_path=""']
      from pg_catalog.pg_proc where oid = helper), format('%s is not a fixed invoker helper', helper);
    assert not has_function_privilege('anon', helper, 'EXECUTE'), format('anon can run %s', helper);
    assert not has_function_privilege('authenticated', helper, 'EXECUTE'),
      format('authenticated can run %s', helper);
    assert not has_function_privilege('service_role', helper, 'EXECUTE'),
      format('service_role can run %s', helper);
  end loop;

  foreach helper in array array[
    'public.insert_reviews(text,jsonb)'::regprocedure,
    'public.finish_ingestion_attempt(uuid,uuid,jsonb,integer,jsonb,text)'::regprocedure
  ] loop
    assert (select prosecdef and proconfig = array['search_path=""']
      from pg_catalog.pg_proc where oid = helper), format('%s lost its definer settings', helper);
  end loop;
  assert has_function_privilege('authenticated', 'public.insert_reviews(text,jsonb)', 'EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.finish_ingestion_attempt(uuid,uuid,jsonb,integer,jsonb,text)', 'EXECUTE');

  assert not has_column_privilege('authenticated', 'public.reviews', 'review_fingerprint', 'INSERT');
  assert not has_column_privilege('authenticated', 'public.reviews', 'updated_at', 'UPDATE');
end
$$;
\echo 'ok - partial unique indexes, generated fingerprint, and owner-only helpers are in place'

do $$
declare
  vector jsonb;
  mismatches integer := 0;
begin
  for vector in select value from jsonb_array_elements((current_setting('test.vectors'))::jsonb->'vectors')
  loop
    if public.review_fingerprint(
        vector->'input'->>'reviewerName',
        (vector->'input'->>'reviewDate')::timestamptz,
        (vector->'input'->>'rating')::numeric,
        vector->'input'->>'text'
      ) is distinct from vector->>'expectedFingerprint'
      or public.review_source_id(vector->'input'->>'sourceReviewId')
        is distinct from vector->>'expectedSourceId' then
      raise warning 'identity vector mismatch: %', vector->>'name';
      mismatches := mismatches + 1;
    end if;
  end loop;
  assert mismatches = 0, 'SQL identity differs from the application golden vectors';
  assert (select count(*) from jsonb_array_elements((current_setting('test.vectors'))::jsonb->'vectors')) >= 15,
    'golden vectors were not loaded';
end
$$;
\echo 'ok - SQL fingerprints and source id normalization match the shared golden vectors'

do $$
begin
  begin
    insert into public.reviews (analysis_target_id, review_text, rating, review_fingerprint)
    values ('b3110000-0000-4000-8000-000000000001', 'forged', 4, 'fp2:forged');
    raise exception 'a caller chose review_fingerprint';
  exception when generated_always then null;
  end;
  begin
    insert into public.reviews (analysis_target_id, review_text, rating, source_review_id)
    values ('b3110000-0000-4000-8000-000000000001', 'padded id', 4, ' g-padded ');
    raise exception 'a non-normalized source id was stored';
  exception when check_violation then null;
  end;
end
$$;
\echo 'ok - fingerprints cannot be forged and stored source ids are always normalized'

-- ---------------------------------------------------------------------------------------------
-- Reconciliation through insert_reviews, as the owning user
-- ---------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-0000000000a1"}';

create temporary table observed (label text primary key, review_id uuid, created_at timestamptz,
  updated_at timestamptz, row_version tid);
grant all on observed to authenticated;

-- [1] + [11]: first without an id, then with one.
do $$
declare
  saved public.reviews;
begin
  select * into strict saved from public.insert_reviews('b3110000-0000-4000-8000-000000000001',
    '[{"review_text":"Lovely terrace","rating":4,"reviewer_name":"Ann","review_date":"2026-10-01T09:00:00Z"}]');
  assert saved.source_review_id is null;
  insert into observed values ('id-appears', saved.id, saved.created_at, saved.updated_at, null);
end
$$;
reset role;
insert into public.citation_fixture
  select 'cites-id-appears', review_id from observed where label = 'id-appears';
set role authenticated;
do $$
declare
  saved public.reviews;
  before observed;
begin
  select * into strict before from observed where label = 'id-appears';
  select * into strict saved from public.insert_reviews('b3110000-0000-4000-8000-000000000001',
    '[{"review_text":"Lovely terrace, great staff","rating":5,"source_review_id":"g-1","reviewer_name":" ANN ","review_date":"2026-10-01T09:00:00Z"}]');
  assert saved.id = before.review_id, 'the id-less review was not adopted';
  assert saved.created_at = before.created_at, 'adoption changed created_at';
  assert saved.source_review_id = 'g-1', 'adoption did not record the source id';
  assert saved.review_text = 'Lovely terrace, great staff' and saved.rating = 5,
    'adoption did not refresh the source fields';
  assert (select count(*) from public.reviews
    where analysis_target_id = 'b3110000-0000-4000-8000-000000000001') = 1, 'adoption inserted a row';
end
$$;
\echo 'ok - [1] an id that appears adopts the id-less row: one row, same id and created_at'

-- [2]: first with an id, then without one.
do $$
declare
  saved public.reviews;
begin
  select * into strict saved from public.insert_reviews('b3110000-0000-4000-8000-000000000002',
    '[{"review_text":"Fine","rating":3,"source_review_id":"g-2","reviewer_name":"Bo","review_date":"2026-10-02T10:00:00Z"}]');
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-000000000002',
    '[{"review_text":"Fine","rating":3,"reviewer_name":"Bo","review_date":"2026-10-02T10:00:00Z"}]')) = 0,
    'an id-less copy of a stored review was written';
  assert (select review_text from public.insert_reviews('b3110000-0000-4000-8000-000000000002',
    '[{"review_text":"Fine, actually good","rating":4,"reviewer_name":"Bo","review_date":"2026-10-02T10:00:00Z"}]'))
    = 'Fine, actually good', 'an id-less edit did not refresh the stored review';
  assert (select array_agg(id::text || ':' || source_review_id) from public.reviews
    where analysis_target_id = 'b3110000-0000-4000-8000-000000000002') = array[saved.id::text || ':g-2'],
    'an id that disappeared created a row or cleared the stored id';
end
$$;
\echo 'ok - [2] an id that disappears matches by fingerprint and keeps the stored id'

-- [3]: identical content, different ids.
do $$
begin
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-000000000003', '[
    {"review_text":"Same words","rating":4,"source_review_id":"g-3a","reviewer_name":"Cy","review_date":"2026-10-03T08:00:00Z"},
    {"review_text":"Same words","rating":4,"source_review_id":"g-3b","reviewer_name":"Cy","review_date":"2026-10-03T08:00:00Z"}
  ]')) = 2, 'distinct source ids were collapsed';
  perform public.insert_reviews('b3110000-0000-4000-8000-000000000003',
    '[{"review_text":"Same words","rating":4,"reviewer_name":"Cy","review_date":"2026-10-03T08:00:00Z"}]');
  assert (select array_agg(source_review_id order by source_review_id) from public.reviews
    where analysis_target_id = 'b3110000-0000-4000-8000-000000000003') = array['g-3a', 'g-3b'],
    'reviews with different ids were merged or an id-less copy was inserted';
end
$$;
\echo 'ok - [3] identical content with different source ids stays two reviews'

-- [4] (runtime part): at most one id-less row per fingerprint, and an id adopts exactly it.
reset role;
do $$
declare
  adopted uuid;
begin
  insert into public.reviews (analysis_target_id, review_text, rating, reviewer_name)
  values ('b3110000-0000-4000-8000-000000000004', 'Nice', 4, 'Dee') returning id into adopted;
  begin
    insert into public.reviews (analysis_target_id, review_text, rating, reviewer_name)
    values ('b3110000-0000-4000-8000-000000000004', '  NICE ', 4, 'dee');
    raise exception 'a second id-less row with the same fingerprint was stored';
  exception when unique_violation then null;
  end;
  -- Different ids never block each other, even with an identical fingerprint.
  insert into public.reviews (analysis_target_id, review_text, rating, reviewer_name, source_review_id)
  values ('b3110000-0000-4000-8000-000000000004', 'Nice', 4, 'Dee', 'g-4x'),
    ('b3110000-0000-4000-8000-000000000004', 'Nice', 4, 'Dee', 'g-4y');
  assert (select review_id from public.merge_target_reviews('b3110000-0000-4000-8000-000000000004',
    '[{"review_text":"Nice","rating":4,"reviewer_name":"Dee","source_review_id":"g-4"}]')) = adopted,
    'the id-less row was not the one adopted';
  assert (select count(*) from public.reviews where analysis_target_id = 'b3110000-0000-4000-8000-000000000004') = 3;
end
$$;
\echo 'ok - [4] an incoming id adopts the single id-less copy; ids never block each other'

set role authenticated;
set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-0000000000a1"}';

-- [5] + [7]: refreshed fields update in place; missing fields keep stored values.
do $$
declare
  first_save public.reviews;
  refreshed public.reviews;
begin
  select * into strict first_save from public.insert_reviews('b3110000-0000-4000-8000-000000000005',
    '[{"review_text":"Old text","rating":2,"source_review_id":"g-5","reviewer_name":"Di","review_date":"2026-10-05T07:00:00Z","review_url":"https://maps.google.com/review/5","source_metadata":{"platform":"google_maps"}}]');
  select * into strict refreshed from public.insert_reviews('b3110000-0000-4000-8000-000000000005',
    '[{"review_text":"New text","rating":5,"source_review_id":"g-5"}]');
  assert refreshed.id = first_save.id and refreshed.created_at = first_save.created_at
    and refreshed.analysis_target_id = first_save.analysis_target_id, 'refresh replaced the row';
  assert refreshed.review_text = 'New text' and refreshed.rating = 5, 'refresh did not update fields';
  assert refreshed.reviewer_name = 'Di' and refreshed.review_date = '2026-10-05T07:00:00Z'
    and refreshed.review_url = 'https://maps.google.com/review/5'
    and refreshed.source_metadata = '{"platform":"google_maps"}', 'a missing field erased stored data';
  assert refreshed.updated_at > first_save.updated_at, 'refresh did not move updated_at';
  insert into observed select 'refreshed', id, created_at, updated_at, ctid
    from public.reviews where id = refreshed.id;
end
$$;
\echo 'ok - [5][7] a refresh updates text and rating in place and never erases stored fields'

-- [6]: an identical refresh writes nothing.
do $$
declare
  before observed;
begin
  select * into strict before from observed where label = 'refreshed';
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-000000000005',
    '[{"review_text":"New text","rating":5.0,"source_review_id":"g-5","reviewer_name":"Di"}]')) = 0,
    'an identical refresh reported a change';
  assert (select ctid = before.row_version and updated_at = before.updated_at
    from public.reviews where id = before.review_id), 'an identical refresh rewrote the row';
end
$$;
\echo 'ok - [6] an identical refresh does not write or move updated_at'

-- [8]: repeats within one batch and across batches; the last occurrence wins.
do $$
declare
  returned text[];
begin
  select array_agg(review_text) into returned from public.insert_reviews('b3110000-0000-4000-8000-000000000006', '[
    {"review_text":"first","rating":1,"source_review_id":"g-8","reviewer_name":"Eve"},
    {"review_text":"v1","rating":3,"reviewer_name":"Fay","review_date":"2026-10-06T06:00:00Z"},
    {"review_text":"second","rating":2,"source_review_id":"g-8"},
    {"review_text":"v2","rating":4,"reviewer_name":" fay","review_date":"2026-10-06T06:00:00Z"}
  ]');
  assert returned = array['second', 'v2'], format('batch repeats were not merged last-wins: %s', returned);
  perform public.insert_reviews('b3110000-0000-4000-8000-000000000006',
    '[{"review_text":"third","rating":3,"source_review_id":"g-8"}]');
  assert (select array_agg(review_text || '/' || rating || '/' || coalesce(reviewer_name, '-') order by review_text)
    from public.reviews where analysis_target_id = 'b3110000-0000-4000-8000-000000000006')
    = array['third/3/Eve', 'v2/4/ fay'], 'cross-batch repeats were not merged last-wins';
end
$$;
\echo 'ok - [8] repeats in one batch and across batches are one row; the last value wins'

-- [10]: never matched across targets or accounts.
do $$
begin
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-000000000007', '[
    {"review_text":"New text","rating":5,"source_review_id":"g-5"},
    {"review_text":"Fine","rating":3,"reviewer_name":"Bo","review_date":"2026-10-02T10:00:00Z"}
  ]')) = 2, 'a review of another target of the same user was matched';
end
$$;
set request.jwt.claims to '{"sub":"b3110000-0000-4000-8000-0000000000b1"}';
do $$
begin
  assert (select count(*) from public.insert_reviews('b3110000-0000-4000-8000-0000000000b1', '[
    {"review_text":"New text","rating":5,"source_review_id":"g-5"},
    {"review_text":"Fine","rating":3,"reviewer_name":"Bo","review_date":"2026-10-02T10:00:00Z"}
  ]')) = 2, 'another account''s review was matched';
  assert (select count(*) from public.reviews) = 2, 'User B can see User A''s reviews';
end
$$;
\echo 'ok - [10] reviews of different targets and accounts are never matched'

reset role;

-- [11]: references and browser order survive adoption and refresh.
do $$
begin
  assert (select review.review_text from public.citation_fixture citation
    join public.reviews review on review.id = citation.review_id
    where citation.citation = 'cites-id-appears') = 'Lovely terrace, great staff',
    'a citation no longer resolves to the adopted and refreshed review';
  assert (select array_agg(id order by created_at, id) from public.reviews
      where analysis_target_id = 'b3110000-0000-4000-8000-000000000001')
    = array[(select review_id from observed where label = 'id-appears')],
    'the review browser order changed after adoption';
end
$$;
\echo 'ok - [11] citations and browser ordering still resolve after adoption and refresh'

-- ---------------------------------------------------------------------------------------------
-- finish_ingestion_attempt: repeated refreshes, retries, and an all-duplicate completion.
-- Runs as the database owner so it can count rows; ingestion-attempts.test.sql covers the
-- service_role-only EXECUTE boundary.
-- ---------------------------------------------------------------------------------------------
create temporary table refresh_batch (name text primary key, rows jsonb not null);
insert into refresh_batch values
  ('first', '[
    {"text":"Crispy fries","rating":5,"reviewer_name":"Cy","review_date":"2026-10-03T09:00:00.000Z"},
    {"text":"Crispy fries","rating":5,"source_review_id":"o-1","reviewer_name":"Cy","review_date":"2026-10-03T09:00:00.000Z"},
    {"text":"Cold coffee","rating":2,"reviewer_name":"Di","review_date":"2026-10-03T09:30:00.000Z"},
    {"text":"cold  COFFEE","rating":2,"reviewer_name":"di","review_date":"2026-10-03T09:30:00.000Z"}
  ]'),
  ('second', '[
    {"text":"Cold coffee, warm staff","rating":3,"source_review_id":"o-2","reviewer_name":"Di","review_date":"2026-10-03T09:30:00.000Z"},
    {"text":"Crispy fries","rating":4,"reviewer_name":"Cy","review_date":"2026-10-03T09:00:00.000Z"},
    {"text":"Friendly staff","rating":4,"source_review_id":"o-3"}
  ]');

do $$
declare
  owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
  target_id uuid := 'b3110000-0000-4000-8000-000000000008';
  identity jsonb := '{"placeId":"ChIJDedupe8","businessName":"Dedupe 8"}';
  reserved jsonb;
  attempt public.ingestion_attempts;
begin
  reserved := public.reserve_ingestion_attempt(target_id, owner_id);
  attempt := public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, owner_id, 'dedupe-job-1');

  -- A failure after the review write rolls the whole completion back; the retry stores it once.
  begin
    perform public.finish_ingestion_attempt(attempt.id, owner_id,
      (select rows from refresh_batch where name = 'first'), 0, identity, null);
    raise exception 'simulated failure after review write';
  exception
    when raise_exception then
      if sqlerrm <> 'simulated failure after review write' then raise; end if;
  end;
  assert (select count(*) from public.reviews where analysis_target_id = target_id) = 0,
    'a failed completion left reviews behind';
  assert (select status from public.ingestion_attempts where id = attempt.id) = 'processing';

  attempt := public.finish_ingestion_attempt(attempt.id, owner_id,
    (select rows from refresh_batch where name = 'first'), 0, identity, null);
  assert attempt.status = 'succeeded' and attempt.saved_count = 2,
    format('first refresh saved %s rows, expected 2 distinct reviews', attempt.saved_count);
  assert (select source_review_id from public.reviews
    where analysis_target_id = target_id and review_text = 'Crispy fries') = 'o-1',
    'an id that appeared within one batch was not adopted';

  -- A repeated poll of the finished attempt is a no-op.
  attempt := public.finish_ingestion_attempt(attempt.id, owner_id,
    (select rows from refresh_batch where name = 'first'), 0, identity, null);
  assert attempt.saved_count = 2;
  assert (select count(*) from public.reviews where analysis_target_id = target_id) = 2;
end
$$;

-- Later refresh runs of the same target. reserve_ingestion_attempt still returns the succeeded
-- attempt, so these stand in for the S3-009 refresh flow by recording new bound attempts directly.
insert into public.ingestion_attempts (analysis_target_id, owner_id, source_url, submitted_query,
  query_kind, expected_place_id, provider_request_id)
values ('b3110000-0000-4000-8000-000000000008', 'b3110000-0000-4000-8000-0000000000a1',
  'https://www.google.com/maps/place/Dedupe8', 'ChIJDedupe8', 'place_id', 'ChIJDedupe8',
  'dedupe-job-2');

do $$
declare
  owner_id uuid := 'b3110000-0000-4000-8000-0000000000a1';
  target_id uuid := 'b3110000-0000-4000-8000-000000000008';
  attempt public.ingestion_attempts;
  before_ids uuid[];
begin
  select array_agg(id order by id) into before_ids from public.reviews where analysis_target_id = target_id;
  select * into strict attempt from public.ingestion_attempts where provider_request_id = 'dedupe-job-2';
  attempt := public.finish_ingestion_attempt(attempt.id, owner_id,
    (select rows from refresh_batch where name = 'second'), 0,
    '{"placeId":"ChIJDedupe8","businessName":"Dedupe 8"}', null);
  assert attempt.status = 'succeeded' and attempt.saved_count = 1,
    format('second refresh saved %s rows, expected 1 new review', attempt.saved_count);
  assert (select array_agg(id order by id) from public.reviews
    where analysis_target_id = target_id and review_text <> 'Friendly staff') = before_ids,
    'a refresh replaced existing rows';
  assert (select array_agg(source_review_id || '=' || review_text || '/' || rating order by source_review_id)
    from public.reviews where analysis_target_id = target_id)
    = array['o-1=Crispy fries/4', 'o-2=Cold coffee, warm staff/3', 'o-3=Friendly staff/4'],
    'the refresh did not adopt, update, and insert as expected';
end
$$;

insert into public.ingestion_attempts (analysis_target_id, owner_id, source_url, submitted_query,
  query_kind, expected_place_id, provider_request_id)
values ('b3110000-0000-4000-8000-000000000008', 'b3110000-0000-4000-8000-0000000000a1',
  'https://www.google.com/maps/place/Dedupe8', 'ChIJDedupe8', 'place_id', 'ChIJDedupe8',
  'dedupe-job-3');

do $$
declare
  attempt public.ingestion_attempts;
begin
  select * into strict attempt from public.ingestion_attempts where provider_request_id = 'dedupe-job-3';
  attempt := public.finish_ingestion_attempt(attempt.id, 'b3110000-0000-4000-8000-0000000000a1',
    (select rows from refresh_batch where name = 'second'), 0,
    '{"placeId":"ChIJDedupe8","businessName":"Dedupe 8"}', null);
  assert attempt.status = 'succeeded' and attempt.saved_count = 0,
    'an all-duplicate refresh did not succeed with zero new reviews';
  assert (select count(*) from public.reviews where analysis_target_id = 'b3110000-0000-4000-8000-000000000008') = 3;
end
$$;

do $$
begin
  assert not exists (select 1 from public.reviews where source_review_id is not null
    group by analysis_target_id, source_review_id having count(*) > 1), 'duplicate source ids exist';
  assert not exists (select 1 from public.reviews where source_review_id is null
    group by analysis_target_id, review_fingerprint having count(*) > 1), 'duplicate id-less reviews exist';
end
$$;
\echo 'ok - finish_ingestion_attempt reconciles refreshes and retries without duplicates'

rollback;
