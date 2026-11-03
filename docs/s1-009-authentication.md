# S1-009 managed authentication

## Local setup

1. Use a compatible runtime: the installed Supabase SDK requires Node 22 or later.
   The repository's existing `engines.node >=20.9.0` declaration is deliberately unchanged
   at Shawn's request; Node 20 is not sufficient for the newly installed SDK.
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

## Verification

Automated tests mock Supabase; no live account, external API, credentials, or paid service is needed.
They cover validation, password preservation, identity verification and request separation, safe
provider errors, confirmation, cookie refresh/clearing, logout, API responses, and UI states.

Run formatting, lint, typecheck, Jest, and build using the repository scripts. Run the separate
Playwright smoke suite when its Chromium browser is available. Passing mocks do not establish that
the team's live dashboard settings, email delivery, or deployed sessions work.

Manual acceptance checklist (requires the team's configured project):

The isolated browser integration suite runs the real Next.js app and Supabase SDK against a local
test provider with dummy credentials. It does not load real credentials into that app process.
It covers invalid login, cookie storage, explicitly expired-session refresh, navigation/reload,
verified identity, logout/back-navigation, and registration's confirmation state.

```powershell
# Use Playwright's installed Chromium, or select an existing supported browser:
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e -- --config=playwright.auth.config.ts
```

The configuration starts and stops isolated servers on ports 3100 and 54329. If using bundled
Chromium, omit the channel override and install Chromium through the team's normal setup process.
The provider fixture under `tests/fixtures/` is test-only and must never be deployed as auth code.
It intentionally issues dummy tokens and includes test controls; it does not implement Supabase
security. The real project's policies and hosted behavior still require manual acceptance below.

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

## Deliberately deferred decisions

The Node minimum remains unchanged despite the SDK requirement, and Geist remains until the
team approves the font change. Development-tool audit findings require separate review; do not run
`npm audit fix --force` or approve native install scripts without understanding the resulting changes.

## Sources

- [Supabase SSR integration](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase email/password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase logout](https://supabase.com/docs/guides/auth/signout)
- [shadcn/ui forms](https://ui.shadcn.com/docs/forms/react-hook-form)

Implementation also follows the installed Next.js authentication, Cache Components authentication,
Server Actions, Proxy, Route Handler, and async cookies guides under `node_modules/next/dist/docs/`.
