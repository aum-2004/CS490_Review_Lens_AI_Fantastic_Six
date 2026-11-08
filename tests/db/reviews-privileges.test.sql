-- S1-022 database tests for table privileges on public.reviews. TRUNCATE is not subject to Row
-- Level Security, so a role holding it could delete every user's reviews at once. Supabase (and
-- tests/db/supabase-auth-shim.sql) grant new tables ALL to anon and authenticated by default,
-- so the migration must revoke those inherited privileges. Run with `npm run test:db`.
-- Uses its own ids so it is independent of other test files.
--
-- User C: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa (targets C and C2)
-- User D: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb (target D)
-- Target C: cccccccc-cccc-4ccc-8ccc-cccccccccccc
-- Target C2: cccccccc-cccc-4ccc-8ccc-ccccccccccc2
-- Target D: dddddddd-dddd-4ddd-8ddd-dddddddddddd

\set ON_ERROR_STOP on
\set QUIET on

-- Setup as the database owner (RLS does not apply): two users, one target each, seeded reviews.
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.analysis_targets (id, owner_id, name, platform, source_url) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Target C', 'google_maps', 'https://maps.google.com/?cid=10'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'Target C2', 'google_maps', 'https://maps.google.com/?cid=12'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'Target D', 'google_maps', 'https://maps.google.com/?cid=11');

insert into public.reviews (analysis_target_id, review_text, rating) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'C one', 4),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'C two', 5),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'D one', 3),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'D two', 2),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'D three', 1);

-- ---------------------------------------------------------------------------------------------
-- Privileges held by authenticated and anon
-- ---------------------------------------------------------------------------------------------
do $$
begin
  assert not has_table_privilege('authenticated', 'public.reviews', 'TRUNCATE'),
    'authenticated has TRUNCATE on reviews';
  assert not has_table_privilege('authenticated', 'public.reviews', 'REFERENCES'),
    'authenticated has REFERENCES on reviews';
  assert not has_table_privilege('authenticated', 'public.reviews', 'TRIGGER'),
    'authenticated has TRIGGER on reviews';
end
$$;
\echo 'ok - authenticated has no TRUNCATE, REFERENCES, or TRIGGER privilege on reviews'

do $$
declare
  writable text;
begin
  assert has_table_privilege('authenticated', 'public.reviews', 'SELECT'),
    'authenticated lost SELECT on reviews';
  assert not has_table_privilege('authenticated', 'public.reviews', 'UPDATE'),
    'authenticated has UPDATE on reviews';
  assert not has_table_privilege('authenticated', 'public.reviews', 'DELETE'),
    'authenticated has DELETE on reviews';
  assert not has_table_privilege('authenticated', 'public.reviews', 'INSERT'),
    'authenticated has table-wide INSERT on reviews';

  foreach writable in array array[
    'analysis_target_id', 'review_text', 'rating', 'source_review_id', 'reviewer_name',
    'review_date', 'review_url', 'source_metadata'
  ] loop
    assert has_column_privilege('authenticated', 'public.reviews', writable, 'INSERT'),
      format('authenticated cannot insert reviews.%s', writable);
  end loop;

  assert not has_column_privilege('authenticated', 'public.reviews', 'id', 'INSERT'),
    'authenticated can insert reviews.id';
  assert not has_column_privilege('authenticated', 'public.reviews', 'created_at', 'INSERT'),
    'authenticated can insert reviews.created_at';
end
$$;
\echo 'ok - authenticated has SELECT and column-limited INSERT only (no UPDATE, DELETE, id or created_at)'

do $$
begin
  assert not has_table_privilege(
    'anon', 'public.reviews', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
  ), 'anon has a privilege on reviews';
end
$$;
\echo 'ok - anon has no privilege on reviews'

-- ---------------------------------------------------------------------------------------------
-- A TRUNCATE attempt as an authenticated user is denied and removes nothing
-- ---------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
begin
  truncate public.reviews;
  raise exception 'User C truncated public.reviews';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - TRUNCATE as an authenticated user fails with insufficient_privilege'

reset role;

do $$
begin
  assert (
    select count(*) from public.reviews
    where analysis_target_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 2, 'User C''s seeded reviews changed after the TRUNCATE attempt';
  assert (
    select count(*) from public.reviews
    where analysis_target_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) = 3, 'User D''s seeded reviews changed after the TRUNCATE attempt';
end
$$;
\echo 'ok - both users'' seeded reviews are still present after the TRUNCATE attempt'

-- ---------------------------------------------------------------------------------------------
-- Even the owning user cannot rewrite, delete, or backdate reviews (as User C on target C)
-- ---------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
begin
  update public.reviews set rating = 5 where review_text = 'C one';
  raise exception 'User C changed the rating of their own review';
exception
  when insufficient_privilege then null;
end
$$;

do $$
begin
  update public.reviews set created_at = '2020-01-01T00:00:00Z' where review_text = 'C one';
  raise exception 'User C changed created_at of their own review';
exception
  when insufficient_privilege then null;
end
$$;

do $$
begin
  update public.reviews
  set analysis_target_id = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
  where review_text = 'C one';
  raise exception 'User C moved their own review to their other target';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - the owner cannot update their own reviews (rating, created_at, or target)'

do $$
begin
  delete from public.reviews where review_text = 'C one';
  raise exception 'User C deleted their own review';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - the owner cannot delete their own reviews'

do $$
begin
  insert into public.reviews (id, analysis_target_id, review_text, rating)
  values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          'Chosen id', 4);
  raise exception 'User C inserted a review with a chosen id';
exception
  when insufficient_privilege then null;
end
$$;

do $$
begin
  insert into public.reviews (analysis_target_id, review_text, rating, created_at)
  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Backdated', 4, '2020-01-01T00:00:00Z');
  raise exception 'User C inserted a review with a chosen created_at';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - the owner cannot choose id or created_at when inserting'

do $$
declare
  inserted public.reviews;
begin
  insert into public.reviews (
    analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date,
    review_url, source_metadata
  ) values (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'C three', 3, 'src-c3', 'Cam',
    '2026-10-01T12:00:00Z', 'https://maps.google.com/review/c3', '{"helpfulVotes": 1}'
  )
  returning * into inserted;

  assert inserted.id is not null, 'id was not generated';
  assert inserted.created_at is not null and inserted.created_at <= now(),
    'created_at was not set by the database';
  assert inserted.review_text = 'C three' and inserted.rating = 3, 'values were not persisted';
end
$$;
\echo 'ok - a normal insert of the app''s columns still works and returns the row'

reset role;

do $$
begin
  assert (
    select rating from public.reviews where review_text = 'C one'
  ) = 4, 'User C''s review rating changed';
  assert (
    select analysis_target_id from public.reviews where review_text = 'C one'
  ) = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'User C''s review moved target';
  assert (
    select count(*) from public.reviews
    where analysis_target_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 3, 'target C should have its 2 seeded reviews plus the 1 normal insert';
  assert not exists (
    select 1 from public.reviews where review_text in ('Chosen id', 'Backdated')
  ), 'a denied insert was saved';
end
$$;
\echo 'ok - denied writes left User C''s reviews unchanged'

-- ---------------------------------------------------------------------------------------------
-- Browser deletion is denied; only an administrative deletion may exercise the FK cascade.
-- ---------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$ begin
  begin
    delete from public.analysis_targets where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'owner browser DELETE unexpectedly permitted';
  exception when insufficient_privilege then null; end;
  assert exists (select 1 from public.analysis_targets where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert exists (select 1 from public.reviews where analysis_target_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc');
end $$;

reset role;

delete from public.analysis_targets where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

do $$
begin
  assert not exists (
    select 1 from public.analysis_targets where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'administrative deletion did not remove the target';
  assert not exists (
    select 1 from public.reviews where analysis_target_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'reviews remained after their target was deleted';
  assert (
    select count(*) from public.reviews
    where analysis_target_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) = 3, 'deleting User C''s target removed User D''s reviews';
end
$$;
\echo 'ok - browser deletion is denied and administrative deletion retains FK cascade behavior'
