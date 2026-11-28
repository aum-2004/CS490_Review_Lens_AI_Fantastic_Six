# S3-006 — Persist Questions and ReviewLens Responses

**Story:** [#112](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/112) S3-006 |
**Rules:** S3-BR-009, S3-BR-010 | **Used by:** S3-007 (restore history), S3-008 (clear history),
S3-018 (Markdown export)

## Outcome

Every question a user asks about an analysis, and the response ReviewLens shows for it, is saved as
part of that analysis. The saved history is enough to rebuild what the user saw: the question, the
response text, its outcome, the reviews it cites, and when it was asked.

## What is saved

Table `public.review_qa_exchanges` (migration `20261128120000_persist_review_qa_history.sql`):

| Column               | Meaning                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| `id`                 | Exchange identity.                                                                              |
| `analysis_target_id` | The analysis it belongs to. Deleting the analysis deletes its history (`on delete cascade`).    |
| `question`           | The question as submitted (1–2,000 characters, same limit as the API).                          |
| `outcome`            | The public outcome shown: `answered`, `insufficient_evidence` or `out_of_scope`.                |
| `answer`             | The server-composed response text (≤ 8,000 characters), including the verified quotes.          |
| `cited_review_ids`   | Ordered, unique review IDs the answer cites (≤ 100). Empty for every outcome except `answered`. |
| `prompt_version`     | The system-prompt version that produced the answer, e.g. `s2-013.v7`.                           |
| `created_at`         | When it was saved. History is ordered by `(created_at, id)`.                                    |

Only responses the user saw are saved. Validation errors, quota denials, model failures and rejected
model replies are not history.

### Supporting evidence

The spec asks for stable references rather than copies of review text. Citations are stored as
review IDs. The short quotes shown beside each claim are already part of `answer`, so nothing else
is duplicated.

`cited_review_ids` is deliberately not a foreign key. When the row is written, the database checks
that every ID is a review of the same analysis. If a later refresh (S3-009 to S3-012) removes a
review, the old exchange keeps its ID, and the UI shows that citation as unavailable (existing
`buildCitationView` behavior) instead of silently changing the saved answer.

## Ownership and security

- **Reads:** browser roles have `SELECT` only, through an RLS policy that requires the caller to
  own the analysis. The route also checks ownership first (`getOwnedTargetOrThrow`), and the query
  filters by analysis, so history never appears under another analysis (S3-BR-013).
- **Writes:** browser roles have no `INSERT`, `UPDATE` or `DELETE` on the table. The only write path
  is `record_review_qa_exchange(...)`. It is a `SECURITY DEFINER` function with a fixed
  `search_path`, executable by `authenticated` only. It:
  1. rejects a missing user, a missing analysis or another user's analysis with the same
     `P0002` error;
  2. rejects duplicate citations, or citations to reviews that are not in this analysis;
  3. enforces outcome/citation consistency and the text limits through table constraints;
  4. caps history at 200 exchanges per analysis, serialized per analysis with an advisory lock.
- **Known limitation (same as `insert_reviews`):** an owner who calls the function directly can
  write an exchange the model did not produce, but only into their own analysis and only citing
  that analysis's reviews, and without using a question quota slot. The 200-exchange cap bounds the
  storage this can use. Acknowledged in review (#138): saved history is the owner's own record, not
  proof of what the model said, so S3-018's Markdown export must not present it as verified model
  output. Closing this would need the server to write history with a privileged key, which the team
  has avoided so far.

## API

### `POST /api/analysis-targets/[targetId]/questions` (changed)

After a successful answer, the route saves the exchange and adds a `history` field:

```json
{ "history": { "saved": true, "id": "<uuid>", "createdAt": "<timestamp>" } }
```

If saving fails, the answer is still returned with status 200, because the question has already used
a paid quota slot:

```json
{ "history": { "saved": false, "reason": "QA_HISTORY_FULL" | "QA_HISTORY_UNAVAILABLE" } }
```

The Q&A form then shows "This response wasn't saved to the analysis's Q&A history.", or, for
`QA_HISTORY_FULL`, "This analysis's Q&A history is full, so this response wasn't saved." No
database detail reaches the response or the logs (only the error category is logged).

### `GET /api/analysis-targets/[targetId]/questions` (new)

Returns the analysis's history, oldest first, at most 200 exchanges:

```json
{
  "success": true,
  "data": {
    "targetId": "<uuid>",
    "exchanges": [
      {
        "id": "<uuid>",
        "question": "What do reviewers like?",
        "outcome": "answered",
        "answer": "…",
        "citedReviewIds": ["<uuid>"],
        "createdAt": "<timestamp>"
      }
    ]
  }
}
```

| Case                                          | Response                          |
| --------------------------------------------- | --------------------------------- |
| Not signed in                                 | `401`                             |
| Missing, malformed or another user's analysis | `404 TARGET_NOT_FOUND`            |
| No history yet                                | `200` with `exchanges: []`        |
| Database error or malformed row               | `503 QA_HISTORY_UNAVAILABLE`      |
| Unexpected error                              | `500 QA_HISTORY_FAILED` (generic) |

S3-007 restores history in the UI by calling this endpoint and rendering each exchange with the
existing `buildCitationView` and `SupportingReviews` components.

## Decisions shared with other stories

- **Save As (S3-003)** does not copy Q&A history. The copy gets new review IDs, so copied citations
  would all need remapping. The copy starts with an empty history.
- **Clear history (S3-008)** will delete this analysis's rows from `review_qa_exchanges` only. The
  analysis, source URL, reviews and ingestion summary are separate tables and are not touched. It
  must also handle a question that is still in flight when history is cleared: that answer is saved
  after the clear unless S3-008 prevents it (for example by recording a clear time and rejecting
  older questions in `record_review_qa_exchange`, or ignoring them in the UI).
- **Delete analysis (S3-005)** needs no extra work: history is removed by `on delete cascade`.
- **Markdown export (S3-018)** reads the same history through `listQaHistory`.

## Tests

| Test                                                                                                    | What it proves                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/db/review-qa-history.test.sql`                                                                   | Privileges and RLS; owner round trip in order with citation order kept; no cross-analysis leakage; citations from another analysis, another user or nowhere are rejected; another user cannot read or write; the cap; review removal and analysis deletion, including S3-005's `delete_owned_analysis`. |
| `tests/unit/services/qa/qa-history.test.ts`                                                             | RPC arguments, full-history mapping, fail-closed handling of malformed results, query shape (target filter, ordering, cap).                                                                                                                                                                             |
| `tests/unit/app/api/analysis-targets/[targetId]/questions/history-route.test.ts`                        | POST saves the shown exchange on the right analysis with the public outcome; an answer survives a failed save; failed requests save nothing; GET returns only the owner's history and maps errors without details.                                                                                      |
| `tests/unit/lib/api/review-questions.test.ts`, `tests/unit/components/reviews/ReviewQuestions.test.tsx` | The client flags only an explicit `saved: false`, and the form shows the notice only then, with a specific message for a full history.                                                                                                                                                                  |

Verification on this branch: `npm run test:db` (all database tests), `npm run coverage:changed`
(100% changed-line coverage), `npm run lint`, `npm run typecheck`, `npm run build`,
`npm run check:migrations`.

### Browser tests (requested in review)

Run on 2026-11-28 at the branch head, rebased on main `3f95182` (includes #132 and #139), from a
separate checkout with local fixtures only:

| Suite                                                     | Result       |
| --------------------------------------------------------- | ------------ |
| `npm run test:e2e:auth` (dev server)                      | 46/46 passed |
| `PLAYWRIGHT_AUTH_SERVER=production npm run test:e2e:auth` | 46/46 passed |
| `npm run test:e2e` (foundation smoke)                     | 2/2 passed   |

This includes `review-questions`, `switch-target`, `target-context-switching`,
`stale-review-context` and `supporting-reviews`, so Q&A responses and target switching show no
regressions. These specs stub `/questions` in the browser and run with `QA_ENABLED=false`, so they
do not exercise the save path; that is covered by the route, service and database tests above. No
live Supabase or OpenAI run is claimed.

## Deployment note

The migration is `20261128120000_persist_review_qa_history.sql`. It was renamed from
`20261126130000` because it has never been applied anywhere shared, and the shared Supabase history
already records `20261127212801`. A forward version keeps it in order, so it needs no out-of-order
procedure of its own.

### Remote history (checked 2026-11-28)

`supabase migration list --remote` against the shared project (`reviewlens-ai`): the last recorded
version is `20261127212801_enforce_trimmed_analysis_names`, and every version up to it is recorded
except the older ones below. The four S3-002 versions applied by hand are already repaired and
recorded.

Migrations in `main` plus this PR that the remote does not record yet:

| Version          | Name                                        | From        | Note                                  |
| ---------------- | ------------------------------------------- | ----------- | ------------------------------------- |
| `20261125000000` | `increase_review_question_quota`            | #131        | Older than the last recorded version. |
| `20261126000000` | `delete_owned_analysis`                     | #134 S3-005 | Older than the last recorded version. |
| `20261126010000` | `reconcile_detached_ingestion_audits`       | #134 S3-005 | Older than the last recorded version. |
| `20261126120000` | `prevent_duplicate_reviews`                 | #135 S3-011 | Older than the last recorded version. |
| `20261128060000` | `restrict_detached_audit_ticket_references` | #134 S3-005 | Newer than every recorded version.    |
| `20261128120000` | `persist_review_qa_history`                 | this PR     | Newer than every recorded version.    |

The older ones are already merged, so their versions are not renamed. No one has reported applying
them by hand, so they are applied out of order with `--include-all`. Do not run
`supabase migration repair` for any of these: repair marks a version as applied without running it.
S3-005's `delete_owned_analysis` deletes the `analysis_targets` row, so this table's
`on delete cascade` removes the history; `tests/db/review-qa-history.test.sql` checks that.

### Reviewed dry run (2026-11-28, from this branch merged with main `89b7350`)

Supabase CLI 3.x targets the local stack unless `--remote` is passed, so every command below uses
it.

```text
$ supabase db push --remote --dry-run
Error: Found local migration files to be inserted before the last migration on remote database.
  supabase/migrations/20261125000000_increase_review_question_quota.sql
  supabase/migrations/20261126000000_delete_owned_analysis.sql
  supabase/migrations/20261126010000_reconcile_detached_ingestion_audits.sql
  supabase/migrations/20261126120000_prevent_duplicate_reviews.sql

$ supabase db push --remote --dry-run --include-all
Would push these migrations:
 • 20261125000000_increase_review_question_quota.sql
 • 20261126000000_delete_owned_analysis.sql
 • 20261126010000_reconcile_detached_ingestion_audits.sql
 • 20261126120000_prevent_duplicate_reviews.sql
 • 20261128060000_restrict_detached_audit_ticket_references.sql
 • 20261128120000_persist_review_qa_history.sql
```

### Steps after this PR merges

This push also applies #131's quota migration, so it follows #131's rollout order
(`docs/s3-qa-quota-30.md`). An old app build rejects the new quota values once the database has
them, so Q&A must be off while versions change. S3-006 itself is safe in either order: the old app
never touches the new table, and the new app shows the "not saved" notice until the table exists.

1. If a hosted deployment exists, set `QA_ENABLED=false` there, redeploy, and confirm Q&A is
   disabled. Then deploy the merged `main` with Q&A still disabled. (No public deployment exists
   until S3-020; locally, stop `npm run dev` instead.)
2. On an up-to-date `main` in the linked checkout, run `npm run check:migrations` and
   `supabase migration list --remote`. Confirm the remote still ends at `20261127212801` and that
   the six versions above are the only local-only rows. If another merged PR (for example #137)
   added migrations, they appear here too and must be reviewed before continuing.
3. Run `supabase db push --remote --dry-run --include-all`. Confirm it lists exactly those versions,
   in version order, and post the output in the team channel before continuing.
4. Run `supabase db push --remote --include-all`.
5. Run `supabase migration list --remote` again and confirm every local version is recorded.
6. Smoke checks: confirm the quota checks from `docs/s3-qa-quota-30.md`; confirm
   `GET /api/analysis-targets/<id>/questions` returns `200` for an owned analysis and `404` for
   another user's.
7. Turn Q&A back on (`QA_ENABLED=true`), redeploy, ask one question, and confirm there is no "not
   saved" notice and the row appears in `review_qa_exchanges`.

If the push or a smoke check fails, keep Q&A disabled and post the output before trying again.

Until `20261128120000` is applied, every answer is still shown, but with the "not saved" notice,
and `GET .../questions` returns `503 QA_HISTORY_UNAVAILABLE`.
