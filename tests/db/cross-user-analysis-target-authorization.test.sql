-- S1-012: direct-ID authorization checks at the PostgreSQL Row Level Security boundary.
--
-- This scenario intentionally uses identities and a target that are independent from the S1-014
-- persistence tests. It proves that prohibited cross-user and direct client mutations leave the
-- victim's complete row unchanged, not only that PostgreSQL reports zero affected rows.

\set ON_ERROR_STOP on
\set QUIET on

begin;

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

-- User A creates Target A through the restricted client insert boundary. PostgreSQL generates
-- the target id and creation time; the known id is retained for every subsequent direct-ID check.
set role authenticated;
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
declare
  target public.analysis_targets;
begin
  insert into public.analysis_targets (owner_id, name, platform, source_url)
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Target A',
    'google_maps',
    'https://maps.google.com/?cid=12345'
  )
  returning * into target;

  assert target.id is not null, 'PostgreSQL did not generate Target A''s id';
  assert target.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Target A has an unexpected owner';
  assert target.name = 'Target A', 'Target A has an unexpected name';
  assert target.platform = 'google_maps', 'Target A has an unexpected platform';
  assert target.source_url = 'https://maps.google.com/?cid=12345',
    'Target A has an unexpected source URL';
  assert target.google_place_id is null, 'Target A''s Google place ID was not initially null';
  assert target.created_at is not null, 'PostgreSQL did not generate Target A''s creation time';
  assert target.created_at <= clock_timestamp(), 'Target A''s creation time is in the future';

  perform set_config('test.s1_012_target_id', target.id::text, false);
  perform set_config('test.s1_012_target_created_at', target.created_at::text, false);
end
$$;

do $$
declare
  target public.analysis_targets;
begin
  select * into strict target
  from public.analysis_targets
  where id = current_setting('test.s1_012_target_id')::uuid;

  assert target.id = current_setting('test.s1_012_target_id')::uuid,
    'User A retrieved a target with an unexpected id';
  assert target.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'User A did not retrieve the owned target';
end
$$;
\echo 'ok - User A creates and retrieves Target A using its database-generated id'

-- User B knows Target A's identifier but cannot read, update, or delete it. UPDATE must fail at
-- the privilege boundary; if it unexpectedly succeeds, even with zero affected rows, the explicit
-- exception below fails the test.
set request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}';

do $$
declare
  affected integer;
begin
  assert not exists (
    select 1
    from public.analysis_targets
    where id = current_setting('test.s1_012_target_id')::uuid
  ), 'User B retrieved User A''s target by its known id';

  begin
    update public.analysis_targets
    set name = 'Changed by User B'
    where id = current_setting('test.s1_012_target_id')::uuid;
    raise exception 'User B''s direct UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.analysis_targets
  where id = current_setting('test.s1_012_target_id')::uuid;
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
  where id = current_setting('test.s1_012_target_id')::uuid;

  assert target.id = current_setting('test.s1_012_target_id')::uuid,
    'the unauthorized attempts changed Target A''s id';
  assert target.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'the unauthorized attempts changed Target A''s owner';
  assert target.name = 'Target A',
    'the unauthorized attempts changed Target A''s name';
  assert target.platform = 'google_maps',
    'the unauthorized attempts changed Target A''s platform';
  assert target.source_url = 'https://maps.google.com/?cid=12345',
    'the unauthorized attempts changed Target A''s source URL';
  assert target.google_place_id is null,
    'the unauthorized attempts changed Target A''s Google place ID';
  assert target.created_at = current_setting('test.s1_012_target_created_at')::timestamptz,
    'the unauthorized attempts changed Target A''s creation time';
end
$$;
\echo 'ok - User A retrieves Target A unchanged after User B modification attempts'

-- An authenticated database role without a verified user identity cannot create, access, or
-- modify a target. INSERT is rejected by RLS with insufficient_privilege, UPDATE is rejected by
-- the immutable-source privilege boundary, and DELETE remains ownership-filtered by RLS.
set request.jwt.claims to '';

do $$
declare
  affected integer;
begin
  assert not exists (
    select 1
    from public.analysis_targets
    where id = current_setting('test.s1_012_target_id')::uuid
  ), 'a request without a user identity retrieved Target A';

  begin
    insert into public.analysis_targets (owner_id, name, platform, source_url)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Created without an identity',
      'google_maps',
      'https://maps.google.com/?cid=missing-identity'
    );
    raise exception 'a request without a user identity unexpectedly inserted a target';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.analysis_targets
    set name = 'Changed without an identity'
    where id = current_setting('test.s1_012_target_id')::uuid;
    raise exception 'a request without a user identity unexpectedly updated Target A';
  exception
    when insufficient_privilege then null;
  end;

  delete from public.analysis_targets
  where id = current_setting('test.s1_012_target_id')::uuid;
  get diagnostics affected = row_count;
  assert affected = 0, 'a request without a user identity deleted Target A';
end
$$;
\echo 'ok - requests without a verified user identity cannot create, access, or modify targets'

-- The anon role has no table privileges, so PostgreSQL rejects direct SELECT, INSERT, UPDATE, and
-- DELETE operations. Each operation is attempted independently. Only the expected privilege error
-- is accepted; any successful statement reaches an explicit failure.
reset role;
set role anon;

do $$
begin
  begin
    perform 1
    from public.analysis_targets
    where id = current_setting('test.s1_012_target_id')::uuid;
    raise exception 'an anonymous request unexpectedly queried Target A';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.analysis_targets (owner_id, name, platform, source_url)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Created anonymously',
      'google_maps',
      'https://maps.google.com/?cid=anonymous'
    );
    raise exception 'an anonymous request unexpectedly inserted a target';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.analysis_targets
    set name = 'Changed anonymously'
    where id = current_setting('test.s1_012_target_id')::uuid;
    raise exception 'an anonymous request unexpectedly updated Target A';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.analysis_targets
    where id = current_setting('test.s1_012_target_id')::uuid;
    raise exception 'an anonymous request unexpectedly deleted Target A';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
\echo 'ok - anonymous select, insert, update, and delete operations are rejected'

-- After every foreign, missing-identity, and anonymous attempt, the owner retrieves the complete
-- unchanged row. Under the immutable-source model, even the owner cannot directly UPDATE the
-- target, while retaining legitimate read and DELETE access.
reset role;
set role authenticated;
set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}';

do $$
declare
  affected integer;
  target public.analysis_targets;
begin
  begin
    update public.analysis_targets
    set name = 'Changed by User A'
    where id = current_setting('test.s1_012_target_id')::uuid;
    raise exception 'User A''s direct UPDATE unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  select * into strict target
  from public.analysis_targets
  where id = current_setting('test.s1_012_target_id')::uuid;

  assert target.id = current_setting('test.s1_012_target_id')::uuid,
    'a prohibited operation changed Target A''s id';
  assert target.owner_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'a prohibited operation changed Target A''s owner';
  assert target.name = 'Target A', 'a prohibited operation changed Target A''s name';
  assert target.platform = 'google_maps',
    'a prohibited operation changed Target A''s platform';
  assert target.source_url = 'https://maps.google.com/?cid=12345',
    'a prohibited operation changed Target A''s source URL';
  assert target.google_place_id is null,
    'a prohibited operation changed Target A''s Google place ID';
  assert target.created_at = current_setting('test.s1_012_target_created_at')::timestamptz,
    'a prohibited operation changed Target A''s creation time';

  delete from public.analysis_targets
  where id = current_setting('test.s1_012_target_id')::uuid;
  get diagnostics affected = row_count;
  assert affected = 1, 'User A could not delete the owned target';
  assert not exists (
    select 1
    from public.analysis_targets
    where id = current_setting('test.s1_012_target_id')::uuid
  ), 'User A''s delete was not persisted';
end
$$;
\echo 'ok - User A can read and delete, but cannot directly update, the owned target'

reset role;
rollback;
