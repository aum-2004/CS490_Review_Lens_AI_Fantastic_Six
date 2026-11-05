# S1-009 authentication security review

Date: 2026-11-04. Reviewer: Codex (AI-assisted review).
Reviewed implementation: `feature/S1-009-managed-authentication`, commit
`a4bbd56e1ce9266b4b34886424a4991e0c360648`.

Result: no blocking security issue identified in the reviewed authentication implementation.
This is a scoped source/test review, not a penetration test or verification of hosted settings.
The PR reviewer subsequently clarified that independent security-focused review is still
required under S1-004 section 7. This AI report is supporting evidence and does not satisfy
that requirement. Shawn later reported being instructed to self-review; acceptance of that
alternative has not been documented here. No human review or approval is claimed.

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

## Latest acceptance evidence and remaining review (2026-11-04)

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

Independent security-review acceptance and final PR approval remain unresolved. SMTP sender
replacement is a documented handoff item. Check Spam/Junk if email is missing from the inbox;
one test reached Spam and a later test reached the inbox.

## References

- [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
- [Supabase sign-out scope](https://supabase.com/docs/guides/auth/signout)
- Installed Next.js authentication, Server Actions, Proxy, cookies, and caching guides.

Reviewed files include `src/services/auth/auth-service.ts`, `src/lib/supabase/server.ts`,
`src/lib/supabase/proxy.ts`, `src/lib/validation/auth.ts`, `src/app/login/actions.ts`,
`src/app/api/auth/session/route.ts`, `src/app/auth/confirm/route.ts`, and the auth UI.
