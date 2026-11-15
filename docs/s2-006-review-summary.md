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
