-- Operator evidence for deleted-target audits. This never releases a reservation,
-- rebinds a job, changes its lifecycle state, or restores analysis/review data.
create function public.reconcile_detached_ingestion_attempt(
  p_attempt_id uuid, p_owner_id uuid, p_evidence_reference text
) returns public.ingestion_attempts
language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts;
begin
  if p_evidence_reference is null or btrim(p_evidence_reference) = ''
    or length(p_evidence_reference) > 500 then
    raise exception 'Resolution evidence required';
  end if;
  select a.* into attempt from public.ingestion_attempts a
    where a.id = p_attempt_id and a.owner_id = p_owner_id
      and a.analysis_target_id is null for update of a;
  if not found then raise exception 'Detached attempt unavailable' using errcode = 'P0002'; end if;
  -- Retry is idempotent, but an existing audit decision cannot be overwritten.
  if attempt.resolved_at is not null or attempt.resolution_reference is not null then
    if attempt.resolved_at is not null
      and attempt.resolution_reference = btrim(p_evidence_reference) then return attempt; end if;
    raise exception 'Reconciliation already recorded';
  end if;
  update public.ingestion_attempts
    set resolution_reference = btrim(p_evidence_reference), resolved_at = clock_timestamp()
    where id = attempt.id returning * into attempt;
  return attempt;
end $$;

revoke all on function public.reconcile_detached_ingestion_attempt(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_detached_ingestion_attempt(uuid, uuid, text) to service_role;
