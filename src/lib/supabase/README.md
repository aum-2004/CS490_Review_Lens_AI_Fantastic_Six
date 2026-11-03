# `src/lib/supabase` — Persistent storage boundary

This folder is the single place where the application connects to Supabase (PostgreSQL and Auth).
No other code should construct a Supabase client directly.

Status: **reserved, not implemented.** The application currently has no database connection and
needs no credentials to run.

Planned contents:

- Browser and server Supabase client factories (S1-009).
- Configuration read from environment variables — never hard-coded (S1-008).

Related boundaries:

- Connection settings: `.env.example` lists the variable names; real values go in `.env.local`,
  which Git ignores. S1-008 owns the final variable list and startup validation.
- Schema and migrations: added by S1-014 under `supabase/migrations/` at the repository root
  (the Supabase CLI default).
- The Supabase service-role key bypasses Row Level Security. It is server-only and must not be
  used for normal user requests (see the S1-003 data and security guardrails).
