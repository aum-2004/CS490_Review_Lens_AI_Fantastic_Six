# S3-006 — Persist Questions and ReviewLens Responses

**Story:** [#112](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/112) S3-006 |
**Rules:** S3-BR-009, S3-BR-010 | **Used by:** S3-007 (restore history), S3-008 (clear history),
S3-018 (Markdown export)

## Outcome

Every question a user asks about an analysis, and the response ReviewLens shows for it, is saved as
part of that analysis. The saved history is enough to rebuild what the user saw: the question, the
response text, its outcome, the reviews it cites, and when it was asked.

## What is saved

Table `public.review_qa_exchanges` (migration `20261126130000_persist_review_qa_history.sql`):

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
  that analysis's reviews. The 200-exchange cap bounds the storage this can use.

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

The Q&A form then shows "This response wasn't saved to the analysis's Q&A history." No database
detail reaches the response or the logs (only the error category is logged).

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
  analysis, source URL, reviews and ingestion summary are separate tables and are not touched.
- **Delete analysis (S3-005)** needs no extra work: history is removed by `on delete cascade`.
- **Markdown export (S3-018)** reads the same history through `listQaHistory`.

## Tests

| Test                                                                                                    | What it proves                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/db/review-qa-history.test.sql`                                                                   | Privileges and RLS; owner round trip in order with citation order kept; no cross-analysis leakage; citations from another analysis, another user or nowhere are rejected; another user cannot read or write; the cap; review removal and analysis deletion. |
| `tests/unit/services/qa/qa-history.test.ts`                                                             | RPC arguments, full-history mapping, fail-closed handling of malformed results, query shape (target filter, ordering, cap).                                                                                                                                 |
| `tests/unit/app/api/analysis-targets/[targetId]/questions/history-route.test.ts`                        | POST saves the shown exchange on the right analysis with the public outcome; an answer survives a failed save; failed requests save nothing; GET returns only the owner's history and maps errors without details.                                          |
| `tests/unit/lib/api/review-questions.test.ts`, `tests/unit/components/reviews/ReviewQuestions.test.tsx` | The client flags only an explicit `saved: false`, and the form shows the notice only then.                                                                                                                                                                  |

Verification on this branch: `npm run test:db` (all database tests), `npm run coverage:changed`
(114 suites, 2,093 tests; 100% changed-line coverage), `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run check:migrations`.

## Deployment note

Following the team process (README, "Next steps for the team"), apply the migration to the shared
Supabase project with `supabase db push` after this PR merges. Until it is applied, every answer is
still shown, but with the "not saved" notice, and `GET .../questions` returns
`503 QA_HISTORY_UNAVAILABLE`.
