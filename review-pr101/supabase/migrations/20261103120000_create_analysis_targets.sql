-- S1-014: AnalysisTarget persistence model.
--
-- One row per business or item a user wants to analyze. Every target belongs to exactly one
-- authenticated user (S1-003, engineering standards section 8). Reviews and ingestion attempts
-- will reference analysis_targets.id in later stories, so a target can have many of each.

create table public.analysis_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  platform text not null,
  source_url text not null,
  google_place_id text,
  created_at timestamptz not null default now(),

  -- Mirrors the S1-016 validation rules so the database rejects bad rows even if a caller
  -- skips validation.
  constraint analysis_targets_name_present check (char_length(btrim(name)) > 0),
  constraint analysis_targets_name_length check (char_length(name) <= 120),
  constraint analysis_targets_platform_supported check (platform in ('google_maps')),
  -- Canonical S1-016 output only: Google Maps host and path, no credentials or port, no raw
  -- whitespace, control characters, or backslashes, at most 2,048 characters.
  constraint analysis_targets_source_url_google_maps check (
    source_url ~ '^https?://((www\.)?google\.com/maps([/?#]|$)|maps\.google\.com/)'
    and source_url !~ '[[:space:][:cntrl:]\\]'
    and char_length(source_url) <= 2048
  ),
  constraint analysis_targets_google_place_id_present check (
    google_place_id is null or char_length(btrim(google_place_id)) > 0
  )
);

comment on table public.analysis_targets is
  'Businesses or items a user analyzes. Owned by exactly one auth.users row.';
comment on column public.analysis_targets.platform is
  'Supported review platform. Sprint 1 supports google_maps only.';
comment on column public.analysis_targets.google_place_id is
  'Optional Google place ID resolved during ingestion (S1-020), reused so later imports skip '
  'resolving the business again. Not unique: different users may analyze the same business. '
  'Clients cannot write it: a verified server-side write path is still to be agreed.';

-- Supports listing a user's targets newest first (S1-017).
create index analysis_targets_owner_id_created_at_idx
  on public.analysis_targets (owner_id, created_at desc);

-- Row Level Security: a signed-in user can only see and change their own targets (S1-BR-008).
-- Server code must still check ownership itself; RLS is defense in depth.
alter table public.analysis_targets enable row level security;

--
-- Supabase exposes this table to signed-in users through its Data API, so these grants are the
-- write boundary. Clients cannot update a target or choose its id, creation time, or Google place
-- ID, which stops an owner replacing a target's source identity directly.
revoke all on table public.analysis_targets from anon, authenticated;
grant select, delete on table public.analysis_targets to authenticated;
grant insert (owner_id, name, platform, source_url) on table public.analysis_targets to authenticated;

create policy analysis_targets_select_own
  on public.analysis_targets
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy analysis_targets_insert_own
  on public.analysis_targets
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy analysis_targets_delete_own
  on public.analysis_targets
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);
