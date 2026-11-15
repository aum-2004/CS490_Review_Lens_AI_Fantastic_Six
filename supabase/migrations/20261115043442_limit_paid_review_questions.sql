-- Paid Q&A reservations are account-wide and survive workers, restarts and target changes.
-- Only timestamps are retained: no questions, reviews or model responses.
create table public.review_question_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  reserved_at timestamptz not null default clock_timestamp()
);
create index review_question_owner_time_idx
  on public.review_question_reservations(owner_id, reserved_at);
alter table public.review_question_reservations enable row level security;
revoke all on table public.review_question_reservations from public, anon, authenticated, service_role;

-- No caller-supplied identity. The narrow definer can write only the session user's budget.
create function public.reserve_review_question()
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
  if active_count >= 5 then
    raise exception 'QA_DAILY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.review_question_reservations(owner_id, reserved_at)
    values (caller, checked_at);
  -- No refunds after provider errors: a failed request may still incur provider usage.
  return 4 - active_count;
end $$;

revoke all on function public.reserve_review_question() from public, anon, authenticated, service_role;
grant execute on function public.reserve_review_question() to authenticated;
