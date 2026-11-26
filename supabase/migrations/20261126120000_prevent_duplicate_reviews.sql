-- S3-011: Prevent duplicate Reviews during re-ingestion (S3-BR-017, S3-BR-018).
-- Strategy: docs/s3-011-duplicate-reviews.md. Application twin: src/services/reviews/review-identity.ts.
--
-- Every review has one deterministic identity key, unique per AnalysisTarget:
--   'sid:' || source review id     when the source supplied a non-blank id (Outscraper review_id)
--   'fp1:' || sha256 hex            of a normalized fingerprint otherwise:
--     'v1|' || field(reviewer name) || '|' || field(review time, UTC epoch ms)
--           || '|' || field(rating, trim_scale text) || '|' || field(review text)
--     field(x) = char_length(x) || ':' || x, or '~' when absent (delimiter-safe).
--     Text and reviewer name: NFC, collapse each whitespace run (explicit set below) to one space,
--     trim, ASCII-only case folding (lower() depends on collation, so it is not used).
-- The key is a STORED generated column, so no caller can choose or forge it. A unique index on
-- (analysis_target_id, identity_key) makes repeated or concurrent ingestion unable to store a
-- second row for the same source review. Writers use ON CONFLICT DO NOTHING: the first stored
-- row is kept unchanged, with its id, created_at, and text. Nothing is updated or re-pointed.
--
-- Existing data: rows that already share a key within a target are reduced to the oldest row by
-- (created_at, id) before the index is created. No table, view, or function references
-- reviews.id (Q&A citations are computed per request and never persisted), so removing the
-- newer copies leaves no dangling reference.
--
-- Known limitation: two genuinely distinct reviews with no source id, the same reviewer name,
-- time, rating, and normalized text are indistinguishable and are stored once.
--
-- Do not replace review_identity_key in place: stored keys would no longer match new rows.
-- A changed rule needs a new prefix (for example 'fp2:') and a migration that recomputes keys.

begin;

create function public.review_identity_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    pg_catalog.translate(
      pg_catalog.btrim(
        pg_catalog.regexp_replace(
          pg_catalog.normalize(p_value, 'NFC'),
          '[\t\n\v\f\r    -     　﻿]+',
          ' ',
          'g'
        ),
        ' '
      ),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz'
    ),
    ''
  )
$$;

comment on function public.review_identity_text(text) is
  'S3-011 fingerprint normalization: NFC, collapsed whitespace, trimmed, ASCII case folded. '
  'Must stay identical to normalizeIdentityText in src/services/reviews/review-identity.ts.';

create function public.review_identity_key(
  p_source_review_id text,
  p_reviewer_name text,
  p_review_date timestamptz,
  p_rating numeric,
  p_review_text text
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when source_id.value is not null then 'sid:' || source_id.value
    else 'fp1:' || pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        'v1'
          || '|' || coalesce(pg_catalog.char_length(reviewer.value) || ':' || reviewer.value, '~')
          || '|' || coalesce(pg_catalog.char_length(review_time.value) || ':' || review_time.value, '~')
          || '|' || coalesce(pg_catalog.char_length(rating.value) || ':' || rating.value, '~')
          || '|' || coalesce(pg_catalog.char_length(body.value) || ':' || body.value, '~'),
        'UTF8'
      )),
      'hex'
    )
  end
  from
    (select nullif(pg_catalog.regexp_replace(
      p_source_review_id,
      '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$',
      '',
      'g'
    ), '') as value) as source_id,
    (select public.review_identity_text(p_reviewer_name) as value) as reviewer,
    (select pg_catalog.floor(extract(epoch from p_review_date) * 1000)::bigint::text as value)
      as review_time,
    (select pg_catalog.trim_scale(p_rating)::text as value) as rating,
    (select public.review_identity_text(p_review_text) as value) as body
$$;

comment on function public.review_identity_key(text, text, timestamptz, numeric, text) is
  'S3-011 deterministic review identity key, unique per AnalysisTarget. Must stay identical to '
  'reviewIdentityKey in src/services/reviews/review-identity.ts (shared golden vectors).';

-- Only the table owner evaluates these (generated column, SECURITY DEFINER writers, migration).
revoke all on function public.review_identity_text(text) from public, anon, authenticated;
revoke all on function public.review_identity_key(text, text, timestamptz, numeric, text)
  from public, anon, authenticated;

-- ADD COLUMN takes ACCESS EXCLUSIVE until commit, so no row can be written between the cleanup
-- below and the unique index. Existing rows are computed by the table rewrite.
alter table public.reviews
  add column identity_key text not null generated always as (
    public.review_identity_key(source_review_id, reviewer_name, review_date, rating, review_text)
  ) stored;

do $$
declare
  removed bigint;
begin
  with ranked as (
    select review.id,
      pg_catalog.row_number() over (
        partition by review.analysis_target_id, review.identity_key
        order by review.created_at, review.id
      ) as copy_number
    from public.reviews review
  )
  delete from public.reviews review
  using ranked
  where ranked.id = review.id and ranked.copy_number > 1;
  get diagnostics removed = row_count;
  if removed > 0 then
    raise notice 'S3-011 removed % duplicate review rows; the oldest row of each was kept', removed;
  end if;
end
$$;

create unique index reviews_target_identity_key_idx
  on public.reviews (analysis_target_id, identity_key);

comment on column public.reviews.identity_key is
  'S3-011 identity: sid:<source id> or fp1:<sha256 fingerprint>. Generated; unique per target.';
comment on column public.reviews.source_review_id is
  'Review id from the source platform. A non-blank id is the review identity within its target '
  '(S3-011, reviews_target_identity_key_idx).';

-- A completion whose reviews are all already stored saved 0 new rows but still succeeded, and
-- the target still has reviews. Before S3-011 a successful completion always inserted rows.
alter table public.ingestion_attempts drop constraint ingestion_attempt_lifecycle;
alter table public.ingestion_attempts add constraint ingestion_attempt_lifecycle check (
  (status = 'processing' and finished_at is null and saved_count = 0 and error_code is null)
  or (status = 'succeeded' and finished_at is not null and saved_count >= 0 and error_code is null
      and provider_request_id is not null and verified_identity is not null and identity_basis is not null)
  or (status = 'failed' and finished_at is not null and saved_count = 0 and error_code is not null)
);

-- Same as 20261107030000 except the review insert, which now collapses repeated reviews and
-- skips reviews already stored for the target. saved_count counts new rows only.
create or replace function public.finish_ingestion_attempt(
  p_attempt_id uuid, p_owner_id uuid, p_reviews jsonb, p_skipped_count integer,
  p_identity jsonb, p_error_code text
) returns public.ingestion_attempts language plpgsql security definer set search_path = '' as $$
declare attempt public.ingestion_attempts; saved integer;
begin
  select a.* into attempt from public.ingestion_attempts a join public.analysis_targets t on t.id = a.analysis_target_id
    where a.id = p_attempt_id and a.owner_id = p_owner_id and t.owner_id = p_owner_id for update of a;
  if not found then raise exception 'Target unavailable' using errcode = 'P0002'; end if;
  if attempt.status <> 'processing' then return attempt; end if;
  -- Recheck the deadline under the same lock even if the provider fetch began before expiry.
  if attempt.provider_request_id is not null and attempt.started_at <= clock_timestamp() - interval '4 hours' then
    update public.ingestion_attempts set status = 'failed', error_code = 'RESULT_WINDOW_EXPIRED',
      finished_at = clock_timestamp() where id = attempt.id returning * into attempt;
    return attempt;
  end if;
  if p_error_code = 'STORAGE_NOT_APPROVED' then return attempt; end if;
  -- A lookup/configuration/transport failure is not evidence of a failed paid job.
  if attempt.provider_request_id is not null and p_error_code is not null
    and p_error_code not in ('INGESTION_FAILED', 'SOURCE_IDENTITY_UNVERIFIED', 'NO_REVIEWS')
    then return attempt; end if;
  if jsonb_typeof(p_reviews) <> 'array' or p_skipped_count < 0 then raise exception 'Invalid completion'; end if;
  if p_error_code is null then
    if attempt.provider_request_id is null or jsonb_array_length(p_reviews) = 0 or p_identity is null
      then raise exception 'Missing verified completion'; end if;
    -- Match the provider request's 30-review limit and the protected review API's
    -- field sizes. This is independent of HTTP/app validation and commits nothing on breach.
    if jsonb_array_length(p_reviews) > 30 or octet_length(p_reviews::text) > 2097152
      or octet_length(p_identity::text) > 16384 or char_length(p_identity->>'businessName') > 200
      or exists (select 1 from jsonb_array_elements(p_reviews) r where
        char_length(r->>'text') > 10000 or char_length(r->>'reviewer_name') > 200
        or char_length(r->>'source_review_id') > 256 or char_length(r->>'review_url') > 2048
        -- jsonb::text inserts spaces; allow rendering headroom for 16 KiB compact app JSON.
        or char_length(r->>'review_date') > 64 or octet_length((r->'source_metadata')::text) > 32768)
      then raise exception 'INGESTION_RESULT_LIMIT' using errcode = '22023'; end if;
    if jsonb_typeof(p_identity->'placeId') is distinct from 'string'
      or p_identity->>'placeId' !~ '^ChIJ[A-Za-z0-9_-]+$'
      or jsonb_typeof(p_identity->'businessName') is distinct from 'string'
      or coalesce(btrim(p_identity->>'businessName'), '') = ''
      or (attempt.query_kind = 'place_id' and p_identity->>'placeId' is distinct from attempt.expected_place_id)
      then raise exception 'Identity mismatch'; end if;
    -- S3-011: first occurrence of each identity key wins; stored reviews are never changed.
    insert into public.reviews(analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date, review_url, source_metadata)
      select attempt.analysis_target_id, r.text, r.rating, r.source_review_id, r.reviewer_name, r.review_date, r.review_url, r.source_metadata
      from (
        select distinct on (public.review_identity_key(candidate.source_review_id, candidate.reviewer_name,
            candidate.review_date, candidate.rating, candidate.text))
          candidate.*, element.ordinal
        from jsonb_array_elements(p_reviews) with ordinality as element(value, ordinal),
          lateral jsonb_to_record(element.value) as candidate(text text, rating numeric, source_review_id text,
            reviewer_name text, review_date timestamptz, review_url text, source_metadata jsonb)
        order by public.review_identity_key(candidate.source_review_id, candidate.reviewer_name,
            candidate.review_date, candidate.rating, candidate.text), element.ordinal
      ) as r
      order by r.ordinal
      on conflict (analysis_target_id, identity_key) do nothing;
    get diagnostics saved = row_count;
  else
    if jsonb_array_length(p_reviews) <> 0 then raise exception 'Failed attempt cannot save reviews'; end if;
    saved := 0;
  end if;
  update public.ingestion_attempts set status = case when p_error_code is null then 'succeeded' else 'failed' end,
    finished_at = clock_timestamp(), saved_count = saved, skipped_count = p_skipped_count,
    verified_identity = p_identity, error_code = p_error_code,
    identity_basis = case when p_error_code is null then
      case when attempt.query_kind = 'place_id' then 'expected_place_id' else 'provider_resolved' end
      else null end
    where id = attempt.id returning * into attempt;
  return attempt;
end $$;

revoke all on function public.finish_ingestion_attempt(uuid, uuid, jsonb, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.finish_ingestion_attempt(uuid, uuid, jsonb, integer, jsonb, text) to service_role;

-- Same as 20261108000000 except the insert: repeated reviews in the batch collapse to their first
-- occurrence, reviews already stored for the target are skipped, and only new rows are returned.
create or replace function public.insert_reviews(p_target_id text, p_rows jsonb)
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

  -- MAX_REQUEST_BODY_BYTES in review-input.ts is 2 MiB before normalization. Mapping to the RPC
  -- adds null fields and ISO dates, while PostgreSQL JSONB rendering can expand compact metadata.
  -- Eight MiB accommodates every route-valid batch that still meets the per-field database limits
  -- while retaining a finite aggregate bound for callers that invoke this RPC directly.
  if jsonb_typeof(p_rows) is distinct from 'array'
    or jsonb_array_length(p_rows) not between 1 and 100
    or octet_length(p_rows::text) > 8388608 then
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
    from (
      select distinct on (public.review_identity_key(
          candidate.source_review_id, candidate.reviewer_name, candidate.review_date,
          candidate.rating, candidate.review_text
        ))
        candidate.*, element.ordinal
      from jsonb_array_elements(p_rows) with ordinality as element(value, ordinal),
        lateral jsonb_to_record(element.value) as candidate(
          review_text text,
          rating numeric,
          source_review_id text,
          reviewer_name text,
          review_date timestamptz,
          review_url text,
          source_metadata jsonb
        )
      order by public.review_identity_key(
          candidate.source_review_id, candidate.reviewer_name, candidate.review_date,
          candidate.rating, candidate.review_text
        ),
        element.ordinal
    ) as review
    order by review.ordinal
    on conflict (analysis_target_id, identity_key) do nothing
    returning inserted.*;
end
$$;

comment on function public.insert_reviews(text, jsonb) is
  'Atomically inserts a validated review batch for a target owned by auth.uid(). This prevents '
  'direct table writes but does not establish provider-authenticated review provenance: an '
  'authenticated owner may submit reviews through the protected application endpoint. '
  'S3-011: returns only new rows; reviews already stored for the target are skipped.';

revoke all on function public.insert_reviews(text, jsonb) from public, anon, authenticated;
grant execute on function public.insert_reviews(text, jsonb) to authenticated;

commit;
