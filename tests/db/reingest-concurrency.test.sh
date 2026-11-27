#!/usr/bin/env bash
# S3-009, real PostgreSQL sessions: session A holds an uncommitted refresh reservation while
# session B refreshes the same target. B must wait for A's target lock and then be rejected with
# REINGEST_IN_PROGRESS, leaving exactly one active refresh.
set -euo pipefail
psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "${1:?throwaway database required}")
work_dir=$(mktemp -d)
session_a_pid=""
session_b_pid=""
owner='c3091111-0000-4000-8000-0000000000a1'
target='c3091111-0000-4000-8000-00000000a001'
cleanup() {
  exec 9>&- || true
  for pid in "$session_a_pid" "$session_b_pid"; do
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
  done
  psql "${psql_args[@]}" -c "delete from auth.users where id = '$owner'" >/dev/null
  rm -f "$work_dir/input" "$work_dir/a.log" "$work_dir/b.log"
  rmdir "$work_dir"
}
trap cleanup EXIT

psql "${psql_args[@]}" <<SQL
insert into auth.users(id) values ('$owner');
insert into public.analysis_targets(id, owner_id, name, platform, source_url, google_place_id)
values ('$target', '$owner', 'Concurrent refresh', 'google_maps',
  'https://www.google.com/maps/place/ConcurrentRefresh', 'ChIJConcurrentRefresh');
set role service_role;
do \$\$ declare reserved jsonb; begin
  reserved := public.reserve_ingestion_attempt('$target', '$owner');
  perform public.bind_ingestion_job((reserved->'attempt'->>'id')::uuid, '$owner', 'concurrent-refresh-job');
  perform public.finish_ingestion_attempt((reserved->'attempt'->>'id')::uuid, '$owner',
    '[{"text":"Stored","rating":4,"source_review_id":"c1"}]'::jsonb, 0,
    '{"placeId":"ChIJConcurrentRefresh","businessName":"Concurrent refresh"}'::jsonb, null);
end \$\$;
SQL

mkfifo "$work_dir/input"
exec 9<>"$work_dir/input"
psql "${psql_args[@]}" <"$work_dir/input" >"$work_dir/a.log" 2>&1 &
session_a_pid=$!
printf '%s\n' \
  'begin;' \
  "set idle_in_transaction_session_timeout = '20s';" \
  'set role service_role;' \
  "select public.reserve_reingestion_attempt('$target', '$owner');" \
  '\echo refresh_reserved' >&9
ready=false
for ((poll = 0; poll < 100; poll++)); do
  if grep -q '^refresh_reserved$' "$work_dir/a.log"; then ready=true; break; fi
  if ! kill -0 "$session_a_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$work_dir/a.log"; echo 'First refresh was not reserved'; exit 1; fi

psql "${psql_args[@]}" >"$work_dir/b.log" 2>&1 <<SQL &
set application_name = 'reviewlens_refresh_session_b';
set statement_timeout = '15s';
set role service_role;
do \$\$ begin
  begin
    perform public.reserve_reingestion_attempt('$target', '$owner');
  exception when raise_exception then
    if sqlerrm = 'REINGEST_IN_PROGRESS' then return; end if;
    raise;
  end;
  raise exception 'A concurrent second refresh was reserved';
end \$\$;
SQL
session_b_pid=$!
blocked=false
for ((poll = 0; poll < 100; poll++)); do
  if [[ $(psql "${psql_args[@]}" -Atc "select count(*) from pg_stat_activity where datname = current_database() and application_name = 'reviewlens_refresh_session_b' and wait_event_type = 'Lock'") == 1 ]]; then
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
if [[ "$blocked" != true ]]; then echo 'Second refresh did not wait for the target lock'; exit 1; fi
psql "${psql_args[@]}" <<SQL
do \$\$ begin
  assert (select count(*) from public.ingestion_attempts
    where analysis_target_id = '$target' and status = 'processing') = 1,
    'Concurrent refreshes started more than one run';
  assert (select count(*) from public.ingestion_attempts where analysis_target_id = '$target') = 2,
    'Concurrent refreshes created an unexpected attempt';
end \$\$;
SQL
echo 'ok - concurrent refreshes of one target serialize to a single active run'
