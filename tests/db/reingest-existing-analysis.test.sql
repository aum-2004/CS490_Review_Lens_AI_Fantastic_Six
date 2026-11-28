-- S3-009 database tests: refreshing an existing owned analysis (S3-BR-014) and the merge-only
-- dataset guarantee (S3-BR-015). Run with `npm run test:db`. Everything rolls back.
--
-- User A: c3090000-0000-4000-8000-0000000000a1  targets a1 (ingested), a2 (never ingested)
-- User B: c3090000-0000-4000-8000-0000000000b1  (foreign caller)
-- User C: c3090000-0000-4000-8000-0000000000c1  targets c1..c3 (paid-start budget)

\set ON_ERROR_STOP on
\set QUIET on

begin;

insert into auth.users (id) values
  ('c3090000-0000-4000-8000-0000000000a1'),
  ('c3090000-0000-4000-8000-0000000000b1'),
  ('c3090000-0000-4000-8000-0000000000c1');
insert into public.analysis_targets (id, owner_id, name, platform, source_url, google_place_id) values
  ('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1', 'Refresh A1',
   'google_maps', 'https://www.google.com/maps/place/RefreshA1', 'ChIJRefreshA1'),
  ('c3090000-0000-4000-8000-00000000a002', 'c3090000-0000-4000-8000-0000000000a1', 'Refresh A2',
   'google_maps', 'https://www.google.com/maps/place/RefreshA2', 'ChIJRefreshA2'),
  ('c3090000-0000-4000-8000-00000000c001', 'c3090000-0000-4000-8000-0000000000c1', 'Budget C1',
   'google_maps', 'https://www.google.com/maps/place/BudgetC1', 'ChIJBudgetC1'),
  ('c3090000-0000-4000-8000-00000000c002', 'c3090000-0000-4000-8000-0000000000c1', 'Budget C2',
   'google_maps', 'https://www.google.com/maps/place/BudgetC2', 'ChIJBudgetC2'),
  ('c3090000-0000-4000-8000-00000000c003', 'c3090000-0000-4000-8000-0000000000c1', 'Budget C3',
   'google_maps', 'https://www.google.com/maps/place/BudgetC3', 'ChIJBudgetC3');

-- ---------------------------------------------------------------------------------------------
-- Schema and privileges
-- ---------------------------------------------------------------------------------------------
do $$
declare fn regprocedure := 'public.reserve_reingestion_attempt(uuid, uuid)'::regprocedure;
begin
  assert (select prosecdef from pg_catalog.pg_proc where oid = fn), 'refresh RPC must be SECURITY DEFINER';
  assert (select proconfig from pg_catalog.pg_proc where oid = fn) = array['search_path=""'],
    'refresh RPC must pin an empty search_path';
  assert has_function_privilege('service_role', fn, 'EXECUTE'), 'service_role cannot reserve a refresh';
  assert not has_function_privilege('authenticated', fn, 'EXECUTE'), 'browser sessions can reserve paid refreshes';
  assert not has_function_privilege('anon', fn, 'EXECUTE'), 'anonymous callers can reserve paid refreshes';
  assert not exists (
    select 1 from pg_catalog.aclexplode((select proacl from pg_catalog.pg_proc where oid = fn)) acl
    where acl.grantee = 0
  ), 'PUBLIC can execute the refresh RPC';
  assert has_column_privilege('authenticated', 'public.ingestion_attempts', 'attempt_kind', 'SELECT'),
    'owners cannot read the attempt kind';
  assert not has_table_privilege('authenticated', 'public.ingestion_attempts', 'INSERT'), 'browser can insert attempts';
  assert not has_table_privilege('authenticated', 'public.ingestion_attempts', 'UPDATE'), 'browser can update attempts';
  assert not has_table_privilege('authenticated', 'public.ingestion_attempts', 'DELETE'), 'browser can delete attempts';
  assert not has_column_privilege('authenticated', 'public.ingestion_attempts', 'attempt_kind', 'UPDATE'),
    'browser can relabel attempts';
  assert not has_table_privilege('authenticated', 'public.reviews', 'INSERT'), 'browser can insert reviews';
  assert not has_table_privilege('authenticated', 'public.reviews', 'DELETE'), 'browser can delete reviews';
end $$;

-- A browser session cannot reach the RPC or write attempts directly, even for its own target.
set role authenticated;
set request.jwt.claims to '{"sub":"c3090000-0000-4000-8000-0000000000a1"}';
do $$ begin
  begin
    perform public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
    raise exception 'authenticated reserved a refresh';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.ingestion_attempts (analysis_target_id, owner_id, source_url, submitted_query, query_kind, attempt_kind)
    values ('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1',
      'https://www.google.com/maps/place/RefreshA1', 'https://www.google.com/maps/place/RefreshA1', 'source_url', 'reingest');
    raise exception 'authenticated inserted an attempt';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------------------------
-- Initial collection: three reviews (two with source ids, one without)
-- ---------------------------------------------------------------------------------------------
set role service_role;
do $$
declare reserved jsonb; again jsonb; done public.ingestion_attempts;
begin
  reserved := public.reserve_ingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
  assert (reserved->>'created')::boolean, 'initial reservation not created';
  assert reserved->'attempt'->>'attempt_kind' = 'initial', 'initial attempt has the wrong kind';
  perform set_config('test.initial', reserved->'attempt'->>'id', true);
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000a1', 'reingest-job-initial');
  done := public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000a1',
    '[{"text":"Original one","rating":4,"source_review_id":"s1","reviewer_name":"Ana","review_date":"2026-11-01T10:00:00Z"},
      {"text":"Original two","rating":5,"source_review_id":"s2","reviewer_name":"Ben","review_date":"2026-11-02T10:00:00Z"},
      {"text":"No source id","rating":3}]'::jsonb,
    0, '{"placeId":"ChIJRefreshA1","businessName":"Refresh A1"}'::jsonb, null);
  assert done.status = 'succeeded' and done.saved_count = 3, 'initial collection did not save three reviews';

  -- A duplicated create request is still answered with the successful attempt (unchanged rule).
  again := public.reserve_ingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
  assert not (again->>'created')::boolean and again->'attempt'->>'id' = current_setting('test.initial'),
    'create idempotency changed';
end $$;
reset role;

do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 3,
    'initial dataset is not three reviews';
end $$;

-- ---------------------------------------------------------------------------------------------
-- Ownership and availability: denials create nothing
-- ---------------------------------------------------------------------------------------------
set role service_role;
do $$ begin
  -- Foreign owner of an existing target, a missing target, and a target with no dataset.
  begin
    perform public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000b1');
    raise exception 'foreign owner reserved a refresh';
  exception when no_data_found then null; end;
  begin
    perform public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000ffff', 'c3090000-0000-4000-8000-0000000000a1');
    raise exception 'missing target reserved a refresh';
  exception when no_data_found then null; end;
  begin
    perform public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a002', 'c3090000-0000-4000-8000-0000000000a1');
    raise exception 'target without a dataset reserved a refresh';
  exception when raise_exception then
    if sqlerrm <> 'REINGEST_UNAVAILABLE' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.ingestion_attempts where owner_id = 'c3090000-0000-4000-8000-0000000000b1') = 0,
    'a foreign refresh created or charged an attempt';
  assert (select count(*) from public.ingestion_attempts where analysis_target_id = 'c3090000-0000-4000-8000-00000000a002') = 0,
    'an unavailable refresh created an attempt';
  assert (select count(*) from public.ingestion_attempts where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 1,
    'a denied refresh created an attempt';
end $$;

-- ---------------------------------------------------------------------------------------------
-- Refresh creates a new attempt; previous attempts remain; one active run per target
-- ---------------------------------------------------------------------------------------------
set role service_role;
do $$
declare reserved jsonb; create_during jsonb;
begin
  reserved := public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
  assert (reserved->>'created')::boolean, 'refresh not created';
  assert reserved->'attempt'->>'id' <> current_setting('test.initial'), 'refresh reused the old attempt';
  assert reserved->'attempt'->>'attempt_kind' = 'reingest', 'refresh is not labelled reingest';
  assert reserved->'attempt'->>'status' = 'processing', 'refresh is not processing';
  assert reserved->'attempt'->>'source_url' = 'https://www.google.com/maps/place/RefreshA1'
    and reserved->'attempt'->>'expected_place_id' = 'ChIJRefreshA1', 'refresh source not copied from storage';
  perform set_config('test.refresh1', reserved->'attempt'->>'id', true);

  begin
    perform public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
    raise exception 'a second concurrent refresh was reserved';
  exception when raise_exception then
    if sqlerrm <> 'REINGEST_IN_PROGRESS' then raise; end if;
  end;
  -- A create request during the refresh still returns the running attempt, never a new one.
  create_during := public.reserve_ingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
  assert not (create_during->>'created')::boolean, 'a create request started a second run';
end $$;
reset role;

do $$ begin
  assert (select count(*) from public.ingestion_attempts where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 2,
    'expected exactly the initial attempt and one refresh';
  assert (select status = 'succeeded' and saved_count = 3 and attempt_kind = 'initial'
    from public.ingestion_attempts where id = current_setting('test.initial')::uuid), 'refresh changed the previous attempt';
  -- The last successful attempt is still the initial one while the refresh runs.
  assert (select id from public.ingestion_attempts
    where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001' and status = 'succeeded'
    order by started_at desc, id desc limit 1) = current_setting('test.initial')::uuid,
    'the previous successful attempt is no longer identifiable';
end $$;

-- Owners can read both rows and their kinds through RLS (the workspace last-success read).
set role authenticated;
set request.jwt.claims to '{"sub":"c3090000-0000-4000-8000-0000000000a1"}';
do $$ begin
  assert (select pg_catalog.array_agg(attempt_kind order by started_at) from public.ingestion_attempts
    where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = array['initial', 'reingest'],
    'owner cannot read the attempt history';
end $$;
set request.jwt.claims to '{"sub":"c3090000-0000-4000-8000-0000000000b1"}';
do $$ begin
  assert (select count(*) from public.ingestion_attempts
    where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 0, 'foreign user can read attempts';
end $$;
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------------------------
-- A partial refresh batch merges: absent reviews remain, repeats do not multiply
-- ---------------------------------------------------------------------------------------------
create temporary table refresh_snapshot on commit drop as
  select id, source_review_id, review_text, rating from public.reviews
  where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001';

set role service_role;
do $$
declare done public.ingestion_attempts;
begin
  perform public.bind_ingestion_job(current_setting('test.refresh1')::uuid, 'c3090000-0000-4000-8000-0000000000a1', 'reingest-job-1');
  -- s1 edited, s2 absent, the id-less review repeated, s4 new.
  done := public.finish_ingestion_attempt(current_setting('test.refresh1')::uuid, 'c3090000-0000-4000-8000-0000000000a1',
    '[{"text":"Edited one","rating":3,"source_review_id":"s1","reviewer_name":"Ana","review_date":"2026-11-01T10:00:00Z"},
      {"text":"No source id","rating":3},
      {"text":"Brand new","rating":5,"source_review_id":"s4","reviewer_name":"Dee","review_date":"2026-11-20T10:00:00Z"}]'::jsonb,
    0, '{"placeId":"ChIJRefreshA1","businessName":"Refresh A1"}'::jsonb, null);
  assert done.status = 'succeeded' and done.saved_count = 1, 'refresh saved_count must count only new reviews';
end $$;
reset role;

do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 4,
    'the dataset is not the union of persisted and fetched reviews';
  assert exists (select 1 from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001'
    and source_review_id = 's2' and review_text = 'Original two'), 'a review absent from the partial batch was removed';
  assert (select count(*) from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001'
    and source_review_id = 's1') = 1, 'a repeated source review multiplied';
  assert (select review_text from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001'
    and source_review_id = 's1') = 'Edited one', 'a matched review was not refreshed';
  assert (select count(*) from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001'
    and source_review_id is null and review_text = 'No source id') = 1, 'a repeated id-less review multiplied';
  -- Every previously stored row keeps its identity.
  assert (select count(*) from refresh_snapshot s join public.reviews r using (id)) = 3,
    'a previously stored review lost its row';
  assert (select id from public.ingestion_attempts
    where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001' and status = 'succeeded'
    order by started_at desc, id desc limit 1) = current_setting('test.refresh1')::uuid,
    'the completed refresh is not the last successful attempt';
end $$;

-- ---------------------------------------------------------------------------------------------
-- Late completion or binding of an older attempt cannot change newer state
-- ---------------------------------------------------------------------------------------------
set role service_role;
do $$
declare late public.ingestion_attempts;
begin
  late := public.finish_ingestion_attempt(current_setting('test.initial')::uuid, 'c3090000-0000-4000-8000-0000000000a1',
    '[{"text":"Stale overwrite","rating":1,"source_review_id":"s1"},{"text":"Stale extra","rating":1,"source_review_id":"s9"}]'::jsonb,
    0, '{"placeId":"ChIJRefreshA1","businessName":"Refresh A1"}'::jsonb, null);
  assert late.status = 'succeeded' and late.saved_count = 3, 'a late completion rewrote the old attempt';
  late := public.finish_ingestion_attempt(current_setting('test.initial')::uuid, 'c3090000-0000-4000-8000-0000000000a1',
    '[]'::jsonb, 0, null, 'INGESTION_FAILED');
  assert late.status = 'succeeded', 'a late failure flipped the old attempt';
  begin
    perform public.bind_ingestion_job(current_setting('test.initial')::uuid, 'c3090000-0000-4000-8000-0000000000a1', 'reingest-job-other');
    raise exception 'an old attempt was rebound';
  exception when raise_exception then
    if sqlerrm <> 'Job binding conflict' then raise; end if;
  end;
  -- Repeating the newest completion is idempotent too.
  late := public.finish_ingestion_attempt(current_setting('test.refresh1')::uuid, 'c3090000-0000-4000-8000-0000000000a1',
    '[{"text":"Replay","rating":1,"source_review_id":"s8"}]'::jsonb,
    0, '{"placeId":"ChIJRefreshA1","businessName":"Refresh A1"}'::jsonb, null);
  assert late.saved_count = 1, 'a replayed completion was saved twice';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 4,
    'a late or replayed completion changed the dataset';
  assert not exists (select 1 from public.reviews where review_text in ('Stale overwrite', 'Stale extra', 'Replay')),
    'a stale batch reached the dataset';
end $$;

-- ---------------------------------------------------------------------------------------------
-- A failed refresh leaves the dataset untouched and does not block the next refresh
-- ---------------------------------------------------------------------------------------------
create temporary table before_failure on commit drop as
  select id, source_review_id, review_text, rating, reviewer_name, review_date, updated_at
  from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001';

set role service_role;
do $$
declare reserved jsonb; failed public.ingestion_attempts;
begin
  reserved := public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000a1', 'reingest-job-2');
  begin
    perform public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000a1',
      '[{"text":"Must not save","rating":2,"source_review_id":"s5"}]'::jsonb, 0, null, 'NO_REVIEWS');
    raise exception 'a failed refresh saved reviews';
  exception when raise_exception then
    if sqlerrm <> 'Failed attempt cannot save reviews' then raise; end if;
  end;
  failed := public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000a1',
    '[]'::jsonb, 2, null, 'NO_REVIEWS');
  assert failed.status = 'failed' and failed.error_code = 'NO_REVIEWS', 'refresh did not fail';
  perform set_config('test.refresh2', reserved->'attempt'->>'id', true);
end $$;
reset role;

do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 4
    and not exists (
      (select id, source_review_id, review_text, rating, reviewer_name, review_date, updated_at from before_failure)
      except
      (select id, source_review_id, review_text, rating, reviewer_name, review_date, updated_at
        from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001')
    ), 'a failed refresh changed the dataset';
  -- The dataset still resolves to the last successful attempt, not to the failed one.
  assert (select id from public.ingestion_attempts
    where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001' and status = 'succeeded'
    order by started_at desc, id desc limit 1) = current_setting('test.refresh1')::uuid,
    'a failed refresh replaced the last successful attempt';
end $$;

-- A provider failure is not a hold: the owner may refresh again. A billing hold blocks it.
set role service_role;
do $$
declare reserved jsonb;
begin
  reserved := public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
  perform set_config('test.refresh3', reserved->'attempt'->>'id', true);
end $$;
reset role;
-- Admin fixture: the unbound refresh aged past the binding window (S1-023 expiry rules).
update public.ingestion_attempts set started_at = clock_timestamp() - interval '2 minutes'
  where id = current_setting('test.refresh3')::uuid;
set role service_role;
do $$
declare expired public.ingestion_attempts;
begin
  expired := public.expire_unbound_ingestion_attempt(current_setting('test.refresh3')::uuid, 'c3090000-0000-4000-8000-0000000000a1');
  assert expired.error_code = 'SUBMISSION_UNCERTAIN', 'fixture did not create a billing hold';
  begin
    perform public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000a001', 'c3090000-0000-4000-8000-0000000000a1');
    raise exception 'a refresh started over a billing hold';
  exception when raise_exception then
    if sqlerrm <> 'REINGEST_BLOCKED' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.reviews where analysis_target_id = 'c3090000-0000-4000-8000-00000000a001') = 4,
    'a held refresh changed the dataset';
end $$;

-- ---------------------------------------------------------------------------------------------
-- Paid-start budget: refreshes count exactly like starts, failed attempts included
-- ---------------------------------------------------------------------------------------------
set role service_role;
do $$
declare reserved jsonb; n integer;
begin
  -- 1: initial success on c1.
  reserved := public.reserve_ingestion_attempt('c3090000-0000-4000-8000-00000000c001', 'c3090000-0000-4000-8000-0000000000c1');
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000c1', 'budget-job-1');
  perform public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000c1',
    '[{"text":"Budget review","rating":4,"source_review_id":"b1"}]'::jsonb, 0,
    '{"placeId":"ChIJBudgetC1","businessName":"Budget C1"}'::jsonb, null);
  -- 2..4: refreshes that fail (rejected before acceptance), each still charged.
  for n in 2..4 loop
    reserved := public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000c001', 'c3090000-0000-4000-8000-0000000000c1');
    perform public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid, 'c3090000-0000-4000-8000-0000000000c1',
      '[]'::jsonb, 0, null, 'PROVIDER_REJECTED');
  end loop;
  -- 5: a create on another target shares the same budget.
  reserved := public.reserve_ingestion_attempt('c3090000-0000-4000-8000-00000000c002', 'c3090000-0000-4000-8000-0000000000c1');
  assert (reserved->>'created')::boolean, 'the fifth slot was not available';
  -- 6: both paths are now refused.
  begin
    perform public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000c001', 'c3090000-0000-4000-8000-0000000000c1');
    raise exception 'a refresh bypassed the paid-start budget';
  exception when raise_exception then
    if sqlerrm <> 'INGESTION_START_LIMIT' then raise; end if;
  end;
  begin
    perform public.reserve_ingestion_attempt('c3090000-0000-4000-8000-00000000c003', 'c3090000-0000-4000-8000-0000000000c1');
    raise exception 'refreshes were not counted toward the paid-start budget';
  exception when raise_exception then
    if sqlerrm <> 'INGESTION_START_LIMIT' then raise; end if;
  end;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.ingestion_attempts where owner_id = 'c3090000-0000-4000-8000-0000000000c1') = 5,
    'the budget allowed more than five reservations';
  assert (select count(*) from public.ingestion_attempts where owner_id = 'c3090000-0000-4000-8000-0000000000c1'
    and attempt_kind = 'reingest' and status = 'failed') = 3, 'failed refreshes were refunded or not recorded';
end $$;
-- The window is the same rolling 24 hours: aged slots free the budget again (no other bypass).
update public.ingestion_attempts set started_at = started_at - interval '25 hours'
  where owner_id = 'c3090000-0000-4000-8000-0000000000c1' and analysis_target_id = 'c3090000-0000-4000-8000-00000000c001';
set role service_role;
do $$
declare reserved jsonb;
begin
  reserved := public.reserve_reingestion_attempt('c3090000-0000-4000-8000-00000000c001', 'c3090000-0000-4000-8000-0000000000c1');
  assert (reserved->>'created')::boolean, 'an aged-out budget still refused the refresh';
end $$;
reset role;

rollback;
\echo 'ok - S3-009 re-ingestion: new attempts, merge-only dataset, ownership, concurrency, budget'
