-- S3-006: Persist questions and ReviewLens responses as part of a saved analysis.
--
-- One row per question the user asked and the response ReviewLens showed for it. History belongs to
-- exactly one AnalysisTarget and inherits that target's owner, the same way reviews do
-- (S3-BR-009, S3-BR-010). Deleting the target deletes its history (on delete cascade).
--
-- Only user-visible responses are stored: answered, insufficient_evidence and out_of_scope (the
-- public outcome the API returns, not the internal decline reason). Failed requests are not history.
--
-- Supporting evidence is kept as an ordered list of review IDs, not copied review text. The quotes
-- shown with an answer are already part of `answer`. IDs are checked against the target when the
-- row is written. Rows are never rewritten, so if a later refresh removes a review, the citation
-- keeps its ID and the UI shows it as unavailable instead of silently dropping it.

begin;

create table public.review_qa_exchanges (
  id uuid primary key default gen_random_uuid(),
  analysis_target_id uuid not null references public.analysis_targets (id) on delete cascade,
  question text not null,
  outcome text not null,
  answer text not null,
  cited_review_ids uuid[] not null default '{}',
  prompt_version text not null,
  created_at timestamptz not null default clock_timestamp(),

  -- Mirrors the API limits (review-question.ts, qa-response.ts, citations.ts).
  constraint review_qa_exchanges_question_present check (char_length(btrim(question)) > 0),
  constraint review_qa_exchanges_question_length check (char_length(question) <= 2000),
  constraint review_qa_exchanges_outcome_known check (
    outcome in ('answered', 'insufficient_evidence', 'out_of_scope')
  ),
  constraint review_qa_exchanges_answer_present check (char_length(btrim(answer)) > 0),
  constraint review_qa_exchanges_answer_length check (char_length(answer) <= 8000),
  constraint review_qa_exchanges_prompt_version_length check (
    char_length(prompt_version) between 1 and 64
  ),
  constraint review_qa_exchanges_citations_bounded check (
    cardinality(cited_review_ids) <= 100 and array_position(cited_review_ids, null) is null
  ),
  -- Grounded answers always cite evidence; declines and insufficient evidence never do (S2-011).
  constraint review_qa_exchanges_citations_match_outcome check (
    (outcome = 'answered') = (cardinality(cited_review_ids) > 0)
  )
);

comment on table public.review_qa_exchanges is
  'Q&A history of an AnalysisTarget (S3-006). Ownership is inherited from the target. Written only '
  'through record_review_qa_exchange.';
comment on column public.review_qa_exchanges.cited_review_ids is
  'Ordered, de-duplicated IDs of reviews the answer cites. Checked against the target at write time; '
  'not a foreign key, so history stays readable if a review is later removed.';

-- History is restored oldest first (S3-007); id breaks ties between equal timestamps.
create index review_qa_exchanges_target_created_idx
  on public.review_qa_exchanges (analysis_target_id, created_at, id);

alter table public.review_qa_exchanges enable row level security;

-- Supabase grants new tables ALL to anon and authenticated by default. Browser roles may only read
-- their own history; every write goes through the function below.
revoke all on table public.review_qa_exchanges from public, anon, authenticated;
grant select on table public.review_qa_exchanges to authenticated;

create policy review_qa_exchanges_select_own
  on public.review_qa_exchanges
  for select
  to authenticated
  using (exists (
    select 1 from public.analysis_targets t
    where t.id = review_qa_exchanges.analysis_target_id and t.owner_id = (select auth.uid())
  ));

-- Most exchanges one analysis keeps. Bounds storage when the RPC is called directly (the paid Q&A
-- quota limits only the normal route). The user can clear history to make room (S3-008).
create function public.record_review_qa_exchange(
  p_target_id uuid,
  p_question text,
  p_outcome text,
  p_answer text,
  p_prompt_version text,
  p_cited_review_ids uuid[]
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  citations uuid[] := coalesce(p_cited_review_ids, '{}');
  history_count integer;
begin
  if caller_id is null or p_target_id is null or not exists (
    select 1
    from public.analysis_targets target
    where target.id = p_target_id and target.owner_id = caller_id
  ) then
    raise exception 'Target unavailable' using errcode = 'P0002';
  end if;

  -- Citations must be unique and must all be reviews of this target (S3-BR-010, S3-BR-021).
  if (select count(distinct cited) from unnest(citations) as cited) <> cardinality(citations)
    or exists (
      select 1
      from unnest(citations) as cited(review_id)
      where not exists (
        select 1 from public.reviews review
        where review.id = cited.review_id and review.analysis_target_id = p_target_id
      )
    ) then
    raise exception 'Invalid citations' using errcode = '23514';
  end if;

  -- Serialize writers per target so the history cap holds under concurrent requests.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reviewlens:qa-history:' || p_target_id::text, 0)
  );
  select count(*) into history_count
  from public.review_qa_exchanges exchange
  where exchange.analysis_target_id = p_target_id;
  if history_count >= 200 then
    raise exception 'QA_HISTORY_FULL' using errcode = 'P0001';
  end if;

  -- Table constraints reject empty, oversized or contradictory values.
  return query
    insert into public.review_qa_exchanges as inserted (
      analysis_target_id, question, outcome, answer, prompt_version, cited_review_ids
    )
    values (p_target_id, p_question, p_outcome, p_answer, p_prompt_version, citations)
    returning inserted.id, inserted.created_at;
end
$$;

comment on function public.record_review_qa_exchange(uuid, text, text, text, text, uuid[]) is
  'Stores one Q&A exchange for a target owned by auth.uid(). Citations must be reviews of that '
  'target. Like insert_reviews, it prevents direct table writes but cannot prove the text came from '
  'the model: an owner calling it directly can only write to their own analysis.';

revoke all on function public.record_review_qa_exchange(uuid, text, text, text, text, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.record_review_qa_exchange(uuid, text, text, text, text, uuid[])
  to authenticated;

commit;
