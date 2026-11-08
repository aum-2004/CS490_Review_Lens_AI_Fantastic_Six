-- Issue #46: bound review rows in PostgreSQL and close direct browser/Data API inserts.
-- Application limits: src/app/api/analysis-targets/[targetId]/reviews/review-input.ts.
-- Existing rows are never changed here. A violation aborts the migration with per-column counts
-- so an operator can remediate the named rows manually before retrying.

begin;

alter table public.reviews
  add constraint reviews_review_text_length
    check (char_length(review_text) <= 10000) not valid,
  add constraint reviews_reviewer_name_length
    check (reviewer_name is null or char_length(reviewer_name) <= 200) not valid,
  add constraint reviews_source_review_id_length
    check (source_review_id is null or char_length(source_review_id) <= 256) not valid,
  add constraint reviews_review_url_length
    check (review_url is null or char_length(review_url) <= 2048) not valid,
  add constraint reviews_source_metadata_size
    check (source_metadata is null or octet_length(source_metadata::text) <= 32768) not valid;

do $$
declare
  review_text_violations bigint;
  reviewer_name_violations bigint;
  source_review_id_violations bigint;
  review_url_violations bigint;
  source_metadata_violations bigint;
begin
  select
    count(*) filter (where char_length(review_text) > 10000),
    count(*) filter (where reviewer_name is not null and char_length(reviewer_name) > 200),
    count(*) filter (where source_review_id is not null and char_length(source_review_id) > 256),
    count(*) filter (where review_url is not null and char_length(review_url) > 2048),
    count(*) filter (
      where source_metadata is not null and octet_length(source_metadata::text) > 32768
    )
  into
    review_text_violations,
    reviewer_name_violations,
    source_review_id_violations,
    review_url_violations,
    source_metadata_violations
  from public.reviews;

  if review_text_violations + reviewer_name_violations + source_review_id_violations
      + review_url_violations + source_metadata_violations > 0 then
    raise exception 'Existing reviews violate Issue #46 size limits'
      using
        errcode = '23514',
        detail = format(
          'review_text=%s, reviewer_name=%s, source_review_id=%s, review_url=%s, source_metadata=%s',
          review_text_violations,
          reviewer_name_violations,
          source_review_id_violations,
          review_url_violations,
          source_metadata_violations
        ),
        hint = 'Manually remediate the reported rows without truncating or deleting data, then retry.';
  end if;
end
$$;

alter table public.reviews validate constraint reviews_review_text_length;
alter table public.reviews validate constraint reviews_reviewer_name_length;
alter table public.reviews validate constraint reviews_source_review_id_length;
alter table public.reviews validate constraint reviews_review_url_length;
alter table public.reviews validate constraint reviews_source_metadata_size;

-- Column grants are independent of table-wide grants, so revoke both forms explicitly.
revoke insert on table public.reviews from public, anon, authenticated;
revoke insert (
  analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date,
  review_url, source_metadata
) on table public.reviews from public, anon, authenticated;

create function public.insert_reviews(p_target_id text, p_rows jsonb)
returns setof public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  caller_id uuid := auth.uid();
begin
  begin
    target_id := p_target_id::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Target unavailable' using errcode = 'P0002';
  end;

  if caller_id is null or not exists (
    select 1
    from public.analysis_targets target
    where target.id = target_id and target.owner_id = caller_id
  ) then
    raise exception 'Target unavailable' using errcode = 'P0002';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) not between 1 and 100
    or octet_length(p_rows::text) > 2097152 then
    raise exception 'Invalid review batch' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as row(value)
    where jsonb_typeof(row.value) is distinct from 'object'
      or exists (
        select 1
        from jsonb_object_keys(row.value) as key(name)
        where key.name not in (
          'review_text', 'rating', 'source_review_id', 'reviewer_name', 'review_date',
          'review_url', 'source_metadata'
        )
      )
      or jsonb_typeof(row.value->'review_text') is distinct from 'string'
      or coalesce(btrim(row.value->>'review_text'), '') = ''
      or char_length(row.value->>'review_text') > 10000
      or jsonb_typeof(row.value->'rating') is distinct from 'number'
      or (row.value->>'rating')::numeric not between 1 and 5
      or (
        row.value ? 'source_review_id'
        and row.value->'source_review_id' <> 'null'::jsonb
        and (
          jsonb_typeof(row.value->'source_review_id') is distinct from 'string'
          or char_length(row.value->>'source_review_id') > 256
        )
      )
      or (
        row.value ? 'reviewer_name'
        and row.value->'reviewer_name' <> 'null'::jsonb
        and (
          jsonb_typeof(row.value->'reviewer_name') is distinct from 'string'
          or char_length(row.value->>'reviewer_name') > 200
        )
      )
      or (
        row.value ? 'review_date'
        and row.value->'review_date' <> 'null'::jsonb
        and (
          jsonb_typeof(row.value->'review_date') is distinct from 'string'
          or char_length(row.value->>'review_date') > 64
        )
      )
      or (
        row.value ? 'review_url'
        and row.value->'review_url' <> 'null'::jsonb
        and (
          jsonb_typeof(row.value->'review_url') is distinct from 'string'
          or char_length(row.value->>'review_url') > 2048
          or row.value->>'review_url' !~* '^https?://'
        )
      )
      or (
        row.value ? 'source_metadata'
        and row.value->'source_metadata' <> 'null'::jsonb
        and (
          jsonb_typeof(row.value->'source_metadata') is distinct from 'object'
          or octet_length((row.value->'source_metadata')::text) > 32768
        )
      )
  ) then
    raise exception 'Invalid review batch' using errcode = '23514';
  end if;

  return query
    insert into public.reviews as inserted (
      analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date,
      review_url, source_metadata
    )
    select
      target_id,
      review.review_text,
      review.rating,
      review.source_review_id,
      review.reviewer_name,
      review.review_date,
      review.review_url,
      review.source_metadata
    from jsonb_to_recordset(p_rows) as review(
      review_text text,
      rating numeric,
      source_review_id text,
      reviewer_name text,
      review_date timestamptz,
      review_url text,
      source_metadata jsonb
    )
    returning inserted.*;
end
$$;

comment on function public.insert_reviews(text, jsonb) is
  'Atomically inserts a validated review batch for a target owned by auth.uid(). This prevents '
  'direct table writes but does not establish provider-authenticated review provenance: an '
  'authenticated owner may submit reviews through the protected application endpoint.';

revoke all on function public.insert_reviews(text, jsonb) from public, anon, authenticated;
grant execute on function public.insert_reviews(text, jsonb) to authenticated;

commit;
