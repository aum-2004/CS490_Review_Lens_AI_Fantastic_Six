-- S1-022 database tests for public.reviews: persistence, target association, ownership inherited
-- through analysis_targets, RLS isolation between users, and field constraints.
-- Run with `npm run test:db`. Uses its own ids so it is independent of other test files.
--
-- User A: 55555555-5555-4555-8555-555555555555 (targets A1 and A2)
-- User B: 66666666-6666-4666-8666-666666666666 (target B)
-- Target A1: 77777777-7777-4777-8777-777777777771
-- Target A2: 77777777-7777-4777-8777-777777777772
-- Target B:  88888888-8888-4888-8888-888888888888

\set ON_ERROR_STOP on
\set QUIET on

-- Setup as the database owner (RLS does not apply), standing in for S1-014/S1-015.
insert into auth.users (id) values
  ('55555555-5555-4555-8555-555555555555'),
  ('66666666-6666-4666-8666-666666666666');

insert into public.analysis_targets (id, owner_id, name, platform, source_url) values
  ('77777777-7777-4777-8777-777777777771', '55555555-5555-4555-8555-555555555555',
   'Target A1', 'google_maps', 'https://maps.google.com/?cid=1'),
  ('77777777-7777-4777-8777-777777777772', '55555555-5555-4555-8555-555555555555',
   'Target A2', 'google_maps', 'https://maps.google.com/?cid=2'),
  ('88888888-8888-4888-8888-888888888888', '66666666-6666-4666-8666-666666666666',
   'Target B', 'google_maps', 'https://maps.google.com/?cid=3');

-- ---------------------------------------------------------------------------------------------
-- Persistence and retrieval as User A
-- ---------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555"}';

insert into public.reviews (
  analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date,
  review_url, source_metadata
) values
  ('77777777-7777-4777-8777-777777777771', 'Great food', 4.5, 'src-1', 'Sam',
   '2026-10-01T12:00:00Z', 'https://maps.google.com/review/1', '{"helpfulVotes": 3}'),
  ('77777777-7777-4777-8777-777777777771', 'Slow service', 2, null, null, null, null, null);

do $$
declare
  review public.reviews;
begin
  assert (
    select count(*) from public.reviews
    where analysis_target_id = '77777777-7777-4777-8777-777777777771'
  ) = 2, 'User A should see both reviews of target A1';

  select * into strict review from public.reviews where source_review_id = 'src-1';

  assert review.review_text = 'Great food', 'review_text was not persisted';
  assert review.rating = 4.5, 'rating was not persisted';
  assert review.reviewer_name = 'Sam', 'reviewer_name was not persisted';
  assert review.review_date = '2026-10-01T12:00:00Z', 'review_date was not persisted';
  assert review.review_url = 'https://maps.google.com/review/1', 'review_url was not persisted';
  assert review.source_metadata = '{"helpfulVotes": 3}', 'source_metadata was not persisted';
  assert review.analysis_target_id = '77777777-7777-4777-8777-777777777771',
    'review is not associated with target A1';
  assert review.id is not null and review.created_at is not null, 'id or created_at not set';
end
$$;
\echo 'ok - User A can persist reviews and retrieve them with the expected values and target'

do $$
begin
  assert not exists (
    select 1 from public.reviews
    where analysis_target_id = '77777777-7777-4777-8777-777777777772'
  ), 'target A1''s reviews appear under target A2';
end
$$;
\echo 'ok - reviews of one target do not appear under another target of the same user'

insert into public.reviews (analysis_target_id, review_text, rating, source_review_id) values
  ('77777777-7777-4777-8777-777777777771', 'Same source review again', 5, 'src-1');
\echo 'ok - duplicate source_review_id values are allowed in Sprint 1'

-- ---------------------------------------------------------------------------------------------
-- Cross-user isolation: User B against User A's target (S1-BR-008)
-- ---------------------------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"66666666-6666-4666-8666-666666666666"}';

insert into public.reviews (analysis_target_id, review_text, rating)
values ('88888888-8888-4888-8888-888888888888', 'Fine', 3);

do $$
begin
  assert (select count(*) from public.reviews) = 1, 'User B can see other users'' reviews';
  assert (select review_text from public.reviews) = 'Fine', 'User B cannot see their own review';
  assert not exists (
    select 1 from public.reviews
    where analysis_target_id = '77777777-7777-4777-8777-777777777771'
  ), 'User B can read reviews through User A''s target';
end
$$;
\echo 'ok - User B sees only their own target''s reviews, not User A''s'

do $$
begin
  insert into public.reviews (analysis_target_id, review_text, rating)
  values ('77777777-7777-4777-8777-777777777771', 'Planted by B', 1);
  raise exception 'User B added a review to User A''s target';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - User B cannot add reviews to User A''s target'

do $$
declare
  affected integer;
begin
  update public.reviews
  set review_text = 'Edited by B'
  where analysis_target_id = '77777777-7777-4777-8777-777777777771';
  get diagnostics affected = row_count;
  assert affected = 0, 'User B updated User A''s reviews';

  delete from public.reviews where analysis_target_id = '77777777-7777-4777-8777-777777777771';
  get diagnostics affected = row_count;
  assert affected = 0, 'User B deleted User A''s reviews';
end
$$;
\echo 'ok - User B cannot update or delete User A''s reviews'

-- ---------------------------------------------------------------------------------------------
-- Reviews cannot be moved to another user's target; no session sees nothing
-- ---------------------------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555"}';

do $$
begin
  update public.reviews
  set analysis_target_id = '88888888-8888-4888-8888-888888888888'
  where source_review_id = 'src-1';
  raise exception 'User A moved a review onto User B''s target';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - a review cannot be moved onto another user''s target'

set request.jwt.claims to '';

do $$
begin
  assert (select count(*) from public.reviews) = 0,
    'an authenticated role without a user id can see reviews';
end
$$;
\echo 'ok - a request without a user id sees no reviews'

reset role;
set role anon;

do $$
begin
  perform 1 from public.reviews;
  raise exception 'anon can query reviews';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - anonymous requests are denied'

-- ---------------------------------------------------------------------------------------------
-- Field constraints (as User A on target A2, so RLS passes and only the constraint can fail)
-- ---------------------------------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555"}';

do $$
declare
  bad record;
begin
  for bad in
    select * from (values
      ('   ', 4::numeric, null::text, null::jsonb, 'blank text'),
      ('ok', 0, null, null, 'rating below 1'),
      ('ok', 6, null, null, 'rating above 5'),
      ('ok', 4, 'javascript:alert(1)', null, 'non-http review_url'),
      ('ok', 4, null, '["not", "an", "object"]', 'non-object source_metadata')
    ) as t(review_text, rating, review_url, source_metadata, label)
  loop
    begin
      insert into public.reviews (
        analysis_target_id, review_text, rating, review_url, source_metadata
      ) values (
        '77777777-7777-4777-8777-777777777772', bad.review_text, bad.rating, bad.review_url,
        bad.source_metadata
      );
      raise exception 'accepted a review with %', bad.label;
    exception
      when check_violation then null;
    end;
  end loop;

  begin
    insert into public.reviews (analysis_target_id, review_text) values
      ('77777777-7777-4777-8777-777777777772', 'no rating');
    raise exception 'accepted a review without a rating';
  exception
    when not_null_violation then null;
  end;
end
$$;
\echo 'ok - text, rating, review_url and source_metadata constraints are enforced'

-- ---------------------------------------------------------------------------------------------
-- A review needs an existing target, and deleting a target deletes its reviews
-- ---------------------------------------------------------------------------------------------
reset role;

do $$
begin
  insert into public.reviews (analysis_target_id, review_text, rating)
  values ('99999999-9999-4999-8999-999999999999', 'Orphan', 3);
  raise exception 'accepted a review for a target that does not exist';
exception
  when foreign_key_violation then null;
end
$$;

delete from public.analysis_targets where id = '77777777-7777-4777-8777-777777777771';

do $$
begin
  assert not exists (
    select 1 from public.reviews
    where analysis_target_id = '77777777-7777-4777-8777-777777777771'
  ), 'reviews remained after their target was deleted';
end
$$;
\echo 'ok - the target must exist, and deleting a target deletes its reviews'
