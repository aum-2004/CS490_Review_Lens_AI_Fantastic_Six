-- S1-022 database tests for table privileges on public.reviews. TRUNCATE is not subject to Row
-- Level Security, so a role holding it could delete every user's reviews at once. Supabase (and
-- tests/db/supabase-auth-shim.sql) grant new tables ALL to anon and authenticated by default,
-- so the migration must revoke those inherited privileges. Run with `npm run test:db`.
-- Uses its own ids so it is independent of other test files.
--
-- User C: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa (target C)
-- User D: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb (target D)
-- Target C: cccccccc-cccc-4ccc-8ccc-cccccccccccc
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
begin
  assert has_table_privilege('authenticated', 'public.reviews', 'SELECT'),
    'authenticated lost SELECT on reviews';
  assert has_table_privilege('authenticated', 'public.reviews', 'INSERT'),
    'authenticated lost INSERT on reviews';
  assert has_table_privilege('authenticated', 'public.reviews', 'UPDATE'),
    'authenticated lost UPDATE on reviews';
  assert has_table_privilege('authenticated', 'public.reviews', 'DELETE'),
    'authenticated lost DELETE on reviews';
end
$$;
\echo 'ok - authenticated keeps SELECT, INSERT, UPDATE, and DELETE on reviews'

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
