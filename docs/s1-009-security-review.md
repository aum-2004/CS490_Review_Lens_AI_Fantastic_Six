# S1-009 authentication security review

Review date: 2026-11-04. Updated: 2026-11-05.
Security reviewer: Shawn (author-performed review), with Codex assistance.
Status: completed; the PR reviewer confirmed this author-performed review is sufficient for S1-009.

The supporting Codex source review examined
Reviewed implementation: `feature/S1-009-managed-authentication`, commit
`a4bbd56e1ce9266b4b34886424a4991e0c360648`.

Result: no blocking security issue identified in the reviewed authentication implementation.
This is a scoped source/test review, not a penetration test or verification of hosted settings.
Shawn completed the security check assigned by the PR reviewer, covering the implementation
and related tests described below. The reviewer confirmed that no additional security reviewer
is needed for S1-009. The Codex findings and test runs support Shawn's completed review.

## Scope and observations

- Identity: the server-only auth service obtains identity with Supabase `getUser()` and returns
  only ID/email. It creates a client per request; client ownership fields are not trusted.
  Missing/invalid identity fails closed; provider outages produce a safe unavailable state.
- Credentials: registration/sign-in use the supported SDK. Zod validates input server-side;
  passwords are preserved unchanged. Password storage, policy, and rate limiting belong to
  Supabase. Auth responses do not return session tokens or raw provider diagnostics.
- Session cookies: the server adapter permits writes explicitly for Actions/Route Handlers.
  Proxy forwards refreshed cookies to both the request and browser, preserves successive SDK
  writes, and sets private/no-store headers. Proxy is not the authorization boundary.
- Mutations: sign-in, registration, and logout are Server Actions using Next's origin-checked
  POST mechanism. No custom cross-origin mutation endpoint was introduced.
- Confirmation: only the email verification type is accepted and `verifyOtp` performs provider
  verification. Redirects use a fixed local path, strip the token, and set no-store/no-referrer.
  Missing/invalid tokens produce safe failure feedback rather than authenticated success.
- Logout: local-session scope is intentional; failures are surfaced. Other devices and
  already-issued access JWTs follow Supabase's documented session/expiry model.
- Errors/UI: operation-only application logs omit credentials and provider error objects.
  React renders feedback as text; the reviewed auth UI has no raw HTML injection sink.
- Boundaries: resource guards, owner assignment, RLS, migrations, and cross-user target/review
  authorization belong to 010 onward and are not certified by this review.

## Validation

Re-ran six existing Jest suites for the auth service, server cookie adapter, Proxy refresh,
session API, confirmation handler, and login Actions: **48 tests passed, 6 suites passed**.
Assertions include verified identity/request separation, rejected credentials, ignored owner
input, safe diagnostics, missing/rejected sessions, cookie propagation, fixed redirects,
confirmation rejection, logout failures, and API 401/503 responses without protected data.
Provider calls are mocked; an expiry-named mock test is not a genuinely expired hosted link.

Earlier full local checks and hosted failure-case checks are recorded in
[the authentication guide](s1-009-authentication.md). GitHub CI passing is reported by Shawn
and the PR reviewer; the current remote run was not independently inspected here.
No application code, dependency, dashboard setting, migration, or real credential changed.

## Acceptance evidence (2026-11-04)

- Custom SMTP is configured using a temporary personal Gmail sender. A supplied dashboard
  screenshot shows the required TokenHash template. Shawn confirmed a fresh confirmation
  automatically established the app session on 009 and the session API returned his identity.
- For the subsequent timed-expiry procedure, screenshots show the safe login error notice
  and session API AUTH_REQUIRED without user data. The test conditions were user-controlled;
  exact issuance/open timestamps and unused-link history were not independently observed.
  This is hosted callback-rejection evidence, not an independently measured token lifetime.
- PM confirmed JWT expiry 3600, and Shawn confirmed Email OTP Expiration restored and saved
  at 3600 after the temporary five-minute tests.
- Subsequent isolated-009 checks were confirmed by Shawn: sign-in, refresh/navigation,
  session API identity, logout with signed-out API rejection, and signing in again. Shawn
  subsequently also reported fresh registration/email confirmation passing on 009. These
  are user-reported observations; the assistant did not access the inbox or credentials.
- The exact Site URL dashboard value has not been supplied; successful local confirmation
  demonstrates the tested email reached the app, not an independent settings inspection.
- The 015 owner agreed to merge 009 first, then reconcile PascalCase shared components/APIs
  in 015 while resolving its 016 dependency. That later implementation remains pending.

The security review is complete. SMTP sender replacement is a documented handoff item.
Check Spam/Junk if email is missing from the inbox;
one test reached Spam and a later test reached the inbox.

## References

- [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase sign-out scope](https://supabase.com/docs/guides/auth/signout)
- Installed Next.js authentication, Server Actions, Proxy, cookies, and caching guides.

Reviewed files include `src/services/auth/auth-service.ts`, `src/lib/supabase/server.ts`,
`src/lib/supabase/proxy.ts`, `src/lib/validation/auth.ts`, `src/app/login/actions.ts`,
`src/app/api/auth/session/route.ts`, `src/app/auth/confirm/route.ts`, and the auth UI.

## Guided author review (2026-11-04)

Author: Shawn. Reviewed branch/commit: feature/S1-009-managed-authentication at 0ad1fe8.
Codex explained each inspection step; Shawn reported the code/tests looked correct for each.
Shawn confirmed all five review areas below. This completed author-performed review satisfies
the security check assigned by the PR reviewer for S1-009.

| Inspected area         | Author confirmation and scope                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity verification  | Confirmed auth service getUser verification, null/401 rejection, safe 503 failures, minimal identity response, request separation, and related test assertions.           |
| Credentials/errors     | Confirmed server-side schema validation, provider-managed passwords, preserved password input, ignored extra ownership fields, safe responses/logging, and related tests. |
| Cookies/refresh        | Confirmed per-request client, explicit writable mode, request/response cookie propagation, retained writes, private cache headers, and related tests.                     |
| Confirmation/redirects | Confirmed verifyOtp verification, email-only type, rejection on errors/missing session, fixed local destination, no token forwarding, privacy headers, and related tests. |
| Logout                 | Confirmed SDK local scope, failure reporting, cache invalidation, SessionPanel navigation/retry behavior, and related service/UI tests.                                   |

The earlier user-confirmed live tests support this inspection: session identity/persistence,
logout with no user data returned, valid TokenHash confirmation establishing a session, and
rejected callback showing safe feedback with AUTH_REQUIRED. Timing conditions remain as
qualified in the authentication guide. Local logout does not promise immediate invalidation
of every previously issued access JWT or logout on other devices.

Following these confirmations, Codex reran the existing isolated-009 Jest suite: 67 tests passed
in 11 suites. These results support the completed author review.
No application change was required by this guided inspection. The temporary personal SMTP
sender, variable inbox placement, and sender/credential replacement remain documented
handoff items. The previously missing transcript dialogue was recovered on 2026-11-05.

### Reviewer clarification of review responsibility

The 009 reviewer confirmed, as relayed by Shawn, that Shawn is responsible for the whole
security check and that his author-performed review is sufficient. No additional person is
required for this security review. The completed inspection and passing tests are recorded above.
