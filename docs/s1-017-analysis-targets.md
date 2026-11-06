# S1-017 — View My Analysis Targets

An authenticated user opens `/analysis-targets` to see their persisted AnalysisTargets. Each card shows the name, supported platform (Google Maps), source reference and Open link. Results are ordered newest first, with ID as the stable tie-breaker. Empty, loading and retryable failure states are distinct.

## Ownership and response contract

Both the page and `GET /api/analysis-targets` independently verify identity with the S1-010 guards before database work. They pass the verified session user's ID and a session-scoped Supabase client to `listAnalysisTargets`. The query includes `owner_id = verifiedUser.id` on every page. No client-side ownership filtering or service-role client is used. Existing S1-014 RLS remains the database boundary; no migration or grant changes are introduced.

`GET /api/analysis-targets` ignores client-supplied owner/user query parameters and headers. Its successful response is:

```json
{
  "success": true,
  "data": [
    {
      "id": "target-uuid",
      "name": "Coffee shop",
      "platform": "google_maps",
      "sourceUrl": "https://www.google.com/maps/place/Coffee",
      "createdAt": "2026-11-01T12:00:00Z"
    }
  ]
}
```

An empty result returns `data: []`. Missing identity returns 401 `AUTH_REQUIRED`; verification outages return the shared guard's 503. Database failures return 500 `ANALYSIS_TARGET_LIST_FAILED` with generic feedback and no target data. Responses are private/no-store. Logs contain only an operation/category, never database errors, target input, identity or credentials. The existing S1-011 POST contract is unchanged.

The service retrieves pages until an empty page, rather than stopping at a short page: a Supabase project can cap results below the requested 1,000 rows. A failed page rejects the entire read. Stable offset pagination does not promise a transactional snapshot during concurrent inserts/deletes; refreshing reloads current persisted data.

## UI and integration handoff

- `/` verifies identity and redirects to `/analysis-targets` or `/login`, as required by the UI standards.
- `AppShell` provides the wordmark, My Targets, New Target, account menu and skip link. It uses existing PascalCase UI primitives without changing their APIs. Account-menu logout calls the existing authentication action, refreshes navigation on success, and gives safe retry feedback on failure.
- The shell is composed by the list page, not an enclosing layout. S1-015 and S1-018 can adopt it without inheriting a second nested main element. Each page must still use `requirePageUser()` independently.
- New Target and the empty-state action point to `/analysis-targets/new` (S1-015). Open points to `/analysis-targets/{id}` (S1-018). Those destinations may return 404 until their owning stories merge. This PR supplies no creation form, workspace, ingestion controls or invented ingestion statuses.
- Existing S1-011/014 are already on the branch base. No unmerged feature branch was incorporated. Target ownership/review authorization in other stories remains separately enforced.

## Validation and limits

- Unit tests cover per-user queries and API results, minimal DTOs, deterministic ordering, 1,001 targets, a lower project cap, later-page failure, missing identity, provider outages, escaped target labels, page guarding and safe error rendering.
- Isolated Playwright tests run the real Next app and Supabase SDK against a local dummy auth/database provider. They cover User A/User B isolation, forged owner arguments, refresh/home navigation, empty/error states, logout failure/retry, keyboard menu behavior, mobile overflow and signed-out denial. Existing authentication/protection browser checks run alongside them.
- The fixture asserts owner-scoped database queries and simulates ownership filtering. It is not evidence that the shared hosted project's migrations or RLS configuration have been applied. No shared Supabase settings, data or credentials were inspected or modified.
- Before merge: author/human validation, normal review, the additional independent security-focused review required by S1-004 §7, and latest-head GitHub CI must be complete. Hosted acceptance should verify two real users' persisted targets against the team's project; creation and workspace behavior belong to S1-015/018.

AI assistance: Codex. See the S1-017 transcripts in `ai-transcripts/` for available original dialogue, failed checks and recovery limits.

## Local completion evidence (November 6, 2026)

Formatting, lint, explicit typecheck, production build, all **347 unit tests in 27 suites**, and all **12 isolated Edge browser tests** passed. The browser suite includes seven target-list scenarios and the five pre-existing authentication/protection scenarios. No database tests were run locally; no migration was changed. Latest-head GitHub CI is recorded on the PR after publication rather than claimed in advance.

The browser logout-failure scenario waits for the asynchronous action to finish. The Supabase SDK clears local cookies on the tested remote 500; Next can immediately redirect the guarded page, so the menu's error UI may unmount. The test verifies subsequent API/page denial and successful reauthentication. Component tests separately verify generic error/retry feedback when the menu remains mounted.

Review checklist: inspect `list-analysis-targets.ts`, GET and the page's guard order; verify owner filtering on every page, DTO minimization, failure/caching behavior and the two-user negative assertions. Normal and independent security reviews must be recorded separately. Hosted two-user acceptance remains a deployment/validation step; do not interpret fixture tests as hosted database execution.
