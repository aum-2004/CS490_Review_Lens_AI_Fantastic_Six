# S3-016 Active Review Dataset Filters

The target workspace loads the authenticated user's complete persisted `Review[]` only after the
server verifies ownership of the active `AnalysisTarget`. `ReviewBrowser` filters that in-memory
dataset; it does not fetch another target, modify reviews, or change Q&A evidence or quotas.

Rating bounds and source-date bounds are inclusive. Every selected bound is combined with AND
semantics. A review with no source date is excluded whenever either date bound is active. Draft
values do not affect results until Apply; Cancel restores the applied selections, and Clear all
immediately restores the full current dataset. The matching count, a three-entry Review Preview,
and the complete browser all derive from the same filtered array. The workspace keys the browser
by verified user and target, so real target navigation resets filter state. A filtered zero-result
message is distinct from an empty persisted dataset and from the server-side load failure state.

Only review ID, text, rating, reviewer name, and review date cross into the filter/browser client
component. The page authenticates and verifies target ownership before loading reviews; Q&A keeps
its own separately mapped evidence fields and server-side context pipeline.

Draft ratings are validated as finite values from 1 through 5, and draft dates must be real
calendar dates in `YYYY-MM-DD` order before Apply changes the applied state. Invalid drafts leave
the existing results and active-filter indicators unchanged.

The UI filter is not an authorization boundary. Authentication, target ownership checks, the
session-scoped Supabase client, and RLS remain responsible for data access. Tests cover combined
filter semantics, draft validation/actions, preview/list dataset consistency, a dataset larger than
1,000 reviews, empty and zero-match results, and an authenticated browser target switch from
filtered Target A to Target B.
