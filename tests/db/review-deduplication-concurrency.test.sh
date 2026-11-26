#!/usr/bin/env bash
# S3-011, real PostgreSQL sessions. Session A has reconciled a batch but not committed while
# session B submits the same reviews. B must wait for A's per-target merge lock and then
# reconcile against A's committed rows instead of inserting duplicates.
#   race 1: the same batch twice (also guarded by the unique indexes);
#   race 2: A stores a review WITHOUT a source id, B the same review WITH one. Only the merge lock
#           prevents this duplicate: the two copies fall under different partial unique indexes.
set -euo pipefail
psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "${1:?throwaway database required}")
work_dir=$(mktemp -d)
session_a_pid=""
session_b_pid=""
owner='d3110000-0000-4000-8000-0000000000a1'
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
insert into public.analysis_targets(id, owner_id, name, platform, source_url) values
  ('d3110000-0000-4000-8000-00000000a1a1', '$owner', 'Race one', 'google_maps', 'https://www.google.com/maps/place/Race1'),
  ('d3110000-0000-4000-8000-00000000a2a2', '$owner', 'Race two', 'google_maps', 'https://www.google.com/maps/place/Race2');
SQL

# race <name> <target> <batch for A> <batch for B> <SQL condition that must hold afterwards>
race() {
  local name=$1 target=$2 batch_a=$3 batch_b=$4 final_check=$5
  rm -f "$work_dir/input"
  mkfifo "$work_dir/input"
  exec 9<>"$work_dir/input"
  psql "${psql_args[@]}" <"$work_dir/input" >"$work_dir/a.log" 2>&1 &
  session_a_pid=$!
  printf '%s\n' \
    'begin;' \
    "set idle_in_transaction_session_timeout = '20s';" \
    'set role authenticated;' \
    "set request.jwt.claims to '{\"sub\":\"$owner\"}';" \
    "select count(*) from public.insert_reviews('$target', '$batch_a');" \
    '\echo session_a_merged' >&9
  local ready=false
  for ((poll = 0; poll < 100; poll++)); do
    if grep -q '^session_a_merged$' "$work_dir/a.log"; then ready=true; break; fi
    if ! kill -0 "$session_a_pid" 2>/dev/null; then break; fi
    sleep 0.05
  done
  if [[ "$ready" != true ]]; then cat "$work_dir/a.log"; echo "$name: session A did not merge"; exit 1; fi

  psql "${psql_args[@]}" >"$work_dir/b.log" 2>&1 <<SQL &
set application_name = 'reviewlens_dedupe_session_b';
set statement_timeout = '15s';
set role authenticated;
set request.jwt.claims to '{"sub":"$owner"}';
select count(*) from public.insert_reviews('$target', '$batch_b');
SQL
  session_b_pid=$!
  local blocked=false
  for ((poll = 0; poll < 100; poll++)); do
    if [[ $(psql "${psql_args[@]}" -Atc "select count(*) from pg_stat_activity where datname = current_database() and application_name = 'reviewlens_dedupe_session_b' and wait_event_type = 'Lock'") == 1 ]]; then
      blocked=true; break
    fi
    if ! kill -0 "$session_b_pid" 2>/dev/null; then break; fi
    sleep 0.05
  done
  # Release A only after observing B's lock wait (or its erroneous completion).
  printf '%s\n' 'commit;' '\q' >&9
  exec 9>&-
  wait "$session_a_pid"
  session_a_pid=""
  if ! wait "$session_b_pid"; then cat "$work_dir/b.log"; exit 1; fi
  session_b_pid=""
  if [[ "$blocked" != true ]]; then echo "$name: session B did not wait for session A"; exit 1; fi
  if [[ $(psql "${psql_args[@]}" -Atc "select ($final_check)") != t ]]; then
    psql "${psql_args[@]}" -c "select source_review_id, review_text from public.reviews where analysis_target_id = '$target'"
    echo "$name: concurrent submissions stored duplicates"; exit 1
  fi
}

race 'same batch' 'd3110000-0000-4000-8000-00000000a1a1' \
  '[{"review_text":"Concurrent review","rating":4,"source_review_id":"race-1"},{"review_text":"Concurrent fingerprint","rating":3}]' \
  '[{"review_text":"Concurrent review","rating":4,"source_review_id":"race-1"},{"review_text":"Concurrent fingerprint","rating":3}]' \
  "select count(*) = 2 from public.reviews where analysis_target_id = 'd3110000-0000-4000-8000-00000000a1a1'"

race 'id appears' 'd3110000-0000-4000-8000-00000000a2a2' \
  '[{"review_text":"Racing adoption","rating":5,"reviewer_name":"Rae","review_date":"2026-10-07T07:00:00Z"}]' \
  '[{"review_text":"Racing adoption","rating":5,"source_review_id":"race-2","reviewer_name":"Rae","review_date":"2026-10-07T07:00:00Z"}]' \
  "select array_agg(source_review_id) = array['race-2'] from public.reviews where analysis_target_id = 'd3110000-0000-4000-8000-00000000a2a2'"

echo 'ok - concurrent refreshes of one target never store a review twice, including id adoption'
