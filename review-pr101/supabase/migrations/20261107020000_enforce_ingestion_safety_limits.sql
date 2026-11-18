-- S1-018/S1-023 security review: browser deletion cannot erase billing holds/audit.
revoke delete on public.analysis_targets from authenticated;
drop policy analysis_targets_delete_own on public.analysis_targets;

create index ingestion_owner_started_idx on public.ingestion_attempts(owner_id, started_at);

-- Conservative budget: at most five reservations per owner in a rolling 24 hours.
-- Rejected/uncertain reservations count too; errors cannot refund a paid-start slot.
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
