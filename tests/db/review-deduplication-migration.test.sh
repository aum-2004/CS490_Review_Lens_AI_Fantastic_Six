#!/usr/bin/env bash
# S3-011: the duplicate-review migration must clean up rows stored before uniqueness existed.
# Builds a separate throwaway database with every migration BEFORE S3-011, stores duplicates the
# Sprint 1 schema allowed (plus a table that references reviews), applies the S3-011 migration,
# and checks each cleanup pass, the re-pointed references, and adoption afterwards.
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

-- Stand-in for a table that references reviews (for example persisted Q&A citations).
create table public.citation_fixture (
  citation text primary key,
  review_id uuid not null references public.reviews (id) on delete cascade
);

-- Sprint 1 stored all of these as separate rows. created_at is explicit so "oldest" is fixed.
insert into public.reviews (id, analysis_target_id, review_text, rating, source_review_id,
  reviewer_name, review_date, review_url, created_at) values
  -- Pass 1, same source id (one padded with whitespace): survivor 0001 takes the newest values.
  ('c3110000-0000-4000-8000-000000000001', 'c3110000-0000-4000-8000-00000000a1a1', 'Original', 5, 'dup-id', 'Ann', null, null, '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000011', 'c3110000-0000-4000-8000-00000000a1a1', 'Second copy', 4, 'dup-id', 'Ann', null, 'https://maps.google.com/r/11', '2026-11-02T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000012', 'c3110000-0000-4000-8000-00000000a1a1', 'Newest copy', 3, E' dup-id\t', null, null, null, '2026-11-04T00:00:00Z'),
  -- Pass 2, id-less rows with one fingerprint; 0002 and 0021 tie on created_at, so id decides.
  ('c3110000-0000-4000-8000-000000000002', 'c3110000-0000-4000-8000-00000000a1a1', 'No id review', 4, null, 'Ben', null, null, '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000021', 'c3110000-0000-4000-8000-00000000a1a1', '  no ID   review ', 4, null, 'BEN', null, null, '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000022', 'c3110000-0000-4000-8000-00000000a1a1', 'No id review', 4, '   ', 'Ben', null, null, '2026-11-02T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000003', 'c3110000-0000-4000-8000-00000000a1a1', 'No id review', 2, null, 'Ben', null, null, '2026-11-04T00:00:00Z'),
  -- Pass 3, an id that appeared later: the older id-less row survives and takes the id.
  ('c3110000-0000-4000-8000-000000000005', 'c3110000-0000-4000-8000-00000000a1a1', 'Good', 4, null, 'Pat', '2026-10-05T12:00:00Z', null, '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000051', 'c3110000-0000-4000-8000-00000000a1a1', 'Good (edited)', 5, 'late-id', 'Pat', '2026-10-05T12:00:00Z', null, '2026-11-03T00:00:00Z'),
  -- Ambiguous: one id-less row shares its fingerprint with TWO different ids. Left untouched.
  ('c3110000-0000-4000-8000-000000000006', 'c3110000-0000-4000-8000-00000000a1a1', 'Hi', 4, null, 'Quinn', '2026-10-06T12:00:00Z', null, '2026-11-01T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000061', 'c3110000-0000-4000-8000-00000000a1a1', 'Hi', 4, 'q-1', 'Quinn', '2026-10-06T12:00:00Z', null, '2026-11-02T00:00:00Z'),
  ('c3110000-0000-4000-8000-000000000062', 'c3110000-0000-4000-8000-00000000a1a1', 'Hi', 4, 'q-2', 'Quinn', '2026-10-06T12:00:00Z', null, '2026-11-03T00:00:00Z'),
  -- Another target: never merged with target A1.
  ('c3110000-0000-4000-8000-000000000004', 'c3110000-0000-4000-8000-00000000a2a2', 'Original', 5, 'dup-id', 'Ann', null, null, '2026-11-05T00:00:00Z');

insert into public.citation_fixture values
  ('cites-second-copy', 'c3110000-0000-4000-8000-000000000011'),
  ('cites-idless-copy', 'c3110000-0000-4000-8000-000000000021'),
  ('cites-late-id', 'c3110000-0000-4000-8000-000000000051'),
  ('cites-survivor', 'c3110000-0000-4000-8000-000000000001');
SQL

psql "${psql_args[@]}" --file "$s3011_migration"

psql "${psql_args[@]}" <<'SQL'
do $$
declare
  survivor public.reviews;
begin
  assert (select array_agg(right(id::text, 2) order by id) from public.reviews) =
    array['01', '02', '03', '04', '05', '06', '61', '62'],
    'cleanup did not keep exactly the oldest row of each duplicate group';

  select * into strict survivor from public.reviews where id = 'c3110000-0000-4000-8000-000000000001';
  assert survivor.source_review_id = 'dup-id' and survivor.review_text = 'Newest copy'
    and survivor.rating = 3 and survivor.reviewer_name = 'Ann'
    and survivor.review_url = 'https://maps.google.com/r/11'
    and survivor.created_at = '2026-11-01T00:00:00Z' and survivor.updated_at = '2026-11-04T00:00:00Z',
    'pass 1 survivor did not keep its id/created_at and take the newest non-null values';

  select * into strict survivor from public.reviews where id = 'c3110000-0000-4000-8000-000000000005';
  assert survivor.source_review_id = 'late-id' and survivor.review_text = 'Good (edited)'
    and survivor.rating = 5, 'pass 3 survivor did not adopt the late id and its newest values';

  assert (select source_review_id from public.reviews where id = 'c3110000-0000-4000-8000-000000000006') is null,
    'an ambiguous id-less row was merged';
  assert (select updated_at = created_at from public.reviews where id = 'c3110000-0000-4000-8000-000000000003'),
    'a row without duplicates was changed';

  assert (select array_agg(citation || '>' || right(review_id::text, 2) order by citation)
    from public.citation_fixture) = array[
      'cites-idless-copy>02', 'cites-late-id>05', 'cites-second-copy>01', 'cites-survivor>01'
    ], 'references to removed copies were not re-pointed to the survivors';

  -- [4] After cleanup, an incoming id adopts the oldest of the formerly duplicated id-less rows.
  assert (select review_id from public.merge_target_reviews('c3110000-0000-4000-8000-00000000a1a1',
      '[{"review_text":"No id review","rating":4,"reviewer_name":"Ben","source_review_id":"ben-1"}]'))
    = 'c3110000-0000-4000-8000-000000000002', 'the oldest id-less copy was not the one adopted';
  assert (select count(*) from public.reviews) = 8, 'adoption inserted a row';

  assert to_regclass('public.reviews_target_source_review_id_key') is not null
    and to_regclass('public.reviews_target_idless_fingerprint_key') is not null, 'unique indexes missing';
end
$$;
SQL
echo 'ok - the migration merges pre-existing duplicates into the oldest row and re-points references'
