-- S1-022: Persist ingested Reviews with target ownership.
--
-- Depends on S1-014 (20261103120000_create_analysis_targets.sql). A Review has no owner column of
-- its own: it belongs to exactly one AnalysisTarget and inherits that target's owner, so every
-- policy below checks ownership through public.analysis_targets (S1-BR-007, S1-BR-022).
-- Field names follow the S1-021 NormalizedReview (src/services/reviews/types.ts).

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  analysis_target_id uuid not null references public.analysis_targets (id) on delete cascade,
  review_text text not null,
  rating numeric not null,
  source_review_id text,
  reviewer_name text,
  review_date timestamptz,
  review_url text,
  source_metadata jsonb,
  created_at timestamptz not null default now(),

  -- Mirrors the S1-021 normalization rules so the database rejects bad rows even if a caller
  -- skips normalization (S1-BR-020).
  constraint reviews_review_text_present check (char_length(btrim(review_text)) > 0),
  constraint reviews_rating_range check (rating between 1 and 5),
  constraint reviews_review_url_http check (review_url is null or review_url ~* '^https?://'),
  constraint reviews_source_metadata_object check (
    source_metadata is null or jsonb_typeof(source_metadata) = 'object'
  )
);

comment on table public.reviews is
  'Normalized reviews ingested for an AnalysisTarget. Ownership is inherited from the target.';
comment on column public.reviews.source_review_id is
  'Review id from the source platform. Not unique in Sprint 1: duplicates are stored as-is, and '
  'reviews_target_source_review_idx lets a later sprint find them.';

-- Supports retrieving all Reviews of one target in a stable order.
create index reviews_analysis_target_id_created_at_idx
  on public.reviews (analysis_target_id, created_at, id);

-- Non-unique on purpose: lets a later sprint find duplicate source reviews without Sprint 1
-- implementing re-ingestion or duplicate resolution.
create index reviews_target_source_review_idx
  on public.reviews (analysis_target_id, source_review_id)
  where source_review_id is not null;

-- Row Level Security: a signed-in user can only see and change Reviews of their own targets
-- (S1-BR-008, S1-BR-009). Server code must still check target ownership; RLS is defense in depth.
alter table public.reviews enable row level security;

-- Supabase grants new tables ALL to anon and authenticated by default. Revoke from both first so
-- authenticated does not keep TRUNCATE (not subject to RLS), REFERENCES, or TRIGGER.
revoke all on table public.reviews from anon, authenticated;
grant select, insert, update, delete
  on table public.reviews to authenticated;

create policy reviews_select_own
  on public.reviews
  for select
  to authenticated
  using (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = (select auth.uid())
  ));

create policy reviews_insert_own
  on public.reviews
  for insert
  to authenticated
  with check (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = (select auth.uid())
  ));

-- `with check` also stops a Review from being moved onto another user's target.
create policy reviews_update_own
  on public.reviews
  for update
  to authenticated
  using (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = (select auth.uid())
  ));

create policy reviews_delete_own
  on public.reviews
  for delete
  to authenticated
  using (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = (select auth.uid())
  ));
