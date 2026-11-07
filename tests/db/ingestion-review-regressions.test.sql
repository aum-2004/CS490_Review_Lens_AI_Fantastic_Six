\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('88888888-8888-4888-8888-888888888881'), ('88888888-8888-4888-8888-888888888882');
insert into public.analysis_targets(id, owner_id, name, platform, source_url, google_place_id)
values ('88888888-8888-4888-8888-888888888883', '88888888-8888-4888-8888-888888888881',
  'Review regression', 'google_maps', 'https://www.google.com/maps/place/Synthetic', 'ChIJExpected');
set role service_role;
do $$ declare reserved jsonb; attempt public.ingestion_attempts; before_count integer; begin
  select count(*) into before_count from public.ingestion_attempts;
  begin
    perform public.reserve_ingestion_attempt('88888888-8888-4888-8888-888888888883', '88888888-8888-4888-8888-888888888882');
    raise exception 'reserve accepted a foreign owner';
  exception when no_data_found then null; end;
  assert (select count(*) from public.ingestion_attempts) = before_count;
  reserved := public.reserve_ingestion_attempt('88888888-8888-4888-8888-888888888883', '88888888-8888-4888-8888-888888888881');
  perform set_config('test.review_attempt', reserved->'attempt'->>'id', true);
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, '88888888-8888-4888-8888-888888888881', 'review-job');
  -- Execute the actual recovery SELECT; privilege introspection alone is insufficient.
  assert (select provider_request_id from public.ingestion_attempts where id = current_setting('test.review_attempt')::uuid) = 'review-job';
  begin
    perform public.finish_ingestion_attempt(current_setting('test.review_attempt')::uuid,
      '88888888-8888-4888-8888-888888888882', '[]', 0, null, 'INGESTION_FAILED');
    raise exception 'finish accepted a foreign owner';
  exception when no_data_found then null; end;
  begin
    perform public.finish_ingestion_attempt(current_setting('test.review_attempt')::uuid,
      '88888888-8888-4888-8888-888888888881', '[{"text":"wrong identity","rating":4}]', 0,
      '{"placeId":"ChIJWrong","businessName":"Synthetic"}', null);
    raise exception 'Place ID mismatch was accepted';
  exception when raise_exception then if sqlerrm <> 'Identity mismatch' then raise; end if; end;
  assert (select status from public.ingestion_attempts where id = current_setting('test.review_attempt')::uuid) = 'processing';
end $$;
reset role;
do $$ begin assert (select count(*) from public.reviews where analysis_target_id = '88888888-8888-4888-8888-888888888883') = 0; end $$;

-- Test each owner predicate independently using intentionally inconsistent admin fixtures.
update public.ingestion_attempts set owner_id = '88888888-8888-4888-8888-888888888882' where id = current_setting('test.review_attempt')::uuid;
set role service_role;
do $$ begin
  begin
    perform public.finish_ingestion_attempt(current_setting('test.review_attempt')::uuid, '88888888-8888-4888-8888-888888888881', '[]', 0, null, 'INGESTION_FAILED');
    raise exception 'finish ignored the attempt owner';
  exception when no_data_found then null; end;
end $$;
reset role;
update public.ingestion_attempts set owner_id = '88888888-8888-4888-8888-888888888881' where id = current_setting('test.review_attempt')::uuid;
update public.analysis_targets set owner_id = '88888888-8888-4888-8888-888888888882' where id = '88888888-8888-4888-8888-888888888883';
set role service_role;
do $$ begin
  begin
    perform public.finish_ingestion_attempt(current_setting('test.review_attempt')::uuid, '88888888-8888-4888-8888-888888888881', '[]', 0, null, 'INGESTION_FAILED');
    raise exception 'finish ignored the parent owner';
  exception when no_data_found then null; end;
end $$;
reset role;
update public.analysis_targets set owner_id = '88888888-8888-4888-8888-888888888881' where id = '88888888-8888-4888-8888-888888888883';
set role service_role;
do $$ declare code text; attempt public.ingestion_attempts; reserved jsonb; begin
  foreach code in array array['PROVIDER_AUTH','PROVIDER_BILLING','MISSING_API_KEY','INVALID_RESPONSE','PROVIDER_UNAVAILABLE','STORAGE_NOT_APPROVED'] loop
    attempt := public.finish_ingestion_attempt(current_setting('test.review_attempt')::uuid, '88888888-8888-4888-8888-888888888881', '[]', 0, null, code);
    assert attempt.status = 'processing' and attempt.provider_request_id = 'review-job';
    reserved := public.reserve_ingestion_attempt(attempt.analysis_target_id, attempt.owner_id);
    assert not (reserved->>'created')::boolean, 'lookup outage released the paid-start lock';
  end loop;
  attempt := public.finish_ingestion_attempt(current_setting('test.review_attempt')::uuid, '88888888-8888-4888-8888-888888888881',
    '[{"text":"saved once","rating":4}]', 0, '{"placeId":"ChIJExpected","businessName":"Synthetic"}', null);
  for i in 1..3 loop
    reserved := public.reserve_ingestion_attempt(attempt.analysis_target_id, attempt.owner_id);
    assert not (reserved->>'created')::boolean and reserved->'attempt'->>'status' = 'succeeded', 'success allowed another paid job';
  end loop;
  attempt := public.expire_bound_ingestion_attempt(attempt.id, attempt.owner_id);
  assert attempt.status = 'succeeded', 'stale expiry overwrote success';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = '88888888-8888-4888-8888-888888888883') = 1;
  assert (select count(*) from public.ingestion_attempts where analysis_target_id = '88888888-8888-4888-8888-888888888883') = 1;
end $$;

insert into public.analysis_targets(id, owner_id, name, platform, source_url)
values ('88888888-8888-4888-8888-888888888884', '88888888-8888-4888-8888-888888888881', 'Expired target', 'google_maps', 'https://www.google.com/maps/place/Expired');
set role service_role;
do $$ declare reserved jsonb; begin
  reserved := public.reserve_ingestion_attempt('88888888-8888-4888-8888-888888888884', '88888888-8888-4888-8888-888888888881');
  perform set_config('test.expired_attempt', reserved->'attempt'->>'id', true);
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, '88888888-8888-4888-8888-888888888881', 'expired-job');
end $$;
reset role;
update public.ingestion_attempts set started_at = clock_timestamp() - interval '4 hours' where id = current_setting('test.expired_attempt')::uuid;
set role service_role;
do $$ declare attempt public.ingestion_attempts; reserved jsonb; begin
  -- Finalization checks the deadline too; a fetch started before expiry cannot save late data.
  attempt := public.finish_ingestion_attempt(current_setting('test.expired_attempt')::uuid, '88888888-8888-4888-8888-888888888881',
    '[{"text":"late data","rating":4}]', 0, '{"placeId":"ChIJExpected","businessName":"Synthetic"}', null);
  assert attempt.status = 'failed' and attempt.error_code = 'RESULT_WINDOW_EXPIRED' and attempt.provider_request_id = 'expired-job';
  reserved := public.reserve_ingestion_attempt(attempt.analysis_target_id, attempt.owner_id);
  assert not (reserved->>'created')::boolean;
  begin
    perform public.resolve_ingestion_no_job(attempt.id, '88888888-8888-4888-8888-888888888882', 'synthetic case');
    raise exception 'foreign operator owner accepted';
  exception when no_data_found then null; end;
  begin
    perform public.resolve_ingestion_no_job(attempt.id, attempt.owner_id, ' ');
    raise exception 'missing evidence accepted';
  exception when raise_exception then if sqlerrm <> 'Resolution evidence required' then raise; end if; end;
  attempt := public.resolve_ingestion_no_job(attempt.id, attempt.owner_id, 'synthetic provider confirmation case');
  assert attempt.resolved_at is not null and attempt.resolution_reference = 'synthetic provider confirmation case';
  assert attempt.provider_request_id = 'expired-job';
  reserved := public.reserve_ingestion_attempt(attempt.analysis_target_id, attempt.owner_id);
  assert (reserved->>'created')::boolean;
  perform public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid, attempt.owner_id, '[]', 0, null, 'SUBMISSION_UNCERTAIN');
  perform public.resolve_ingestion_no_job((reserved->'attempt'->>'id')::uuid, attempt.owner_id, 'synthetic confirmed no accepted request');
  reserved := public.reserve_ingestion_attempt(attempt.analysis_target_id, attempt.owner_id);
  assert (reserved->>'created')::boolean, 'operator resolution did not release uncertainty';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = '88888888-8888-4888-8888-888888888884') = 0;
  assert not has_function_privilege('authenticated', 'public.resolve_ingestion_no_job(uuid,uuid,text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.expire_bound_ingestion_attempt(uuid,uuid)', 'EXECUTE');
end $$;
-- Exercise the expiry RPC itself (pending/404 lookups cannot bypass this deadline).
set role service_role;
do $$ declare attempt public.ingestion_attempts; begin
  select * into attempt from public.ingestion_attempts where analysis_target_id = '88888888-8888-4888-8888-888888888884' and status = 'processing';
  perform public.bind_ingestion_job(attempt.id, attempt.owner_id, 'pending-until-expired');
  attempt := public.expire_bound_ingestion_attempt(attempt.id, attempt.owner_id);
  assert attempt.status = 'processing', 'young job expired';
  perform set_config('test.pending_attempt', attempt.id::text, true);
end $$;
reset role;
update public.ingestion_attempts set started_at = clock_timestamp() - interval '4 hours 1 second' where id = current_setting('test.pending_attempt')::uuid;
set role service_role;
do $$ declare attempt public.ingestion_attempts; repeated jsonb; begin
  attempt := public.expire_bound_ingestion_attempt(current_setting('test.pending_attempt')::uuid, '88888888-8888-4888-8888-888888888881');
  assert attempt.status = 'failed' and attempt.error_code = 'RESULT_WINDOW_EXPIRED';
  assert attempt.provider_request_id = 'pending-until-expired';
  repeated := public.reserve_ingestion_attempt(attempt.analysis_target_id, attempt.owner_id);
  assert not (repeated->>'created')::boolean;
end $$;
reset role;
rollback;
