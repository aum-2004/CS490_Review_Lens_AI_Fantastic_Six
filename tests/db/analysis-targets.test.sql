-- S1-014 database tests for public.analysis_targets: persistence, ownership, RLS isolation
-- between User A and User B, field constraints, and the client write boundary. Run with
-- `npm run test:db`.
--
-- User A: 11111111-1111-4111-8111-111111111111
-- User B: 22222222-2222-4222-8222-222222222222
-- A's first target id is generated, then kept in the test.target_a setting.

\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

-- ---------------------------------------------------------------------------------------------
-- Persistence and retrieval as User A
-- ---------------------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111"}';

do $$
declare
  new_id uuid;
begin
  insert into public.analysis_targets (owner_id, name, platform, source_url)
  values (
    '11111111-1111-4111-8111-111111111111',
    'Joe''s Pizza',
    'google_maps',
    'https://www.google.com/maps/place/Joe''s+Pizza'
  )
  returning id into new_id;
  perform set_config('test.target_a', new_id::text, false);
end
$$;

do $$
declare
  target public.analysis_targets;
begin
  select * into strict target
  from public.analysis_targets
  where id = current_setting('test.target_a')::uuid;

  assert target.owner_id = '11111111-1111-4111-8111-111111111111', 'owner_id was not persisted';
  assert target.name = 'Joe''s Pizza', 'name was not persisted';
  assert target.platform = 'google_maps', 'platform was not persisted';
  assert target.source_url = 'https://www.google.com/maps/place/Joe''s+Pizza',
    'source_url was not persisted';
  assert target.google_place_id is null, 'google_place_id should default to null';
  assert target.created_at is not null, 'created_at was not set';
  assert target.created_at <= now(), 'created_at is in the future';
end
$$;
\echo 'ok - User A can persist a target and retrieve it with the expected values and owner'

do $$
declare
  new_id uuid;
begin
  insert into public.analysis_targets (owner_id, name, platform, source_url)
  values (
    '11111111-1111-4111-8111-111111111111',
    'Corner Cafe',
    'google_maps',
    'https://maps.google.com/?cid=123'
  )
  returning id into new_id;

  assert new_id is not null, 'id was not generated';
  assert new_id <> current_setting('test.target_a')::uuid, 'generated id is not unique';
  assert (select count(*) from public.analysis_targets) = 2, 'User A should see both targets';
end
$$;
\echo 'ok - ids are generated and one owner can have multiple targets'

-- ---------------------------------------------------------------------------------------------
-- Cross-user isolation: User B against User A's target (S1-BR-008)
-- ---------------------------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222"}';

do $$
begin
  assert (select count(*) from public.analysis_targets) = 0, 'User B can see User A''s targets';
  assert not exists (
    select 1 from public.analysis_targets where id = current_setting('test.target_a')::uuid
  ), 'User B can read User A''s target by id';
end
$$;
\echo 'ok - User B cannot read User A''s targets'

do $$
begin
  insert into public.analysis_targets (owner_id, name, platform, source_url)
  values (
    '11111111-1111-4111-8111-111111111111',
    'Planted by B',
    'google_maps',
    'https://maps.google.com/?cid=999'
  );
  raise exception 'User B created a target owned by User A';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - User B cannot create a target owned by User A'

do $$
declare
  affected integer;
begin
  begin
    update public.analysis_targets
    set name = 'Renamed by B'
    where id = current_setting('test.target_a')::uuid;
    raise exception 'User B updated User A''s target';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.analysis_targets where id = current_setting('test.target_a')::uuid;
  get diagnostics affected = row_count;
  assert affected = 0, 'User B deleted User A''s target';
end
$$;
\echo 'ok - User B cannot update or delete User A''s target'

-- ---------------------------------------------------------------------------------------------
-- Ownership cannot be moved, and requests without a session see nothing
-- ---------------------------------------------------------------------------------------------
set request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111"}';

do $$
begin
  update public.analysis_targets
  set owner_id = '22222222-2222-4222-8222-222222222222'
  where id = current_setting('test.target_a')::uuid;
  raise exception 'User A reassigned a target to User B';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - a target cannot be reassigned to another owner'

set request.jwt.claims to '';

do $$
begin
  assert (select count(*) from public.analysis_targets) = 0,
    'an authenticated role without a user id can see targets';
end
$$;
\echo 'ok - a request without a user id sees no targets'

reset role;
set role anon;

do $$
begin
  perform 1 from public.analysis_targets;
  raise exception 'anon can query analysis_targets';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - anonymous requests are denied'

-- ---------------------------------------------------------------------------------------------
-- Field constraints (as User A, so RLS passes and only the constraint can fail)
-- ---------------------------------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111"}';

create function pg_temp.expect_rejected(
  label text,
  target_name text,
  target_platform text,
  target_source_url text,
  expected_state text
) returns void
language plpgsql
as $$
begin
  insert into public.analysis_targets (owner_id, name, platform, source_url)
  values (
    '11111111-1111-4111-8111-111111111111',
    target_name,
    target_platform,
    target_source_url
  );
  raise exception 'expected % to be rejected', label;
exception
  when check_violation or not_null_violation then
    if sqlstate <> expected_state then
      raise exception '% was rejected with % instead of %', label, sqlstate, expected_state;
    end if;
end
$$;

\o /dev/null
select pg_temp.expect_rejected('a blank name', '   ', 'google_maps', 'https://maps.google.com/?cid=1', '23514');
select pg_temp.expect_rejected('a missing name', null, 'google_maps', 'https://maps.google.com/?cid=1', '23502');
select pg_temp.expect_rejected('a 121-character name', repeat('x', 121), 'google_maps', 'https://maps.google.com/?cid=1', '23514');
select pg_temp.expect_rejected('an unsupported platform', 'Cafe', 'yelp', 'https://maps.google.com/?cid=1', '23514');
select pg_temp.expect_rejected('a missing platform', 'Cafe', null, 'https://maps.google.com/?cid=1', '23502');
select pg_temp.expect_rejected('a non-http source URL', 'Cafe', 'google_maps', 'ftp://maps.google.com/x', '23514');
select pg_temp.expect_rejected('a missing source URL', 'Cafe', 'google_maps', null, '23502');
select pg_temp.expect_rejected('a non-Google source URL', 'Cafe', 'google_maps', 'https://example.com/maps/place/Cafe', '23514');
select pg_temp.expect_rejected('a lookalike host', 'Cafe', 'google_maps', 'https://maps.google.com.evil.example/x', '23514');
select pg_temp.expect_rejected('embedded credentials', 'Cafe', 'google_maps', 'https://www.google.com@evil.example/maps/place/Cafe', '23514');
select pg_temp.expect_rejected('a non-default port', 'Cafe', 'google_maps', 'https://www.google.com:8443/maps/place/Cafe', '23514');
select pg_temp.expect_rejected('a Google URL outside Maps', 'Cafe', 'google_maps', 'https://www.google.com/search?q=Cafe', '23514');
select pg_temp.expect_rejected('a backslash', 'Cafe', 'google_maps', 'https://www.google.com/maps\place\Cafe', '23514');
select pg_temp.expect_rejected('a newline', 'Cafe', 'google_maps', E'https://www.google.com/maps/place/Ca\nfe', '23514');
select pg_temp.expect_rejected('a 2,049-character source URL', 'Cafe', 'google_maps', 'https://www.google.com/maps/place/' || repeat('x', 2015), '23514');
\o

insert into public.analysis_targets (owner_id, name, platform, source_url)
values (
  '11111111-1111-4111-8111-111111111111',
  repeat('x', 120),
  'google_maps',
  'https://maps.google.com/?cid=120'
);
\echo 'ok - name, platform, and source URL constraints are enforced (120-character name accepted)'

-- Every URL shape S1-016 returns as valid must still be storable.
insert into public.analysis_targets (owner_id, name, platform, source_url)
select '11111111-1111-4111-8111-111111111111', 'S1-016 shape', 'google_maps', url
from unnest(array[
  'https://www.google.com/maps/place/NJIT/@40.742,-74.179,17z',
  'http://google.com/maps/place/Example+Business',
  'https://maps.google.com/maps?cid=123456789',
  'https://www.google.com/maps?place_id=ChIJ123456789',
  'https://www.google.com/maps/search/?api=1&query=NJIT&query_place_id=abc123',
  'https://maps.google.com/?cid=123456789',
  'https://www.google.com/maps/place/' || repeat('x', 2014)
]) as url;
\echo 'ok - canonical S1-016 source URLs are accepted (2,048-character URL accepted)'

-- ---------------------------------------------------------------------------------------------
-- Client write boundary: an owner cannot replace their own target's source identity directly
-- ---------------------------------------------------------------------------------------------
create function pg_temp.expect_denied(label text, statement text) returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'expected % to be denied', label;
exception
  when insufficient_privilege then null;
end
$$;

\o /dev/null
select pg_temp.expect_denied('changing source_url', format(
  $sql$update public.analysis_targets set source_url = 'https://www.google.com/maps/place/Other' where id = %L$sql$,
  current_setting('test.target_a')));
select pg_temp.expect_denied('changing google_place_id', format(
  $sql$update public.analysis_targets set google_place_id = 'chosen-by-client' where id = %L$sql$,
  current_setting('test.target_a')));
select pg_temp.expect_denied('changing name', format(
  $sql$update public.analysis_targets set name = 'Renamed' where id = %L$sql$,
  current_setting('test.target_a')));
select pg_temp.expect_denied('changing platform', format(
  $sql$update public.analysis_targets set platform = 'google_maps' where id = %L$sql$,
  current_setting('test.target_a')));
select pg_temp.expect_denied('inserting google_place_id', $sql$
  insert into public.analysis_targets (owner_id, name, platform, source_url, google_place_id)
  values ('11111111-1111-4111-8111-111111111111', 'Cafe', 'google_maps',
          'https://maps.google.com/?cid=7', 'chosen-by-client')$sql$);
select pg_temp.expect_denied('choosing an id', $sql$
  insert into public.analysis_targets (id, owner_id, name, platform, source_url)
  values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Cafe',
          'google_maps', 'https://maps.google.com/?cid=7')$sql$);
select pg_temp.expect_denied('choosing created_at', $sql$
  insert into public.analysis_targets (owner_id, name, platform, source_url, created_at)
  values ('11111111-1111-4111-8111-111111111111', 'Cafe', 'google_maps',
          'https://maps.google.com/?cid=7', '2000-01-01')$sql$);
\o

do $$
declare
  target public.analysis_targets;
begin
  select * into strict target
  from public.analysis_targets
  where id = current_setting('test.target_a')::uuid;

  assert target.name = 'Joe''s Pizza', 'a denied write changed name';
  assert target.source_url = 'https://www.google.com/maps/place/Joe''s+Pizza',
    'a denied write changed source_url';
  assert target.google_place_id is null, 'a denied write changed google_place_id';
end
$$;
\echo 'ok - an owner cannot update a target or choose its id, creation time, or place ID directly'

-- ---------------------------------------------------------------------------------------------
-- The write createAnalysisTarget sends (S1-011) still works under the restricted grants
-- ---------------------------------------------------------------------------------------------
do $$
declare
  created record;
begin
  insert into public.analysis_targets (owner_id, name, platform, source_url)
  values (
    '11111111-1111-4111-8111-111111111111',
    'Created through the API',
    'google_maps',
    'https://www.google.com/maps/place/NJIT/@40.742,-74.179,17z'
  )
  returning id, owner_id, name, platform, source_url, google_place_id, created_at into created;

  assert created.id is not null, 'id was not generated';
  assert created.owner_id = '11111111-1111-4111-8111-111111111111', 'owner_id was not returned';
  assert created.google_place_id is null, 'a new target should have no place ID';
  assert created.created_at is not null, 'created_at was not generated';
end
$$;
\echo 'ok - the repository insert and its returned columns work under the restricted grants'

-- ---------------------------------------------------------------------------------------------
-- Owner relationship to auth.users
-- ---------------------------------------------------------------------------------------------
reset role;

do $$
begin
  insert into public.analysis_targets (owner_id, name, platform, source_url)
  values (
    '99999999-9999-4999-8999-999999999999',
    'Orphan',
    'google_maps',
    'https://maps.google.com/?cid=1'
  );
  raise exception 'a target was created for a user that does not exist';
exception
  when foreign_key_violation then null;
end
$$;

delete from auth.users where id = '11111111-1111-4111-8111-111111111111';

do $$
begin
  assert not exists (
    select 1 from public.analysis_targets
    where owner_id = '11111111-1111-4111-8111-111111111111'
  ), 'targets remained after their owner was deleted';
end
$$;
\echo 'ok - the owner must exist, and deleting the owner deletes their targets'
