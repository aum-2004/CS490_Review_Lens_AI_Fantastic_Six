#!/usr/bin/env bash
# S3-011: the duplicate-review migration must clean up rows stored before uniqueness existed.
# Builds a separate throwaway database with every migration BEFORE S3-011, stores duplicates the
# Sprint 1 schema allowed, applies the S3-011 migration, and checks that the oldest row of each
# identity survives, distinct and cross-target reviews are untouched, and the index exists.
set -euo pipefail

cd "$(dirname "$0")/../.."

s3011_migration=supabase/migrations/20261126120000_prevent_duplicate_reviews.sql
db="${1:?throwaway database name required}_s3011_cleanup"
psql_args=(--no-psqlrc --quiet --set ON_ERROR_STOP=1 --dbname "$db")

createdb "$db"
trap 'dropdb --if-exists "$db"' EXIT

psql "${psql_args[@]}" --file tests/db/supabase-auth-shim.sql
for migration in supabase/migrations/*.sql; do
  if [[ ! "$migration" < "$s3011_migration" ]]; then break; fi
  psql "${psql_args[@]}" --file "$migration"
done

psql "${psql_args[@]}" <<'SQL'
insert into auth.users (id) values ('c3110000-0000-4000-8000-0000000000a1');
insert into public.analysis_targets (id, owner_id, name, platform, source_url) values
  ('c3110000-0000-4000-8000-00000000a1a1', 'c3110000-0000-4000-8000-0000000000a1',
   'Cleanup A1', 'google_maps', 'https://www.google.com/maps/place/CleanupA1'),
  ('c3110000-0000-4000-8000-00000000a2a2', 'c3110000-0000-4000-8000-0000000000a1',
   'Cleanup A2', 'google_maps', 'https://www.google.com/maps/place/CleanupA2');

-- Sprint 1 stored these as separate rows. created_at is explicit so "oldest" is unambiguous;
-- the 0002 rows share a created_at with a later copy to exercise the id tie-break.
insert into public.reviews (id, analysis_target_id, review_text, rating, source_review_id, reviewer_name, created_at) values
  ('c3110000-0000-4000-8000-000000000001', 'c3110000-0000-4000-8000-00000000a1a1', 'Original', 5, 'dup-id', 'Ann', '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000011', 'c3110000-0000-4000-8000-00000000a1a1', 'Re-ingested copy', 4, 'dup-id', 'Ann', '2026-11-02T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000012', 'c3110000-0000-4000-8000-00000000a1a1', 'Third copy', 3, 'dup-id', 'Ann', '2026-11-03T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000002', 'c3110000-0000-4000-8000-00000000a1a1', 'No id review', 4, null, 'Ben', '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000021', 'c3110000-0000-4000-8000-00000000a1a1', '  no ID   review ', 4, null, 'BEN', '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000003', 'c3110000-0000-4000-8000-00000000a1a1', 'No id review', 2, null, 'Ben', '2026-11-04T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000004', 'c3110000-0000-4000-8000-00000000a2a2', 'Original', 5, 'dup-id', 'Ann', '2026-11-05T00:00:00Z');
SQL

psql "${psql_args[@]}" --file "$s3011_migration"

psql "${psql_args[@]}" <<'SQL'
do $$
begin
  assert (select array_agg(id::text order by id) from public.reviews) = array[
    'c3110000-0000-4000-8000-000000000001',
    'c3110000-0000-4000-8000-000000000002',
    'c3110000-0000-4000-8000-000000000003',
    'c3110000-0000-4000-8000-000000000004'
  ], 'cleanup did not keep exactly the oldest row of each identity per target';
  assert (select review_text from public.reviews where id = 'c3110000-0000-4000-8000-000000000001') = 'Original',
    'the surviving row was modified';
  assert to_regclass('public.reviews_target_identity_key_idx') is not null, 'unique index missing';
end
$$;
SQL
echo 'ok - the migration keeps the oldest row of each pre-existing duplicate and adds the index'
