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

See [authentication setup](../../../docs/s1-009-authentication.md) for confirmation email
configuration, test coverage, and limitations. Auth responses must not be shared-cacheable.

Related boundaries:

- Connection settings: `.env.example` lists the variable names; real values go in `.env.local`,
  which Git ignores. S1-008 owns the final variable list and startup validation.
- Schema and migrations: added by S1-014 under `supabase/migrations/` at the repository root
  (the Supabase CLI default).
- The Supabase service-role key bypasses Row Level Security. It is server-only and must not be
  used for normal user requests (see the S1-003 data and security guardrails).
