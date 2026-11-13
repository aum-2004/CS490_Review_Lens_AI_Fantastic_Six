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
