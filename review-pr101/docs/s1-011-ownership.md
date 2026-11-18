# S1-011: Ownership from authenticated identity

## Decision

ReviewLens stores the Supabase Auth user ID (`auth.users.id`) as the owner of user-owned records.
This is the "provider user identifier stored as owner" approach from the story. There is no separate
internal User table, because nothing in Sprint 1 needs profile data that Supabase Auth doesn't hold.

Ownership is enforced at two independent layers:

1. **Application:** the Route Handler takes the owner only from `requireApiUser()`, which verifies
   the session with Supabase Auth on each request.
2. **Database:** Row Level Security requires `auth.uid() = owner_id`, using a client that carries the
   user's session. A service-role client bypasses this and must not be used for user requests.

## Rules for user-owned records

- Never read an owner from the request. `ownerId`, `userId`, and similar body fields are ignored, not
  rejected, so a spoofed value has no effect.
- Pass only validated fields to persistence. Repository inputs don't include ownership, so it remains
  a separate argument supplied by the server.
- Authenticate before reading the request body or creating a database client.
- `AnalysisTarget` stores `owner_id` directly. Reviews and ingestion attempts inherit ownership through
  their parent target, as the engineering standards (section 8) describe. S1-013 and S1-022 own that
  parent check and its tests.

## Implemented endpoint

`POST /api/analysis-targets` accepts `{ name, sourceUrl }` and matches the S1-015 client contract:

| Status | When                                      | `error.code`                      |
| ------ | ----------------------------------------- | --------------------------------- |
| 201    | Target committed; `data` is the target    | —                                 |
| 400    | Invalid or malformed input; nothing saved | `INVALID_ANALYSIS_TARGET_INPUT`   |
| 401    | No valid session; nothing saved           | `AUTH_REQUIRED`                   |
| 503    | Identity could not be verified            | `AUTH_UNAVAILABLE`                |
| 500    | Unexpected or persistence failure         | `ANALYSIS_TARGET_CREATION_FAILED` |

## Verification

- `tests/unit/app/api/analysis-targets/route.test.ts` runs the real guard, validator, and repository
  with a fake database client and asserts the exact row sent to Supabase.
- `npm run test:db` proves at PostgreSQL that RLS rejects a row whose owner isn't the current user.

### Hosted verification

The endpoint was verified against the shared Supabase project at commit `76fccb2`. The sanitized
results and the scripts are in the comments on pull request #40.

- The final S1-014 migration from `main` was applied through the SQL editor, because the table did
  not exist yet. All 17 read-only schema checks passed, covering columns, column permissions, RLS
  policies, and constraints.
- All 24 live checks passed using two test accounts: spoofed owner IDs, unauthenticated requests,
  invalid input, cross-user read, update, delete, and insert, and direct column writes.

Because the SQL editor doesn't record migrations, the history was then reconciled with
`supabase migration repair 20261103120000 --status applied`, which changes only the history table.
`supabase migration list` now shows the version as both local and remote, and
`supabase db push --dry-run` reports that the remote database is up to date, so a future push won't
reapply it. Use `db push` for later migrations so the history stays accurate.

A database failure was not forced on the shared project. The generic 500 for that case is covered by
the route tests and a local run against PostgreSQL. The S1-015 form was not part of this verification.

If a session expires between `requireApiUser()` and the insert, RLS rejects the write and the user
gets a 500 rather than a 401.
