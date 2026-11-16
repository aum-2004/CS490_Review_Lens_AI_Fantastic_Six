begin;

create or replace function public.get_review_summary(p_target_id uuid)
returns table(review_count bigint, average_rating numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.analysis_targets target
    where target.id = p_target_id
      and target.owner_id = (select auth.uid())
  ) then
    raise exception 'Target unavailable' using errcode = 'P0002';
  end if;

  return query
    select count(*)::bigint, avg(review.rating)
    from public.reviews review
    where review.analysis_target_id = p_target_id;
end;
$$;

comment on function public.get_review_summary(uuid) is
  'Returns exact count and average rating for the authenticated owner target without exposing review rows.';

revoke all on function public.get_review_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_review_summary(uuid) to authenticated;

commit;
