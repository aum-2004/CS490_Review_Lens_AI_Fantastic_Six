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

These don't exercise the handler against a live Supabase project. That check needs the
`analysis_targets` migration applied to the team project and two signed-in test accounts: create a
target as each user with a spoofed `ownerId`, then confirm each row's `owner_id` is the signed-in user.
