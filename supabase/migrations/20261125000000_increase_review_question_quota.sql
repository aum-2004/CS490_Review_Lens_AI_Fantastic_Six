-- Increase the existing account-wide paid Q&A budget without replacing its storage.
-- Existing reservations remain charged until each one leaves the rolling 24-hour window.
create or replace function public.reserve_review_question()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  active_count integer;
  checked_at timestamptz;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- Serialize reservations across all targets and server instances for this account.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reviewlens:qa-budget:' || caller::text, 0)
  );
  checked_at := pg_catalog.clock_timestamp();
  delete from public.review_question_reservations
    where owner_id = caller and reserved_at <= checked_at - interval '24 hours';
  select count(*) into active_count from public.review_question_reservations
    where owner_id = caller;
  -- Must match MAX_QUESTIONS_PER_24_HOURS in src/services/qa/question-quota.ts.
  if active_count >= 30 then
    raise exception 'QA_DAILY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.review_question_reservations(owner_id, reserved_at)
    values (caller, checked_at);
  -- No refunds after provider errors: a failed request may still incur provider usage.
  return 29 - active_count;
end $$;

revoke all on function public.reserve_review_question() from public, anon, authenticated, service_role;
grant execute on function public.reserve_review_question() to authenticated;
