# S2-006 review summary deployment note

The review summary endpoint now calls `public.get_review_summary(uuid)`. Apply
[`20261113000000_create_review_summary.sql`](../supabase/migrations/20261113000000_create_review_summary.sql)
through the normal Supabase migration pipeline before using the endpoint in an
environment that does not already contain this function. This change does not
deploy the migration to shared Supabase.

The function is `SECURITY INVOKER`, runs with an empty search path, is executable
only by `authenticated`, and checks that `auth.uid()` owns the requested target.
It aggregates `count(*)` and `avg(rating)` in PostgreSQL and returns no review
text, reviewer identity, URL, metadata, or other review columns. Existing RLS
policies therefore remain in force.

## Workspace integration

The active target workspace now performs authentication and the existing target-ownership lookup
before requesting the summary. It uses the existing `getReviewSummary` service and its aggregate
RPC, then renders `ReviewSummaryCard` beside ingestion and saved reviews. A summary failure is
handled independently with safe user-facing copy and the existing router-refresh retry button;
the workspace does not substitute zeroes or expose database details. Since the workspace is a
server-rendered target view, navigation to another target obtains a fresh target-scoped summary,
and `WorkspaceIngestion`'s existing `router.refresh()` after completion reloads it without extra
provider polling.

## S2-008 persisted-dataset boundary

The summary aggregate and Q&A context use the same security and data boundary: the authenticated
user's selected `AnalysisTarget` and its persisted `reviews` rows. `get_review_summary()` computes
the exact count and average in PostgreSQL without loading review text. `buildReviewDatasetContext()`
reloads the same target-filtered rows for Q&A, requires an exact complete result, and either includes
all eligible rows within the 100-review/32 KiB limits or fails closed. It never truncates Q&A data
or substitutes the ingestion presentation, browser state, provider output, or an LLM-generated value.

The S2-008 database regression covers live insert/delete recalculation, empty datasets, target
isolation, and cross-user denial. The focused boundary test also asserts that a supported persisted
dataset produces matching summary count/context rows, while an oversized dataset remains an exact
summary but is rejected by Q&A rather than silently represented by a partial context.
