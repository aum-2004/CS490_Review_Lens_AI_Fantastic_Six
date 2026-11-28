#!/usr/bin/env bash
# Run only against tests/db/run.sh's disposable database, never a hosted project.
set -euo pipefail
db="${1:?throwaway test database required}"
[[ "$db" =~ ^reviewlens_test_[0-9]+$ ]] || { echo 'Refusing a non-test database'; exit 1; }
args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "$db")
caller='99999999-9999-4999-8999-999999999993'
psql "${args[@]}" --command "insert into auth.users(id) values ('$caller');"
test_output=$(mktemp -d)
trap 'rm -f "$test_output"/*.out; rmdir "$test_output"' EXIT
pids=()
for i in {1..40}; do
  (
    if psql "${args[@]}" --command "begin; set local role authenticated; set local request.jwt.claims = '{\"sub\":\"$caller\"}'; select public.reserve_review_question(); commit;" >"$test_output/$i.out" 2>&1; then
      echo allowed >>"$test_output/$i.out"
    else
      grep -q QA_DAILY_LIMIT "$test_output/$i.out" || { cat "$test_output/$i.out"; exit 1; }
      echo denied >>"$test_output/$i.out"
    fi
  ) &
  pids+=("$!")
done
for pid in "${pids[@]}"; do wait "$pid"; done
allowed=$(grep -l '^allowed$' "$test_output"/*.out | wc -l)
denied=$(grep -l '^denied$' "$test_output"/*.out | wc -l)
[[ "$allowed" -eq 30 ]] || { echo "Expected 30 winners, got $allowed"; exit 1; }
[[ "$denied" -eq 10 ]] || { echo "Expected 10 denied requests, got $denied"; exit 1; }
stored=$(psql "${args[@]}" --tuples-only --no-align --command "select count(*) from public.review_question_reservations where owner_id = '$caller';")
[[ "$stored" -eq 30 ]] || { echo "Expected 30 stored reservations, got $stored"; exit 1; }
echo 'Paid Q&A quota concurrency: 30 allowed, 10 denied.'
