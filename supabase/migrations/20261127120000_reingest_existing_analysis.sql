-- S3-009: re-ingest (refresh) an existing owned analysis. Design: docs/s3-009-reingest-existing-analysis.md.
--
-- S3-BR-014: an owner may start a new ingestion for an analysis that already has a successful
--   dataset, without creating a second AnalysisTarget. reserve_ingestion_attempt is NOT changed:
--   for a create request it still returns the active or previously successful attempt
--   (created=false), so a retried or duplicated start can never buy a second paid job. A refresh is
--   an explicit, separate reservation that always creates a NEW ingestion_attempts row.
-- S3-BR-015: the current dataset is the deduplicated union of every review already persisted for
--   the target and every review fetched by a successful attempt. finish_ingestion_attempt (S3-011)
--   merges through merge_target_reviews and never deletes; this migration adds no removal or
--   deactivation path because the provider adapter exposes no signal that a response is the
--   complete source dataset (requests are capped at reviewsLimit=30, sorted by relevance).
--
-- Unchanged rules: one active run per target (target row lock + ingestion_one_processing_per_target),
-- the owner's five reservations per rolling 24 hours (failed attempts count, nothing is refunded),
-- billing holds (SUBMISSION_UNCERTAIN / RESULT_WINDOW_EXPIRED) block every new reservation, and
-- lifecycle mutations stay SECURITY DEFINER RPCs granted only to service_role. The server passes
-- p_owner_id from the verified session (requireApiUser), never from request input, exactly as for
-- every other ingestion lifecycle RPC.

-- Distinguishes a refresh attempt from the attempt(s) that produced the existing dataset. Every row
-- that exists before this migration was an initial collection (or a retry of one).
alter table public.ingestion_attempts
  add column if not exists attempt_kind text not null default 'initial';
alter table public.ingestion_attempts drop constraint if exists ingestion_attempt_kind;
alter table public.ingestion_attempts add constraint ingestion_attempt_kind
  check (attempt_kind in ('initial', 'reingest'));
comment on column public.ingestion_attempts.attempt_kind is
  'S3-009: initial = first collection (or its retry); reingest = refresh of an existing dataset.';

-- Owners may read the kind of their own attempts (column grants: see 20261107010000).
grant select (attempt_kind) on public.ingestion_attempts to authenticated;

-- "Last successful attempt" lookup: latest succeeded row per target in started_at, id order.
create index if not exists ingestion_target_succeeded_idx
  on public.ingestion_attempts (analysis_target_id, started_at desc, id desc)
  where status = 'succeeded';

create or replace function public.reserve_reingestion_attempt(p_target_id uuid, p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.analysis_targets; attempt public.ingestion_attempts;
begin
  -- Ownership first, under the same target lock that serializes reserve_ingestion_attempt, so a
  -- create and a refresh (or two refreshes) for one target can never both pass the checks below.
  select * into target from public.analysis_targets
    where id = p_target_id and owner_id = p_owner_id for update;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;

  -- One active run per target. Unlike a create request, a refresh is never answered with the
  -- running attempt: it is rejected so the caller knows nothing new was started.
  select * into attempt from public.ingestion_attempts
    where analysis_target_id = p_target_id
      and (status = 'processing' or error_code in ('SUBMISSION_UNCERTAIN', 'RESULT_WINDOW_EXPIRED'))
    order by started_at desc, id desc limit 1;
  if found then
    if attempt.status = 'processing' then
      raise exception 'REINGEST_IN_PROGRESS' using errcode = 'P0001';
    end if;
    raise exception 'REINGEST_BLOCKED' using errcode = 'P0001';
  end if;

  -- A refresh needs an existing dataset; the first collection uses reserve_ingestion_attempt.
  -- Detached audit rows (analysis_target_id null after an S3-005 delete) never match.
  if not exists (
    select 1 from public.ingestion_attempts
    where analysis_target_id = p_target_id and owner_id = p_owner_id and status = 'succeeded'
  ) then
    raise exception 'REINGEST_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- The same paid-start budget as reserve_ingestion_attempt (20261107020000): same lock key, same
  -- window, same limit. A refresh is a paid start like any other.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reviewlens:paid-start:' || p_owner_id::text, 0));
  if (select count(*) from public.ingestion_attempts where owner_id = p_owner_id
      and started_at > pg_catalog.clock_timestamp() - interval '24 hours') >= 5 then
    raise exception 'INGESTION_START_LIMIT' using errcode = 'P0001';
  end if;

  -- Source is copied from storage, never from the caller. ingestion_one_processing_per_target
  -- remains the atomic backstop for the active-run rule.
  insert into public.ingestion_attempts(analysis_target_id, owner_id, source_url, submitted_query,
    query_kind, expected_place_id, attempt_kind)
  values (target.id, target.owner_id, target.source_url,
    coalesce(pg_catalog.btrim(target.google_place_id), target.source_url),
    case when target.google_place_id is null then 'source_url' else 'place_id' end,
    pg_catalog.btrim(target.google_place_id), 'reingest')
  returning * into attempt;
  return pg_catalog.jsonb_build_object('attempt', pg_catalog.to_jsonb(attempt), 'created', true);
end $$;

comment on function public.reserve_reingestion_attempt(uuid, uuid) is
  'S3-009 refresh reservation: a new attempt for an owned target with a successful dataset. '
  'Rejects an active run or billing hold, and counts toward the owner''s paid-start budget.';

revoke all on function public.reserve_reingestion_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_reingestion_attempt(uuid, uuid) to service_role;
