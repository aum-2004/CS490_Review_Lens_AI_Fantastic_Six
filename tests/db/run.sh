#!/usr/bin/env bash
# Runs the database tests against a throwaway PostgreSQL database.
#
# Requires Node 24+, PostgreSQL 15+ client tools (psql, createdb, dropdb) and a server you can connect to
# as a role that may create databases. Connection settings come from the standard PG* variables
# (PGHOST, PGPORT, PGUSER, PGPASSWORD); the defaults work with a local Homebrew PostgreSQL.

set -euo pipefail

cd "$(dirname "$0")/../.."

# Reject Supabase version collisions before creating a database or executing any SQL.
# WSL users can point MIGRATION_CHECK_NODE at their installed Windows node.exe.
"${MIGRATION_CHECK_NODE:-node}" --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/migrations/check-migration-versions.mjs

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

echo "Running two-session ingestion start-limit regression"
bash tests/db/ingestion-start-limit-concurrency.test.sh "$db"

echo "Running concurrent paid Q&A reservation regression"
bash tests/db/review-question-quota-concurrency.test.sh "$db"

echo "Running two-session duplicate review regression"
bash tests/db/review-deduplication-concurrency.test.sh "$db"

echo "Running pre-existing duplicate review migration regression"
bash tests/db/review-deduplication-migration.test.sh "$db"

echo "Running two-session Save As consistency regression"
bash tests/db/save-analysis-as-concurrency.test.sh "$db"

echo "All database tests passed."
