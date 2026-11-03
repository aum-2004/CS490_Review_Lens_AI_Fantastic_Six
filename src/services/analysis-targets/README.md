# AnalysisTarget creation integration contract

S1-015 intentionally does not implement authentication (S1-009) or persistence (S1-014).
The client form submits only `name` and `sourceUrl` to `POST /api/analysis-targets`; it never sends
an owner or user identifier.

When the dependent stories are available, the protected Route Handler must:

1. Resolve and verify the Supabase session. Return `401` before any write when no authenticated
   identity exists.
2. Parse the JSON body and call `validateAnalysisTargetInput()` from
   `src/lib/validation/analysis-target.ts`. Return its structured error as `400` before calling
   persistence.
3. Pass only the validated `name`, `sourceUrl`, and fixed `platform`, plus the server-derived user
   identity, to the S1-014 service.
4. Return `201` as `{ success: true, data: AnalysisTarget }` after a genuine committed write.
5. Translate expected failures to the shared safe error response and never return fabricated target
   data.

The S1-014 result must expose at least `id`, `name`, `sourceUrl`, and `platform` so the client can
navigate to `/analysis-targets/{id}?created=1`. The workspace should use that query marker to show
the standards-required confirmation: “Target created. You can now start ingestion.”
