-- S3-003: Save As a separate analysis. Design: docs/s3-003-save-as.md.
--
-- S3-BR-005: Save As creates a new AnalysisTarget (new id) owned by the caller. The source is never
--   renamed or otherwise written.
-- S3-BR-006: the copy owns independent copies of the source's reviews (new ids), so renaming,
--   deleting or refreshing the copy cannot change the source, and the reverse.
--
-- The copy starts with the source's current saved state:
--   * name chosen by the user; platform, source URL and place reference from the source;
--   * every persisted review, with its source fields, dedupe identity and collection times;
--   * the source's ingestion summary, as one ingestion_attempts row copied from the source's latest
--     successful attempt. That row did not call the review provider: it is marked
--     is_save_as_copy, has a "save-as:" placeholder instead of a provider job id, and does not
--     count toward the owner's paid-start budget. Because it is a normal succeeded row, the copy
--     shows the same ingestion state as the source everywhere, and refresh (S3-009) treats the
--     copy as an analysis with an existing dataset.
--   * Q&A history is NOT copied: copied citations would point at the source's review ids
--     (decision recorded in docs/s3-006-persist-qa-history.md). The copy starts with no history.

alter table public.ingestion_attempts
  add column is_save_as_copy boolean not null default false;
comment on column public.ingestion_attempts.is_save_as_copy is
  'S3-003: true only for the succeeded row a Save As copy starts with. No provider job was run, '
  'and the row does not count toward the paid-start budget.';

-- A copy row is always a finished success with a placeholder job id, and no real job uses that
-- prefix. Existing rows all satisfy this (no row is a copy yet).
alter table public.ingestion_attempts add constraint ingestion_attempt_save_as_copy check (
  is_save_as_copy = coalesce(provider_request_id like 'save-as:%', false)
  and (not is_save_as_copy or status = 'succeeded')
);

-- Same as 20261107020000, except that Save As copy rows are not paid starts and are not counted.
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
  -- Serialize distinct-target reservations for this owner, not just starts on one target.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('reviewlens:paid-start:' || p_owner_id::text, 0));
  if (select count(*) from public.ingestion_attempts where owner_id = p_owner_id
      and not is_save_as_copy
      and started_at > clock_timestamp() - interval '24 hours') >= 5 then
    raise exception 'INGESTION_START_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.ingestion_attempts(analysis_target_id, owner_id, source_url, submitted_query, query_kind, expected_place_id)
  values (target.id, target.owner_id, target.source_url, coalesce(btrim(target.google_place_id), target.source_url),
    case when target.google_place_id is null then 'source_url' else 'place_id' end, btrim(target.google_place_id))
  returning * into attempt;
  return jsonb_build_object('attempt', to_jsonb(attempt), 'created', true);
end $$;

revoke all on function public.reserve_ingestion_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ingestion_attempt(uuid, uuid) to service_role;

-- Save As only: most analyses one owner may hold for Save As to add another (the target list shows
-- up to 200). Creating a new analysis from a URL is not capped here.
-- Each copy duplicates a review dataset, so the cap bounds the storage one account can create.
create function public.save_analysis_as(p_source_target_id uuid, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  source public.analysis_targets;
  source_attempt public.ingestion_attempts;
  copy_id uuid;
  copied_reviews integer;
begin
  -- Missing user, missing analysis and another user's analysis are indistinguishable.
  select * into source from public.analysis_targets
    where id = p_source_target_id and owner_id = caller
    for share;
  if caller is null or not found then
    raise exception 'Target unavailable' using errcode = 'P0002';
  end if;

  -- The same name rules as rename (analysis_targets_update_name_own, 20261127212801); the table
  -- constraints still enforce presence and the 120-character limit.
  if p_name is null
    or p_name <> pg_catalog.btrim(p_name)
    or p_name <> pg_catalog.btrim(p_name, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
    or p_name ~ U&'[\0001-\001F\007F-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B\200E-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]'
    or p_name !~ U&'[^\0009-\000D\0020\00A0\00AD\034F\0600-\0605\061C\06DD\070F\0890-\0891\08E2\115F-\1160\1680\17B4-\17B5\180B-\180F\2000-\200F\2028-\202F\205F-\206F\3000\3164\FE00-\FE0F\FEFF\FFA0\FFF0-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0000-\+0E0FFF]'
  then
    raise exception 'Invalid analysis name' using errcode = '23514';
  end if;

  -- Consistent snapshot of the source: a refresh merges reviews and records its successful attempt
  -- in one transaction under this per-target lock (merge_target_reviews, 20261126120000). Holding
  -- it here makes Save As wait for an in-flight refresh, so the copied reviews and the copied
  -- ingestion summary always come from the same committed state.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reviewlens:review-merge:' || source.id::text, 0));

  -- Serialize this owner's Save As requests so two at once cannot both pass the Save As cap.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reviewlens:save-as:' || caller::text, 0));
  if (select count(*) from public.analysis_targets where owner_id = caller) >= 200 then
    raise exception 'ANALYSIS_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.analysis_targets (owner_id, name, platform, source_url, google_place_id)
  values (caller, p_name, source.platform, source.source_url, source.google_place_id)
  returning id into copy_id;

  -- New ids; review_fingerprint is generated. Collection times are kept so the copy shows the same
  -- dataset history as the source.
  insert into public.reviews (analysis_target_id, review_text, rating, source_review_id,
    reviewer_name, review_date, review_url, source_metadata, created_at, updated_at)
  select copy_id, review.review_text, review.rating, review.source_review_id,
    review.reviewer_name, review.review_date, review.review_url, review.source_metadata,
    review.created_at, review.updated_at
  from public.reviews review
  where review.analysis_target_id = source.id
  order by review.created_at, review.id;
  get diagnostics copied_reviews = row_count;

  -- The latest success, not the latest attempt: after a failed refresh (S3-012) the source still
  -- shows its last known-good dataset, which is what was just copied.
  select * into source_attempt from public.ingestion_attempts attempt
    where attempt.analysis_target_id = source.id and attempt.status = 'succeeded'
    order by attempt.started_at desc, attempt.id desc
    limit 1;
  if found then
    insert into public.ingestion_attempts (analysis_target_id, owner_id, source_url,
      submitted_query, query_kind, expected_place_id, provider_request_id, status, started_at,
      finished_at, saved_count, skipped_count, verified_identity, identity_basis, is_save_as_copy)
    values (copy_id, caller, source_attempt.source_url, source_attempt.submitted_query,
      source_attempt.query_kind, source_attempt.expected_place_id,
      'save-as:' || pg_catalog.gen_random_uuid()::text, 'succeeded', source_attempt.started_at,
      source_attempt.finished_at, copied_reviews, 0, source_attempt.verified_identity,
      source_attempt.identity_basis, true);
  end if;

  return copy_id;
end $$;

comment on function public.save_analysis_as(uuid, text) is
  'S3-003: copy an owned analysis and its reviews under a new name. Returns the new analysis id.';

revoke all on function public.save_analysis_as(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.save_analysis_as(uuid, text) to authenticated;
