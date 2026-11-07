-- PR #48 review: one successful ingestion per target, bounded polling, explicit recovery reads.
grant select on public.ingestion_attempts to service_role;
-- Supabase service_role bypasses RLS; this also works without relying on that default.
create policy ingestion_service_read on public.ingestion_attempts for select to service_role using (true);

alter table public.ingestion_attempts add column resolution_reference text;
alter table public.ingestion_attempts add column resolved_at timestamptz;

drop index public.ingestion_one_processing_per_target;
create unique index ingestion_one_processing_per_target on public.ingestion_attempts(analysis_target_id)
  where status = 'processing' or error_code in ('SUBMISSION_UNCERTAIN', 'RESULT_WINDOW_EXPIRED');

create or replace function public.reserve_ingestion_attempt(p_target_id uuid, p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.analysis_targets; attempt public.ingestion_attempts;
begin
  select * into target from public.analysis_targets where id = p_target_id and owner_id = p_owner_id for update;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  select * into attempt from public.ingestion_attempts where analysis_target_id = p_target_id
    and (status in ('processing', 'succeeded') or error_code in ('SUBMISSION_UNCERTAIN', 'RESULT_WINDOW_EXPIRED'))
    order by (status = 'succeeded') desc, started_at desc, id desc limit 1;
  if found then return jsonb_build_object('attempt', to_jsonb(attempt), 'created', false); end if;
  insert into public.ingestion_attempts(analysis_target_id, owner_id, source_url, submitted_query, query_kind, expected_place_id)
  values (target.id, target.owner_id, target.source_url, coalesce(btrim(target.google_place_id), target.source_url),
    case when target.google_place_id is null then 'source_url' else 'place_id' end, btrim(target.google_place_id))
  returning * into attempt;
  return jsonb_build_object('attempt', to_jsonb(attempt), 'created', true);
end $$;

-- No browser clock decides expiry. A stale caller cannot expire a succeeded attempt.
create function public.expire_bound_ingestion_attempt(p_attempt_id uuid, p_owner_id uuid)
returns public.ingestion_attempts language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts;
begin
  select a.* into attempt from public.ingestion_attempts a join public.analysis_targets t on t.id = a.analysis_target_id
    where a.id = p_attempt_id and a.owner_id = p_owner_id and t.owner_id = p_owner_id for update of a;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  if attempt.status = 'processing' and attempt.provider_request_id is not null
    and attempt.started_at <= clock_timestamp() - interval '4 hours' then
    update public.ingestion_attempts set status = 'failed', error_code = 'RESULT_WINDOW_EXPIRED',
      finished_at = clock_timestamp() where id = attempt.id returning * into attempt;
  end if;
  return attempt;
end $$;

create or replace function public.finish_ingestion_attempt(
  p_attempt_id uuid, p_owner_id uuid, p_reviews jsonb, p_skipped_count integer,
  p_identity jsonb, p_error_code text
) returns public.ingestion_attempts language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts; saved integer;
begin
  select a.* into attempt from public.ingestion_attempts a join public.analysis_targets t on t.id = a.analysis_target_id
    where a.id = p_attempt_id and a.owner_id = p_owner_id and t.owner_id = p_owner_id for update of a;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  if attempt.status <> 'processing' then return attempt; end if;
  -- Recheck the deadline under the same lock even if the provider fetch began before expiry.
  if attempt.provider_request_id is not null and attempt.started_at <= clock_timestamp() - interval '4 hours' then
    update public.ingestion_attempts set status = 'failed', error_code = 'RESULT_WINDOW_EXPIRED',
      finished_at = clock_timestamp() where id = attempt.id returning * into attempt;
    return attempt;
  end if;
  if p_error_code = 'STORAGE_NOT_APPROVED' then return attempt; end if;
  -- A lookup/configuration/transport failure is not evidence of a failed paid job.
  if attempt.provider_request_id is not null and p_error_code is not null
    and p_error_code not in ('INGESTION_FAILED', 'SOURCE_IDENTITY_UNVERIFIED', 'NO_REVIEWS')
    then return attempt; end if;
  if jsonb_typeof(p_reviews) <> 'array' or p_skipped_count < 0 then raise exception 'Invalid completion'; end if;
  if p_error_code is null then
    if attempt.provider_request_id is null or jsonb_array_length(p_reviews) = 0 or p_identity is null
      then raise exception 'Missing verified completion'; end if;
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

-- Operator-only release after independent provider confirmation. Keep binding and audit evidence.
create function public.resolve_ingestion_no_job(p_attempt_id uuid, p_owner_id uuid, p_evidence_reference text)
returns public.ingestion_attempts language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts;
begin
  if p_evidence_reference is null or btrim(p_evidence_reference) = '' or length(p_evidence_reference) > 500
    then raise exception 'Resolution evidence required'; end if;
  select a.* into attempt from public.ingestion_attempts a join public.analysis_targets t on t.id = a.analysis_target_id
    where a.id = p_attempt_id and a.owner_id = p_owner_id and t.owner_id = p_owner_id for update of a;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  if attempt.status <> 'failed' or attempt.error_code not in ('SUBMISSION_UNCERTAIN', 'RESULT_WINDOW_EXPIRED')
    then raise exception 'Attempt is not awaiting reconciliation'; end if;
  update public.ingestion_attempts set error_code = case when error_code = 'SUBMISSION_UNCERTAIN'
      then 'SUBMISSION_NOT_ACCEPTED' else 'EXPIRED_JOB_RECONCILED' end,
    resolution_reference = btrim(p_evidence_reference), resolved_at = clock_timestamp()
    where id = attempt.id returning * into attempt;
  return attempt;
end $$;

revoke all on function public.expire_bound_ingestion_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_ingestion_no_job(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.expire_bound_ingestion_attempt(uuid, uuid) to service_role;
grant execute on function public.resolve_ingestion_no_job(uuid, uuid, text) to service_role;
