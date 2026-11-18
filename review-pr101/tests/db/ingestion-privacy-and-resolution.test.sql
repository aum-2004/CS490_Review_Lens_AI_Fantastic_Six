\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('77777777-7777-4777-8777-777777777771');
insert into public.analysis_targets(id, owner_id, name, platform, source_url)
values ('77777777-7777-4777-8777-777777777772', '77777777-7777-4777-8777-777777777771',
  'Privacy test', 'google_maps', 'https://www.google.com/maps/place/Synthetic');
insert into public.ingestion_attempts(id, analysis_target_id, owner_id, source_url, submitted_query, query_kind,
  status, finished_at, error_code, provider_request_id, resolution_reference, resolved_at)
values ('77777777-7777-4777-8777-777777777773', '77777777-7777-4777-8777-777777777772',
  '77777777-7777-4777-8777-777777777771', 'https://www.google.com/maps/place/Synthetic',
  'https://www.google.com/maps/place/Synthetic', 'source_url', 'failed', clock_timestamp(),
  'RESULT_WINDOW_EXPIRED', 'synthetic-private-job', 'restricted synthetic team note', clock_timestamp());

set role authenticated;
set request.jwt.claims to '{"sub":"77777777-7777-4777-8777-777777777771"}';
do $$ begin
  assert (select provider_request_id from public.ingestion_attempts where id = '77777777-7777-4777-8777-777777777773') = 'synthetic-private-job';
  assert (select state from public.analysis_target_ingestion_status where analysis_target_id = '77777777-7777-4777-8777-777777777772') = 'failed';
  assert (select status from public.latest_ingestion_attempts where analysis_target_id = '77777777-7777-4777-8777-777777777772') = 'failed';
  assert not has_column_privilege('authenticated','public.ingestion_attempts','resolution_reference','SELECT');
  assert not has_column_privilege('authenticated','public.ingestion_attempts','resolved_at','SELECT');
  begin
    perform resolution_reference from public.ingestion_attempts where id = '77777777-7777-4777-8777-777777777773';
    raise exception 'owner read operator evidence';
  exception when insufficient_privilege then null; end;
  begin
    perform resolved_at from public.ingestion_attempts where id = '77777777-7777-4777-8777-777777777773';
    raise exception 'owner read operator resolution time';
  exception when insufficient_privilege then null; end;
end $$;
set role service_role;
do $$ begin
  assert (select resolution_reference from public.ingestion_attempts where id = '77777777-7777-4777-8777-777777777773') = 'restricted synthetic team note';
  assert (select resolved_at from public.ingestion_attempts where id = '77777777-7777-4777-8777-777777777773') is not null;
end $$;
reset role;

-- Test the unique index itself, bypassing reserve's independent guard. Removing
-- RESULT_WINDOW_EXPIRED from the predicate must make this assertion fail.
do $$ begin
  begin
    insert into public.ingestion_attempts(analysis_target_id,owner_id,source_url,submitted_query,query_kind)
    values ('77777777-7777-4777-8777-777777777772','77777777-7777-4777-8777-777777777771',
      'https://www.google.com/maps/place/Synthetic','https://www.google.com/maps/place/Synthetic','source_url');
    raise exception 'expired hold did not participate in unique index';
  exception when unique_violation then null; end;
end $$;

set role service_role;
do $$ declare attempt public.ingestion_attempts; begin
  attempt := public.resolve_ingestion_no_job('77777777-7777-4777-8777-777777777773',
    '77777777-7777-4777-8777-777777777771','synthetic provider confirmation');
  assert attempt.error_code = 'EXPIRED_JOB_RECONCILED';
end $$;
reset role;

insert into public.analysis_targets(id,owner_id,name,platform,source_url)
values ('77777777-7777-4777-8777-777777777774','77777777-7777-4777-8777-777777777771',
  'Status guard test','google_maps','https://www.google.com/maps/place/Guard');
set role service_role;
do $$ declare reserved jsonb; attempt public.ingestion_attempts; begin
  reserved := public.reserve_ingestion_attempt('77777777-7777-4777-8777-777777777774','77777777-7777-4777-8777-777777777771');
  begin
    perform public.resolve_ingestion_no_job((reserved->'attempt'->>'id')::uuid,
      '77777777-7777-4777-8777-777777777771','synthetic evidence on active attempt');
    raise exception 'active attempt was released';
  exception when raise_exception then
    if sqlerrm <> 'Attempt is not awaiting reconciliation' then raise; end if;
  end;
  attempt := public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid,
    '77777777-7777-4777-8777-777777777771','[]',0,null,'PROVIDER_REJECTED');
  begin
    perform public.resolve_ingestion_no_job(attempt.id,attempt.owner_id,'synthetic evidence on ordinary failure');
    raise exception 'ordinary failure was released';
  exception when raise_exception then
    if sqlerrm <> 'Attempt is not awaiting reconciliation' then raise; end if;
  end;
  assert (select resolution_reference from public.ingestion_attempts where id = attempt.id) is null;
  assert (select error_code from public.ingestion_attempts where id = attempt.id) = 'PROVIDER_REJECTED';
end $$;
reset role;
rollback;
