-- S3-011: Prevent duplicate Reviews during re-ingestion (S3-BR-017, S3-BR-018), reconciling
-- refreshed reviews with updated source fields as S3-010 requires.
-- Strategy: docs/s3-011-duplicate-reviews.md. Application twin: src/services/reviews/review-identity.ts.
--
-- Identity within ONE AnalysisTarget (never across targets or accounts):
--   source_review_id   nullable, normalized (trimmed; blank -> null). Distinct ids = distinct reviews.
--   review_fingerprint 'fp2:' || sha256 hex, a STORED generated column on every row:
--     author-time tier (reviewer name AND review time present): 'v2|author-time|' f(name) '|' f(ms)
--     content tier (either missing): 'v2|content|' f(name) '|' f(ms) '|' f(rating) '|' f(text)
--     f(x) = char_length(x) || ':' || x, or '~' when absent (delimiter-safe). Name and text: NFC,
--     whitespace runs (explicit set below) -> one space, trimmed, ASCII-only case folding.
--
-- Matching (public.merge_target_reviews, one row at a time under a per-target advisory lock):
--   1. incoming id = stored id                                  -> update that row
--   2. incoming id not stored, an id-less row has the fingerprint -> adopt it (set its id)
--   3. no incoming id, a row has the fingerprint                -> update it, preferring an id-less
--      row, then the oldest; a stored id is never cleared
--   4. otherwise                                                -> insert
-- Updates keep id, created_at, and analysis_target_id. Text and rating take the incoming value;
-- optional fields take it only when non-null. A row is written only when a value is distinct,
-- and then updated_at moves. Enforced by partial unique indexes: (target, source_review_id) for
-- rows with an id, and (target, review_fingerprint) for rows without one.
--
-- Existing data: duplicates are merged into the oldest row of each group (by created_at, id),
-- which takes the newest non-null value of every source field; foreign keys that reference a
-- removed copy are re-pointed to the surviving row first.
--
-- Do not replace review_fingerprint in place: stored fingerprints would stop matching new rows.
-- A changed rule needs a new prefix (for example 'fp3:') and a migration that recomputes them.

begin;

lock table public.reviews in access exclusive mode;

create function public.review_source_id(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(pg_catalog.regexp_replace(
    p_value,
    '^[\t\n\v\f\r    -     　﻿]+|[\t\n\v\f\r    -     　﻿]+$',
    '',
    'g'
  ), '')
$$;

comment on function public.review_source_id(text) is
  'S3-011 source id normalization (trim; blank -> null). Must stay identical to '
  'normalizeSourceReviewId in src/services/reviews/review-identity.ts.';

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

create function public.review_fingerprint(
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
  select 'fp2:' || pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      case
        when author.value is not null and review_time.value is not null then
          'v2|author-time'
            || '|' || pg_catalog.char_length(author.value) || ':' || author.value
            || '|' || pg_catalog.char_length(review_time.value) || ':' || review_time.value
        else
          'v2|content'
            || '|' || coalesce(pg_catalog.char_length(author.value) || ':' || author.value, '~')
            || '|' || coalesce(pg_catalog.char_length(review_time.value) || ':' || review_time.value, '~')
            || '|' || coalesce(pg_catalog.char_length(rating.value) || ':' || rating.value, '~')
            || '|' || coalesce(pg_catalog.char_length(body.value) || ':' || body.value, '~')
      end,
      'UTF8'
    )),
    'hex'
  )
  from
    (select public.review_identity_text(p_reviewer_name) as value) as author,
    (select pg_catalog.floor(extract(epoch from p_review_date) * 1000)::bigint::text as value)
      as review_time,
    (select pg_catalog.trim_scale(p_rating)::text as value) as rating,
    (select public.review_identity_text(p_review_text) as value) as body
$$;

comment on function public.review_fingerprint(text, timestamptz, numeric, text) is
  'S3-011 deterministic review fingerprint. Must stay identical to reviewFingerprint in '
  'src/services/reviews/review-identity.ts (shared golden vectors).';

-- Only the table owner evaluates these (generated column, CHECK, SECURITY DEFINER writers).
revoke all on function public.review_source_id(text) from public, anon, authenticated, service_role;
revoke all on function public.review_identity_text(text) from public, anon, authenticated, service_role;
revoke all on function public.review_fingerprint(text, timestamptz, numeric, text)
  from public, anon, authenticated, service_role;

-- Existing ids: one normalized form, so uniqueness cannot be dodged with whitespace.
update public.reviews
set source_review_id = public.review_source_id(source_review_id)
where source_review_id is distinct from public.review_source_id(source_review_id);

-- The table rewrite computes fingerprints for existing rows.
alter table public.reviews
  add column review_fingerprint text not null generated always as (
    public.review_fingerprint(reviewer_name, review_date, rating, review_text)
  ) stored,
  add column updated_at timestamptz;
update public.reviews set updated_at = created_at;
alter table public.reviews
  alter column updated_at set default now(),
  alter column updated_at set not null;

-- ---------------------------------------------------------------------------------------------
-- Existing-data cleanup. Three passes, each merging groups into their oldest row:
--   1. rows sharing a source id;  2. id-less rows sharing a fingerprint;
--   3. an id-less row whose fingerprint belongs to exactly one row with an id (the id appeared
--      after Sprint 1 stored a second copy). Ambiguous fingerprints are left untouched.
-- ---------------------------------------------------------------------------------------------
create temporary table review_merge (
  drop_id uuid primary key,
  keep_id uuid not null
) on commit drop;

create function pg_temp.apply_review_merge()
returns bigint
language plpgsql
as $$
declare
  reference record;
  removed bigint;
begin
  if exists (
    select 1 from pg_catalog.pg_constraint
    where confrelid = 'public.reviews'::regclass and contype = 'f'
      and pg_catalog.cardinality(conkey) <> 1
  ) then
    raise exception 'S3-011 cleanup cannot re-point a multi-column reference to reviews';
  end if;

  -- Re-point every single-column foreign key (for example persisted citations) to the survivor.
  for reference in
    select constraint_row.conrelid::regclass as table_name, attribute.attname as column_name
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid and attribute.attnum = constraint_row.conkey[1]
    where constraint_row.confrelid = 'public.reviews'::regclass and constraint_row.contype = 'f'
  loop
    execute pg_catalog.format(
      'update %s as referencing set %I = merge.keep_id from pg_temp.review_merge merge where referencing.%I = merge.drop_id',
      reference.table_name, reference.column_name, reference.column_name
    );
  end loop;

  -- The survivor keeps its id and created_at and takes the newest non-null source values.
  with member as (
    select merge.keep_id, review.*
    from (
      select keep_id, drop_id as member_id from pg_temp.review_merge
      union
      select keep_id, keep_id from pg_temp.review_merge
    ) merge
    join public.reviews review on review.id = merge.member_id
  ), merged as (
    select keep_id,
      (pg_catalog.array_agg(review_text order by created_at desc, id desc))[1] as review_text,
      (pg_catalog.array_agg(rating order by created_at desc, id desc))[1] as rating,
      (pg_catalog.array_agg(source_review_id order by created_at desc, id desc)
        filter (where source_review_id is not null))[1] as source_review_id,
      (pg_catalog.array_agg(reviewer_name order by created_at desc, id desc)
        filter (where reviewer_name is not null))[1] as reviewer_name,
      (pg_catalog.array_agg(review_date order by created_at desc, id desc)
        filter (where review_date is not null))[1] as review_date,
      (pg_catalog.array_agg(review_url order by created_at desc, id desc)
        filter (where review_url is not null))[1] as review_url,
      (pg_catalog.array_agg(source_metadata order by created_at desc, id desc)
        filter (where source_metadata is not null))[1] as source_metadata,
      pg_catalog.max(created_at) as updated_at
    from member
    group by keep_id
  )
  update public.reviews review
  set review_text = merged.review_text, rating = merged.rating,
    source_review_id = merged.source_review_id, reviewer_name = merged.reviewer_name,
    review_date = merged.review_date, review_url = merged.review_url,
    source_metadata = merged.source_metadata, updated_at = merged.updated_at
  from merged
  where review.id = merged.keep_id;

  delete from public.reviews review using pg_temp.review_merge merge where review.id = merge.drop_id;
  get diagnostics removed = row_count;
  truncate pg_temp.review_merge;
  return removed;
end
$$;

do $$
declare
  by_source_id bigint;
  by_fingerprint bigint;
  by_adoption bigint;
begin
  insert into pg_temp.review_merge (drop_id, keep_id)
  select id, keep_id from (
    select id, pg_catalog.first_value(id) over (
      partition by analysis_target_id, source_review_id order by created_at, id
    ) as keep_id
    from public.reviews where source_review_id is not null
  ) ranked
  where id <> keep_id;
  by_source_id := pg_temp.apply_review_merge();

  insert into pg_temp.review_merge (drop_id, keep_id)
  select id, keep_id from (
    select id, pg_catalog.first_value(id) over (
      partition by analysis_target_id, review_fingerprint order by created_at, id
    ) as keep_id
    from public.reviews where source_review_id is null
  ) ranked
  where id <> keep_id;
  by_fingerprint := pg_temp.apply_review_merge();

  insert into pg_temp.review_merge (drop_id, keep_id)
  select
    case when (idless.created_at, idless.id) < (owner_row.created_at, owner_row.id)
      then owner_row.id else idless.id end,
    case when (idless.created_at, idless.id) < (owner_row.created_at, owner_row.id)
      then idless.id else owner_row.id end
  from public.reviews idless
  join public.reviews owner_row
    on owner_row.analysis_target_id = idless.analysis_target_id
    and owner_row.review_fingerprint = idless.review_fingerprint
    and owner_row.source_review_id is not null
  where idless.source_review_id is null
    and (
      select pg_catalog.count(*) from public.reviews other
      where other.analysis_target_id = idless.analysis_target_id
        and other.review_fingerprint = idless.review_fingerprint
        and other.source_review_id is not null
    ) = 1;
  by_adoption := pg_temp.apply_review_merge();

  if by_source_id + by_fingerprint + by_adoption > 0 then
    raise notice 'S3-011 merged duplicate review rows: % by source id, % by fingerprint, % by adoption',
      by_source_id, by_fingerprint, by_adoption;
  end if;
end
$$;

drop function pg_temp.apply_review_merge();

-- The unique partial index below covers the same columns and predicate.
drop index public.reviews_target_source_review_idx;

create unique index reviews_target_source_review_id_key
  on public.reviews (analysis_target_id, source_review_id)
  where source_review_id is not null;
create unique index reviews_target_idless_fingerprint_key
  on public.reviews (analysis_target_id, review_fingerprint)
  where source_review_id is null;

alter table public.reviews add constraint reviews_source_review_id_normalized
  check (source_review_id is null or source_review_id = public.review_source_id(source_review_id));

comment on column public.reviews.source_review_id is
  'Normalized review id from the source platform; unique per target when present (S3-011).';
comment on column public.reviews.review_fingerprint is
  'S3-011 content fingerprint (fp2:). Generated; unique per target among rows without a source id.';
comment on column public.reviews.updated_at is
  'Last time a refresh changed this review''s source fields (S3-010); created_at when never changed.';

-- A completion whose reviews are all already stored saved 0 new rows but still succeeded, and
-- the target still has reviews. Before S3-011 a successful completion always inserted rows.
alter table public.ingestion_attempts drop constraint ingestion_attempt_lifecycle;
alter table public.ingestion_attempts add constraint ingestion_attempt_lifecycle check (
  (status = 'processing' and finished_at is null and saved_count = 0 and error_code is null)
  or (status = 'succeeded' and finished_at is not null and saved_count >= 0 and error_code is null
      and provider_request_id is not null and verified_identity is not null and identity_basis is not null)
  or (status = 'failed' and finished_at is not null and saved_count = 0 and error_code is not null)
);

-- ---------------------------------------------------------------------------------------------
-- Shared reconciliation used by both review writers. Invoker rights: it runs as the owner only
-- inside the SECURITY DEFINER writers below and is not executable by any API role.
-- p_rows uses the insert_reviews field names and must already be validated by the caller.
-- ---------------------------------------------------------------------------------------------
create function public.merge_target_reviews(p_target_id uuid, p_rows jsonb)
returns table (row_ordinal bigint, review_id uuid, merge_action text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  incoming record;
  matched_id uuid;
  incoming_source_id text;
  incoming_fingerprint text;
begin
  -- Serializes reconciliation per target, so concurrent refreshes cannot both decide to insert
  -- the same review (the two partial indexes alone cannot see an id-less copy vs an id'd copy).
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reviewlens:review-merge:' || p_target_id::text, 0)
  );

  for incoming in
    select element.ordinal, candidate.*
    from pg_catalog.jsonb_array_elements(p_rows) with ordinality as element(value, ordinal),
      lateral pg_catalog.jsonb_to_record(element.value) as candidate(
        review_text text, rating numeric, source_review_id text, reviewer_name text,
        review_date timestamptz, review_url text, source_metadata jsonb
      )
    order by element.ordinal
  loop
    incoming_source_id := public.review_source_id(incoming.source_review_id);
    incoming_fingerprint := public.review_fingerprint(
      incoming.reviewer_name, incoming.review_date, incoming.rating, incoming.review_text
    );
    matched_id := null;
    merge_action := null;

    if incoming_source_id is not null then
      select stored.id into matched_id from public.reviews stored
      where stored.analysis_target_id = p_target_id and stored.source_review_id = incoming_source_id;
      if matched_id is not null then
        merge_action := 'updated';
      else
        select stored.id into matched_id from public.reviews stored
        where stored.analysis_target_id = p_target_id and stored.source_review_id is null
          and stored.review_fingerprint = incoming_fingerprint
        order by stored.created_at, stored.id
        limit 1;
        if matched_id is not null then merge_action := 'adopted'; end if;
      end if;
    else
      select stored.id into matched_id from public.reviews stored
      where stored.analysis_target_id = p_target_id
        and stored.review_fingerprint = incoming_fingerprint
      order by (stored.source_review_id is not null), stored.created_at, stored.id
      limit 1;
      if matched_id is not null then merge_action := 'updated'; end if;
    end if;

    if matched_id is null then
      insert into public.reviews as created (
        analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date,
        review_url, source_metadata
      ) values (
        p_target_id, incoming.review_text, incoming.rating, incoming_source_id,
        incoming.reviewer_name, incoming.review_date, incoming.review_url, incoming.source_metadata
      )
      returning created.id into matched_id;
      merge_action := 'inserted';
    else
      -- Idempotent refresh: no write, and no updated_at change, when nothing differs.
      update public.reviews stored
      set review_text = incoming.review_text,
        rating = incoming.rating,
        source_review_id = coalesce(stored.source_review_id, incoming_source_id),
        reviewer_name = coalesce(incoming.reviewer_name, stored.reviewer_name),
        review_date = coalesce(incoming.review_date, stored.review_date),
        review_url = coalesce(incoming.review_url, stored.review_url),
        source_metadata = coalesce(incoming.source_metadata, stored.source_metadata),
        updated_at = pg_catalog.clock_timestamp()
      where stored.id = matched_id
        and (stored.review_text, stored.rating, stored.source_review_id, stored.reviewer_name,
          stored.review_date, stored.review_url, stored.source_metadata)
        is distinct from (incoming.review_text, incoming.rating,
          coalesce(stored.source_review_id, incoming_source_id),
          coalesce(incoming.reviewer_name, stored.reviewer_name),
          coalesce(incoming.review_date, stored.review_date),
          coalesce(incoming.review_url, stored.review_url),
          coalesce(incoming.source_metadata, stored.source_metadata));
      if not found then merge_action := 'unchanged'; end if;
    end if;

    row_ordinal := incoming.ordinal;
    review_id := matched_id;
    return next;
  end loop;
end
$$;

comment on function public.merge_target_reviews(uuid, jsonb) is
  'S3-011/S3-010 reconciliation of a validated batch with one target''s reviews: update by source '
  'id, adopt an id-less copy, match by fingerprint, else insert. Internal; owner-only.';

revoke all on function public.merge_target_reviews(uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Same as 20261107030000 except the review write, which now reconciles through
-- merge_target_reviews. saved_count counts new rows only.
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
    -- S3-011/S3-010: reconcile with stored reviews instead of inserting duplicates.
    select count(*) filter (where merged.merge_action = 'inserted') into saved
    from public.merge_target_reviews(
      attempt.analysis_target_id,
      (select jsonb_agg(jsonb_build_object(
          'review_text', r.value->'text', 'rating', r.value->'rating',
          'source_review_id', r.value->'source_review_id', 'reviewer_name', r.value->'reviewer_name',
          'review_date', r.value->'review_date', 'review_url', r.value->'review_url',
          'source_metadata', r.value->'source_metadata'
        ) order by r.ordinal)
        from jsonb_array_elements(p_reviews) with ordinality as r(value, ordinal))
    ) as merged;
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

-- Same as 20261108000000 except the write, which now reconciles through merge_target_reviews and
-- returns the rows created or changed (each once, in first-occurrence order).
create or replace function public.insert_reviews(p_target_id text, p_rows jsonb)
returns setof public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  caller_id uuid := auth.uid();
  changed_ids uuid[];
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

  -- Two statements on purpose: a query that wrote rows inside a function cannot see them through
  -- its own snapshot, so the changed rows are read back by a separate statement.
  select coalesce(pg_catalog.array_agg(changed.review_id order by changed.first_ordinal), '{}')
  into changed_ids
  from (
    select change.review_id, pg_catalog.min(change.row_ordinal) as first_ordinal
    from public.merge_target_reviews(target_id, p_rows) as change
    where change.merge_action <> 'unchanged'
    group by change.review_id
  ) as changed;

  return query
    select review.*
    from pg_catalog.unnest(changed_ids) with ordinality as wanted(id, position)
    join public.reviews review on review.id = wanted.id
    order by wanted.position;
end
$$;

comment on function public.insert_reviews(text, jsonb) is
  'Atomically inserts a validated review batch for a target owned by auth.uid(). This prevents '
  'direct table writes but does not establish provider-authenticated review provenance: an '
  'authenticated owner may submit reviews through the protected application endpoint. '
  'S3-011: reconciles with stored reviews and returns only rows it created or changed.';

revoke all on function public.insert_reviews(text, jsonb) from public, anon, authenticated;
grant execute on function public.insert_reviews(text, jsonb) to authenticated;

commit;
