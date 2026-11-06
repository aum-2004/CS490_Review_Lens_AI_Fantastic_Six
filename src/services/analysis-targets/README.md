# AnalysisTarget creation integration contract

S1-015 reuses the S1-011 authenticated `POST /api/analysis-targets` Route Handler, S1-014
persistence, and S1-016 validation. The client form submits only `name` and `sourceUrl`; it never
sends an owner or user identifier.

The protected Route Handler:

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

The result exposes at least `id`, `name`, `sourceUrl`, and `platform`. Until S1-017 and S1-018 are
merged, the creation form displays an accessible confirmation containing the saved target's name,
ID, and normalized source URL. It does not link or redirect to routes that do not exist.

S1-017 should restore the `My Targets` breadcrumb and Cancel destination to `/analysis-targets` when
the list route exists. S1-018 should replace the temporary inline confirmation with navigation to
`/analysis-targets/{id}?created=1`; the workspace should use that query marker to show the
standards-required confirmation: “Target created. You can now start ingestion.”
