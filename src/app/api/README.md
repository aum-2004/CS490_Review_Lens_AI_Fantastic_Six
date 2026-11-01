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

| Method | Path          | Purpose                                               | Added by |
| ------ | ------------- | ----------------------------------------------------- | -------- |
| GET    | `/api/health` | Confirms the server is running. No auth, no database. | S1-005   |

Protected endpoints (analysis targets, ingestion, reviews) arrive with S1-009 onward.
