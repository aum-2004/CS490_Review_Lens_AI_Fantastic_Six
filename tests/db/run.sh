#!/usr/bin/env bash
# Runs the database tests against a throwaway PostgreSQL database.
#
# Requires PostgreSQL 15+ client tools (psql, createdb, dropdb) and a server you can connect to
# as a role that may create databases. Connection settings come from the standard PG* variables
# (PGHOST, PGPORT, PGUSER, PGPASSWORD); the defaults work with a local Homebrew PostgreSQL.

set -euo pipefail

cd "$(dirname "$0")/../.."

db="reviewlens_test_$$"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "$db")

createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT

psql "${psql_args[@]}" --file tests/db/supabase-auth-shim.sql

for migration in supabase/migrations/*.sql; do
  echo "Applying ${migration}"
  psql "${psql_args[@]}" --file "$migration"
done

for test_file in tests/db/*.test.sql; do
  echo "Running ${test_file}"
  psql "${psql_args[@]}" --file "$test_file"
done

echo "All database tests passed."
