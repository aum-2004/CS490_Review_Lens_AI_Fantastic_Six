-- S1-022: Persist ingested Reviews with target ownership.
-- ASSUMPTION: S1-014 provides public.analysis_targets(id uuid pk, owner_id uuid references auth.users).
-- Adjust the names below if S1-014 differs.

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  analysis_target_id uuid not null
    references public.analysis_targets (id) on delete cascade,
  review_text text not null check (length(btrim(review_text)) > 0),
  rating numeric not null,
  source_review_id text,
  reviewer_name text,
  reviewed_at timestamptz,
  review_url text,
  created_at timestamptz not null default now()
);

create index reviews_analysis_target_id_idx
  on public.reviews (analysis_target_id);

-- Non-unique on purpose: lets a later sprint find duplicate source reviews
-- without Sprint 1 implementing re-ingestion/dedupe.
create index reviews_target_source_review_idx
  on public.reviews (analysis_target_id, source_review_id)
  where source_review_id is not null;

alter table public.reviews enable row level security;

-- Ownership is inherited transitively through the parent AnalysisTarget.
create policy reviews_select_own on public.reviews
  for select to authenticated
  using (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = auth.uid()
  ));

create policy reviews_insert_own on public.reviews
  for insert to authenticated
  with check (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = auth.uid()
  ));

create policy reviews_update_own on public.reviews
  for update to authenticated
  using (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = auth.uid()
  ));

create policy reviews_delete_own on public.reviews
  for delete to authenticated
  using (exists (
    select 1 from public.analysis_targets t
    where t.id = reviews.analysis_target_id and t.owner_id = auth.uid()
  ));
