# S1-010: Protected routes and backend operations

S1-009 was squash-merged into main on 2026-11-05 as 5c200a9 (PR #37), including the
implementation and verified development-logging fix reviewed at e83041b. S1-010 has now
incorporated origin/main through that commit, including S1-016's validation work.
PR #39 should target main. The published branch history is preserved without a force-push;
the merge resolves duplicate-history conflicts while retaining the S1-010 guard extensions.
The S1-009 branch remains intact. Its completed reviews apply to that story;
010 still requires its own PR review and current CI before merge.

The shared Supabase project exists. Hosted 009 acceptance, temporary personal SMTP and restored
JWT/Email OTP settings are documented in the 009 guide. The implemented 010 guards are ready
for review, while actual target-page/API adoption and live target-data tests remain the owning
stories' integration work. Historical snapshots below retain their original dates.

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

## Local HTTP protection checks after resuming S1-010

After bringing S1-009's transcript/evidence commits into S1-010, direct requests to the running
local app were sent with cookies disabled and redirects not followed:

| Request                      | Observed result                                                          |
| ---------------------------- | ------------------------------------------------------------------------ |
| `/analysis-targets/new`      | 303 to `/login?next=%2Fanalysis-targets%2Fnew`; private/no-store         |
| `/analysis-targets/target-a` | 303 to login with the original path; private/no-store                    |
| `/api/auth/session`          | 401 `AUTH_REQUIRED`, no user/data payload, no redirect, private/no-store |
| `/api/health`                | 200                                                                      |
| `/login`                     | 200, no-store                                                            |

No credentials or user cookies were supplied by the assistant. The user subsequently restarted
the manual test and reports that signed-out navigation redirected to login and successful sign-in
returned to `/analysis-targets/new` (currently a 404). This is live return-to-page acceptance, not
target-page/data authorization verification. These checks do not establish protection of a target
API that has not yet been implemented or integrated. The user also reports post-logout target
navigation redirects back to login and the session API returns `AUTH_REQUIRED` without user data.
Live navigation/session checks for the currently implemented guards have passed; real target
page/API adoption, target data checks, S1-010 PR CI, and human/security review remain pending.

## Team integration handoff and draft review

S1-010's shared branch is `feature/S1-010-protected-routes`.
Its draft PR should target `feature/S1-009-managed-authentication` while S1-009 is unmerged, so
reviewers see only the S1-010 changes. After S1-009 merges, update this branch as appropriate and
retarget the draft to `main`; inspect the resulting diff, resolve any squash-merge duplication,
and rerun required checks before marking it ready. Do not merge 010 into 009 to complete review.

The following is a proposed division of integration work for the story owners to confirm. It
does not assign teammates externally or claim their routes have been modified.

| Story / boundary                     | Integration action                                                                                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 011 / target creation handler        | Call `requireApiUser()` before reading/processing protected input or invoking services. Return its failure response immediately; pass `auth.user.id` and a user-scoped Supabase client into the target service. |
| 015 / `/analysis-targets/new`        | Put `requirePageUser("/analysis-targets/new")` before rendering the form inside an async component behind Suspense. Reconcile shared UI filenames/exports with the existing auth primitives.                    |
| 017 / `/analysis-targets`            | Verify the page/data operation and constrain target queries by the verified identity. Do not fetch every user's targets and filter in the browser.                                                              |
| 018 / `/analysis-targets/[targetId]` | Verify identity before loading target data, then enforce ownership through the repository/service. Use the agreed 404 behavior for missing or foreign targets. Check protected child operations independently.  |
| 012/013 / ownership tests            | Keep cross-user resource tests with the ownership stories. Authentication guards establish identity; they do not establish ownership by themselves.                                                             |

Helpers are exported from `@/services/auth/access-control`. Normal user database operations use
the existing `createSupabaseServerClient` in `@/lib/supabase/server`, preserving session cookies;
they do not use service-role credentials or an owner ID supplied by the browser. Document any
new API namespace so the existing Proxy matcher can cover refresh there.

Owner-side acceptance should cover signed-in success, signed-out 401/redirect with no protected
data, safe provider failure, direct handler/action invocation, post-logout navigation, and User A/B
ownership checks where applicable. The current session endpoint's tests do not prove future target
handlers are guarded. No endpoint, page, migration, or UI primitive should be duplicated merely to
make this authentication PR appear complete.

Latest fetched S1-012 snapshot includes target repository and database isolation tests but no
target `route.ts` handler. No S1-012 code or migrations were merged during this handoff review.

## Resumed integration review (2026-11-04)

Resumed the existing S1-010 branch and merged S1-009's published documentation-only follow-up
(commit 271a490). No 009/010 authentication implementation changed in that merge. S1-009
remains unmerged at the fetched main snapshot (1d2be39). Its latest author-confirmed checks
include fresh registration/confirmation, sign-in, refresh/navigation, verified session identity,
logout, and re-login directly on 009. Hosted Site URL/template, genuine confirmation expiry,
and final PM confirmation of JWT restoration remain pending; this supersedes the older opening
status above. The 015 owner/reviewer agreed to reconcile shared UI in 015 after 009 merges.

The newly fetched 011 branch at a0d8fd7 supplies POST /api/analysis-targets. Source inspection
shows requireApiUser() runs before body validation/database work, and the handler passes
verified auth.user.id with a session-scoped client into persistence. The shared access-control
helper matches 010's implementation. Its direct handler tests assert successful creation,
401 before persistence, 503 on failed identity verification, and ignored submitted owner IDs.
Those 011 tests were inspected, not run or merged on this branch. This is a compatible handoff,
not proof of live database/RLS behavior or deployed target protection.

The fetched 015 page at 08087ed still lacks an independent page/data guard and imports the
lowercase shared primitives. Its agreed integration step remains necessary. No 011 or 015 code
was merged into 010; target routes/pages remain absent here. Continue the stacked 010 PR against
009 while it is unmerged, then reconcile main and retarget after 009 merges.

## Final implementation and integration assessment (2026-11-05)

The 010 implementation was re-inspected against engineering standards and installed Next guides.
It verifies identity again at backend/page boundaries, fails closed on missing identity/provider
failure, preserves private responses and refreshed cookies, and restricts login destinations to
the protected namespace. The verified 009 logging fix is inherited. No new guard defect was found
and no additional application change was needed in this completion pass.

Current fetched integration evidence:

- 011 at a0d8fd7 calls the unchanged requireApiUser before JSON validation or database work,
  supplies auth.user.id, and creates a session-scoped client. Its tests cover 201, unauthenticated
  401, verification failure 503 and ignored owner fields. This is source inspection, not a claim
  that those tests ran here or the migration is deployed.
- 015 at 08087ed still needs requirePageUser before protected content/data and the agreed shared
  UI reconciliation. Its page is not merged into this branch. Signed-in visits on this branch
  therefore still return 404 after safe navigation; signed-out access redirects before rendering.
- 017/018 pages and additional target/review/ingestion handlers must independently adopt guards;
  resource ownership tests belong to 011-013 and the owning features. Proxy alone is insufficient.

The shared guard implementation and its handoff are complete for review. Do not describe actual
absent target features as integrated or mark the whole sprint's authorization complete from the
session endpoint alone. After 009 merges, reconcile this branch with main and retarget the PR;
handle squash-history duplication if applicable, inspect the diff, and rerun CI before merge.

### Completion-pass validation (2026-11-05)

On the updated 010 branch, all 113 unit tests in 14 suites, five isolated Edge auth/protection
browser tests, lint, formatting, explicit typecheck and production build passed. The browser
suite verified direct API rejection, forged owner input, login return flow, logout re-protection
and rejection of an external return destination, in addition to session lifecycle checks.
The guard/matcher/cookie/security inspection found no new defect in 010. This does not replace
current GitHub CI, PR approval, or integration tests for absent target features.

Original saved 010 dialogue was recovered in ai-transcripts/2026-11-05_shawn_S1-010_codex.md
with declared selection, privacy redactions and attachment limits. Nov3/Nov4 records remain as
action evidence with intentional overlap. No application behavior beyond the existing 010
implementation and inherited 009 logging fix was added during this completion pass.

Live signed-out checks against the restarted normal 010 app also passed: protected namespace
root/new/detail URLs redirected 303 with private/no-store, the direct session API rejected forged
owner input with 401 and no data/HTML redirect, and public health returned 200. No cookies or
credentials supplied. The app remains running on 010 at localhost:3000.

## Post-S1-009 squash-merge reconciliation (2026-11-05)

S1-009 PR #37 is merged as 5c200a9. Merged origin/main into the existing published
S1-010 branch, retaining the S1-010 guard changes and longer original transcript where
Git reported duplicate additions from the squash history. Main's S1-016 validation,
tests, transcripts and UI standards are retained unchanged. The S1-009 branch was not
deleted or modified. No history rewrite or force-push was used.

The diff against main contains S1-010 implementation, tests and evidence only. In
particular, shared UI primitives, dependency files and the S1-009 logging configuration
match main. The commit list retains earlier ancestry; those commits do not represent
duplicate file changes in the resulting main-based PR diff.

After reconciliation, all 213 unit tests in 15 suites, all five isolated Edge auth/
route-protection browser tests, lint, explicit typecheck and production build passed. The increase from
113 unit tests includes S1-016 coverage inherited from main. Browser tests use only the
local dummy provider. Actual target integration, independent review of S1-010 and CI
on its new head remain required; S1-009's approvals do not approve S1-010.

Earlier dated statements about S1-009 being unmerged are historical snapshots, superseded
by this section and the current opening status.
