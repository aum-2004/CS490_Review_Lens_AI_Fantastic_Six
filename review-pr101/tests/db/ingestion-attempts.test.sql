\set ON_ERROR_STOP on
-- Self-contained SQL regression: lifecycle, atomicity, idempotence and database privilege boundary.
begin;
insert into auth.users(id) values ('99999999-9999-4999-8999-999999999991'), ('99999999-9999-4999-8999-999999999992');
insert into public.analysis_targets(id, owner_id, name, platform, source_url, google_place_id)
values ('99999999-9999-4999-8999-999999999993', '99999999-9999-4999-8999-999999999991',
  'Synthetic ingestion target', 'google_maps', 'https://www.google.com/maps/place/Synthetic', 'ChIJSyntheticPlace');

insert into public.analysis_targets(id, owner_id, name, platform, source_url, google_place_id)
values ('99999999-9999-4999-8999-999999999995', '99999999-9999-4999-8999-999999999991',
  'Separate failed target', 'google_maps', 'https://www.google.com/maps/place/Failed', 'ChIJSyntheticPlace');
set role authenticated;
set request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999999991"}';
do $$ begin
  assert (select state from public.analysis_target_ingestion_status where analysis_target_id = '99999999-9999-4999-8999-999999999993') = 'not_ingested';
end $$;

set role service_role;
do $$ declare first jsonb; repeated jsonb; begin
  first := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999993', '99999999-9999-4999-8999-999999999991');
  repeated := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999993', '99999999-9999-4999-8999-999999999991');
  assert (first->>'created')::boolean;
  assert not (repeated->>'created')::boolean, 'repeat submission created another attempt';
  assert first->'attempt'->>'id' = repeated->'attempt'->>'id';
  assert first->'attempt'->>'source_url' = 'https://www.google.com/maps/place/Synthetic';
  assert first->'attempt'->>'submitted_query' = 'ChIJSyntheticPlace';
  perform set_config('test.ingestion_attempt', first->'attempt'->>'id', true);
  perform public.bind_ingestion_job((first->'attempt'->>'id')::uuid, '99999999-9999-4999-8999-999999999991', 'synthetic-job-023');
  -- Storage approval can be restored later: it must not terminal-fail an accepted job.
  perform public.finish_ingestion_attempt((first->'attempt'->>'id')::uuid,
    '99999999-9999-4999-8999-999999999991', '[]', 0, null, 'STORAGE_NOT_APPROVED');
  repeated := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999993', '99999999-9999-4999-8999-999999999991');
  assert not (repeated->>'created')::boolean, 'gate outage allowed another paid submission';
  assert repeated->'attempt'->>'status' = 'processing';
  begin
    perform public.bind_ingestion_job((first->'attempt'->>'id')::uuid, '99999999-9999-4999-8999-999999999992', 'stolen-job');
    raise exception 'cross-owner binding was allowed';
  exception when no_data_found then null;
  end;
end $$;

reset role;
update public.ingestion_attempts set started_at = clock_timestamp() - interval '2 minutes'
  where id = current_setting('test.ingestion_attempt')::uuid;
set role service_role;
do $$ declare attempt public.ingestion_attempts; begin
  attempt := public.expire_unbound_ingestion_attempt(current_setting('test.ingestion_attempt')::uuid, '99999999-9999-4999-8999-999999999991');
  assert attempt.status = 'processing' and attempt.provider_request_id = 'synthetic-job-023', 'stale expiry failed a bound job';
  attempt := public.finish_ingestion_attempt(attempt.id, '99999999-9999-4999-8999-999999999991', '[]', 0, null, 'SUBMISSION_UNCERTAIN');
  assert attempt.status = 'processing', 'stale uncertainty overwrote an accepted binding';
end $$;

set role authenticated;
set request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999999991"}';
do $$ begin
  assert (select count(*) from public.latest_ingestion_attempts where analysis_target_id = '99999999-9999-4999-8999-999999999993') = 1;
  assert not has_table_privilege('authenticated', 'public.ingestion_attempts', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.ingestion_attempts', 'UPDATE');
  assert not has_table_privilege('authenticated', 'public.ingestion_attempts', 'DELETE');
  assert not has_table_privilege('authenticated', 'public.ingestion_attempts', 'TRUNCATE');
  assert not has_function_privilege('authenticated', 'public.bind_ingestion_job(uuid,uuid,text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.finish_ingestion_attempt(uuid,uuid,jsonb,integer,jsonb,text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.expire_unbound_ingestion_attempt(uuid,uuid)', 'EXECUTE');
end $$;
set request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999999992"}';
do $$ begin
  assert (select count(*) from public.ingestion_attempts) = 0, 'User B read User A jobs';
  assert (select count(*) from public.latest_ingestion_attempts) = 0, 'latest-state view bypassed RLS';
  assert (select count(*) from public.analysis_target_ingestion_status) = 0, 'status view bypassed RLS';
end $$;

set role service_role;
do $$ declare attempt public.ingestion_attempts; begin
  begin
    perform public.finish_ingestion_attempt(current_setting('test.ingestion_attempt')::uuid,
      '99999999-9999-4999-8999-999999999991', '[{"text":"invalid synthetic review","rating":9}]', 0,
      '{"placeId":"ChIJSyntheticPlace","businessName":"Synthetic"}', null);
    raise exception 'invalid review unexpectedly accepted';
  exception when check_violation then null;
  end;
  attempt := public.finish_ingestion_attempt(current_setting('test.ingestion_attempt')::uuid,
    '99999999-9999-4999-8999-999999999991', '[{"text":"valid synthetic review","rating":4}]', 1,
    '{"placeId":"ChIJSyntheticPlace","businessName":"Synthetic"}', null);
  assert attempt.status = 'succeeded' and attempt.saved_count = 1 and attempt.skipped_count = 1;
  assert attempt.identity_basis = 'expected_place_id';
  perform public.finish_ingestion_attempt(attempt.id, '99999999-9999-4999-8999-999999999991',
    '[{"text":"would duplicate","rating":5}]', 0, '{"placeId":"ChIJSyntheticPlace","businessName":"Synthetic"}', null);
  attempt := public.bind_ingestion_job(attempt.id, '99999999-9999-4999-8999-999999999991', 'synthetic-job-023');
  assert attempt.status = 'succeeded', 'duplicate callback reset completed ingestion';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = '99999999-9999-4999-8999-999999999993') = 1, 'completion was not atomic/idempotent';
end $$;
set role service_role;
do $$ declare reserved jsonb; failed public.ingestion_attempts; begin
  reserved := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999995', '99999999-9999-4999-8999-999999999991');
  failed := public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid,
    '99999999-9999-4999-8999-999999999991', '[]', 0, null, 'PROVIDER_QUOTA');
  assert failed.status = 'failed' and failed.saved_count = 0 and failed.finished_at is not null;
end $$;
do $$ declare reserved jsonb; repeated jsonb; begin
  reserved := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999995', '99999999-9999-4999-8999-999999999991');
  perform public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid,
    '99999999-9999-4999-8999-999999999991', '[]', 0, null, 'SUBMISSION_UNCERTAIN');
  repeated := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999995', '99999999-9999-4999-8999-999999999991');
  assert not (repeated->>'created')::boolean, 'ambiguous paid job was submitted twice';
  assert repeated->'attempt'->>'id' = reserved->'attempt'->>'id';
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, '99999999-9999-4999-8999-999999999991', 'recovered-synthetic-job');
  repeated := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999995', '99999999-9999-4999-8999-999999999991');
  assert not (repeated->>'created')::boolean;
  assert repeated->'attempt'->>'status' = 'processing', 'callback did not recover the uncertain attempt';
  assert repeated->'attempt'->>'provider_request_id' = 'recovered-synthetic-job';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = '99999999-9999-4999-8999-999999999993') = 1, 'failure modified prior reviews';
end $$;
insert into public.analysis_targets(id, owner_id, name, platform, source_url)
values ('99999999-9999-4999-8999-999999999994', '99999999-9999-4999-8999-999999999991',
  'Synthetic URL target', 'google_maps', 'https://www.google.com/maps/place/SyntheticURL');
set role service_role;
do $$ declare reserved jsonb; completed public.ingestion_attempts; begin
  reserved := public.reserve_ingestion_attempt('99999999-9999-4999-8999-999999999994', '99999999-9999-4999-8999-999999999991');
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, '99999999-9999-4999-8999-999999999991', 'synthetic-url-job');
  completed := public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid,
      '99999999-9999-4999-8999-999999999991', '[{"text":"synthetic consistent result","rating":4}]', 0,
      '{"placeId":"ChIJSyntheticPlace","businessName":"Synthetic"}', null);
  assert completed.status = 'succeeded' and completed.saved_count = 1;
  assert completed.identity_basis = 'provider_resolved';
  assert completed.expected_place_id is null;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = '99999999-9999-4999-8999-999999999994') = 1;
  assert (select google_place_id from public.analysis_targets where id = '99999999-9999-4999-8999-999999999994') is null, 'URL results were promoted to a configured identity';
end $$;
rollback;
