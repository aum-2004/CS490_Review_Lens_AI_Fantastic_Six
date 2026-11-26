\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
  ('55555555-5555-4555-8555-555555555501'), ('55555555-5555-4555-8555-555555555502');
insert into public.analysis_targets(id, owner_id, name, platform, source_url)
select ('55555555-5555-4555-8555-' || lpad(n::text, 12, '0'))::uuid,
  '55555555-5555-4555-8555-555555555501', 'Delete fixture ' || n,
  'google_maps', 'https://www.google.com/maps/place/DeleteFixture'
from generate_series(1, 6) n;
insert into public.reviews(analysis_target_id, review_text, rating)
values ('55555555-5555-4555-8555-000000000001', 'Synthetic persisted evidence', 4);

-- Make five genuine reservations with the real service-only ingestion RPC.
set local role service_role;
do $$ begin
  for n in 1..5 loop
    perform public.reserve_ingestion_attempt(
      ('55555555-5555-4555-8555-' || lpad(n::text, 12, '0'))::uuid,
      '55555555-5555-4555-8555-555555555501');
  end loop;
end $$;
reset role;

set local role anon;
do $$ begin
  begin
    perform public.delete_owned_analysis('55555555-5555-4555-8555-000000000001');
    raise exception 'Anonymous deletion allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
set local request.jwt.claims = '{}';
do $$ begin
  begin
    perform public.delete_owned_analysis('55555555-5555-4555-8555-000000000001');
    raise exception 'Sessionless deletion allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555502"}';
do $$ begin
  assert not public.delete_owned_analysis('55555555-5555-4555-8555-000000000001'), 'Foreign deletion allowed';
  assert not public.delete_owned_analysis('55555555-5555-4555-8555-000000000099'), 'Missing target must return false';
  assert not has_table_privilege('authenticated', 'public.analysis_targets', 'DELETE'), 'Raw deletes must remain revoked';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = '55555555-5555-4555-8555-000000000001') = 1, 'Foreign denial removed evidence';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555501"}';
select public.reserve_review_question();
do $$ begin
  for n in 1..5 loop
    assert public.delete_owned_analysis(('55555555-5555-4555-8555-' || lpad(n::text, 12, '0'))::uuid), 'Owner could not delete';
  end loop;
  assert not public.delete_owned_analysis('55555555-5555-4555-8555-000000000001'), 'Repeated deletion must not report success';
  assert not exists (select 1 from public.analysis_targets where id = '55555555-5555-4555-8555-000000000001'), 'Deleted analysis still readable';
  assert not exists (select 1 from public.reviews where analysis_target_id = '55555555-5555-4555-8555-000000000001'), 'Deleted evidence still readable';
  assert not exists (select 1 from public.ingestion_attempts where owner_id = auth.uid()), 'Detached audits visible to browser';
end $$;
reset role;

do $$ begin
  assert not exists (select 1 from public.reviews where analysis_target_id = '55555555-5555-4555-8555-000000000001'), 'Review cascade failed';
  assert (select count(*) from public.ingestion_attempts where owner_id = '55555555-5555-4555-8555-555555555501' and analysis_target_id is null) = 5, 'Audit reservations were lost';
  assert (select count(*) from public.review_question_reservations where owner_id = '55555555-5555-4555-8555-555555555501') = 1, 'Q&A usage was refunded';
  assert (select count(*) from public.analysis_targets where owner_id = '55555555-5555-4555-8555-555555555501') = 1, 'Unselected analysis deleted';
end $$;

set local role service_role;
do $$ declare attempt uuid; begin
  begin
    perform public.reserve_ingestion_attempt('55555555-5555-4555-8555-000000000006', '55555555-5555-4555-8555-555555555501');
    raise exception 'Deletion refunded paid ingestion quota';
  exception when raise_exception then
    if sqlerrm <> 'INGESTION_START_LIMIT' then raise; end if;
  end;
  select id into attempt from public.ingestion_attempts where owner_id = '55555555-5555-4555-8555-555555555501' limit 1;
  begin
    perform public.bind_ingestion_job(attempt, '55555555-5555-4555-8555-555555555501', 'late-deleted-job');
    raise exception 'Late callback bound a deleted target';
  exception when no_data_found then null; end;
  begin
    perform public.finish_ingestion_attempt(attempt, '55555555-5555-4555-8555-555555555501', '[{"text":"Late review","rating":4}]', 0, '{"placeId":"Synthetic","businessName":"Synthetic"}', null);
    raise exception 'Late completion restored deleted data';
  exception when no_data_found then null; end;
end $$;
reset role;
rollback;
\echo 'ok - owned deletion, cross-user denial, cascades, retained budgets and late callback denial'
