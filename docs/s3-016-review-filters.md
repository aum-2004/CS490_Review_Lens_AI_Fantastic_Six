# S3-016 Active Review Dataset Filters

The target workspace loads the authenticated user's complete persisted `Review[]` only after the
server verifies ownership of the active `AnalysisTarget`. `ReviewBrowser` filters that in-memory
dataset; it does not fetch another target, modify reviews, or change Q&A evidence or quotas.

Rating bounds and source-date bounds are inclusive. Every selected bound is combined with AND
semantics. A review with no source date is excluded whenever either date bound is active. Draft
values do not affect results until Apply; Cancel restores the applied selections, and Clear all
immediately restores the full current dataset. The matching count, filter-aware Review Preview,
and complete browser all receive the same filtered array. Target-keyed mounting clears filter state
when the active target changes. A filtered zero-result message is distinct from an empty persisted
dataset and from the server-side load failure state.

Draft ratings are validated as finite values from 1 through 5, and draft dates must be real
calendar dates in `YYYY-MM-DD` order before Apply changes the applied state. Invalid drafts leave
the existing results and active-filter indicators unchanged.

The UI filter is not an authorization boundary. Authentication, target ownership checks, the
session-scoped Supabase client, and RLS remain responsible for data access. Existing workspace
authorization tests continue to cover cross-user denial; S3-016 adds deterministic unit tests for
filter semantics, draft validation/actions, empty results, and target-switch reset behavior.
