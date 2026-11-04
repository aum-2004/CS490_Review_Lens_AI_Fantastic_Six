# S1-009 managed authentication

## Local setup

1. Use **Node 24 LTS**, the merged team's baseline in `.nvmrc` and `package.json`.
   This satisfies the installed Supabase SDK's Node 22-or-later requirement.
2. Run `npm ci` (use `npm.cmd ci` if PowerShell blocks `npm.ps1`).
3. Copy `.env.example` to `.env.local` and fill in the team's Supabase project URL and
   publishable key. Do not share `.env.local`, credentials, tokens, or real account passwords.
4. Restart `npm run dev` after changing environment configuration.
5. Open `/login`. Without valid configuration, it shows a safe unavailable message.
   The public `/` starter and `/api/health` remain usable without Supabase credentials.

## Supabase dashboard setup (performed by the project administrator)

- Enable email/password authentication and allow new registrations if users should self-register.
- Keep email confirmation enabled unless the team deliberately selects a different policy.
  Supabase owns password policy and rate limits; this application does not store or hash passwords.
- Set Auth's Site URL to `http://localhost:3000` for local testing, or the actual deployment origin
  for that environment. Use an agreed team setup for multiple environments. Never use an arbitrary
  redirect origin supplied by the browser.
- In the **Confirm signup** email template, use this link:

  ```html
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
    >Confirm your email</a
  >
  ```

- Save the template and test with a fresh test account. Existing emails may still contain the
  old link. SMTP configuration, provider email limits, and delivery must be checked in the dashboard.
- No service-role key, database password, or ingestion-provider secret is needed for this story.

The `/auth/confirm` handler uses Supabase's `verifyOtp` API to establish cookie storage, then
redirects to `/login` without forwarding the token. Invalid/expired links show a safe notice.
Confirmation URLs contain sensitive one-time tokens; do not paste them into logs or transcripts.

## Behavior and handoff

- `/login` offers sign-in and registration using one shared AuthForm. Email is trimmed; passwords
  are passed unchanged. Fields are validated in the browser and again in the server service.
- Registration without a session asks the user to check their email; it does not claim login.
- Signed-in `/login` shows the verified email and logout. This is an explicitly temporary S1-009
  session demonstration. The `/analysis-targets` destination, AppShell/account menu, requested-route
  return behavior, and broader protected-route UX are handed off to their owning stories.
- `getAuthenticatedUser()` supplies `{ id, email }` from Supabase `getUser()` to server operations.
  Missing/invalid sessions return `null`; configuration or provider failures throw only a safe error.
- `GET /api/auth/session` demonstrates the shared API contract: verified identity returns 200;
  missing identity returns 401 without user data; unavailable auth returns 503 without diagnostics.
- Server Actions implement sign-in, registration, and logout using Next.js same-origin POST handling.
  Auth mutations and confirmation use a writable per-request client; rendering uses a read-only one.
- Proxy refreshes tokens via `getClaims()` and forwards cookie changes to both downstream requests
  and browser responses. Session responses use private/no-store headers. The public starter and
  health route do not invoke Proxy or require Supabase.
- Logout uses Supabase's local-session scope, clears the current browser's cookie session and
  invalidates Next.js cached navigation. Other devices remain signed in. Failed logout is reported
  and can be retried. Already-issued access JWTs can remain valid until expiry under Supabase's
  session model; this story does not claim instant invalidation of every previously copied JWT.
- S1-010 must independently verify protected server operations and pages; Proxy alone never
  authorizes data. S1-011–013 own resource ownership, RLS, and cross-user resource denial tests.

The [Supabase handoff](../src/lib/supabase/README.md#s1-010-handoff) specifies the identity helper,
client modes, refresh matcher, and cookie-preservation requirements for S1-010. The
[shared UI export inventory](../src/components/ui/README.md#supported-exports-and-reuse) lists the
current component APIs so later stories can extend them without generating duplicates.

## Verification

Automated tests mock Supabase; no live account, external API, credentials, or paid service is needed.
They cover validation, password preservation, identity verification and request separation, safe
provider errors, confirmation, cookie refresh/clearing, logout, API responses, and UI states.

Run formatting, lint, typecheck, Jest, and build using the repository scripts. Run the separate
Playwright smoke suite when its Chromium browser is available. Passing mocks do not establish that
the team's live dashboard settings, email delivery, or deployed sessions work.

### Isolated browser integration tests

The isolated browser integration suite runs the real Next.js app and Supabase SDK against a local
test provider with dummy credentials. It does not load real credentials into that app process.
It covers invalid login, cookie storage, explicitly expired-session refresh, navigation/reload,
verified identity, logout/back-navigation, and registration's confirmation state.

```powershell
# Use Playwright's installed Chromium, or select an existing supported browser:
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e:auth
```

The configuration starts and stops isolated servers on ports 3100 and 54329. If using bundled
Chromium, omit the channel override and install Chromium through the team's normal setup process.
The provider fixture under `tests/fixtures/` is test-only and must never be deployed as auth code.
It intentionally issues dummy tokens and includes test controls; it does not implement Supabase
security. The real project's policies and hosted behavior still require manual acceptance below.

Auth specifications live under `tests/e2e/auth/`. The ordinary `npm run test:e2e` command keeps
running the foundation smoke suite; it excludes the auth directory because those tests require
the isolated provider started by `npm run test:e2e:auth`. Both commands accept the optional
`PLAYWRIGHT_CHANNEL` override; without it, they use Playwright's installed Chromium.

### Manual acceptance checklist (requires the team's configured project)

- Register a fresh test account; verify confirmation instructions and email delivery.
- Confirm using the email link; verify `/login` shows the authenticated email.
- Test incorrect credentials, malformed email, empty fields, and an expired confirmation link.
- Sign in, refresh `/login`, navigate to `/` and back, and verify the session remains active.
- Inspect `/api/auth/session` after sign-in: identity must match the signed-in account.
- Verify token refresh across an actual expiry using the project's configured token lifetime.
- Sign out; refresh/back-navigation must not restore authenticated content. The session API must
  return 401 without user data. Retry login after logout.
- Repeat in a separate browser/account and confirm each session API returns its own verified ID.
- Obtain teammate review plus the additional authentication/security review required by S1-004.

These live checks remain pending until performed; do not mark the issue Done from mocks alone.

### User-reported hosted acceptance (2026-11-03)

Shawn reports successful registration, email confirmation, sign-in, navigation/reload persistence,
verified session API identity, logout with signed-out API rejection, incorrect-password rejection,
and distinct identities in two browser sessions. These checks ran on the dependent S1-010 branch,
which contains S1-009. They have not yet been repeated manually on the isolated S1-009 branch.

The hosted expiry-refresh check was reported as passed after proposing a temporary JWT duration
of 300 seconds and a six-minute idle interval. No tokens were inspected by the assistant; this is
user-reported acceptance evidence. Restoration to 3600 was initially deferred while the PM was
unavailable; Shawn subsequently reported the original duration restored. The reviewer now requests
PM confirmation/evidence of the current setting. No shared project setting was changed or inspected
by the assistant; do not present the user report as an independently verified dashboard value.

Shawn and the PR reviewer report GitHub CI passed. Its current run was not independently inspected
by the assistant. Expired confirmation-link acceptance, exact hosted email-template configuration,
full isolated S1-009 manual acceptance, and required teammate/security review remain pending.
The isolated invalid-link check recorded below passed; it does not prove actual token expiry.

Original live-test exchanges, with personal values redacted, are preserved in the supplementary
[S1-010 session transcript](../ai-transcripts/2026-11-03_shawn_S1-010_codex.md). Its inclusion here is
conversation evidence; no S1-010 production changes are included in the S1-009 branch.

### Isolated S1-009 automated verification for PR preparation

After preserving S1-010 as a separate local checkpoint, the S1-009 branch independently passed
67 unit tests (11 suites), 2 local-provider auth browser tests, 2 home/health smoke browser tests,
lint, explicit typecheck, formatting, and production build. Browser checks used existing Edge.
These are local results, not GitHub CI or new hosted manual acceptance. The initial auth browser
attempt could not acquire Next's dev lock while the user's server was running; it was stopped
briefly, both suites/build were verified, and the user's dev server was restarted on S1-009.

### PR review follow-up (2026-11-04)

Keep PR #37 Draft and use `Refs #9` while acceptance and security review remain outstanding. The
assistant cannot update GitHub PR metadata without a connected PR tool; a revised description is
prepared separately for the author to paste. Do not infer that CI passing completes human review.

| Review item                          | Evidence / remaining action                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JWT expiry                           | User reports restoration to 3600. PM confirmation or a settings check remains requested; do not change the value again for this review.                                                                                                                      |
| CI                                   | User and reviewer report a passing run. Link the actual run from this PR's Checks tab when updating the description; the supplied `/pull/27` URL is a PR URL rather than an Actions run URL.                                                                 |
| Invalid confirmation on isolated 009 | Direct fresh/no-cookie request with an invalid dummy token returned 307 to `/login?notice=confirmation-error`; the destination returned 200 with safe error copy. Session API returned 401 `AUTH_REQUIRED` with no data. No real token/account was supplied. |
| Expired confirmation                 | Automated SDK/route mocks cover rejection. A genuinely expired hosted link has not been independently tested; invalid/reused links must not be recorded as proof of expiry.                                                                                  |
| Hosted template and Site URL         | Expected Site URL and TokenHash callback are specified above. Actual dashboard values remain unconfirmed. Registration success alone does not establish which callback was used.                                                                             |
| Full live acceptance on 009          | Earlier hosted happy-path checks ran on dependent 010. Repeat registration/confirmation, sign-in, persistence, identity, logout, and failure cases on this branch; local automated checks already passed here.                                               |
| Shared UI                            | On 2026-11-04 the 015 owner agreed to PascalCase and 009-first merge order, then reconciliation in 015 after accounting for its 016 dependency. Actual reconciliation and reviewer acceptance of this deferred integration remain pending.                   |
| Human/security review                | Obtain the normal teammate review and the additional authentication/security-focused review required by S1-004 section 7 before merge. No external review request was sent by the assistant.                                                                 |

Proposed PM confirmation request (no credentials needed): confirm JWT expiry is 3600, the local
test Site URL is `http://localhost:3000`, and Confirm signup uses the TokenHash `/auth/confirm`
template shown above. Record only settings/check outcomes, not real confirmation links or tokens.

### Shared UI reconciliation plan for PR #36

On 2026-11-04 Shawn supplied the 015 owner's agreement to PascalCase, one shared implementation,
and 009 merging first. The owner will update 015 from main, extend the shared Card as needed,
preserve both forms' accessibility/functionality, and share the reconciliation diff after tests/CI.
They also confirmed 015 is stacked on 016 and will reconcile that dependency/history before final
integration. This records owner agreement, not completed implementation or 009 reviewer approval.
The previously inspected PR #36 head is `aa4e6b9`; no newer implementation was inspected here.

1. Retain PascalCase `Button.tsx`, `Input.tsx`, `Card.tsx`, and `Label.tsx` per the current engineering
   standard, with one canonical implementation per primitive and consistent imports. Changing the
   convention requires a reviewed standards change; do not keep case-only duplicates.
2. Follow the agreed merge order: 009 lands first after its acceptance/reviews pass. The 015 owner
   then updates from current main, accounts for 016's merge and stacked history, and reconciles
   imports/primitives before merging 015. Do not blindly accept both file sets.
3. Reconcile APIs as well as filenames. PR #36 uses Base UI/generated components and compound Card
   exports, while 009's approved implementation uses Radix/React Hook Form and a smaller Card.
   Agree on the canonical APIs, extend required shared exports in one place, and adapt both feature
   consumers. Do not replace the authentication dependency baseline as an incidental rename.
4. Normalize utility imports to the agreed shared `cn` helper and retain team dimensions, focus,
   labels, pending state, and keyboard behavior. Existing exports are documented in the UI README.
5. Case-only renames on Windows require a temporary intermediate name, performed on a branch
   without an existing conflicting target file. If both cases are present, reconcile in a case-sensitive
   environment before checkout/merge; do not overwrite one implementation with `git mv -f`.
6. After reconciliation, run auth and target-form tests, typecheck, lint/formatting, and the Linux CI
   build. The post-merge Linux check is necessary to catch import-case mistakes Windows may hide.

### Additional live app checks on isolated 009 (2026-11-04)

Using fresh headless Edge sessions against the running localhost app with its existing configured
Supabase project, the following checks passed without a real account/password/token:

- Signed-out session endpoint returns 401 `AUTH_REQUIRED` without `data`.
- Empty sign-in fields show accessible invalid state.
- Malformed email is rejected by form validation.
- Empty registration fields show accessible invalid state without creating an account.
- Missing confirmation token, unsupported confirmation type, and an invalid dummy confirmation
  token each lead to the safe confirmation-error notice; session remains unauthenticated.

The browser probes initially encountered repeated development-page reloads. Only the verified
project dev process was restarted; validation then passed. The confirmation assertion was scoped
to the app's main alert to exclude Next's separate route announcer. These were probe/development
state issues; no application code or shared Auth settings changed. This is live app failure-case
evidence, not a completed authenticated account lifecycle or proof of provider token expiry.

### Genuine expired-confirmation acceptance procedure — pending

Email confirmation is governed by **Email OTP Expiration**, not the access-token/JWT expiry.
The user has no unused older confirmation email and cannot currently confirm the email expiry
duration. No fresh signup was created by the assistant, and no expired-link pass is claimed.

1. Have the PM read the current Email OTP Expiration value in the email provider settings. Keep
   JWT expiry at 3600 and leave the shared email expiry unchanged. Confirm the Site URL/template.
2. Register a fresh test account in the 009 app using an inbox controlled by the tester. Record the
   issuance time and configured duration, without recording email/password or the link/token.
3. Leave it unconfirmed; do not click the link or request another confirmation before the test.
   Check for email-link scanners/prefetching or other events that could consume/invalidate it.
4. After the configured email duration plus a small margin, open the original link in a signed-out
   test browser. Expect the safe error notice and session API 401 without user data. Confirm the
   account remains unconfirmed and record timestamps/outcomes only. Provider logs can support
   the result, but an `otp_expired`/invalid message alone does not establish the cause.
5. Complete remaining happy-path checks with a fresh valid confirmation flow, sign-in, navigation,
   identity, logout, and separate-account identity on 009. Retain settings/test evidence for review.

An invalid or previously consumed link is not a substitute for this procedure. Official references:
[Email OTP expiry](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[verification-failure causes](https://supabase.com/kb/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0).

## Deliberately deferred decisions

The upstream Node 24 baseline was adopted when S1-001–008 were merged into this branch.
The earlier independent proposal to change the minimum to Node 22 was not applied.
Geist remains until the team approves the font change. Development-tool audit findings require separate review; do not run
`npm audit fix --force` or approve native install scripts without understanding the resulting changes.

## Sources

- [Supabase SSR integration](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase email/password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase logout](https://supabase.com/docs/guides/auth/signout)
- [shadcn/ui forms](https://ui.shadcn.com/docs/forms/react-hook-form)

Implementation also follows the installed Next.js authentication, Cache Components authentication,
Server Actions, Proxy, Route Handler, and async cookies guides under `node_modules/next/dist/docs/`.

### AI-assisted security review completed (2026-11-04)

The focused source review found no blocking issue in the reviewed 009 authentication code;
48 targeted tests passed in six suites. See [the review evidence](s1-009-security-review.md)
for scope, assertions, and limits. Shawn explicitly stated that teammate review is unnecessary
for this step; this latest instruction supersedes the earlier pending teammate-review requests
in this working record. It does not claim human approval or rewrite S1-004 globally.
Genuine expired-link, hosted configuration, and isolated authenticated acceptance evidence
remain pending. The revised PR description records CI passing based on author/reviewer reports;
no live GitHub metadata was edited by the assistant.

### User-confirmed authenticated checks on isolated 009 (2026-11-04)

With `feature/S1-009-managed-authentication` checked out, Shawn supplied a screenshot of
`/login` showing the signed-in account panel (personal account values omitted here).
He then confirmed that all of the following passed in the same browser:

- Refreshing `/login` preserves the authenticated account panel.
- Navigating home and back through the sign-in link preserves the account panel.
- `/api/auth/session` returns success and the signed-in account's identity.
- Signing out returns to the sign-in form; refresh keeps the browser signed out.
- After logout, `/api/auth/session` returns `AUTH_REQUIRED` without user data.
- Signing in again restores the account panel.

These are user-confirmed hosted-session checks on isolated 009, not assistant-controlled
browser observations. Fresh registration/email confirmation on 009, hosted Site URL/template
verification, and a genuinely expired confirmation link remain outstanding. Dashboard checks
require the PM because Shawn reports no access. No new JWT-expiry test was claimed.

### Current reviewer handoff status (2026-11-04; supersedes earlier pending lists)

Shawn now reports that fresh registration/email confirmation also passed on isolated 009,
in addition to the previously confirmed sign-in, persistence, identity, logout, and re-login
checks. No fresh account or inbox was accessed by the assistant; these are author-reported
results. Remaining hosted acceptance items are actual Site URL/TokenHash template verification
and a genuinely expired unused confirmation link. Shawn's latest message expresses uncertainty
about Aryan restoring JWT expiry, so final PM confirmation of 3600 is pending despite earlier
reports of restoration. Email OTP Expiration is separate and must be known for the expiry test.
The 015 owner is also the 009 reviewer and agreed to the shared UI reconciliation plan.

The AI-assisted security review is complete within its documented scope. Prior CI success is
reported by author/reviewer; this documentation push requires a new passing run. PR metadata
must use Refs #9 and remain Draft pending acceptance. No claim that remote metadata was edited
is made. This guide and the security report are the current reviewer handoff evidence.
