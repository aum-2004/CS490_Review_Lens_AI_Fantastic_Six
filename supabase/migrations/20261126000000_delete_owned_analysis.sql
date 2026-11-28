-- S3-005: remove analysis data without refunding paid ingestion reservations.
-- Keep audit/billing rows, but detach them from the deleted target. Existing RLS hides
-- detached attempts (it requires an owned, existing parent); lifecycle RPCs join that
-- parent too, so late callbacks cannot recreate a deleted target or its reviews.
alter table public.ingestion_attempts alter column analysis_target_id drop not null;
alter table public.ingestion_attempts drop constraint ingestion_attempts_analysis_target_id_fkey;
alter table public.ingestion_attempts add constraint ingestion_attempts_analysis_target_id_fkey
  foreign key (analysis_target_id) references public.analysis_targets(id) on delete set null;

-- Direct DELETE remains revoked. This narrowly scoped operation derives the owner
-- from the JWT, accepts no owner argument, and deletes atomically with FK actions.
create function public.delete_owned_analysis(p_target_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare deleted_id uuid; caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  delete from public.analysis_targets where id = p_target_id and owner_id = caller
    returning id into deleted_id;
  return deleted_id is not null;
end $$;

revoke all on function public.delete_owned_analysis(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_owned_analysis(uuid) to authenticated;
