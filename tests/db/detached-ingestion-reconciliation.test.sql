\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values ('66666666-6666-4666-8666-666666666601');
insert into public.analysis_targets(id, owner_id, name, platform, source_url)
values ('66666666-6666-4666-8666-666666666602', '66666666-6666-4666-8666-666666666601',
  'Detached audit fixture', 'google_maps', 'https://www.google.com/maps/place/AuditFixture');
insert into public.analysis_targets(id, owner_id, name, platform, source_url)
values ('66666666-6666-4666-8666-666666666603', '66666666-6666-4666-8666-666666666601',
  'Fresh quota fixture', 'google_maps', 'https://www.google.com/maps/place/FreshFixture');
insert into public.ingestion_attempts(id, analysis_target_id, owner_id, source_url, submitted_query, query_kind)
select ('66666666-6666-4666-8666-' || lpad(n::text, 12, '0'))::uuid,
  case when n = 6 then '66666666-6666-4666-8666-666666666602'::uuid else null end,
  '66666666-6666-4666-8666-666666666601', 'https://www.google.com/maps/place/AuditFixture',
  'https://www.google.com/maps/place/AuditFixture', 'source_url'
from generate_series(1, 6) n;
update public.ingestion_attempts set status = 'failed', finished_at = clock_timestamp(),
  error_code = case when id::text like '%000002' then 'SUBMISSION_UNCERTAIN' else 'RESULT_WINDOW_EXPIRED' end
where id in ('66666666-6666-4666-8666-000000000002', '66666666-6666-4666-8666-000000000003');
update public.ingestion_attempts set status = 'succeeded', finished_at = clock_timestamp(), saved_count = 2,
  provider_request_id = 'retained-provider-job', verified_identity = '{"placeId":"ChIJSynthetic"}', identity_basis = 'provider_resolved'
where id = '66666666-6666-4666-8666-000000000004';

do $$ begin
  assert not has_function_privilege('anon', 'public.reconcile_detached_ingestion_attempt(uuid,uuid,text)', 'EXECUTE'), 'Anonymous operator access';
  assert not has_function_privilege('authenticated', 'public.reconcile_detached_ingestion_attempt(uuid,uuid,text)', 'EXECUTE'), 'Browser operator access';
end $$;
set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666601"}';
do $$ begin
  begin
    perform public.reconcile_detached_ingestion_attempt('66666666-6666-4666-8666-000000000001', auth.uid(), 'ticket');
    raise exception 'Browser reconciled an audit';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$
declare before_row public.ingestion_attempts; after_row public.ingestion_attempts; repeated public.ingestion_attempts; bad_ref text;
begin
  -- Both live-parent and wrong-owner/missing requests fail with the same safe error.
  for n in 5..7 loop
    begin
      perform public.reconcile_detached_ingestion_attempt(
        ('66666666-6666-4666-8666-' || lpad(n::text, 12, '0'))::uuid,
        case when n = 5 then '66666666-6666-4666-8666-666666666699'::uuid
          else '66666666-6666-4666-8666-666666666601'::uuid end, 'ticket');
      raise exception 'Unavailable audit accepted';
    exception when no_data_found then
      assert sqlerrm = 'Detached attempt unavailable', 'Failure reveals a different state';
    end;
  end loop;
  foreach bad_ref in array array[null::text, '', '   ', repeat('x', 501)] loop
    begin
      perform public.reconcile_detached_ingestion_attempt('66666666-6666-4666-8666-000000000001',
        '66666666-6666-4666-8666-666666666601', bad_ref);
      raise exception 'Invalid evidence accepted';
    exception when raise_exception then
      if sqlerrm <> 'Resolution evidence required' then raise; end if;
    end;
  end loop;
  for n in 1..4 loop
    select * into strict before_row from public.ingestion_attempts
      where id = ('66666666-6666-4666-8666-' || lpad(n::text, 12, '0'))::uuid;
    after_row := public.reconcile_detached_ingestion_attempt(before_row.id, before_row.owner_id, ' ticket/provider-confirmation ');
    assert after_row.resolution_reference = 'ticket/provider-confirmation' and after_row.resolved_at is not null, 'Evidence missing';
    assert (to_jsonb(before_row) - 'resolution_reference' - 'resolved_at') =
      (to_jsonb(after_row) - 'resolution_reference' - 'resolved_at'), 'Reconciliation changed lifecycle, quota, binding or owner';
    repeated := public.reconcile_detached_ingestion_attempt(before_row.id, before_row.owner_id, 'ticket/provider-confirmation');
    assert to_jsonb(repeated) = to_jsonb(after_row), 'Retry changed the original audit';
    begin
      perform public.reconcile_detached_ingestion_attempt(before_row.id, before_row.owner_id, 'replacement-ticket');
      raise exception 'Existing evidence overwritten';
    exception when raise_exception then
      if sqlerrm <> 'Reconciliation already recorded' then raise; end if;
    end;
    begin
      perform public.bind_ingestion_job(before_row.id, before_row.owner_id, 'late-job');
      raise exception 'Reconciled orphan was rebound';
    exception when no_data_found then null; end;
  end loop;
  begin
    perform public.reserve_ingestion_attempt('66666666-6666-4666-8666-666666666603', '66666666-6666-4666-8666-666666666601');
    raise exception 'Reconciliation refunded quota';
  exception when raise_exception then
    if sqlerrm <> 'INGESTION_START_LIMIT' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.analysis_targets where owner_id = '66666666-6666-4666-8666-666666666601') = 2, 'Target restored';
  assert not exists (select 1 from public.reviews where analysis_target_id = '66666666-6666-4666-8666-666666666602'), 'Reviews restored';
end $$;
rollback;
\echo 'ok - detached audit reconciliation privileges, immutability, evidence and retained quota'
