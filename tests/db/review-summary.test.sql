-- S2-006: exact aggregate behavior, ownership enforcement, and RPC privileges.

\set ON_ERROR_STOP on
\set QUIET on

begin;

insert into auth.users (id) values
  ('56000000-0000-4000-8000-000000000001'),
  ('56000000-0000-4000-8000-000000000002');

insert into public.analysis_targets (id, owner_id, name, platform, source_url) values
  ('56000000-0000-4000-8000-000000000011', '56000000-0000-4000-8000-000000000001',
   'Summary target A', 'google_maps', 'https://maps.google.com/?cid=5601'),
  ('56000000-0000-4000-8000-000000000012', '56000000-0000-4000-8000-000000000002',
   'Summary target B', 'google_maps', 'https://maps.google.com/?cid=5602'),
  ('56000000-0000-4000-8000-000000000013', '56000000-0000-4000-8000-000000000001',
   'Empty summary target', 'google_maps', 'https://maps.google.com/?cid=5603');

insert into public.reviews (analysis_target_id, review_text, rating)
select '56000000-0000-4000-8000-000000000011', 'large dataset review', ((series % 5) + 1)::numeric
from generate_series(1, 1001) series;

insert into public.reviews (analysis_target_id, review_text, rating)
values ('56000000-0000-4000-8000-000000000012', 'foreign target review', 1);

do $$
declare
  function_security_definer boolean;
  function_config text[];
begin
  select procedure.prosecdef, procedure.proconfig
  into strict function_security_definer, function_config
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_review_summary(uuid)'::regprocedure;

  assert not function_security_definer, 'summary RPC must not be SECURITY DEFINER';
  assert function_config = array['search_path=""'], 'summary RPC search_path is not fixed';
  assert has_function_privilege(
    'authenticated', 'public.get_review_summary(uuid)', 'EXECUTE'
  ), 'authenticated cannot execute summary RPC';
  assert not has_function_privilege(
    'anon', 'public.get_review_summary(uuid)', 'EXECUTE'
  ), 'anon can execute summary RPC';
  assert not exists (
    select 1
    from pg_catalog.pg_proc procedure,
      lateral pg_catalog.aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
    where procedure.oid = 'public.get_review_summary(uuid)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC can execute summary RPC';
  assert pg_catalog.pg_get_function_result('public.get_review_summary(uuid)'::regprocedure)
    = 'TABLE(review_count bigint, average_rating numeric)',
    'summary RPC exposes an unexpected result contract';
end
$$;

set role authenticated;
set request.jwt.claims to '{"sub":"56000000-0000-4000-8000-000000000001"}';

do $$
declare
  summary record;
begin
  select * into strict summary
  from public.get_review_summary('56000000-0000-4000-8000-000000000011');
  assert summary.review_count = 1001, 'aggregate count was truncated';
  assert summary.average_rating = 3002.0 / 1001.0, 'aggregate average is incorrect';

  select * into strict summary
  from public.get_review_summary('56000000-0000-4000-8000-000000000013');
  assert summary.review_count = 0, 'empty dataset count is not zero';
  assert summary.average_rating is null, 'empty dataset average must be null';
end
$$;

do $$
begin
  perform * from public.get_review_summary('56000000-0000-4000-8000-000000000012');
  raise exception 'foreign target summary succeeded';
exception
  when sqlstate 'P0002' then null;
end
$$;

set request.jwt.claims to '{"sub":"56000000-0000-4000-8000-000000000002"}';
do $$
begin
  perform * from public.get_review_summary('56000000-0000-4000-8000-000000000011');
  raise exception 'foreign user summary succeeded';
exception
  when sqlstate 'P0002' then null;
end
$$;

reset role;
rollback;

\echo 'ok - review summary is exact, owner-authorized, invoker-secured, and column-minimal'
