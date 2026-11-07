\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('66666666-6666-4666-8666-666666666661'),('66666666-6666-4666-8666-666666666662');
insert into public.analysis_targets(id,owner_id,name,platform,source_url,google_place_id)
values ('66666666-6666-4666-8666-666666666663','66666666-6666-4666-8666-666666666661',
  'Held target','google_maps','https://www.google.com/maps/place/Held','ChIJExpected');
set role service_role;
do $$ declare reserved jsonb; begin
  reserved:=public.reserve_ingestion_attempt('66666666-6666-4666-8666-666666666663','66666666-6666-4666-8666-666666666661');
  perform set_config('test.security_attempt',reserved->'attempt'->>'id',true);
  -- Both owner predicates must be exercised before any age/state decision.
  begin
    perform public.expire_unbound_ingestion_attempt((reserved->'attempt'->>'id')::uuid,'66666666-6666-4666-8666-666666666662');
    raise exception 'foreign unbound expiry permitted';
  exception when no_data_found then null; end;
  begin
    perform public.expire_bound_ingestion_attempt((reserved->'attempt'->>'id')::uuid,'66666666-6666-4666-8666-666666666662');
    raise exception 'foreign bound expiry permitted';
  exception when no_data_found then null; end;
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid,'66666666-6666-4666-8666-666666666661','security-job');
end $$;
reset role;
-- Deliberately inconsistent admin fixtures independently exercise each owner predicate.
update public.ingestion_attempts set owner_id='66666666-6666-4666-8666-666666666662' where id=current_setting('test.security_attempt')::uuid;
set role service_role;
do $$ begin
  begin perform public.expire_unbound_ingestion_attempt(current_setting('test.security_attempt')::uuid,'66666666-6666-4666-8666-666666666661'); raise exception 'unbound expiry ignored attempt owner'; exception when no_data_found then null; end;
  begin perform public.expire_bound_ingestion_attempt(current_setting('test.security_attempt')::uuid,'66666666-6666-4666-8666-666666666661'); raise exception 'bound expiry ignored attempt owner'; exception when no_data_found then null; end;
end $$;
reset role;
update public.ingestion_attempts set owner_id='66666666-6666-4666-8666-666666666661' where id=current_setting('test.security_attempt')::uuid;
update public.analysis_targets set owner_id='66666666-6666-4666-8666-666666666662' where id='66666666-6666-4666-8666-666666666663';
set role service_role;
do $$ begin
  begin perform public.expire_unbound_ingestion_attempt(current_setting('test.security_attempt')::uuid,'66666666-6666-4666-8666-666666666661'); raise exception 'unbound expiry ignored parent owner'; exception when no_data_found then null; end;
  begin perform public.expire_bound_ingestion_attempt(current_setting('test.security_attempt')::uuid,'66666666-6666-4666-8666-666666666661'); raise exception 'bound expiry ignored parent owner'; exception when no_data_found then null; end;
end $$;
reset role;
update public.analysis_targets set owner_id='66666666-6666-4666-8666-666666666661' where id='66666666-6666-4666-8666-666666666663';
update public.ingestion_attempts set status='failed',error_code='SUBMISSION_UNCERTAIN',finished_at=clock_timestamp(),provider_request_id=null where id=current_setting('test.security_attempt')::uuid;

set role authenticated;
set request.jwt.claims to '{"sub":"66666666-6666-4666-8666-666666666661"}';
do $$ begin
  assert not has_table_privilege('authenticated','public.analysis_targets','DELETE');
  begin delete from public.analysis_targets where id='66666666-6666-4666-8666-666666666663'; raise exception 'owner deleted held target'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert (select count(*) from public.ingestion_attempts where id=current_setting('test.security_attempt')::uuid)=1,'denied delete lost audit'; end $$;
update public.ingestion_attempts set status='processing',error_code=null,finished_at=null,provider_request_id='security-job' where id=current_setting('test.security_attempt')::uuid;

set role service_role;
do $$ declare payload jsonb; code text; identity jsonb := '{"placeId":"ChIJExpected","businessName":"Synthetic"}'; begin
  -- Each limit is tested independently with otherwise valid input; no partial review insert.
  perform ('2026-11-07T12:00:00.'||repeat('0',44)||'Z')::timestamptz;
  foreach code in array array['count','bytes','text','reviewer','url','source_id','date','metadata','identity'] loop
    payload:='[{"text":"valid","rating":4}]';
    if code='count' then select jsonb_agg(jsonb_build_object('text','valid','rating',4)) into payload from generate_series(1,31); end if;
    if code='bytes' then payload:=jsonb_build_array(jsonb_build_object('text','valid','rating',4,'ignored',repeat('x',2097153))); end if;
    if code='text' then payload:=jsonb_build_array(jsonb_build_object('text',repeat('x',10001),'rating',4)); end if;
    if code='reviewer' then payload:=jsonb_build_array(jsonb_build_object('text','valid','rating',4,'reviewer_name',repeat('x',201))); end if;
    if code='url' then payload:=jsonb_build_array(jsonb_build_object('text','valid','rating',4,'review_url','https://example.test/'||repeat('x',2049-length('https://example.test/')))); end if;
    if code='source_id' then payload:=jsonb_build_array(jsonb_build_object('text','valid','rating',4,'source_review_id',repeat('x',257))); end if;
    -- Valid timestamp with a long zero fraction: only the 64-character guard should reject it.
    if code='date' then payload:=jsonb_build_array(jsonb_build_object('text','valid','rating',4,'review_date','2026-11-07T12:00:00.'||repeat('0',44)||'Z')); end if;
    if code='metadata' then payload:=jsonb_build_array(jsonb_build_object('text','valid','rating',4,'source_metadata',jsonb_build_object('note',repeat('x',32769)))); end if;
    if code='identity' then identity:=jsonb_build_object('placeId','ChIJExpected','businessName',repeat('x',201)); end if;
    begin
      perform public.finish_ingestion_attempt(current_setting('test.security_attempt')::uuid,'66666666-6666-4666-8666-666666666661',payload,0,identity,null);
      raise exception 'unbounded completion accepted: %',code;
    exception when invalid_parameter_value then
      if sqlerrm<>'INGESTION_RESULT_LIMIT' then raise; end if;
    end;
    identity:='{"placeId":"ChIJExpected","businessName":"Synthetic"}';
  end loop;
  -- Compact JSON for this same fixture is below 16 KiB; PostgreSQL adds array spaces.
  select jsonb_build_array(jsonb_build_object('text','valid','rating',4,
    'review_url','https://example.test/'||repeat('x',2048-length('https://example.test/')),
    'source_review_id',repeat('x',256),'review_date','2026-11-07T12:00:00.'||repeat('0',43)||'Z',
    'source_metadata',
    jsonb_build_object('values',(select jsonb_agg(0) from generate_series(1,5700)), 'note',repeat('x',4884)))) into payload;
  assert octet_length((payload->0->'source_metadata')::text) > 16384;
  assert octet_length((payload->0->'source_metadata')::text) <= 32768;
  perform public.finish_ingestion_attempt(current_setting('test.security_attempt')::uuid,'66666666-6666-4666-8666-666666666661',payload,0,identity,null);
  assert (select status from public.ingestion_attempts where id=current_setting('test.security_attempt')::uuid)='succeeded',
    'App-valid dense metadata must complete rather than leave a paid job held';
end $$;
set role authenticated;
do $$ begin
  begin delete from public.analysis_targets where id='66666666-6666-4666-8666-666666666663'; raise exception 'owner deleted succeeded target'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id='66666666-6666-4666-8666-666666666663')=1;
  assert (select status from public.ingestion_attempts where id=current_setting('test.security_attempt')::uuid)='succeeded';
end $$;

-- Budget applies across different targets, not only duplicate requests to one target.
insert into public.analysis_targets(owner_id,name,platform,source_url)
select '66666666-6666-4666-8666-666666666661','Budget '||i,'google_maps','https://www.google.com/maps/place/Budget'||i from generate_series(1,5)i;
select set_config('test.budget_targets',(select array_agg(id order by name)::text from public.analysis_targets where owner_id='66666666-6666-4666-8666-666666666661' and name like 'Budget %'),true);
set role service_role;
do $$ declare target uuid; reserved jsonb; denied integer:=0; begin
  foreach target in array current_setting('test.budget_targets')::uuid[] loop
    begin reserved:=public.reserve_ingestion_attempt(target,'66666666-6666-4666-8666-666666666661');
    exception when raise_exception then
      if sqlerrm<>'INGESTION_START_LIMIT' then raise; end if;
      denied:=denied+1;
    end;
  end loop;
  assert denied=1,'sixth owner reservation was not blocked';
  assert (select count(*) from public.ingestion_attempts where owner_id='66666666-6666-4666-8666-666666666661')=5;
  reserved:=public.reserve_ingestion_attempt('66666666-6666-4666-8666-666666666663','66666666-6666-4666-8666-666666666661');
  assert not (reserved->>'created')::boolean,'existing success was not returned at the limit';
end $$;
reset role;
insert into public.analysis_targets(id,owner_id,name,platform,source_url)
values ('66666666-6666-4666-8666-666666666664','66666666-6666-4666-8666-666666666662','Other owner','google_maps','https://www.google.com/maps/place/Other');
set role service_role;
do $$ declare reserved jsonb; begin
  reserved:=public.reserve_ingestion_attempt('66666666-6666-4666-8666-666666666664','66666666-6666-4666-8666-666666666662');
  assert (reserved->>'created')::boolean,'one owner used another owner budget';
end $$;
reset role;
update public.ingestion_attempts set started_at=clock_timestamp()-interval '25 hours' where id=current_setting('test.security_attempt')::uuid;
select set_config('test.budget_newtarget',(select t.id::text from public.analysis_targets t where t.owner_id='66666666-6666-4666-8666-666666666661' and t.name like 'Budget %' and not exists(select 1 from public.ingestion_attempts a where a.analysis_target_id=t.id)),true);
set role service_role;
do $$ declare target uuid; reserved jsonb; begin
  target:=current_setting('test.budget_newtarget')::uuid;
  reserved:=public.reserve_ingestion_attempt(target,'66666666-6666-4666-8666-666666666661');
  assert (reserved->>'created')::boolean,'rolling window did not release an old budget slot';
end $$;
reset role;

-- Failed reservations consume the same rolling budget as active/succeeded starts.
insert into auth.users(id) values ('88888888-8888-4888-8888-888888888888');
insert into public.analysis_targets(id,owner_id,name,platform,source_url)
select ('88888888-8888-4888-8888-'||lpad(n::text,12,'0'))::uuid,
  '88888888-8888-4888-8888-888888888888','Failed budget '||n,'google_maps',
  'https://www.google.com/maps/place/FailedBudget'||n from generate_series(1,6)n;
set role service_role;
do $$ declare reserved jsonb; finished public.ingestion_attempts; n integer:=0; code text; begin
  foreach code in array array['PROVIDER_REJECTED','SUBMISSION_UNCERTAIN','PROVIDER_QUOTA','PROVIDER_AUTH','PROVIDER_BILLING'] loop
    n:=n+1;
    reserved:=public.reserve_ingestion_attempt(('88888888-8888-4888-8888-'||lpad(n::text,12,'0'))::uuid,
      '88888888-8888-4888-8888-888888888888');
    assert (reserved->>'created')::boolean;
    select * into finished from public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid,
      '88888888-8888-4888-8888-888888888888','[]',0,null,code);
    assert finished.status='failed' and finished.error_code=code,'Synthetic rejection must be recorded';
  end loop;
  begin
    perform public.reserve_ingestion_attempt('88888888-8888-4888-8888-000000000006',
      '88888888-8888-4888-8888-888888888888');
    raise exception 'Failed starts were refunded from the owner budget';
  exception when raise_exception then
    if sqlerrm<>'INGESTION_START_LIMIT' then raise; end if;
  end;
  assert (select count(*) from public.ingestion_attempts
    where owner_id='88888888-8888-4888-8888-888888888888' and status='failed')=5;
end $$;
reset role;
rollback;
