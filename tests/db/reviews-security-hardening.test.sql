-- Issue #46: database size backstops and the authenticated review-write RPC.
-- This file exercises PostgreSQL directly; authenticated INSERT represents the same grants used
-- by Supabase REST/Data API requests.

\set ON_ERROR_STOP on
\set QUIET on

begin;

insert into auth.users (id) values
  ('46000000-0000-4000-8000-000000000001'),
  ('46000000-0000-4000-8000-000000000002');

insert into public.analysis_targets (id, owner_id, name, platform, source_url) values
  ('46000000-0000-4000-8000-000000000011', '46000000-0000-4000-8000-000000000001',
   'Issue 46 target A', 'google_maps', 'https://maps.google.com/?cid=4601'),
  ('46000000-0000-4000-8000-000000000012', '46000000-0000-4000-8000-000000000002',
   'Issue 46 target B', 'google_maps', 'https://maps.google.com/?cid=4602');

do $$
declare
  constraint_name text;
  function_security_definer boolean;
  function_config text[];
begin
  foreach constraint_name in array array[
    'reviews_review_text_length',
    'reviews_reviewer_name_length',
    'reviews_source_review_id_length',
    'reviews_review_url_length',
    'reviews_source_metadata_size'
  ] loop
    assert (
      select constraint_record.convalidated
      from pg_catalog.pg_constraint constraint_record
      where constraint_record.conrelid = 'public.reviews'::regclass
        and constraint_record.conname = constraint_name
    ), format('%s is missing or not validated', constraint_name);
  end loop;

  select procedure.prosecdef, procedure.proconfig
  into strict function_security_definer, function_config
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.insert_reviews(text,jsonb)'::regprocedure;

  assert function_security_definer, 'insert_reviews is not SECURITY DEFINER';
  assert function_config = array['search_path=""'], 'insert_reviews search_path is not fixed';
  assert has_function_privilege(
    'authenticated', 'public.insert_reviews(text,jsonb)', 'EXECUTE'
  ), 'authenticated cannot execute insert_reviews';
  assert not has_function_privilege(
    'anon', 'public.insert_reviews(text,jsonb)', 'EXECUTE'
  ), 'anon can execute insert_reviews';
  assert not exists (
    select 1
    from pg_catalog.pg_proc procedure,
      lateral pg_catalog.aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
    where procedure.oid = 'public.insert_reviews(text,jsonb)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC can execute insert_reviews';
end
$$;
\echo 'ok - constraints are validated and the RPC has fixed security-definer permissions'

do $$
declare
  column_name text;
begin
  assert has_table_privilege('authenticated', 'public.reviews', 'SELECT');
  assert not has_table_privilege(
    'authenticated', 'public.reviews', 'INSERT, UPDATE, DELETE, TRUNCATE'
  );
  assert not has_table_privilege(
    'anon', 'public.reviews', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE'
  );

  foreach column_name in array array[
    'analysis_target_id', 'review_text', 'rating', 'source_review_id', 'reviewer_name',
    'review_date', 'review_url', 'source_metadata', 'id', 'created_at'
  ] loop
    assert not has_column_privilege('authenticated', 'public.reviews', column_name, 'INSERT'),
      format('authenticated retains INSERT on reviews.%s', column_name);
    assert not has_column_privilege('anon', 'public.reviews', column_name, 'INSERT'),
      format('anon retains INSERT on reviews.%s', column_name);
  end loop;
end
$$;

set role authenticated;
set request.jwt.claims to '{"sub":"46000000-0000-4000-8000-000000000001"}';

do $$
begin
  insert into public.reviews (analysis_target_id, review_text, rating)
  values ('46000000-0000-4000-8000-000000000011', 'direct Data API insert', 5);
  raise exception 'authenticated direct insert succeeded';
exception
  when insufficient_privilege then null;
end
$$;

reset role;
set role anon;
do $$
begin
  insert into public.reviews (analysis_target_id, review_text, rating)
  values ('46000000-0000-4000-8000-000000000011', 'anonymous insert', 5);
  raise exception 'anonymous direct insert succeeded';
exception
  when insufficient_privilege then null;
end
$$;

do $$
begin
  perform public.insert_reviews(
    '46000000-0000-4000-8000-000000000011',
    '[{"review_text":"anonymous RPC","rating":5}]'
  );
  raise exception 'anonymous RPC call succeeded';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - authenticated and anonymous direct/Data API inserts are denied and anon cannot call RPC'

reset role;
set role authenticated;
set request.jwt.claims to '{"sub":"46000000-0000-4000-8000-000000000001"}';

do $$
declare
  saved public.reviews;
begin
  select * into strict saved from public.insert_reviews(
    '46000000-0000-4000-8000-000000000011',
    '[{"review_text":"Valid owner review","rating":4.5,"source_review_id":"issue-46-valid","reviewer_name":"Reviewer","review_date":"2026-11-08T12:00:00.000Z","review_url":"https://example.com/reviews/46","source_metadata":{"verified":false}}]'
  );
  assert saved.analysis_target_id = '46000000-0000-4000-8000-000000000011';
  assert saved.review_text = 'Valid owner review' and saved.rating = 4.5;
  assert saved.source_review_id = 'issue-46-valid';
end
$$;
\echo 'ok - the owner RPC writes and returns a valid batch'

-- Reproduce the complete API-to-RPC expansion at the request boundary. JavaScript preserves the
-- compact 1e-300 representation in the request and normalized Supabase payload; PostgreSQL JSONB
-- renders those values as full decimals. The resulting metadata remains below its 32 KiB database
-- limit, but the complete normalized batch exceeds both the old 2 MiB cap and a proposed 4 MiB cap.
do $$
declare
  api_request text;
  api_review text;
  app_metadata text;
  before_count bigint;
  filler_per_review integer;
  normalized_rows jsonb;
  raw_text text := repeat('😀', 4900);
begin
  app_metadata := '{"values":[' || rtrim(repeat('1e-300,', 100), ',') || ']}';
  api_review := '{"text":"' || raw_text
    || '","rating":5,"reviewDate":"2026-01-01","metadata":' || app_metadata || '}';
  select '{"reviews":[' || string_agg(api_review, ',') || ']}'
  into api_request
  from generate_series(1, 100);

  filler_per_review := (2097151 - octet_length(api_request)) / 100;
  assert filler_per_review > 0, 'near-limit API fixture is already too large';
  raw_text := raw_text || repeat('x', filler_per_review);
  api_review := '{"text":"' || raw_text
    || '","rating":5,"reviewDate":"2026-01-01","metadata":' || app_metadata || '}';
  select '{"reviews":[' || string_agg(api_review, ',') || ']}'
  into api_request
  from generate_series(1, 100);

  assert octet_length(api_request) between 2097052 and 2097152,
    'API fixture is not within 100 bytes of MAX_REQUEST_BODY_BYTES';
  assert char_length(raw_text) <= 10000, 'API review text exceeds its character limit';
  assert octet_length(app_metadata) <= 16384, 'API metadata exceeds its compact byte limit';

  select jsonb_agg(jsonb_build_object(
    'review_text', raw.value->>'text',
    'rating', (raw.value->>'rating')::numeric,
    'source_review_id', null,
    'reviewer_name', null,
    'review_date', '2026-01-01T00:00:00.000Z',
    'review_url', null,
    'source_metadata', raw.value->'metadata'
  ))
  into normalized_rows
  from jsonb_array_elements((api_request::jsonb)->'reviews') raw(value);

  assert octet_length((normalized_rows->0->'source_metadata')::text) <= 32768,
    'normalized metadata exceeds its database limit';
  assert octet_length(normalized_rows::text) > 4194304,
    'fixture does not prove that a 4 MiB RPC cap is too small';
  assert octet_length(normalized_rows::text) <= 8388608,
    'route-valid fixture exceeds the selected 8 MiB RPC cap';

  select count(*) into before_count from public.reviews;
  perform public.insert_reviews(
    '46000000-0000-4000-8000-000000000011', normalized_rows
  );
  assert (select count(*) from public.reviews) = before_count + 100,
    'near-2-MiB API request did not persist its complete normalized batch';
end
$$;
\echo 'ok - a near-2-MiB API request expands beyond 4 MiB and persists through the RPC'

do $$
declare
  candidate text;
  before_count bigint;
begin
  select count(*) into before_count from public.reviews;
  foreach candidate in array array[
    '46000000-0000-4000-8000-000000000012',
    '46000000-0000-4000-8000-000000000099',
    'not-a-uuid'
  ] loop
    begin
      perform public.insert_reviews(
        candidate,
        '[{"review_text":"must not save","rating":1}]'
      );
      raise exception 'unavailable target % was accepted', candidate;
    exception
      when no_data_found then
        assert sqlerrm = 'Target unavailable';
    end;
  end loop;
  assert (select count(*) from public.reviews) = before_count;
end
$$;
\echo 'ok - foreign, missing, and malformed target ids are rejected uniformly'

do $$
declare
  before_count bigint;
  oversized_batch jsonb;
begin
  select count(*) into before_count from public.reviews;

  begin
    perform public.insert_reviews(
      '46000000-0000-4000-8000-000000000011',
      jsonb_build_array(
        jsonb_build_object('review_text', 'valid but atomic', 'rating', 4),
        jsonb_build_object(
          'review_text',
          'oversized',
          'rating',
          4,
          'reviewer_name',
          repeat('n', 201)
        )
      )
    );
    raise exception 'mixed valid/invalid batch was accepted';
  exception when check_violation then null;
  end;
  assert (select count(*) from public.reviews) = before_count,
    'the valid row from an invalid batch was partially saved';

  begin
    perform public.insert_reviews(
      '46000000-0000-4000-8000-000000000011',
      '[{"review_text":"unexpected shape","rating":4,"owner_id":"46000000-0000-4000-8000-000000000002"}]'
    );
    raise exception 'unexpected/owner-supplied field was accepted';
  exception when check_violation then null;
  end;

  select jsonb_agg(jsonb_build_object('review_text', 'row ' || n, 'rating', 4))
  into oversized_batch
  from generate_series(1, 101) n;
  begin
    perform public.insert_reviews(
      '46000000-0000-4000-8000-000000000011', oversized_batch
    );
    raise exception '101-row batch was accepted';
  exception when check_violation then null;
  end;

  begin
    perform public.insert_reviews('46000000-0000-4000-8000-000000000011', '[]');
    raise exception 'empty batch was accepted';
  exception when check_violation then null;
  end;

  assert (select count(*) from public.reviews) = before_count;
end
$$;
\echo 'ok - malformed and oversized RPC batches are rejected atomically'

-- All fields in this direct-RPC batch meet their individual limits. A high-scale but in-range
-- numeric rating makes the serialized batch exceed 8 MiB without relying on an invalid field. If
-- the aggregate cap is removed, the insert succeeds and the deliberate exception fails this test.
do $$
declare
  before_count bigint;
  metadata_at_limit jsonb;
  over_cap_batch jsonb;
  precise_rating numeric := ('4.' || repeat('0', 1200))::numeric;
begin
  metadata_at_limit := jsonb_build_object(
    'note',
    repeat('m', 32768 - octet_length(jsonb_build_object('note', '')::text))
  );
  select jsonb_agg(jsonb_build_object(
    'review_text', repeat('😀', 10000),
    'rating', precise_rating,
    'source_review_id', repeat('😀', 256),
    'reviewer_name', repeat('😀', 200),
    'review_date', '2026-01-01T00:00:00.000Z',
    'review_url', 'http://' || repeat('😀', 2041),
    'source_metadata', metadata_at_limit
  ))
  into over_cap_batch
  from generate_series(1, 100);

  assert char_length(over_cap_batch->0->>'review_text') = 10000;
  assert (over_cap_batch->0->>'rating')::numeric between 1 and 5;
  assert char_length(over_cap_batch->0->>'source_review_id') = 256;
  assert char_length(over_cap_batch->0->>'reviewer_name') = 200;
  assert char_length(over_cap_batch->0->>'review_url') = 2048;
  assert octet_length((over_cap_batch->0->'source_metadata')::text) = 32768;
  assert octet_length(over_cap_batch::text) > 8388608,
    'dedicated aggregate-cap fixture does not exceed 8 MiB';

  select count(*) into before_count from public.reviews;
  begin
    perform public.insert_reviews(
      '46000000-0000-4000-8000-000000000011', over_cap_batch
    );
    raise exception 'over-8-MiB batch was accepted';
  exception
    when check_violation then
      assert sqlerrm = 'Invalid review batch', 'a non-aggregate validation rejected the fixture';
  end;
  assert (select count(*) from public.reviews) = before_count,
    'the over-8-MiB batch was partially saved';
end
$$;
\echo 'ok - a field-valid payload over the 8 MiB RPC cap is rejected atomically'

reset role;

-- Exercise exact database boundaries as the migration owner so table CHECK constraints, rather
-- than RPC validation or grants, are the only possible rejection source.
do $$
declare
  metadata_at_limit jsonb;
  metadata_under_app_limit jsonb;
begin
  metadata_at_limit := jsonb_build_object(
    'note',
    repeat('m', 32768 - octet_length(jsonb_build_object('note', '')::text))
  );
  metadata_under_app_limit := jsonb_build_object(
    'note',
    repeat('a', 16384 - octet_length(jsonb_build_object('note', '')::text))
  );
  assert octet_length(metadata_at_limit::text) = 32768;
  assert octet_length(metadata_under_app_limit::text) = 16384;

  insert into public.reviews (
    analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_url,
    source_metadata
  ) values (
    '46000000-0000-4000-8000-000000000011', repeat('😀', 10000), 5,
    repeat('s', 256), repeat('n', 200),
    'https://example.com/' || repeat('u', 2048 - char_length('https://example.com/')),
    metadata_at_limit
  );

  assert char_length((
    select review_text from public.reviews where source_review_id = repeat('s', 256)
  )) = 10000, '10,000 emoji were not counted as 10,000 characters';

  insert into public.reviews (analysis_target_id, review_text, rating, source_metadata)
  values (
    '46000000-0000-4000-8000-000000000011', 'app metadata boundary', 4,
    metadata_under_app_limit
  );
end
$$;
\echo 'ok - exact text/field/metadata limits, Unicode, and the app metadata budget are accepted'

do $$
declare
  metadata_over_limit jsonb;
  before_count bigint;
begin
  metadata_over_limit := jsonb_build_object(
    'note',
    repeat('m', 32769 - octet_length(jsonb_build_object('note', '')::text))
  );

  select count(*) into before_count from public.reviews;

  begin
    insert into public.reviews (analysis_target_id, review_text, rating)
    values ('46000000-0000-4000-8000-000000000011', repeat('x', 10001), 4);
    raise exception 'over-limit review_text was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reviews (analysis_target_id, review_text, rating, reviewer_name)
    values ('46000000-0000-4000-8000-000000000011', 'bad name', 4, repeat('n', 201));
    raise exception 'over-limit reviewer_name was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reviews (analysis_target_id, review_text, rating, source_review_id)
    values ('46000000-0000-4000-8000-000000000011', 'bad source id', 4, repeat('s', 257));
    raise exception 'over-limit source_review_id was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reviews (analysis_target_id, review_text, rating, review_url)
    values (
      '46000000-0000-4000-8000-000000000011', 'bad URL', 4,
      'https://example.com/' || repeat('u', 2049 - char_length('https://example.com/'))
    );
    raise exception 'over-limit review_url was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.reviews (analysis_target_id, review_text, rating, source_metadata)
    values (
      '46000000-0000-4000-8000-000000000011', 'bad metadata', 4, metadata_over_limit
    );
    raise exception 'over-limit source_metadata was accepted';
  exception when check_violation then null;
  end;

  assert (select count(*) from public.reviews) = before_count,
    'one or more rejected over-limit rows were saved';
end
$$;
\echo 'ok - one character or byte over every database limit is rejected'

rollback;
