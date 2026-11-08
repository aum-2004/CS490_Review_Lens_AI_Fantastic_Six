-- Forward migration: enforce result limits even when 010000 was already applied.
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
    -- Match the provider request's 30-review limit and the protected review API's
    -- field sizes. This is independent of HTTP/app validation and commits nothing on breach.
    if jsonb_array_length(p_reviews) > 30 or octet_length(p_reviews::text) > 2097152
      or octet_length(p_identity::text) > 16384 or char_length(p_identity->>'businessName') > 200
      or exists (select 1 from jsonb_array_elements(p_reviews) r where
        char_length(r->>'text') > 10000 or char_length(r->>'reviewer_name') > 200
        or char_length(r->>'source_review_id') > 256 or char_length(r->>'review_url') > 2048
        -- jsonb::text inserts spaces; allow rendering headroom for 16 KiB compact app JSON.
        or char_length(r->>'review_date') > 64 or octet_length((r->'source_metadata')::text) > 32768)
      then raise exception 'INGESTION_RESULT_LIMIT' using errcode = '22023'; end if;
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

revoke all on function public.finish_ingestion_attempt(uuid, uuid, jsonb, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.finish_ingestion_attempt(uuid, uuid, jsonb, integer, jsonb, text) to service_role;
