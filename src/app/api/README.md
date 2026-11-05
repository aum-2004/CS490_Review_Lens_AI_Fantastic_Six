# `src/app/api` — Backend Route Handlers

Everything under this folder runs on the server. Each `route.ts` file becomes an HTTP endpoint;
for example `src/app/api/health/route.ts` serves `GET /api/health`.

Route Handlers stay thin (see `docs/engineering-standards.md`, sections 3 and 7):

1. Validate the request.
2. Authenticate the user from the verified Supabase session — never from a client-supplied ID.
3. Authorize access to the requested resource.
4. Call a service in `src/services/`.
5. Return the shared response shape: `{ "success": true, "data": ... }` or
   `{ "success": false, "error": { "code": ..., "message": ... } }`.

Current endpoints:

| Method | Path                | Purpose                                                      | Added by   |
| ------ | ------------------- | ------------------------------------------------------------ | ---------- |
| GET    | `/api/health`       | Confirms the server is running. No auth, no database.        | S1-005     |
| GET    | `/api/auth/session` | Returns verified identity; rejects missing/invalid sessions. | S1-009/010 |

Target, ingestion, and review endpoints arrive with their respective stories. Every protected
handler must independently use `requireApiUser()` from `@/services/auth/access-control` and return
its failure `response` before invoking services. Proxy refreshes cookies but does not guard APIs.
See [S1-010 integration guidance](../../../docs/s1-010-route-protection.md) for ownership handoff
and private response caching.
