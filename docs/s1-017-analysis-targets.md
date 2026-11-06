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

## Agent-run acceptance walkthrough

The [November 6 acceptance report](acceptance/s1-017-2026-11-06.md) records a production-mode local walkthrough, screenshots inspected by Codex, and all ten passing observations. It covers the issue's fields and User A/User B isolation, safe failure states, responsive navigation and signed-out Back behavior. It does not replace the author's human verification or the separate normal/security reviews; it does not claim hosted Supabase verification.

## Development refresh-loop fix — November 6, 2026

A subsequent human login attempt reproduced a development-only refresh loop. Capturing the browser's HMR WebSocket showed repeated `reloadPage` messages with `HMR hash mismatch` (19 main-frame navigations in five seconds). This was not an authentication redirect: the server repeatedly returned 200 for the same login URL.

`src/app/globals.css` now imports Tailwind with `source("../")`. Relative to `src/app`, this explicitly scans `src`, where the team's app and component classes live, instead of defaulting to the repository root. It keeps non-application sources out of Tailwind's development watch scope. The theme and component APIs are unchanged. The setting follows [Tailwind's source-detection documentation](https://tailwindcss.com/docs/detecting-classes-in-source-files#setting-your-base-path).

After the change and a server restart, the HMR reload messages stopped. Two standalone checks, including one after a warm restart without another source edit, preserved email/password input for ten seconds across a generated-file write and then signed in successfully. `tests/e2e/auth/development-stability.spec.ts` adds regression coverage for input retention, generated-file writes and forced HMR reloads before signing in. Only synthetic local credentials were used; `.env.local` was not edited.

The previously recorded unsuccessful development acceptance attempts remain historical evidence. The production acceptance results remain valid; this follow-up fixes the development experience needed for the author's own manual check.

Validation after the development fix: 347 unit tests, all 13 isolated auth/target browser tests, both foundation smoke tests, formatting, lint, explicit typecheck and production build passed. The local dummy-provider app was restarted for the author's manual verification; those automated checks do not complete the human sign-off.

## Author manual verification

Shawn subsequently confirmed User A's list and refresh, User B's isolated list, the unavailable-account error/retry path, and signed-out API rejection without target data. The author's local happy/failure verification is complete; see the [dated acceptance report](acceptance/s1-017-2026-11-06.md#author-confirmed-manual-acceptance--november-6-2026). Normal and independent security reviews remain pending. These confirmations used the local fixture, not hosted Supabase.

## UI/UX shared-component follow-up

The reviewer identified that required §8.1 components were implemented inline. `Navigation`, `PageHeader`, `EmptyState`, `ErrorState` and `ErrorAlert` are now shared PascalCase components reused by 017's shell, page, empty state, load-error panel, route error boundary and account-menu feedback. No database/query/authentication contract changed. Existing S1-015 primitives were inspected to avoid importing or copying an unmerged implementation.

The status-badge requirement remains open. [The UI compliance follow-up](s1-017-ui-compliance.md) contains a concrete **proposed, unapproved** temporary deferral until an owner-scoped S1-023 ingestion-state contract exists. The earlier omission must not be interpreted as compliance or as an approved exception. The normative UI/UX standards are unchanged, and no target is labeled “Not ingested” without server evidence.
