#!/usr/bin/env bash
# S3-003, real PostgreSQL sessions. Session A is a refresh that has merged a new review and recorded
# its successful attempt but not committed. Session B runs Save As on the same analysis. B must wait
# for A's per-target merge lock, then copy A's committed state: the reviews and the ingestion
# summary of the copy must come from the same refresh.
set -euo pipefail
psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "${1:?throwaway database required}")
work_dir=$(mktemp -d)
session_a_pid=""
session_b_pid=""
owner='33300000-0000-4000-8000-0000000000a1'
source_target='33300000-0000-4000-8000-0000000000b1'
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
  ('$source_target', '$owner', 'Race source', 'google_maps', 'https://www.google.com/maps/place/RaceSource');
insert into public.reviews(analysis_target_id, review_text, rating, source_review_id) values
  ('$source_target', 'First review', 4, 'race-1'),
  ('$source_target', 'Second review', 3, 'race-2');
insert into public.ingestion_attempts(analysis_target_id, owner_id, source_url, submitted_query,
  query_kind, provider_request_id, status, started_at, finished_at, saved_count, verified_identity,
  identity_basis)
values ('$source_target', '$owner', 'https://www.google.com/maps/place/RaceSource',
  'https://www.google.com/maps/place/RaceSource', 'source_url', 'race-job-1', 'succeeded',
  now() - interval '2 days', now() - interval '2 days', 2,
  '{"placeId":"ChIJRace","businessName":"Before refresh"}', 'provider_resolved');
SQL

# Session A: an uncommitted refresh, merged through the same function finish_ingestion_attempt uses.
mkfifo "$work_dir/input"
exec 9<>"$work_dir/input"
psql "${psql_args[@]}" <"$work_dir/input" >"$work_dir/a.log" 2>&1 &
session_a_pid=$!
printf '%s\n' \
  'begin;' \
  "set idle_in_transaction_session_timeout = '20s';" \
  "select count(*) from public.merge_target_reviews('$source_target', '[{\"review_text\":\"Refreshed review\",\"rating\":5,\"source_review_id\":\"race-3\"}]');" \
  "insert into public.ingestion_attempts(analysis_target_id, owner_id, source_url, submitted_query, query_kind, provider_request_id, status, started_at, finished_at, saved_count, verified_identity, identity_basis) values ('$source_target', '$owner', 'https://www.google.com/maps/place/RaceSource', 'https://www.google.com/maps/place/RaceSource', 'source_url', 'race-job-2', 'succeeded', now(), now(), 1, '{\"placeId\":\"ChIJRace\",\"businessName\":\"After refresh\"}', 'provider_resolved');" \
  '\echo session_a_refreshed' >&9
ready=false
for ((poll = 0; poll < 100; poll++)); do
  if grep -q '^session_a_refreshed$' "$work_dir/a.log"; then ready=true; break; fi
  if ! kill -0 "$session_a_pid" 2>/dev/null; then break; fi
  sleep 0.05
done
if [[ "$ready" != true ]]; then cat "$work_dir/a.log"; echo "session A did not refresh"; exit 1; fi

# Session B: Save As on the analysis being refreshed.
psql "${psql_args[@]}" -At >"$work_dir/b.log" 2>&1 <<SQL &
set application_name = 'reviewlens_save_as_session_b';
set statement_timeout = '15s';
set role authenticated;
set request.jwt.claims to '{"sub":"$owner"}';
select public.save_analysis_as('$source_target', 'Race copy');
SQL
session_b_pid=$!
blocked=false
for ((poll = 0; poll < 100; poll++)); do
  if [[ $(psql "${psql_args[@]}" -Atc "select count(*) from pg_stat_activity where datname = current_database() and application_name = 'reviewlens_save_as_session_b' and wait_event_type = 'Lock'") == 1 ]]; then
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
if [[ "$blocked" != true ]]; then echo "Save As did not wait for the in-flight refresh"; exit 1; fi

copy_id=$(grep -E '^[0-9a-f-]{36}$' "$work_dir/b.log" | tail -1)
if [[ -z "$copy_id" ]]; then cat "$work_dir/b.log"; echo "Save As returned no copy"; exit 1; fi
if [[ $(psql "${psql_args[@]}" -Atc "
  select (select count(*) from public.reviews where analysis_target_id = '$copy_id') = 3
    and (select saved_count from public.ingestion_attempts where analysis_target_id = '$copy_id') = 3
    and (select verified_identity->>'businessName' from public.ingestion_attempts
         where analysis_target_id = '$copy_id') = 'After refresh'
    and exists (select 1 from public.reviews where analysis_target_id = '$copy_id'
                and source_review_id = 'race-3')") != t ]]; then
  psql "${psql_args[@]}" -c "select review_text from public.reviews where analysis_target_id = '$copy_id'"
  psql "${psql_args[@]}" -c "select saved_count, verified_identity from public.ingestion_attempts where analysis_target_id = '$copy_id'"
  echo "Save As copied reviews and ingestion summary from different states"; exit 1
fi

echo 'ok - Save As waits for an in-flight refresh and copies one consistent state'
