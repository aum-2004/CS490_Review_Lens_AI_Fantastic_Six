# `src/lib/supabase` — Persistent storage boundary

This folder is the single place where the application connects to Supabase (PostgreSQL and Auth).
No other code should construct a Supabase client directly.

Status: **Auth implemented in S1-009; application database schema remains planned.**
The public starter page and health endpoint need no credentials. Authentication requires the
public URL and publishable key documented in `.env.example`.

Contents:

- `config.ts`: S1-008 validation of public environment configuration.
- `client.ts`: browser client factory, available to future client-side consumers.
- `server.ts`: per-request server factory; read-only by default. Pass `true` only in
  Server Actions or Route Handlers that may write session cookies. Write errors propagate.
- `proxy.ts`: refreshes sessions and forwards updated cookies to the downstream request
  and browser, with private cache headers.

`src/proxy.ts` applies refresh to `/login`, `/auth/*`, `/api/auth/*`, and `/analysis-targets/*`.
It does not authorize resources. Backend operations must independently call
`getAuthenticatedUser()` in `src/services/auth/auth-service.ts` and check ownership as appropriate.
The helper calls Supabase `getUser()` for a server-verified identity and returns only ID/email.
Never authorize using a cookie payload or `getSession()` alone.

## S1-010 handoff

- Extend the existing `src/proxy.ts`; Next.js supports a single Proxy entry point. Keep
  `updateSession(request)` and its cookie/cache-header propagation when adding navigation guards.
- The current matcher covers only the paths listed above. A future `/api/analysis-targets` path
  is not covered. Include newly protected pages and API paths in the refresh matcher before relying
  on the read-only identity helper there. Do not assume all `/api/*` paths already run Proxy.
- If a guard returns a new redirect or error response, transfer all refreshed cookies and private
  cache headers from the response returned by `updateSession`. Otherwise the browser can keep
  stale tokens even when a backend check succeeded.
- Inside every protected server operation, independently call `getAuthenticatedUser()` from
  `@/services/auth/auth-service`. It returns `{ id, email }` for a verified user, `null` for missing
  or invalid identity, and throws a safe error when authentication is unavailable. S1-010 owns
  the page redirect/API rejection behavior for those results.
- `id` is the stable Supabase user ID later ownership logic should use. S1-011–013 own resource
  authorization; neither client-supplied owner IDs nor the email address establish ownership.
- Server Components use `createSupabaseServerClient()` in read-only mode behind a request/loading
  boundary. Actions and handlers that write auth cookies use `createSupabaseServerClient(true)`.
  Create a new server client for each request and let cookie-write failures propagate.
- Reuse the existing sign-out action in `@/app/login/actions` when building the AppShell account
  menu. The current signed-in `/login` panel demonstrates S1-009 sessions; it is not a new workspace.

This is an integration contract for later stories, not an implementation of their guards, target
pages, database ownership, or RLS policies.

See [authentication setup](../../../docs/s1-009-authentication.md) for confirmation email
configuration, test coverage, and limitations. Auth responses must not be shared-cacheable.

Related boundaries:

- Connection settings: `.env.example` lists the variable names; real values go in `.env.local`,
  which Git ignores. S1-008 owns the final variable list and startup validation.
- Schema and migrations: added by S1-014 under `supabase/migrations/` at the repository root
  (the Supabase CLI default).
- The Supabase service-role key bypasses Row Level Security. It is server-only and must not be
  used for normal user requests (see the S1-003 data and security guardrails).
