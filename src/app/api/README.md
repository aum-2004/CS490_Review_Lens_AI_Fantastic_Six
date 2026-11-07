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

| Method | Path                                                 | Purpose                                                                                                   | Added by   |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| GET    | `/api/health`                                        | Confirms the server is running. No auth, no database.                                                     | S1-005     |
| GET    | `/api/auth/session`                                  | Returns verified identity; rejects missing/invalid sessions.                                              | S1-009/010 |
| POST   | `/api/analysis-targets`                              | Creates a target owned by the verified session user.                                                      | S1-011     |
| GET    | `/api/analysis-targets`                              | Lists up to 200 owned targets with authoritative ingestion status.                                        | S1-017/023 |
| GET    | `/api/analysis-targets/[targetId]/reviews`           | Lists the reviews of a target the user owns.                                                              | S1-013     |
| POST   | `/api/analysis-targets/[targetId]/reviews`           | Saves 1–100 reviews under a target the user owns.                                                         | S1-013     |
| POST   | `/api/analysis-targets/[targetId]/ingestion`         | Starts asynchronous ingestion for an owned target using its stored Place ID or validated Google Maps URL. | S1-019     |
| GET    | `/api/analysis-targets/[targetId]/ingestion`         | Reads the owned target's durable ingestion status without provider calls.                                 | S1-023     |
| POST   | `/api/analysis-targets/[targetId]/ingestion/refresh` | Reconciles the stored owner/target/job binding and atomically saves verified results.                     | S1-023     |
| POST   | `/api/ingestion/provider-callback/[attemptId]`       | Recovers a binding after verifying provider-body and per-attempt signatures; no review persistence.       | S1-023     |

`POST /api/analysis-targets/[targetId]/ingestion` is disabled by default. It returns HTTP `503`
with error code `INGESTION_DISABLED` unless the server-side `INGESTION_ENABLED` environment
variable is exactly `"true"`. The integrated S1-023 lifecycle reserves before calling
S1-019's submission service, registers recovery, and saves the job binding before
returning its public status summary. Storage approval and recovery configuration
are separately required; all live gates remain off by default.

The refresh POST also returns `503 INGESTION_DISABLED` when the flag is off, before
database/provider work. Read-only status GET remains available. New starts are
limited in the database to five reservations per owner per rolling 24 hours
(`429 INGESTION_START_LIMIT`); rejected/uncertain reservations still count.
Provider results have a streamed 2 MiB limit and completion accepts at most 30
reviews with bounded fields/metadata, independently checked by the completion RPC.
`503 INGESTION_RESULT_LIMIT` retains an accepted job/hold without partial insertion.
Browser users cannot DELETE analysis_targets through the Data API; there is no
target deletion route. This preserves billing holds and the recovery audit.

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
Provider-resolved URL identities are retained as provenance, not promoted to configured
Place IDs or described as an independently verified match to the original URL. The
workspace displays that distinction. Provider callbacks ignore any claimed owner,
review data, result URL or success status; they only bind authenticated metadata.

Ingestion summaries omit provider job IDs; authenticated owners may still read
their own stored bindings through RLS-protected table access. Browser-supplied
job IDs never select or authorize a provider lookup. Callback recovery has an
explicit service_role SELECT grant.

A successful target cannot submit another run in Sprint 1. Lookup errors without
definitive provider/identity/no-review failure evidence return retryable feedback
and preserve the accepted job. Bound attempts have a four-hour database deadline;
expired attempts become Failed but remain blocked against new paid submissions
until operator reconciliation. The expiry/release RPCs are not browser-accessible.

Other target, ingestion, and review endpoints arrive with their respective stories. Every protected
handler must independently use `requireApiUser()` from `@/services/auth/access-control` and return
its failure `response` before invoking services. Proxy refreshes cookies but does not guard APIs.
See [S1-010 integration guidance](../../../docs/s1-010-route-protection.md) for ownership handoff
and private response caching, and [S1-011 ownership rules](../../../docs/s1-011-ownership.md).
