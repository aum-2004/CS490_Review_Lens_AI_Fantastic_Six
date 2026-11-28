# S3-009 Re-Ingest an Existing Analysis

An owner can start a new ingestion ("Refresh reviews") for an analysis they already collected,
without creating a second AnalysisTarget. Every refresh is its own ingestion attempt, and its
reviews are merged into the existing dataset. No review is ever removed or deactivated by a
refresh.

| Rule                                                                                                                                                                   | How it is met                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-BR-014: a user may refresh or re-ingest an existing owned analysis                                                                                                  | `POST /api/analysis-targets/[targetId]/ingestion/reingest` and the workspace "Refresh reviews" control. `reserve_reingestion_attempt` creates a new attempt for an owned target that already has a successful one |
| S3-BR-015: the current dataset is the deduplicated union of previously persisted and successfully fetched reviews, unless the provider confirms a complete replacement | Completion uses the unchanged S3-011 `finish_ingestion_attempt` → `merge_target_reviews` (update, adopt, or insert; never delete). There is no replacement path because the provider gives no completeness signal |

## Flow

1. The workspace shows the "Refresh reviews" card once the target has a successful attempt.
2. `POST .../ingestion/reingest` (no body or query is read) checks, in order: verified session
   (`requireApiUser`), same-host browser Origin, the three ingestion gates (`INGESTION_ENABLED`,
   storage approval, recovery configuration), ownership with the RLS session client, and the stored
   Google Maps source (`422 SOURCE_NOT_CONFIGURED`).
3. `beginIngestionReingest` runs the normal `beginIngestion` with one override: the reservation
   goes through `reserve_reingestion_attempt`. Everything after the reservation is shared with the
   first collection: one paid submission, idempotent binding retries, the signed recovery callback.
4. The route returns `202` with the processing summary. The control puts that summary into the
   shared workspace state, so the existing Ingestion panel polls
   `POST .../ingestion/refresh` (status reconcile, S1-023) and reloads the page when it finishes.
5. Completion is the existing S3-011 merge. `saved_count` is the number of new reviews.
6. After a failed refresh, both the card's "Retry refresh" and the Ingestion panel's "Try again"
   call this same endpoint (see "Retrying a failed refresh").

Naming: `ingestion/refresh` already means "reconcile the status of a running job", so the
re-ingest route, RPC, and codes use "reingest". The UI says "Refresh reviews".

## Attempt model

- `ingestion_attempts.attempt_kind` (`initial` | `reingest`, default `initial`) marks a refresh.
  Rows from before this migration are `initial`. Owners can SELECT the column; nobody but the
  RPCs can write it.
- A refresh never edits earlier rows. Each attempt keeps its own id, timestamps, counts, and
  provider binding.
- **Last successful attempt**: the newest `status = 'succeeded'` row for the target in
  `(started_at desc, id desc)` order (partial index `ingestion_target_succeeded_idx`). The app
  reads it with `getLastSuccessfulAttempt` (RLS session client). Since only one attempt per target
  can be active, attempts never overlap and start order equals completion order.
- The latest attempt (`latest_ingestion_attempts`) can be a running or failed refresh. The
  previously successful dataset is identified separately and is never replaced by it.

## Why a separate RPC (not a mode on `reserve_ingestion_attempt`)

`reserve_ingestion_attempt` deliberately answers a create request with the active **or
previously successful** attempt (`created: false`). That is retry idempotency: a duplicated or
retried start (double click, two tabs, a network retry) can never buy a second paid job.
`beginIngestion` returns that existing summary. Changing what a create request means would
reopen that duplicate-charge risk, so the function is untouched. A refresh is an explicit intent
with its own function, and it always creates a new row or fails with a reason.

## Concurrency and quota

- **One active run per target.** The RPC locks the target row (`FOR UPDATE`, the same lock
  `reserve_ingestion_attempt` takes), so a create and a refresh, or two refreshes, serialize. An
  active run is rejected with `REINGEST_IN_PROGRESS`. The existing partial unique index
  `ingestion_one_processing_per_target` stays the atomic backstop. A two-session test proves the
  second caller waits on the lock and is then rejected.
- **Billing holds** (`SUBMISSION_UNCERTAIN`, `RESULT_WINDOW_EXPIRED`) block a refresh with
  `REINGEST_BLOCKED` until the project team reconciles them, exactly as for a create.
- **Daily limit.** A refresh is a paid start. It takes the same owner advisory lock and the same
  count (five reservations per owner per rolling 24 hours, every attempt row counts, failed ones
  included, no refund). It returns the existing `INGESTION_START_LIMIT` (HTTP `429`). Refreshes and
  creates share the budget.

## Ownership and security

- The lifecycle RPCs (`reserve_*`, `bind_*`, `finish_*`, `expire_*`) are `SECURITY DEFINER`,
  `search_path = ''`, and executable **only by `service_role`**. The new RPC follows that. The
  server passes `p_owner_id` from `requireApiUser()`. Body and query fields are never read.
- Ownership is checked twice: with the RLS session client (`getOwnedTargetOrThrow`) and inside the
  RPC (`analysis_targets.owner_id = p_owner_id` under the lock). Missing, foreign, and malformed ids
  all get the same `404 TARGET_NOT_FOUND`, including the race where a target is deleted between
  the two checks (RPC `P0002`).
- **Why not `auth.uid()` with `authenticated` EXECUTE?** That pattern fits `insert_reviews` and
  `reserve_review_question`, but not a paid ingestion reservation. A browser could call the RPC
  directly through the Data API and reserve an attempt without submitting a provider job. After
  60 seconds the status reconcile records it as `SUBMISSION_UNCERTAIN`, a billing hold that blocks
  the target until an operator resolves it. Keeping reservation server-only, as for the first
  collection, avoids that.
- The route also rejects cross-site browser requests (`Sec-Fetch-Site: cross-site`, or an `Origin`
  whose host differs from `X-Forwarded-Host`/`Host`) with `403 FORBIDDEN`. Clients without an
  `Origin` still need a session and ownership. Responses are `Cache-Control: private, no-store`.
  Errors use fixed messages only; unexpected errors log just an operation and a category.

| Status | Code                                                                    | When                                                                                         |
| ------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 202    | (success)                                                               | Refresh accepted and processing                                                              |
| 200    | (success, `state: "failed"`)                                            | The provider rejected the submission. Nothing was saved                                      |
| 401    | `AUTH_REQUIRED`                                                         | No verified session (`503 AUTH_UNAVAILABLE` if auth is down)                                 |
| 403    | `FORBIDDEN`                                                             | Cross-site browser request                                                                   |
| 404    | `TARGET_NOT_FOUND`                                                      | Missing, foreign, or malformed target                                                        |
| 409    | `REINGEST_IN_PROGRESS` / `REINGEST_BLOCKED` / `REINGEST_UNAVAILABLE`    | Active run / billing hold / no successful dataset yet                                        |
| 422    | `SOURCE_NOT_CONFIGURED`                                                 | The stored source is not a valid Google Maps source                                          |
| 429    | `INGESTION_START_LIMIT`                                                 | Daily paid-start limit reached                                                               |
| 503    | `INGESTION_DISABLED`, `STORAGE_NOT_APPROVED`, `RECOVERY_NOT_CONFIGURED` | Same gates as the first collection (plus `JOB_BINDING_PENDING` and `INGESTION_RESULT_LIMIT`) |
| 500    | `REINGEST_START_FAILED`                                                 | Anything unexpected                                                                          |

## Merge-only guarantee and the completeness signal

The Outscraper request is `reviewsLimit=30`, `sort=most_relevant`. The result contract the
adapter reads (`status`, `data[]`, per-review fields) carries no total count, cursor, or "this is
the complete dataset" flag. Every response is therefore a bounded, possibly partial sample.
Consequently:

- Completion **only** merges. A review absent from a later response stays in the dataset. A
  repeated review updates the stored row (S3-010) and is not counted as new.
- There is **no removal or deactivation path**, no completeness flag, and no `is_active` column.
  Nothing a provider or a caller sends can trigger one.
- Enabling replacement later would need an explicit, verified provider signal (for example a
  documented total-review count that the response provably reaches), a new verified field on the
  completion RPC, and its own review. Until then the merge is the only behavior.

## Failed, partial, and late results

- **Failed refresh** (provider rejection, no usable reviews, identity mismatch, expiry): the
  attempt ends `failed` with `saved_count = 0`. `finish_ingestion_attempt` refuses reviews on a
  failed completion, so the dataset is unchanged. The last successful attempt stays the
  workspace baseline, and the review list and Q&A keep working (both are gated only on stored
  reviews). The card shows "The last refresh didn't finish … Your previously collected reviews are
  unchanged." with a "Retry refresh" button. A provider failure is not a hold, so retrying is
  allowed and counts toward the daily limit.
- **Partial or throttled batch**: merged like any other result. Nothing is removed.
- **Late browser responses**: see "Stale responses" under Workspace UI.

### Retrying a failed refresh

The Ingestion panel's "Try again" calls `POST .../ingestion/reingest` (a new attempt) when the
failed attempt is a refresh. The workspace decides this from recorded state: the latest attempt's
`attempt_kind = 'reingest'` (read by `loadLatestAttemptKind` through the RLS session client,
because the `select *` columns of `latest_ingestion_attempts` predate `attempt_kind`), **or** an
existing successful dataset. The second rule covers a refresh that fails in the open page before
the server data reloads: for a target with a successful attempt, `POST .../ingestion` can only
answer with that earlier success, so retrying it would collect nothing. A failed **first**
collection has no successful attempt and still retries through `POST .../ingestion`. During a
billing hold the button stays disabled.

- **Late completion of an older attempt**: an older attempt cannot be processing while a newer
  one exists (one active run). `finish_ingestion_attempt` returns a terminal attempt unchanged, and
  `bind_ingestion_job` rejects a different job id. A stale batch cannot reach the dataset, and
  replaying the newest completion saves nothing twice (DB tests cover all three).
- **S3-005 compatibility (#134)**: #134 detaches attempts on delete (`analysis_target_id` null).
  The RPC only reads and inserts rows for an existing, locked, owned target, and
  `getLastSuccessfulAttempt` re-checks `analysis_target_id`. A detached attempt can therefore
  never be the refresh baseline, be rejected as "in progress", or be promoted. The lifecycle RPCs
  keep their parent-target joins.

## Workspace UI

The "Refresh reviews" card (`src/components/ingestion/ReingestReviews.tsx`) sits under the
Ingestion panel. It shows:

- the current dataset as "Current dataset: N reviews. It is the deduplicated union of every review
  collected for <target> so far." (S3-BR-015), plus how merging works;
- the last successful collection time and the new reviews it added (`saved_count`, which S3-011
  made "new rows only");
- processing ("Refreshing… The N reviews already collected stay available…"), success, failure
  with retry, holds, and unavailability (gates, load failure).

The button is a native `<button>` described by the merge explanation. The in-flight request ref
plus the disabled state block double submission, and the button is full width below the `sm`
breakpoint. All copy is rendered as text. The card is hidden until the first collection succeeds,
which stays in the Ingestion panel.

The Ingestion panel's copy for a collected target (replacing "Further collection is
unavailable."):

- collection available: "Reviews have been collected for this target. To collect newer reviews,
  use Refresh reviews. New reviews are merged into this dataset and reviews already collected are
  kept."
- collection unavailable: "Reviews have been collected for this target. Collecting newer reviews
  is unavailable right now; the reason is shown below."
- after a failed refresh: "This was a refresh of reviews already collected for this target. They
  are unchanged and still available. Try again starts a new refresh." (the last sentence is
  omitted during a billing hold).

### Stale responses

With `cacheComponents`, leaving a workspace hides it in React `<Activity>` instead of unmounting
it. Both user-started requests, the refresh card's "Refresh reviews" and the Ingestion panel's
"Try again" (every path: refresh, original start, and status reload), use one shared hook,
`useLatestRequest` (`src/components/ingestion/useLatestRequest.ts`). Each request has an
`AbortController`, a generation number, and the `userId:targetId` scope it started in. A layout-effect cleanup runs on unmount, Activity hide, and
a target or account change. It aborts the request, invalidates the generation, and releases the
pending state that request set. A late response then does nothing: no login redirect, no
`router.refresh()`, no shared-state update, and its `finally` cannot clear a newer request. The
resulting `AbortError` shows no banner. Aborting stops only the browser request; the attempt and
any paid provider job keep running, and there is no cancel call. If a request was abandoned while
hidden, restoring the page calls `router.refresh()` once so the persisted status is shown (the
Ingestion panel then polls a running attempt).

## Tests

- `tests/db/reingest-existing-analysis.test.sql`: privileges, new attempt rows (old ones kept),
  last-success lookup, foreign, missing, and no-dataset denials that create nothing, active-run
  rejection, create idempotency kept, partial-batch merge (absent reviews remain, repeats do not
  multiply), failed refresh leaves every stored review field unchanged, holds, late or replayed completion,
  and the shared daily budget including failed refreshes and the 24-hour window.
- `tests/db/reingest-concurrency.test.sh`: two real sessions; the second refresh waits on the
  lock and is rejected.
- Unit: route (`reingest-route.test.ts`), service (`ingestion-reingest.test.ts`), control
  (`ReingestReviews.test.tsx`, including late 401, 404, terminal, accepted, and conflict responses
  after unmount, Activity hide, target change, and account change), Ingestion panel
  (`IngestionPanel.test.tsx`: retry routing, the copy variants, and the same late-response cases
  for "Try again": late 401, 404, accepted, terminal, and conflict responses after unmount,
  Activity hide, target change, and account change; swallowed `AbortError`; resync on restore; a
  stale `finally`; a current-target 401), and workspace (`workspace-reingest.test.tsx`: a refresh
  that fails in the workspace is retried from the Ingestion panel through `/reingest` while the
  saved reviews stay visible; with the baseline unreadable, the persisted `attempt_kind` alone
  routes "Try again" to `/reingest` (`reingest`) or `POST .../ingestion` (`initial`), on the first
  load and after a reload; a failed first collection still retries through `POST .../ingestion`).
- Browser: `tests/e2e/auth/target-workspace.spec.ts` asserts the exact "unavailable" copy variant
  for a collected target and that the old "Further collection is unavailable" copy is gone.
- Mutation-checked: removing the active-run check, removing the ownership predicates, or making
  completion drop absent reviews each fails the DB tests. Reverting the panel's retry routing fails
  the workspace and panel tests; routing on `attempt_kind` alone fails the in-workspace retry test;
  ignoring `attempt_kind` fails the persisted-kind workspace test; removing the "Try again"
  stale-response checks and abort fails the panel's late-response tests.

## Known limitations

- The header badge still describes the **latest** attempt, so after a failed refresh it shows
  "Failed" while the dataset is intact. The refresh card and the Ingestion panel explain this.
- No browser scenario starts a refresh: a real start calls the provider client, which the fixture
  server does not stub. The flow is covered by unit and DB tests.
- The API README documents the endpoint in its own section rather than as a row of the route
  table, because one more row makes Prettier re-pad every existing row.
