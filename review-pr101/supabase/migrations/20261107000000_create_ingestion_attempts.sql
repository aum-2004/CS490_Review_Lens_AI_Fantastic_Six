-- S1-023: durable, owner-scoped provider jobs. Only the server may bind provider job IDs.
-- Mutations are RPCs granted solely to service_role; browser sessions have read-only RLS access.
create table public.ingestion_attempts (
  id uuid primary key default gen_random_uuid(),
  analysis_target_id uuid not null references public.analysis_targets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  submitted_query text not null,
  query_kind text not null check (query_kind in ('place_id', 'source_url')),
  expected_place_id text,
  provider_request_id text unique,
  status text not null default 'processing' check (status in ('processing', 'succeeded', 'failed')),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  saved_count integer not null default 0 check (saved_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_code text,
  verified_identity jsonb,
  identity_basis text check (identity_basis in ('expected_place_id', 'provider_resolved')),
  constraint ingestion_query_snapshot check (
    (query_kind = 'place_id' and expected_place_id is not null and submitted_query = expected_place_id)
    or (query_kind = 'source_url' and expected_place_id is null and submitted_query = source_url)
  ),
  constraint ingestion_attempt_lifecycle check (
    (status = 'processing' and finished_at is null and saved_count = 0 and error_code is null)
    or (status = 'succeeded' and finished_at is not null and saved_count > 0 and error_code is null
        and provider_request_id is not null and verified_identity is not null and identity_basis is not null)
    or (status = 'failed' and finished_at is not null and saved_count = 0 and error_code is not null)
  ),
  constraint ingestion_identity_object check (verified_identity is null or jsonb_typeof(verified_identity) = 'object')
);
create unique index ingestion_one_processing_per_target on public.ingestion_attempts(analysis_target_id)
  where status = 'processing' or error_code = 'SUBMISSION_UNCERTAIN';
create index ingestion_owner_target_started_idx on public.ingestion_attempts(owner_id, analysis_target_id, started_at desc, id desc);

alter table public.ingestion_attempts enable row level security;
revoke all on public.ingestion_attempts from anon, authenticated;
grant select on public.ingestion_attempts to authenticated;
create policy ingestion_select_own on public.ingestion_attempts for select to authenticated using (
  owner_id = (select auth.uid()) and exists (
    select 1 from public.analysis_targets t where t.id = analysis_target_id and t.owner_id = (select auth.uid())
  )
);

-- One row per target, so a bounded card query cannot lose older targets to row truncation.
create view public.latest_ingestion_attempts with (security_invoker = true) as
  select distinct on (analysis_target_id) * from public.ingestion_attempts
  order by analysis_target_id, started_at desc, id desc;
revoke all on public.latest_ingestion_attempts from anon, authenticated;
grant select on public.latest_ingestion_attempts to authenticated;

-- Explicit no-attempt rows distinguish backend confirmation from missing/truncated data.
create view public.analysis_target_ingestion_status with (security_invoker = true) as
  select t.id as analysis_target_id, t.owner_id,
    coalesce(a.status, 'not_ingested') as state, a.started_at, a.finished_at,
    coalesce(a.saved_count, 0) as saved_count, coalesce(a.skipped_count, 0) as skipped_count, a.error_code,
    a.identity_basis, a.verified_identity->>'businessName' as provider_business_name
  from public.analysis_targets t left join public.latest_ingestion_attempts a on a.analysis_target_id = t.id;
revoke all on public.analysis_target_ingestion_status from anon, authenticated;
grant select on public.analysis_target_ingestion_status to authenticated;

create function public.reserve_ingestion_attempt(p_target_id uuid, p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.analysis_targets; attempt public.ingestion_attempts;
begin
  -- Target lock serializes even the first concurrent submission. Source is copied from storage.
  select * into target from public.analysis_targets where id = p_target_id and owner_id = p_owner_id for update;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  select * into attempt from public.ingestion_attempts where analysis_target_id = p_target_id
    and (status = 'processing' or error_code = 'SUBMISSION_UNCERTAIN');
  if found then return jsonb_build_object('attempt', to_jsonb(attempt), 'created', false); end if;
  insert into public.ingestion_attempts(analysis_target_id, owner_id, source_url, submitted_query, query_kind, expected_place_id)
  values (target.id, target.owner_id, target.source_url, coalesce(btrim(target.google_place_id), target.source_url),
    case when target.google_place_id is null then 'source_url' else 'place_id' end, btrim(target.google_place_id))
  returning * into attempt;
  return jsonb_build_object('attempt', to_jsonb(attempt), 'created', true);
end $$;

create function public.bind_ingestion_job(p_attempt_id uuid, p_owner_id uuid, p_request_id text)
returns public.ingestion_attempts language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts;
begin
  if p_request_id !~ '^[A-Za-z0-9_-]{1,128}$' then raise exception 'Invalid job'; end if;
  select a.* into attempt from public.ingestion_attempts a join public.analysis_targets t on t.id = a.analysis_target_id
    where a.id = p_attempt_id and a.owner_id = p_owner_id and t.owner_id = p_owner_id for update of a;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  if attempt.provider_request_id is not null then
    if attempt.provider_request_id <> p_request_id then raise exception 'Job binding conflict'; end if;
    return attempt; -- duplicate callback/retry must not reset a completed result
  end if;
  if attempt.status <> 'processing' and attempt.error_code is distinct from 'SUBMISSION_UNCERTAIN'
    then raise exception 'Job binding conflict'; end if;
  update public.ingestion_attempts set provider_request_id = p_request_id, status = 'processing',
    error_code = null, finished_at = null where id = attempt.id returning * into attempt;
  return attempt;
end $$;

-- Re-check age and binding AFTER acquiring the lock, not from a stale application read.
create function public.expire_unbound_ingestion_attempt(p_attempt_id uuid, p_owner_id uuid)
returns public.ingestion_attempts language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts;
begin
  select a.* into attempt from public.ingestion_attempts a join public.analysis_targets t on t.id = a.analysis_target_id
    where a.id = p_attempt_id and a.owner_id = p_owner_id and t.owner_id = p_owner_id for update of a;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  if attempt.status = 'processing' and attempt.provider_request_id is null
    and attempt.started_at < clock_timestamp() - interval '1 minute' then
    update public.ingestion_attempts set status = 'failed', error_code = 'SUBMISSION_UNCERTAIN',
      finished_at = clock_timestamp() where id = attempt.id returning * into attempt;
  end if;
  return attempt;
end $$;

-- Review insertion and successful result state are ONE transaction, locked per attempt.
-- Polling twice or from two tabs cannot save the same attempt twice.
create function public.finish_ingestion_attempt(
  p_attempt_id uuid, p_owner_id uuid, p_reviews jsonb, p_skipped_count integer,
  p_identity jsonb, p_error_code text
) returns public.ingestion_attempts language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts; saved integer;
begin
  select a.* into attempt from public.ingestion_attempts a join public.analysis_targets t on t.id = a.analysis_target_id
    where a.id = p_attempt_id and a.owner_id = p_owner_id and t.owner_id = p_owner_id for update of a;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  if attempt.status <> 'processing' then return attempt; end if;
  -- A gate outage is not provider failure. A late uncertainty decision cannot fail a bound job.
  if p_error_code = 'STORAGE_NOT_APPROVED' or
    (p_error_code = 'SUBMISSION_UNCERTAIN' and attempt.provider_request_id is not null) then return attempt; end if;
  if jsonb_typeof(p_reviews) <> 'array' or p_skipped_count < 0 then raise exception 'Invalid completion'; end if;
  if p_error_code is null then
    if attempt.provider_request_id is null or jsonb_array_length(p_reviews) = 0 or p_identity is null
      then raise exception 'Missing verified completion'; end if;
    -- URL job results retain provider-resolved provenance. They are NOT promoted to an
    -- independently verified match to the URL or to the target's configured Place ID.
    if jsonb_typeof(p_identity->'placeId') is distinct from 'string'
      or p_identity->>'placeId' !~ '^ChIJ[A-Za-z0-9_-]+$'
      or jsonb_typeof(p_identity->'businessName') is distinct from 'string'
      or coalesce(btrim(p_identity->>'businessName'), '') = ''
      or (attempt.query_kind = 'place_id' and p_identity->>'placeId' is distinct from attempt.expected_place_id)
      then raise exception 'Identity mismatch'; end if;
    insert into public.reviews(analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date, review_url, source_metadata)
      select attempt.analysis_target_id, r.text, r.rating, r.source_review_id, r.reviewer_name, r.review_date, r.review_url, r.source_metadata
      from jsonb_to_recordset(p_reviews) as r(text text, rating numeric, source_review_id text,
        reviewer_name text, review_date timestamptz, review_url text, source_metadata jsonb);
    get diagnostics saved = row_count;
  else
    if jsonb_array_length(p_reviews) <> 0 then raise exception 'Failed attempt cannot save reviews'; end if;
    saved := 0;
  end if;
  update public.ingestion_attempts set status = case when p_error_code is null then 'succeeded' else 'failed' end,
    finished_at = clock_timestamp(), saved_count = saved, skipped_count = p_skipped_count,
    verified_identity = p_identity, error_code = p_error_code,
    identity_basis = case when p_error_code is null then
      case when attempt.query_kind = 'place_id' then 'expected_place_id' else 'provider_resolved' end
      else null end
    where id = attempt.id returning * into attempt;
  return attempt;
end $$;

revoke all on function public.reserve_ingestion_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bind_ingestion_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_ingestion_attempt(uuid, uuid, jsonb, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.expire_unbound_ingestion_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ingestion_attempt(uuid, uuid) to service_role;
grant execute on function public.bind_ingestion_job(uuid, uuid, text) to service_role;
grant execute on function public.finish_ingestion_attempt(uuid, uuid, jsonb, integer, jsonb, text) to service_role;
grant execute on function public.expire_unbound_ingestion_attempt(uuid, uuid) to service_role;
