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

| Method | Path                                         | Purpose                                                                                                   | Added by   |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| GET    | `/api/health`                                | Confirms the server is running. No auth, no database.                                                     | S1-005     |
| GET    | `/api/auth/session`                          | Returns verified identity; rejects missing/invalid sessions.                                              | S1-009/010 |
| POST   | `/api/analysis-targets`                      | Creates a target owned by the verified session user.                                                      | S1-011     |
| GET    | `/api/analysis-targets`                      | Lists only the verified session user's targets, across pages.                                             | S1-017     |
| GET    | `/api/analysis-targets/[targetId]/reviews`   | Lists the reviews of a target the user owns.                                                              | S1-013     |
| POST   | `/api/analysis-targets/[targetId]/reviews`   | Saves 1–100 reviews under a target the user owns.                                                         | S1-013     |
| POST   | `/api/analysis-targets/[targetId]/ingestion` | Starts asynchronous ingestion for an owned target using its stored Place ID or validated Google Maps URL. | S1-019     |

`POST /api/analysis-targets/[targetId]/ingestion` is disabled by default. It returns HTTP `503`
with error code `INGESTION_DISABLED` unless the server-side `INGESTION_ENABLED` environment
variable is exactly `"true"`. This gate must remain closed until S1-023 persists provider-job
ownership, lifecycle, and repeat-submission safeguards.

### Target child routes (S1-013)

Every route under `/api/analysis-targets/[targetId]/` runs `requireApiUser()`, then
`getOwnedTargetOrThrow()` from `@/services/analysis-targets/target-ownership`, **before** reading
the body or doing any child work. A missing, foreign, or malformed target id always gets the same
`404 TARGET_NOT_FOUND`, so a response never reveals that another user's target exists. Any
`ownerId`, `userId`, or target id in the body or query is ignored.

**`POST .../reviews` is not the ingestion path.** It saves reviews the signed-in user submits for
their own target. Ingestion goes through `POST .../ingestion` (S1-019/S1-020). Provider review
content, such as Outscraper results, must not be saved through this route until the provider's
storage terms are confirmed (see the integration gate in `src/services/README.md`).

`POST .../reviews` limits each request before the normalizer or the store runs. Any breach returns
`400 INVALID_REVIEW_INPUT`. The limits are named constants in `reviews/review-input.ts`:

| Limit               | Value                                                   |
| ------------------- | ------------------------------------------------------- |
| Request body        | 2 MiB, read as a stream (Content-Length is not trusted) |
| Reviews per request | 1–100                                                   |
| `text`              | 10,000 characters                                       |
| `reviewerName`      | 200 characters                                          |
| `sourceReviewId`    | 256 characters                                          |
| `reviewUrl`         | 2,048 characters                                        |
| `reviewDate`        | 64 characters                                           |
| `metadata`          | 16,384 bytes as JSON                                    |

Reviews cannot be updated or deleted: these routes export no `PUT`, `PATCH`, or `DELETE` (Next
answers `405`), and the `reviews` table grants clients no `UPDATE` or `DELETE`. The ingestion route
validates the stored Google Maps source and returns `422 SOURCE_NOT_CONFIGURED` for invalid or
unsupported source information; a nullable Place ID is resolved by the provider job.

Other target, ingestion, and review endpoints arrive with their respective stories. Every protected
handler must independently use `requireApiUser()` from `@/services/auth/access-control` and return
its failure `response` before invoking services. Proxy refreshes cookies but does not guard APIs.
See [S1-010 integration guidance](../../../docs/s1-010-route-protection.md) for ownership handoff
and private response caching, and [S1-011 ownership rules](../../../docs/s1-011-ownership.md).
