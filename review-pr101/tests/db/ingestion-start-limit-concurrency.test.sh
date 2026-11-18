#!/usr/bin/env bash
# Real PostgreSQL sessions: the fifth slot is uncommitted while a distinct target
# attempts the sixth. Without the owner lock both see only four committed slots.
set -euo pipefail
psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "${1:?throwaway database required}")
work_dir=$(mktemp -d)
session_a_pid=""
session_b_pid=""
cleanup() {
  exec 9>&- || true
  for pid in "$session_a_pid" "$session_b_pid"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
  psql "${psql_args[@]}" -c "delete from auth.users where id = '77777777-7777-4777-8777-777777777777'" >/dev/null
  rm -f "$work_dir/input" "$work_dir/a.log" "$work_dir/b.log"
  rmdir "$work_dir"
}
trap cleanup EXIT

psql "${psql_args[@]}" <<'SQL'
insert into auth.users(id) values ('77777777-7777-4777-8777-777777777777');
insert into public.analysis_targets(id, owner_id, name, platform, source_url)
select ('77777777-7777-4777-8777-' || lpad(n::text, 12, '0'))::uuid,
  '77777777-7777-4777-8777-777777777777', 'Concurrent budget ' || n,
  'google_maps', 'https://www.google.com/maps/place/Synthetic' || n
from generate_series(1, 6) n;
set role service_role;
do $$ begin
  for n in 1..4 loop
    perform public.reserve_ingestion_attempt(
      ('77777777-7777-4777-8777-' || lpad(n::text, 12, '0'))::uuid,
      '77777777-7777-4777-8777-777777777777');
  end loop;
end $$;
SQL

mkfifo "$work_dir/input"
exec 9<>"$work_dir/input"
psql "${psql_args[@]}" <"$work_dir/input" >"$work_dir/a.log" 2>&1 &
session_a_pid=$!
printf '%s\n' \
  'begin;' \
  "set idle_in_transaction_session_timeout = '20s';" \
  'set role service_role;' \
  "select public.reserve_ingestion_attempt('77777777-7777-4777-8777-000000000005', '77777777-7777-4777-8777-777777777777');" \
  '\echo fifth_slot_reserved' >&9
ready=false
for ((poll = 0; poll < 100; poll++)); do
  if grep -q '^fifth_slot_reserved$' "$work_dir/a.log"; then ready=true; break; fi
  if ! kill -0 "$session_a_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$work_dir/a.log"; echo 'Fifth reservation was not ready'; exit 1; fi

psql "${psql_args[@]}" >"$work_dir/b.log" 2>&1 <<'SQL' &
set application_name = 'reviewlens_budget_session_b';
set statement_timeout = '15s';
set role service_role;
do $$ begin
  begin
    perform public.reserve_ingestion_attempt('77777777-7777-4777-8777-000000000006',
      '77777777-7777-4777-8777-777777777777');
  exception when raise_exception then
    if sqlerrm = 'INGESTION_START_LIMIT' then return; end if;
    raise;
  end;
  raise exception 'Concurrent sixth reservation escaped the owner budget';
end $$;
SQL
session_b_pid=$!
blocked=false
for ((poll = 0; poll < 100; poll++)); do
  if [[ $(psql "${psql_args[@]}" -Atc "select count(*) from pg_stat_activity where datname = current_database() and application_name = 'reviewlens_budget_session_b' and wait_event_type = 'Lock' and wait_event = 'advisory'") == 1 ]]; then
    blocked=true; break
  fi
  if ! kill -0 "$session_b_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
# Release A only after observing B's actual lock wait (or its erroneous completion).
printf '%s\n' 'commit;' '\q' >&9
wait "$session_a_pid"
session_a_pid=""
if ! wait "$session_b_pid"; then cat "$work_dir/b.log"; exit 1; fi
session_b_pid=""
if [[ "$blocked" != true ]]; then echo 'Sixth reservation did not wait for the owner lock'; exit 1; fi
psql "${psql_args[@]}" <<'SQL'
do $$ begin
  assert (select count(*) from public.ingestion_attempts
    where owner_id = '77777777-7777-4777-8777-777777777777') = 5,
    'Concurrent starts exceeded the five-slot budget';
end $$;
SQL
echo 'ok - concurrent distinct-target starts serialize at the owner budget'
