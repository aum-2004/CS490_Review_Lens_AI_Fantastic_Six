-- S3-002: real grants/RLS, literal SQL-looking names, and dataset preservation.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id) values ('a3000000-0000-4000-8000-000000000001'), ('a3000000-0000-4000-8000-000000000002');
insert into public.analysis_targets (id, owner_id, name, platform, source_url, google_place_id) values
 ('a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000001', 'Original', 'google_maps', 'https://maps.google.com/?cid=123', 'saved-place');
insert into public.reviews (analysis_target_id, review_text, rating) values
 ('a3000000-0000-4000-8000-000000000003', 'Saved review', 5);
insert into public.ingestion_attempts (analysis_target_id, owner_id, source_url, submitted_query, query_kind, expected_place_id) values
 ('a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000001', 'https://maps.google.com/?cid=123', 'saved-place', 'place_id', 'saved-place');
insert into public.review_question_reservations (owner_id) values ('a3000000-0000-4000-8000-000000000001');
create temp table rename_before as select to_jsonb(t) - 'name' as data from public.analysis_targets t where id = 'a3000000-0000-4000-8000-000000000003';
create temp table rename_reviews_before as select to_jsonb(r) as data from public.reviews r where analysis_target_id = 'a3000000-0000-4000-8000-000000000003';
create temp table rename_ingestion_before as select to_jsonb(a) as data from public.ingestion_attempts a where analysis_target_id = 'a3000000-0000-4000-8000-000000000003';
create temp table rename_quota_before as select to_jsonb(q) as data from public.review_question_reservations q where owner_id = 'a3000000-0000-4000-8000-000000000001';
grant select on rename_before, rename_reviews_before to authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a3000000-0000-4000-8000-000000000001"}';
update public.analysis_targets set name = $name$Melissa'); DROP TABLE reviews;--$name$ where id = 'a3000000-0000-4000-8000-000000000003';
do $$
declare invalid_name text; valid_name text; column_name text; codepoint integer;
begin
  assert (select name from public.analysis_targets where id = 'a3000000-0000-4000-8000-000000000003') = $name$Melissa'); DROP TABLE reviews;--$name$, 'SQL-looking name was not stored literally';
  assert (select to_jsonb(t) - 'name' from public.analysis_targets t where id = 'a3000000-0000-4000-8000-000000000003') = (select data from rename_before), 'rename changed target identity/source';
  assert (select to_jsonb(r) from public.reviews r where analysis_target_id = 'a3000000-0000-4000-8000-000000000003') = (select data from rename_reviews_before), 'rename changed reviews';
  assert has_column_privilege('authenticated', 'public.analysis_targets', 'name', 'UPDATE');
  assert not has_column_privilege('authenticated', 'public.analysis_targets', 'source_url', 'UPDATE');
  assert not has_column_privilege('authenticated', 'public.analysis_targets', 'owner_id', 'UPDATE');
  begin
    update public.analysis_targets set name = '' where id = 'a3000000-0000-4000-8000-000000000003';
    raise exception 'empty name accepted';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    update public.analysis_targets set name = repeat('x',121) where id = 'a3000000-0000-4000-8000-000000000003';
    raise exception 'overlong name accepted';
  exception when check_violation then null; end;
  -- Direct Supabase Data API writes must not bypass the application's name rules.
  foreach invalid_name in array array[E'line\nbreak', chr(133), chr(8203), chr(8204) || chr(8205), chr(160), chr(65279), 'visible' || chr(8238), chr(917505), chr(113824)] loop
    begin
      update public.analysis_targets set name = invalid_name where id = 'a3000000-0000-4000-8000-000000000003';
      raise exception 'direct owner update accepted an unusable name';
    exception when insufficient_privilege or check_violation then null; end;
  end loop;
  for codepoint in 1..159 loop
    if codepoint < 32 or codepoint >= 127 then
      begin
        update public.analysis_targets set name = 'Unsafe' || chr(codepoint) where id = 'a3000000-0000-4000-8000-000000000003';
        raise exception 'direct owner update accepted control U+%', to_hex(codepoint);
      exception when insufficient_privilege or check_violation then null; end;
    end if;
  end loop;
  foreach valid_name in array array['Melissa''s café', '東京のカフェ', 'Family ' || chr(128105) || chr(8205) || chr(128103), 'Cafe ' || chr(8204) || ' name', repeat(chr(128512), 120)] loop
    update public.analysis_targets set name = valid_name where id = 'a3000000-0000-4000-8000-000000000003';
    assert (select name from public.analysis_targets where id = 'a3000000-0000-4000-8000-000000000003') = valid_name, 'usable Unicode name was rejected';
  end loop;
  foreach column_name in array array['id', 'owner_id', 'platform', 'source_url', 'google_place_id', 'created_at'] loop
    assert not has_column_privilege('authenticated', 'public.analysis_targets', column_name, 'UPDATE'), 'rename grant permits other column writes';
  end loop;
end $$;
set local request.jwt.claims to '{"sub":"a3000000-0000-4000-8000-000000000002"}';
do $$
declare affected integer;
begin
  update public.analysis_targets set name = 'Stolen' where id = 'a3000000-0000-4000-8000-000000000003';
  get diagnostics affected = row_count;
  assert affected = 0, 'foreign rename was permitted';
end $$;
reset role;
do $$
begin
  assert (select to_jsonb(t) - 'name' from public.analysis_targets t where id = 'a3000000-0000-4000-8000-000000000003') = (select data from rename_before), 'rename series changed target identity/source';
  assert (select to_jsonb(r) from public.reviews r where analysis_target_id = 'a3000000-0000-4000-8000-000000000003') = (select data from rename_reviews_before), 'rename series changed saved reviews';
  assert (select to_jsonb(a) from public.ingestion_attempts a where analysis_target_id = 'a3000000-0000-4000-8000-000000000003') = (select data from rename_ingestion_before), 'rename changed ingestion state';
  assert (select to_jsonb(q) from public.review_question_reservations q where owner_id = 'a3000000-0000-4000-8000-000000000001') = (select data from rename_quota_before), 'rename changed Q&A quota data';
end $$;
rollback;
\echo 'ok - S3-002 renames only an owned name and keeps SQL-looking text literal'
