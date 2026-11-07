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

The result exposes at least `id`, `name`, `sourceUrl`, and `platform`. S1-018 now
integrates successful creation with `/analysis-targets/{encoded id}?created=1`.
The temporary workspace-unavailable confirmation is removed. The form ignores a
stale completion after navigation and prevents duplicate submission during handoff.

S1-017 now supplies the shared `AppShell`, navigation, and `/analysis-targets` list. The creation
page uses that shell; its breadcrumb and Cancel action return to My Targets.
After verifying target ownership, the workspace consumes the marker using native
history replacement, preserving other query parameters and the hash. The notice
remains for the current view but does not reappear after reload. It says
"Target created. You can now start ingestion." only when collection is available;
otherwise it says "Target created." without offering a disabled action. It hides
after ingestion succeeds. This availability-aware refinement follows PR #48 review.
The marker controls presentation only; it never creates a target, starts ingestion,
or bypasses ownership. Reopening without the marker does not show the notice.
