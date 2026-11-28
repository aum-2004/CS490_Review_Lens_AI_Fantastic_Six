-- S3-003: Save As creates an independent copy of an owned analysis.

\set ON_ERROR_STOP on
\set QUIET on

begin;

insert into auth.users (id) values
  ('33000000-0000-4000-8000-000000000001'),
  ('33000000-0000-4000-8000-000000000002');

-- Source S (ingested), N (never ingested), F (success then a failed refresh), B (other user).
insert into public.analysis_targets (id, owner_id, name, platform, source_url, google_place_id) values
  ('33000000-0000-4000-8000-000000000011', '33000000-0000-4000-8000-000000000001',
   'Bakery', 'google_maps', 'https://www.google.com/maps/place/Bakery', 'ChIJBakery'),
  ('33000000-0000-4000-8000-000000000012', '33000000-0000-4000-8000-000000000001',
   'Never ingested', 'google_maps', 'https://www.google.com/maps/place/Never', null),
  ('33000000-0000-4000-8000-000000000013', '33000000-0000-4000-8000-000000000001',
   'Failed refresh', 'google_maps', 'https://www.google.com/maps/place/Failed', null),
  ('33000000-0000-4000-8000-000000000014', '33000000-0000-4000-8000-000000000002',
   'Foreign', 'google_maps', 'https://www.google.com/maps/place/Foreign', null);

insert into public.reviews (id, analysis_target_id, review_text, rating, source_review_id,
  reviewer_name, review_date, review_url, source_metadata) values
  ('33000000-0000-4000-8000-000000000101', '33000000-0000-4000-8000-000000000011',
   'Great bread', 5, 'src-1', 'Ana', '2026-10-01', 'https://maps.google.com/r/1', '{"likes":2}'),
  ('33000000-0000-4000-8000-000000000102', '33000000-0000-4000-8000-000000000011',
   'Slow service', 2, null, 'Ben', null, null, null),
  ('33000000-0000-4000-8000-000000000103', '33000000-0000-4000-8000-000000000012',
   'Manually saved', 4, null, null, null, null, null),
  ('33000000-0000-4000-8000-000000000104', '33000000-0000-4000-8000-000000000013',
   'Kept after failure', 3, 'src-f', null, null, null, null),
  ('33000000-0000-4000-8000-000000000105', '33000000-0000-4000-8000-000000000014',
   'Foreign review', 1, null, null, null, null, null);

-- S succeeded just now (inside the paid-start window); F succeeded, then a refresh failed.
insert into public.ingestion_attempts (id, analysis_target_id, owner_id, source_url,
  submitted_query, query_kind, expected_place_id, provider_request_id, status, started_at,
  finished_at, saved_count, skipped_count, verified_identity, identity_basis, error_code) values
  ('33000000-0000-4000-8000-000000000201', '33000000-0000-4000-8000-000000000011',
   '33000000-0000-4000-8000-000000000001', 'https://www.google.com/maps/place/Bakery',
   'ChIJBakery', 'place_id', 'ChIJBakery', 'job-s', 'succeeded', now() - interval '1 hour',
   now() - interval '50 minutes', 2, 1, '{"placeId":"ChIJBakery","businessName":"Bakery Co"}',
   'expected_place_id', null),
  ('33000000-0000-4000-8000-000000000202', '33000000-0000-4000-8000-000000000013',
   '33000000-0000-4000-8000-000000000001', 'https://www.google.com/maps/place/Failed',
   'https://www.google.com/maps/place/Failed', 'source_url', null, 'job-f1', 'succeeded',
   now() - interval '3 days', now() - interval '3 days', 1, 0,
   '{"placeId":"ChIJFailed","businessName":"Failed Co"}', 'provider_resolved', null),
  ('33000000-0000-4000-8000-000000000203', '33000000-0000-4000-8000-000000000013',
   '33000000-0000-4000-8000-000000000001', 'https://www.google.com/maps/place/Failed',
   'https://www.google.com/maps/place/Failed', 'source_url', null, 'job-f2', 'failed',
   now() - interval '2 days', now() - interval '2 days', 0, 0, null, null, 'PROVIDER_TIMEOUT');

-- Privileges: only signed-in users may call it, and it runs with a fixed search_path.
do $$
declare
  signature constant regprocedure := 'public.save_analysis_as(uuid, text)'::regprocedure;
begin
  assert (select prosecdef from pg_proc where oid = signature), 'Save As must be SECURITY DEFINER';
  assert (select proconfig from pg_proc where oid = signature) = array['search_path=""'],
    'Save As search_path is not fixed';
  assert has_function_privilege('authenticated', signature, 'EXECUTE'), 'authenticated cannot save as';
  assert not has_function_privilege('anon', signature, 'EXECUTE'), 'anon can save as';
  assert not has_function_privilege('service_role', signature, 'EXECUTE'), 'service_role can save as';
  assert not exists (
    select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = signature and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC can save as';
  assert not has_column_privilege('authenticated', 'public.ingestion_attempts', 'is_save_as_copy', 'INSERT'),
    'browser can write the copy marker';
end
$$;

set role anon;
do $$
begin
  perform public.save_analysis_as('33000000-0000-4000-8000-000000000011', 'Copy');
  assert false, 'anon saved as';
exception when insufficient_privilege then null;
end
$$;

set role authenticated;

-- No user, a missing analysis and another user's analysis are the same denial.
set request.jwt.claims to '';
do $$
begin
  perform public.save_analysis_as('33000000-0000-4000-8000-000000000011', 'Copy');
  assert false, 'saved as without a user';
exception when no_data_found then null;
end
$$;

set request.jwt.claims to '{"sub":"33000000-0000-4000-8000-000000000001"}';
do $$
declare
  missing_or_foreign uuid[] := array[
    '33000000-0000-4000-8000-000000000014'::uuid, '33000000-0000-4000-8000-000000000999'::uuid];
  target uuid;
begin
  foreach target in array missing_or_foreign loop
    begin
      perform public.save_analysis_as(target, 'Stolen copy');
      assert false, 'saved as from a foreign or missing analysis';
    exception when no_data_found then null;
    end;
  end loop;
end
$$;

-- Names follow the rename rules.
do $$
declare
  bad_names text[] := array[
    '', '   ', ' Padded', 'Padded ', E'Tab\tname', U&'\200B', U&'Zero\200Bwidth', repeat('n', 121)];
  bad text;
begin
  foreach bad in array bad_names loop
    begin
      perform public.save_analysis_as('33000000-0000-4000-8000-000000000011', bad);
      assert false, format('invalid name accepted: %L', bad);
    exception when check_violation then null;
    end;
  end loop;
  begin
    perform public.save_analysis_as('33000000-0000-4000-8000-000000000011', null);
    assert false, 'null name accepted';
  exception when check_violation then null;
  end;
end
$$;

-- The owner copies S: new identity, same source, independent reviews, same ingestion summary.
do $$
declare
  copy_id uuid;
  copy_target public.analysis_targets;
  status_row record;
begin
  copy_id := public.save_analysis_as('33000000-0000-4000-8000-000000000011', 'Bakery – weekend 🍞');
  perform set_config('test.copy_id', copy_id::text, true);

  select * into strict copy_target from public.analysis_targets where id = copy_id;
  assert copy_id <> '33000000-0000-4000-8000-000000000011', 'copy reused the source id';
  assert copy_target.name = 'Bakery – weekend 🍞', 'copy name';
  assert copy_target.owner_id = '33000000-0000-4000-8000-000000000001', 'copy owner';
  assert copy_target.source_url = 'https://www.google.com/maps/place/Bakery', 'copy source url';
  assert copy_target.google_place_id = 'ChIJBakery', 'copy place reference';
  assert (select name from public.analysis_targets where id = '33000000-0000-4000-8000-000000000011')
    = 'Bakery', 'source was renamed';

  assert (
    select array_agg(array[review_text, rating::text, coalesce(source_review_id, '-'),
      coalesce(reviewer_name, '-'), coalesce(review_date::text, '-'), coalesce(review_url, '-'),
      coalesce(source_metadata::text, '-'), review_fingerprint] order by review_text)
    from public.reviews where analysis_target_id = copy_id
  ) = (
    select array_agg(array[review_text, rating::text, coalesce(source_review_id, '-'),
      coalesce(reviewer_name, '-'), coalesce(review_date::text, '-'), coalesce(review_url, '-'),
      coalesce(source_metadata::text, '-'), review_fingerprint] order by review_text)
    from public.reviews where analysis_target_id = '33000000-0000-4000-8000-000000000011'
  ), 'copied reviews differ from the source';
  assert not exists (
    select 1 from public.reviews copied join public.reviews original using (id)
    where copied.analysis_target_id = copy_id
      and original.analysis_target_id = '33000000-0000-4000-8000-000000000011'
  ), 'copy shares review ids with the source';
  assert (select count(*) from public.reviews
    where analysis_target_id = '33000000-0000-4000-8000-000000000011') = 2, 'source reviews changed';

  select * into strict status_row from public.analysis_target_ingestion_status
    where analysis_target_id = copy_id;
  assert status_row.state = 'succeeded' and status_row.provider_business_name = 'Bakery Co'
    and status_row.saved_count = 2, 'copy does not show the source ingestion summary';
end
$$;

-- The copy's ingestion record (read as the table owner: browsers see only granted columns).
reset role;
do $$
declare
  copy_attempt public.ingestion_attempts;
begin
  select * into strict copy_attempt from public.ingestion_attempts
    where analysis_target_id = current_setting('test.copy_id')::uuid;
  assert copy_attempt.is_save_as_copy and copy_attempt.status = 'succeeded', 'copy attempt state';
  assert copy_attempt.provider_request_id like 'save-as:%', 'copy attempt has a provider job id';
  assert copy_attempt.saved_count = 2 and copy_attempt.skipped_count = 0, 'copy attempt counts';
  assert copy_attempt.verified_identity = '{"placeId":"ChIJBakery","businessName":"Bakery Co"}',
    'copy identity';
  assert copy_attempt.identity_basis = 'expected_place_id', 'copy identity basis';
  assert copy_attempt.started_at = (select started_at from public.ingestion_attempts
    where id = '33000000-0000-4000-8000-000000000201'), 'copy lost the collection time';
end
$$;
set role authenticated;
set request.jwt.claims to '{"sub":"33000000-0000-4000-8000-000000000001"}';

-- After a failed refresh the copy takes the last success; a never-ingested source copies as such.
do $$
declare
  failed_copy uuid;
  never_copy uuid;
begin
  failed_copy := public.save_analysis_as('33000000-0000-4000-8000-000000000013', 'Failed copy');
  assert (select status from public.ingestion_attempts where analysis_target_id = failed_copy)
    = 'succeeded', 'copy of a failed refresh did not keep the last success';
  assert (select count(*) from public.reviews where analysis_target_id = failed_copy) = 1,
    'copy of a failed refresh lost reviews';

  never_copy := public.save_analysis_as('33000000-0000-4000-8000-000000000012', 'Never copy');
  assert not exists (select 1 from public.ingestion_attempts where analysis_target_id = never_copy),
    'a never-ingested copy got an ingestion record';
  assert (select state from public.analysis_target_ingestion_status
    where analysis_target_id = never_copy) = 'not_ingested', 'never-ingested copy state';
  assert (select count(*) from public.reviews where analysis_target_id = never_copy) = 1,
    'never-ingested copy lost reviews';
end
$$;

-- Renaming the copy does not rename the source, and the reverse (S3-BR-006).
update public.analysis_targets set name = 'Renamed copy' where id = current_setting('test.copy_id')::uuid;
update public.analysis_targets set name = 'Renamed source' where id = '33000000-0000-4000-8000-000000000011';
do $$
begin
  assert (select name from public.analysis_targets where id = current_setting('test.copy_id')::uuid)
    = 'Renamed copy', 'copy rename';
  assert (select name from public.analysis_targets where id = '33000000-0000-4000-8000-000000000011')
    = 'Renamed source', 'source rename';
end
$$;

-- A copy of a copy starts from the copy's summary.
do $$
declare
  second_copy uuid;
begin
  second_copy := public.save_analysis_as(current_setting('test.copy_id')::uuid, 'Copy of copy');
  assert (select count(*) from public.reviews where analysis_target_id = second_copy) = 2,
    'copy of a copy lost reviews';
  assert (select verified_identity->>'businessName' from public.ingestion_attempts
    where analysis_target_id = second_copy) = 'Bakery Co', 'copy of a copy lost its summary';
end
$$;

-- Refreshing the copy (a new merged review) does not change the source.
reset role;
do $$
begin
  perform public.merge_target_reviews(current_setting('test.copy_id')::uuid,
    '[{"review_text":"New on copy","rating":4,"source_review_id":"src-new"}]');
  perform public.merge_target_reviews(current_setting('test.copy_id')::uuid,
    '[{"review_text":"Great bread, updated","rating":4,"source_review_id":"src-1"}]');
  assert (select count(*) from public.reviews
    where analysis_target_id = current_setting('test.copy_id')::uuid) = 3, 'copy refresh';
  assert (select count(*) from public.reviews
    where analysis_target_id = '33000000-0000-4000-8000-000000000011') = 2,
    'refreshing the copy added reviews to the source';
  assert (select review_text from public.reviews where id = '33000000-0000-4000-8000-000000000101')
    = 'Great bread', 'refreshing the copy changed a source review';
end
$$;

-- Save As copies never use the paid-start budget. The owner already has one real start in the
-- window (S) and five copies; four more real starts are allowed, the fifth is not.
insert into public.analysis_targets (id, owner_id, name, platform, source_url)
select ('33000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
  '33000000-0000-4000-8000-000000000001', 'Budget ' || n, 'google_maps',
  'https://www.google.com/maps/place/Budget' || n
from generate_series(1, 5) n;
set role service_role;
do $$
begin
  for n in 1..4 loop
    assert (public.reserve_ingestion_attempt(
      ('33000000-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid,
      '33000000-0000-4000-8000-000000000001')->>'created')::boolean, 'a real start was refused';
  end loop;
  begin
    perform public.reserve_ingestion_attempt('33000000-0000-4000-8000-000000000305',
      '33000000-0000-4000-8000-000000000001');
    assert false, 'the paid-start budget ignored real starts';
  exception when raise_exception then
    assert sqlerrm = 'INGESTION_START_LIMIT', 'unexpected budget error';
  end;
end
$$;
reset role;

-- Deleting the copy keeps the source and its reviews.
set role authenticated;
set request.jwt.claims to '{"sub":"33000000-0000-4000-8000-000000000001"}';
do $$
begin
  assert public.delete_owned_analysis(current_setting('test.copy_id')::uuid), 'copy delete';
  assert exists (select 1 from public.analysis_targets where id = '33000000-0000-4000-8000-000000000011'),
    'deleting the copy deleted the source';
  assert (select count(*) from public.reviews
    where analysis_target_id = '33000000-0000-4000-8000-000000000011') = 2,
    'deleting the copy deleted source reviews';
end
$$;

-- The other user's analysis was never touched.
reset role;
do $$
begin
  assert (select count(*) from public.analysis_targets
    where owner_id = '33000000-0000-4000-8000-000000000002') = 1, 'foreign analyses changed';
end
$$;

-- Copy markers cannot be forged: a real job id cannot be a copy, and a copy prefix must be one.
do $$
begin
  begin
    update public.ingestion_attempts set is_save_as_copy = true
      where id = '33000000-0000-4000-8000-000000000201';
    assert false, 'a real attempt was marked as a copy';
  exception when check_violation then null;
  end;
  begin
    update public.ingestion_attempts set provider_request_id = 'save-as:fake'
      where id = '33000000-0000-4000-8000-000000000201';
    assert false, 'a save-as job id was used on a real attempt';
  exception when check_violation then null;
  end;
end
$$;

-- The analysis cap (200 per owner) holds.
insert into public.analysis_targets (owner_id, name, platform, source_url)
select '33000000-0000-4000-8000-000000000001', 'Filler ' || n, 'google_maps',
  'https://www.google.com/maps/place/Filler'
from generate_series(1, 200 - (select count(*)::integer from public.analysis_targets
  where owner_id = '33000000-0000-4000-8000-000000000001')) n;
set role authenticated;
set request.jwt.claims to '{"sub":"33000000-0000-4000-8000-000000000001"}';
do $$
begin
  perform public.save_analysis_as('33000000-0000-4000-8000-000000000011', 'One too many');
  assert false, 'analysis cap not enforced';
exception when raise_exception then
  assert sqlerrm = 'ANALYSIS_LIMIT', 'unexpected cap error';
end
$$;

rollback;
