-- S3-006: Q&A history persistence, ownership, citation integrity and privileges.

\set ON_ERROR_STOP on
\set QUIET on

begin;

insert into auth.users (id) values
  ('36000000-0000-4000-8000-000000000001'),
  ('36000000-0000-4000-8000-000000000002');

insert into public.analysis_targets (id, owner_id, name, platform, source_url) values
  ('36000000-0000-4000-8000-000000000011', '36000000-0000-4000-8000-000000000001',
   'History target A', 'google_maps', 'https://maps.google.com/?cid=3601'),
  ('36000000-0000-4000-8000-000000000012', '36000000-0000-4000-8000-000000000001',
   'History target A2', 'google_maps', 'https://maps.google.com/?cid=3602'),
  ('36000000-0000-4000-8000-000000000013', '36000000-0000-4000-8000-000000000002',
   'History target B', 'google_maps', 'https://maps.google.com/?cid=3603');

insert into public.reviews (id, analysis_target_id, review_text, rating) values
  ('36000000-0000-4000-8000-000000000101', '36000000-0000-4000-8000-000000000011',
   'Great bread', 5),
  ('36000000-0000-4000-8000-000000000102', '36000000-0000-4000-8000-000000000011',
   'Slow service', 2),
  ('36000000-0000-4000-8000-000000000103', '36000000-0000-4000-8000-000000000012',
   'Other analysis review', 4),
  ('36000000-0000-4000-8000-000000000104', '36000000-0000-4000-8000-000000000013',
   'Foreign review', 3);

-- Privileges: browser roles read through RLS only and write only through the RPC.
do $$
declare
  signature constant regprocedure :=
    'public.record_review_qa_exchange(uuid, text, text, text, text, uuid[])'::regprocedure;
  function_config text[];
  function_security_definer boolean;
begin
  assert has_table_privilege('authenticated', 'public.review_qa_exchanges', 'SELECT'),
    'authenticated cannot read history';
  assert not has_table_privilege('authenticated', 'public.review_qa_exchanges',
    'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
    'authenticated has a direct write privilege on history';
  assert not has_table_privilege('anon', 'public.review_qa_exchanges',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
    'anon has a privilege on history';
  assert (select relrowsecurity from pg_class where oid = 'public.review_qa_exchanges'::regclass),
    'RLS is not enabled on history';

  select procedure.prosecdef, procedure.proconfig
  into strict function_security_definer, function_config
  from pg_catalog.pg_proc procedure where procedure.oid = signature;
  assert function_security_definer, 'history RPC must be SECURITY DEFINER';
  assert function_config = array['search_path=""'], 'history RPC search_path is not fixed';
  assert has_function_privilege('authenticated', signature, 'EXECUTE'),
    'authenticated cannot record history';
  assert not has_function_privilege('anon', signature, 'EXECUTE'), 'anon can record history';
  assert not exists (
    select 1
    from pg_catalog.pg_proc procedure,
      lateral pg_catalog.aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) acl
    where procedure.oid = signature and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ), 'PUBLIC can record history';
end
$$;

-- Anonymous callers cannot record history.
set role anon;
do $$
begin
  perform public.record_review_qa_exchange(
    '36000000-0000-4000-8000-000000000011', 'q', 'out_of_scope', 'a', 'v1', '{}');
  assert false, 'anon recorded history';
exception when insufficient_privilege then null;
end
$$;

set role authenticated;
set request.jwt.claims to '{"sub":"36000000-0000-4000-8000-000000000001"}';

-- Owner records exchanges; they come back in order with citations intact.
do $$
declare
  first_row record;
  second_row record;
  rows_seen integer;
begin
  select * into strict first_row from public.record_review_qa_exchange(
    '36000000-0000-4000-8000-000000000011', 'What do people like?', 'answered',
    'Bread is great.', 'v1',
    array['36000000-0000-4000-8000-000000000102', '36000000-0000-4000-8000-000000000101']::uuid[]);
  select * into strict second_row from public.record_review_qa_exchange(
    '36000000-0000-4000-8000-000000000011', 'Is there parking?', 'insufficient_evidence',
    'These reviews don''t contain enough information to answer that question.', 'v1', null);
  assert first_row.id is not null and second_row.created_at > first_row.created_at,
    'exchanges were not stored in order';

  select count(*) into rows_seen from public.review_qa_exchanges
  where analysis_target_id = '36000000-0000-4000-8000-000000000011';
  assert rows_seen = 2, 'owner cannot read their history';

  assert (
    select cited_review_ids from public.review_qa_exchanges where id = first_row.id
  ) = array['36000000-0000-4000-8000-000000000102', '36000000-0000-4000-8000-000000000101']::uuid[],
    'citation order was not preserved';
  assert (
    select array_agg(question order by created_at, id) from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000011'
  ) = array['What do people like?', 'Is there parking?'], 'history is out of order';
end
$$;

-- History of one analysis never appears under another (S3-BR-013).
do $$
begin
  perform public.record_review_qa_exchange(
    '36000000-0000-4000-8000-000000000012', 'Second analysis question', 'out_of_scope',
    'I can only answer questions about these reviews.', 'v1', '{}');
  assert (
    select count(*) from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000012'
  ) = 1, 'second analysis history is wrong';
  assert not exists (
    select 1 from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000011'
      and question = 'Second analysis question'
  ), 'history leaked across analyses';
end
$$;

-- Citations must belong to the same analysis, be unique, and match the outcome.
do $$
declare
  bad_cases text[][] := array[
    -- review of the owner's other analysis
    array['answered', '{36000000-0000-4000-8000-000000000103}'],
    -- another user's review
    array['answered', '{36000000-0000-4000-8000-000000000104}'],
    -- a review that does not exist
    array['answered', '{36000000-0000-4000-8000-000000000999}'],
    -- duplicate citation
    array['answered', '{36000000-0000-4000-8000-000000000101,36000000-0000-4000-8000-000000000101}'],
    -- answered without evidence
    array['answered', '{}'],
    -- a decline with evidence
    array['out_of_scope', '{36000000-0000-4000-8000-000000000101}'],
    -- unknown outcome
    array['declined_general_knowledge', '{}']
  ];
  bad text[];
begin
  foreach bad slice 1 in array bad_cases loop
    begin
      perform public.record_review_qa_exchange(
        '36000000-0000-4000-8000-000000000011', 'Bad citations', bad[1], 'Answer', 'v1',
        bad[2]::uuid[]);
      assert false, format('invalid exchange accepted: %s %s', bad[1], bad[2]);
    exception when check_violation then null;
    end;
  end loop;
end
$$;

-- Empty or oversized text is rejected by the table constraints.
do $$
declare
  bad_cases text[][] := array[
    array['   ', 'Answer', 'v1'],
    array[repeat('q', 2001), 'Answer', 'v1'],
    array['Question', ' ', 'v1'],
    array['Question', repeat('a', 8001), 'v1'],
    array['Question', 'Answer', '']
  ];
  bad text[];
begin
  foreach bad slice 1 in array bad_cases loop
    begin
      perform public.record_review_qa_exchange(
        '36000000-0000-4000-8000-000000000011', bad[1], 'out_of_scope', bad[2], bad[3], '{}');
      assert false, 'invalid text accepted';
    exception when check_violation then null;
    end;
  end loop;
end
$$;

-- Another user cannot write to or read the owner's history.
set request.jwt.claims to '{"sub":"36000000-0000-4000-8000-000000000002"}';
do $$
begin
  begin
    perform public.record_review_qa_exchange(
      '36000000-0000-4000-8000-000000000011', 'Intruder question', 'out_of_scope', 'Answer',
      'v1', '{}');
    assert false, 'another user recorded history on a foreign analysis';
  exception when no_data_found then null;
  end;
  assert not exists (
    select 1 from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000011'
  ), 'another user can read the owner''s history';
end
$$;

-- No signed-in user and a missing target get the same denial.
set request.jwt.claims to '';
do $$
begin
  perform public.record_review_qa_exchange(
    '36000000-0000-4000-8000-000000000011', 'q', 'out_of_scope', 'a', 'v1', '{}');
  assert false, 'history recorded without a user';
exception when no_data_found then null;
end
$$;

-- The history cap holds (200 per analysis).
reset role;
insert into public.review_qa_exchanges (analysis_target_id, question, outcome, answer, prompt_version)
select '36000000-0000-4000-8000-000000000012', 'filler ' || n, 'out_of_scope', 'filler', 'v1'
from generate_series(1, 199) n;

set role authenticated;
set request.jwt.claims to '{"sub":"36000000-0000-4000-8000-000000000001"}';
do $$
begin
  perform public.record_review_qa_exchange(
    '36000000-0000-4000-8000-000000000012', 'Over the cap', 'out_of_scope', 'Answer', 'v1', '{}');
  assert false, 'history cap not enforced';
exception when raise_exception then
  assert sqlerrm = 'QA_HISTORY_FULL', 'unexpected cap error';
end
$$;

-- Removing a cited review keeps the exchange and its recorded citation IDs.
reset role;
delete from public.reviews where id = '36000000-0000-4000-8000-000000000102';
do $$
begin
  assert (
    select cited_review_ids from public.review_qa_exchanges where question = 'What do people like?'
  ) = array['36000000-0000-4000-8000-000000000102', '36000000-0000-4000-8000-000000000101']::uuid[],
    'history changed when a cited review was removed';
end
$$;

-- Deleting the analysis deletes its history and nothing else's.
delete from public.analysis_targets where id = '36000000-0000-4000-8000-000000000011';
do $$
begin
  assert not exists (
    select 1 from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000011'
  ), 'history survived analysis deletion';
  assert (
    select count(*) from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000012'
  ) = 200, 'deleting one analysis removed another analysis''s history';
end
$$;

-- S3-005's owner delete removes the history; another user's delete does not.
set role authenticated;
set request.jwt.claims to '{"sub":"36000000-0000-4000-8000-000000000002"}';
do $$
begin
  assert not public.delete_owned_analysis('36000000-0000-4000-8000-000000000012'),
    'another user deleted the analysis';
end
$$;
reset role;
do $$
begin
  assert (
    select count(*) from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000012'
  ) = 200, 'a foreign delete removed history';
end
$$;

set role authenticated;
set request.jwt.claims to '{"sub":"36000000-0000-4000-8000-000000000001"}';
do $$
begin
  assert public.delete_owned_analysis('36000000-0000-4000-8000-000000000012'),
    'owner could not delete the analysis';
end
$$;
reset role;
do $$
begin
  assert not exists (
    select 1 from public.review_qa_exchanges
    where analysis_target_id = '36000000-0000-4000-8000-000000000012'
  ), 'history survived the owner delete';
end
$$;

rollback;
