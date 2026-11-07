-- S1-013: cross-user Review authorization at the PostgreSQL boundary (RLS + table grants).
--
-- User B knows User A's target and review ids and tries to read, create, modify, delete, and move
-- Reviews. Each attempt must fail, and User A's rows must be byte-for-byte unchanged afterwards.
-- Ownership is inherited from analysis_targets.owner_id; reviews have no owner column of their own.
-- Run with `npm run test:db`. Uses its own ids so it is independent of other test files.
--
-- User A:   a1300000-0000-4000-8000-0000000000a1 (target A)
-- User B:   b1300000-0000-4000-8000-0000000000b1 (target B)
-- Target A: a1300000-0000-4000-8000-00000000a7a1
-- Target B: b1300000-0000-4000-8000-00000000b7b1
-- Review A: a1300000-0000-4000-8000-0000000a1e01

\set ON_ERROR_STOP on
\set QUIET on

-- Setup as the database owner (RLS does not apply).
insert into auth.users (id) values
  ('a1300000-0000-4000-8000-0000000000a1'),
  ('b1300000-0000-4000-8000-0000000000b1');

insert into public.analysis_targets (id, owner_id, name, platform, source_url) values
  ('a1300000-0000-4000-8000-00000000a7a1', 'a1300000-0000-4000-8000-0000000000a1',
   'S1-013 Target A', 'google_maps', 'https://maps.google.com/?cid=1301'),
  ('b1300000-0000-4000-8000-00000000b7b1', 'b1300000-0000-4000-8000-0000000000b1',
   'S1-013 Target B', 'google_maps', 'https://maps.google.com/?cid=1302');

insert into public.reviews (id, analysis_target_id, review_text, rating, source_review_id) values
  ('a1300000-0000-4000-8000-0000000a1e01', 'a1300000-0000-4000-8000-00000000a7a1',
   'User A review', 5, 's1-013-a');

-- Fingerprint of everything stored for target A, compared again at the end.
do $$
begin
  perform set_config(
    'test.s1_013_target_a_reviews',
    (select md5(string_agg(r::text, '|' order by r.id)) from public.reviews r
     where r.analysis_target_id = 'a1300000-0000-4000-8000-00000000a7a1'),
    false
  );
end
$$;

set role authenticated;

-- ---------------------------------------------------------------------------------------------
-- Happy path: User A reads and creates Reviews under their own target.
-- ---------------------------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"a1300000-0000-4000-8000-0000000000a1"}';

do $$
begin
  assert (
    select count(*) from public.reviews
    where analysis_target_id = 'a1300000-0000-4000-8000-00000000a7a1'
  ) = 1, 'User A cannot read their own target''s review';
end
$$;

insert into public.reviews (analysis_target_id, review_text, rating)
values ('a1300000-0000-4000-8000-00000000a7a1', 'User A second review', 4);

do $$
begin
  assert (
    select count(*) from public.reviews
    where analysis_target_id = 'a1300000-0000-4000-8000-00000000a7a1'
  ) = 2, 'User A could not create a review under their own target';
end
$$;
\echo 'ok - User A reads and creates reviews under their own target'

-- Refresh the fingerprint as the owner so it includes A's legitimate second review.
reset role;
do $$
begin
  perform set_config(
    'test.s1_013_target_a_reviews',
    (select md5(string_agg(r::text, '|' order by r.id)) from public.reviews r
     where r.analysis_target_id = 'a1300000-0000-4000-8000-00000000a7a1'),
    false
  );
end
$$;
set role authenticated;

-- ---------------------------------------------------------------------------------------------
-- User B against User A's target.
-- ---------------------------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"b1300000-0000-4000-8000-0000000000b1"}';

do $$
begin
  assert not exists (
    select 1 from public.reviews
    where analysis_target_id = 'a1300000-0000-4000-8000-00000000a7a1'
  ), 'User B retrieved User A''s target reviews';
  assert not exists (
    select 1 from public.reviews where id = 'a1300000-0000-4000-8000-0000000a1e01'
  ), 'User B retrieved User A''s review by its id';
end
$$;
\echo 'ok - User B cannot retrieve User A''s target reviews'

do $$
begin
  begin
    insert into public.reviews (analysis_target_id, review_text, rating)
    values ('a1300000-0000-4000-8000-00000000a7a1', 'Injected by B', 1);
    raise exception 'User B created a review under User A''s target';
  exception when insufficient_privilege then
    null; -- RLS: new row violates the reviews_insert_own policy.
  end;
end
$$;
\echo 'ok - User B cannot create a review under User A''s target'

do $$
begin
  begin
    update public.reviews set review_text = 'Edited by B', rating = 1
    where id = 'a1300000-0000-4000-8000-0000000a1e01';
    raise exception 'User B was allowed to update User A''s review';
  exception when insufficient_privilege then
    null; -- No UPDATE grant on reviews.
  end;

  begin
    delete from public.reviews where id = 'a1300000-0000-4000-8000-0000000a1e01';
    raise exception 'User B was allowed to delete User A''s review';
  exception when insufficient_privilege then
    null; -- No DELETE grant on reviews.
  end;

  begin
    truncate public.reviews;
    raise exception 'User B was allowed to truncate reviews';
  exception when insufficient_privilege then
    null; -- TRUNCATE bypasses RLS, so it must not be granted.
  end;
end
$$;
\echo 'ok - User B cannot update, delete, or truncate User A''s reviews'

-- User B can add reviews to B's own target, but cannot move one onto User A's target.
insert into public.reviews (analysis_target_id, review_text, rating)
values ('b1300000-0000-4000-8000-00000000b7b1', 'User B review', 3);

do $$
begin
  begin
    update public.reviews set analysis_target_id = 'a1300000-0000-4000-8000-00000000a7a1'
    where analysis_target_id = 'b1300000-0000-4000-8000-00000000b7b1';
    raise exception 'User B moved a review onto User A''s target';
  exception when insufficient_privilege then
    null;
  end;
end
$$;
\echo 'ok - User B cannot move a review onto User A''s target'

-- ---------------------------------------------------------------------------------------------
-- User A's data is unchanged.
-- ---------------------------------------------------------------------------------------------
reset role;

do $$
begin
  assert (
    select md5(string_agg(r::text, '|' order by r.id)) from public.reviews r
    where r.analysis_target_id = 'a1300000-0000-4000-8000-00000000a7a1'
  ) = current_setting('test.s1_013_target_a_reviews'),
    'User A''s reviews changed after User B''s attempts';
  assert (
    select count(*) from public.reviews
    where analysis_target_id = 'b1300000-0000-4000-8000-00000000b7b1'
  ) = 1, 'User B''s own review was not stored under target B';
end
$$;
\echo 'ok - User A''s reviews are unchanged after every cross-user attempt'
