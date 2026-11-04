-- S1-012: direct-ID authorization checks at the PostgreSQL Row Level Security boundary.
--
-- This scenario intentionally uses identities and a target that are independent from the S1-014
-- persistence tests. It proves that failed cross-user mutations leave the victim's complete row
-- unchanged, not only that PostgreSQL reports zero affected rows.

\set ON_ERROR_STOP on
\set QUIET on

begin;

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- User A owns and can retrieve Target A by its known identifier.
set role authenticated;
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

insert into public.analysis_targets (
  id,
  owner_id,
  name,
  platform,
  source_url,
  google_place_id,
  created_at
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Target A',
  'google_maps',
  'https://maps.google.com/?cid=12345',
  'place-id-a',
  '2026-11-03 12:00:00+00'
);

do $$
declare
  target public.analysis_targets;
begin
  select * into strict target
  from public.analysis_targets
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  assert target.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'User A did not retrieve the owned target';
  assert target.name = 'Target A', 'User A retrieved unexpected target data';
end
$$;
\echo 'ok - User A can retrieve Target A by id'

-- User B knows Target A's identifier but cannot read, update, or delete it.
set request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';

do $$
declare
  affected integer;
begin
  assert not exists (
    select 1
    from public.analysis_targets
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'User B retrieved User A''s target by its known id';

  update public.analysis_targets
  set
    name = 'Changed by User B',
    source_url = 'https://attacker.example/changed',
    google_place_id = 'changed-by-user-b'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'User B updated User A''s target by its known id';

  delete from public.analysis_targets
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'User B deleted User A''s target by its known id';
end
$$;
\echo 'ok - User B cannot read, update, or delete Target A by its known id'

-- User A can still retrieve Target A, and every stored value is unchanged after both attacks.
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
declare
  target public.analysis_targets;
begin
  select * into strict target
  from public.analysis_targets
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  assert target.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'the unauthorized attempts changed Target A''s owner';
  assert target.name = 'Target A',
    'the unauthorized attempts changed Target A''s name';
  assert target.platform = 'google_maps',
    'the unauthorized attempts changed Target A''s platform';
  assert target.source_url = 'https://maps.google.com/?cid=12345',
    'the unauthorized attempts changed Target A''s source URL';
  assert target.google_place_id = 'place-id-a',
    'the unauthorized attempts changed Target A''s Google place ID';
  assert target.created_at = '2026-11-03 12:00:00+00'::timestamptz,
    'the unauthorized attempts changed Target A''s creation time';
end
$$;
\echo 'ok - User A retrieves Target A unchanged after User B modification attempts'

-- An authenticated database role without a verified user identity cannot access Target A.
set request.jwt.claims to '';

do $$
declare
  affected integer;
begin
  assert not exists (
    select 1
    from public.analysis_targets
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'a request without a user identity retrieved Target A';

  update public.analysis_targets
  set name = 'Changed without an identity'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'a request without a user identity updated Target A';

  delete from public.analysis_targets
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'a request without a user identity deleted Target A';
end
$$;
\echo 'ok - requests without a verified user identity cannot access or modify Target A'

-- The anon role has no table privileges, so PostgreSQL rejects even a direct-ID query.
reset role;
set role anon;

do $$
begin
  perform 1
  from public.analysis_targets
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  raise exception 'an anonymous request queried Target A';
exception
  when insufficient_privilege then null;
end
$$;
\echo 'ok - anonymous direct-ID requests are rejected'

-- The owner can modify and delete the same target, proving the policies deny by ownership.
reset role;
set role authenticated;
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
declare
  affected integer;
begin
  update public.analysis_targets
  set name = 'Changed by User A'
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 1, 'User A could not update the owned target';
  assert (
    select name = 'Changed by User A'
    from public.analysis_targets
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'User A''s update was not persisted';

  delete from public.analysis_targets
  where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 1, 'User A could not delete the owned target';
  assert not exists (
    select 1
    from public.analysis_targets
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'User A''s delete was not persisted';
end
$$;
\echo 'ok - User A can update and delete the owned target'

reset role;
rollback;
