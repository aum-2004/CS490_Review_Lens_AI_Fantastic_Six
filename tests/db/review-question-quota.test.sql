\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values
 ('99999999-9999-4999-8999-999999999991'),
 ('99999999-9999-4999-8999-999999999992');

do $$ begin
  assert (select relrowsecurity from pg_class where oid = 'public.review_question_reservations'::regclass);
  assert not has_table_privilege('authenticated', 'public.review_question_reservations', 'SELECT');
  assert not has_table_privilege('authenticated', 'public.review_question_reservations', 'INSERT');
  assert not has_table_privilege('authenticated', 'public.review_question_reservations', 'UPDATE');
  assert not has_table_privilege('authenticated', 'public.review_question_reservations', 'DELETE');
  assert not has_function_privilege('anon', 'public.reserve_review_question()', 'EXECUTE');
  assert has_function_privilege('authenticated', 'public.reserve_review_question()', 'EXECUTE');
end $$;

set local role authenticated;
set local request.jwt.claims to '{}';
do $$ begin
  begin
    perform public.reserve_review_question();
    raise exception 'Missing identity was accepted';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999999991"}';
do $$ declare i integer; begin
  for i in 1..5 loop
    assert public.reserve_review_question() = 5 - i;
  end loop;
  begin
    perform public.reserve_review_question();
    raise exception 'Sixth paid reservation was allowed';
  exception when raise_exception then
    if sqlerrm <> 'QA_DAILY_LIMIT' then raise; end if;
  end;
  begin
    delete from public.review_question_reservations;
    raise exception 'User reset quota through direct table access';
  exception when insufficient_privilege then null; end;
end $$;

set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999999992"}';
do $$ begin assert public.reserve_review_question() = 4; end $$;
reset role;
do $$ begin
  assert (select count(*) from public.review_question_reservations where owner_id = '99999999-9999-4999-8999-999999999991') = 5;
  assert (select count(*) from public.review_question_reservations where owner_id = '99999999-9999-4999-8999-999999999992') = 1;
end $$;

-- A slot expires independently after 24h; a recent slot must remain charged.
update public.review_question_reservations set reserved_at = clock_timestamp() - interval '25 hours'
where id = (select id from public.review_question_reservations
  where owner_id = '99999999-9999-4999-8999-999999999991' order by reserved_at limit 1);
set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999999991"}';
do $$ begin
  assert public.reserve_review_question() = 0;
  begin
    perform public.reserve_review_question();
    raise exception 'Recent reservations were incorrectly refunded';
  exception when raise_exception then
    if sqlerrm <> 'QA_DAILY_LIMIT' then raise; end if;
  end;
end $$;
reset role;
rollback;
