# S1-010: Protected routes and backend operations

S1-010 depends on the S1-009 authentication branch. The PM has created the shared Supabase project.
The user reports successful live registration/confirmation, sign-in, navigation/reload persistence,
session API identity, logout, incorrect-password rejection, and two distinct account identities.
These checks ran on the dependent S1-010 branch. Actual token-expiry refresh (configured lifetime:
3600 seconds), isolated S1-009 acceptance, human/security review, CI, and target integration remain
pending. Do not change shared JWT settings to shorten the wait without team agreement.

## Boundaries implemented here

- The existing single Proxy refreshes sessions for `/login`, `/auth/*`, `/api/auth/*`,
  `/analysis-targets/*`, and `/api/analysis-targets/*` (including each namespace root).
- For `/analysis-targets` pages, verified SDK claims permit navigation. Missing/invalid identity
  redirects with HTTP 303 to `/login?next=...`; configuration/provider failures return a safe 503.
  Redirects retain SDK cookie writes and private cache headers. API requests continue to their
  handlers; they do not redirect to HTML login pages.
- Login accepts a return destination only inside `/analysis-targets`. Sign-in returns there;
  external URLs, unrelated namespaces, and malformed destinations are ignored. Registration that
  needs email confirmation remains on login. Confirmation links retain S1-009's fixed destination;
  after confirmation users can revisit the protected page to resume navigation.
- `requireApiUser()` independently calls S1-009's server-verified `getAuthenticatedUser()` on each
  operation. It returns either a verified user or a private 401/503 response with no protected data.
  `GET /api/auth/session` now uses this shared guard, preserving its original response contract.
- `requirePageUser(returnTo?)` verifies at the page/data boundary and redirects missing users.
  Authentication outages propagate the existing safe error instead of admitting the user.

Proxy is a navigation convenience. Every protected handler, action, and data operation must verify
independently. Layout-only guards cannot secure children, which Next can render independently.
Public `/`, `/login`, confirmation, and `/api/health` remain available. The starter home stays in
place until target pages exist; the UI standard's home-to-target redirect remains an integration step.

## Integrating target stories and S1-011

No target pages, target APIs, database tables, migrations, AppShell, or ownership policies are
created here. They are not present on this working branch; see the fetched branch review below.
The page namespace is guarded ahead of integration; a signed-in visit still gets 404 until its
owning feature supplies the page. This is not a completed target feature.

In a protected Route Handler:

```ts
const auth = await requireApiUser();
if (auth.response) return auth.response;
// Now call the target service with auth.user.id and validated input.
// Never replace this ID with an ownerId/userId from the request.
```

Import the guard from `@/services/auth/access-control`. Successful protected responses also need
`Cache-Control: private, no-store`. Authenticate before invoking the resource service, including
every exported HTTP method. Tests must call handlers directly as well as through the browser so
Proxy cannot mask a missing backend check.

For a protected page, call `await requirePageUser("/analysis-targets/new")` inside its async
page/data component, behind a Suspense boundary. Verify before loading any protected data.
Do not cache authentication or rely on a previously checked parent layout. Actions can call the
same page guard (redirect) or API guard (structured failure) before mutations; handle response
objects on the server rather than attempting to serialize a NextResponse to a client component.

The verified ID corresponds to Supabase `auth.users.id`. S1-011 supplies ownership integration;
the user-scoped Supabase client must also carry session cookies so RLS `auth.uid()` works. Passing
an owner argument alone does not establish RLS identity. Never use a service-role client for normal
user requests. S1-012/013 own tests proving cross-user resource denial.

Target services/routes and UI owners should adopt these guards when their code becomes available.
Extend the existing Proxy matcher for any additional protected namespaces. Do not create a second
Proxy entry. AppShell and post-logout Back/navigation behavior must be checked with actual target
pages when those stories integrate, including any client-prefetched data.

## Validation

Run the existing commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build`, and `npm run test:e2e:auth`. The auth browser suite uses the local dummy provider,
not a hosted Supabase project; use `PLAYWRIGHT_CHANNEL=msedge` if using existing Edge on Windows.

Coverage includes direct handler success/401/503, no data in failures, per-call identity, page
redirects, fail-closed outages, cookie retention, post-login destination validation, and browser
navigation/login/logout. Target service invocation and real RLS ownership cannot yet be verified
because those features and shared hosted setup remain external dependencies.

## Fetched team branch review (2026-11-03)

These are remote-tracking snapshots, not merged changes or claims about unpublished team work.
No teammate branch was merged, modified, or deployed during this review.

- S1-014 at `8743735` supplies `createAnalysisTarget(client, ownerId, input)` and
  `getAnalysisTargetById(client, ownerId, targetId)` in the target repository. This matches the
  verified `auth.user.id` plus user-scoped client handoff. Its migration explicitly grants target
  operations to `authenticated`, revokes `anon`, enables RLS, and references `auth.users(id)`.
  Schema presence or successful deployment in the shared project was not checked.
- S1-015 at `aa4e6b9` supplies `/analysis-targets/new`. That page currently has no independent
  page guard. At integration, retain its UI and place `requirePageUser("/analysis-targets/new")`
  before rendering its protected content, inside an async component wrapped by Suspense. Do not
  rely only on Proxy or a parent layout. Adapt the page's unit tests to verify the guard.
- S1-015's browser client POSTs `{ name, sourceUrl }` to `/api/analysis-targets` and treats HTTP
  401 as expired authentication. Our matcher covers this exact API path and the page path. That
  fetched snapshot has no target `route.ts` handler; the eventual handler must use `requireApiUser`
  before validation/service work, pass the verified ID, and return a private response.
- S1-015's UI imports lowercase `ui/card` and related primitives, while S1-009 uses PascalCase
  primitives per engineering standards. Its Card has compound exports absent from our smaller
  Card. Reconcile these shared files and imports explicitly during integration, including Linux
  CI case sensitivity. Do not merge both implementations as parallel shared UI systems.
- Nested ingestion/review API names beyond these known paths remain proposals; matcher tests
  exercise nested namespace coverage without claiming those endpoints currently exist.

Continue local/live navigation checks on this branch while the owning target stories integrate.
Until a protected target page exists here, authenticated navigation reaches 404; that verifies
routing only and does not establish target UI, resource authorization, or RLS behavior.
