-- S3-002: permit only display-name changes, with ownership checked by RLS.
grant update (name) on table public.analysis_targets to authenticated;

create policy analysis_targets_update_name_own
  on public.analysis_targets
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
