#!/usr/bin/env bash
# S3-011, real PostgreSQL sessions: session A has inserted a review but not committed while
# session B submits the same review. B must wait on A's unique-index entry and then skip the
# review (ON CONFLICT DO NOTHING). Without the unique index both sessions would store a row.
set -euo pipefail
psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "${1:?throwaway database required}")
work_dir=$(mktemp -d)
session_a_pid=""
session_b_pid=""
owner='d3110000-0000-4000-8000-0000000000a1'
target='d3110000-0000-4000-8000-00000000a1a1'
batch='[{"review_text":"Concurrent review","rating":4,"source_review_id":"race-1"},{"review_text":"Concurrent fingerprint","rating":3}]'
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
insert into public.analysis_targets(id, owner_id, name, platform, source_url)
values ('$target', '$owner', 'Concurrent dedupe', 'google_maps', 'https://www.google.com/maps/place/Race');
SQL

mkfifo "$work_dir/input"
exec 9<>"$work_dir/input"
psql "${psql_args[@]}" <"$work_dir/input" >"$work_dir/a.log" 2>&1 &
session_a_pid=$!
printf '%s\n' \
  'begin;' \
  "set idle_in_transaction_session_timeout = '20s';" \
  'set role authenticated;' \
  "set request.jwt.claims to '{\"sub\":\"$owner\"}';" \
  "select count(*) from public.insert_reviews('$target', '$batch');" \
  '\echo session_a_inserted' >&9
ready=false
for ((poll = 0; poll < 100; poll++)); do
  if grep -q '^session_a_inserted$' "$work_dir/a.log"; then ready=true; break; fi
  if ! kill -0 "$session_a_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$work_dir/a.log"; echo 'Session A did not insert'; exit 1; fi

psql "${psql_args[@]}" >"$work_dir/b.log" 2>&1 <<SQL &
set application_name = 'reviewlens_dedupe_session_b';
set statement_timeout = '15s';
set role authenticated;
set request.jwt.claims to '{"sub":"$owner"}';
do \$\$ begin
  assert (select count(*) from public.insert_reviews('$target', '$batch')) = 0,
    'Concurrent session stored a review that another session was inserting';
end \$\$;
SQL
session_b_pid=$!
blocked=false
for ((poll = 0; poll < 100; poll++)); do
  if [[ $(psql "${psql_args[@]}" -Atc "select count(*) from pg_stat_activity where datname = current_database() and application_name = 'reviewlens_dedupe_session_b' and wait_event_type = 'Lock'") == 1 ]]; then
    blocked=true; break
  fi
  if ! kill -0 "$session_b_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
# Release A only after observing B's lock wait on A's uncommitted index entry.
printf '%s\n' 'commit;' '\q' >&9
wait "$session_a_pid"
session_a_pid=""
if ! wait "$session_b_pid"; then cat "$work_dir/b.log"; exit 1; fi
session_b_pid=""
if [[ "$blocked" != true ]]; then echo 'Session B did not wait for the unique index'; exit 1; fi
psql "${psql_args[@]}" <<SQL
do \$\$ begin
  assert (select count(*) from public.reviews where analysis_target_id = '$target') = 2,
    'Concurrent submissions stored duplicate reviews';
end \$\$;
SQL
echo 'ok - concurrent submissions of the same reviews store each review once'
