# S3-003 — Save As a Separate Analysis

**Story:** [#109](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/109) S3-003 |
**Rules:** S3-BR-005, S3-BR-006

## Outcome

In an analysis workspace, **Save as new analysis** asks for a name (suggested: "<name> (copy)") and
creates a separate analysis that starts with the current saved state of the original. ReviewLens
then opens the copy. The original is never changed.

## What the copy starts with

| Copied                                              | How                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Name                                                | The name the user chose, validated with the same rules as rename (S3-002).                       |
| Platform, source URL, place reference               | Copied from the original.                                                                        |
| Every persisted review                              | New review IDs; text, rating, source review ID, reviewer, dates, URL and metadata are identical. |
| Ingestion summary (state, business identity, count) | One ingestion record copied from the original's latest **successful** ingestion (details below). |
| Q&A history                                         | **Not copied.** The copy starts with no history (decision shared with S3-006).                   |

Q&A history is left out because each saved answer cites review IDs of the original analysis. The copy
gets new review IDs, so every copied citation would need remapping. Starting the copy with an empty
history keeps citations correct (S3-BR-021) and is stated in the Save As form.

### Ingestion summary

The workspace, the analysis list and refresh (S3-009) all read an analysis's ingestion state from its
`ingestion_attempts` rows. A copy with reviews but no attempt would show "Not ingested" and could not
be refreshed. So Save As adds one row to the copy:

- copied from the original's latest **succeeded** attempt (after a failed refresh, the original still
  shows its last known-good dataset, which is what was copied);
- `saved_count` is the number of reviews copied, and collection times are kept;
- `is_save_as_copy = true`, with a `save-as:<uuid>` placeholder instead of a provider job ID. No
  provider job was run, and a check constraint keeps the marker and the prefix in step;
- **not counted** toward the owner's five paid ingestion starts per 24 hours.
  `reserve_ingestion_attempt` now skips copy rows when counting.

If the original was never ingested successfully, the copy gets no ingestion row and shows "Not
ingested", like the original.

## Independence (S3-BR-006)

The copy shares no rows with the original: it has its own analysis ID, its own review rows and its
own ingestion record. Therefore:

1. Renaming the copy updates only the copy's `analysis_targets` row (and the reverse).
2. Deleting the copy (S3-005) cascades only to the copy's reviews and detaches only its ingestion
   rows; the original and its reviews remain.
3. Refreshing the copy (S3-009) merges into the copy's reviews only (S3-011 deduplicates per
   analysis).

`tests/db/save-analysis-as.test.sql` checks all three.

## Security

- `POST /api/analysis-targets/[targetId]/save-as` requires a session, accepts JSON only (4 KB max),
  checks ownership before reading the body, and validates the name with `validateAnalysisNameInput`.
  Any other body fields are ignored.
- The only write path is `save_analysis_as(p_source_target_id, p_name)`: `SECURITY DEFINER`, fixed
  `search_path`, executable by `authenticated` only. It takes the owner from `auth.uid()`, never
  from input, and:
  1. rejects a missing user, a missing analysis and another user's analysis with the same `P0002`;
  2. re-checks the name with the rename policy's rules (trimmed, no control or invisible-only
     names), plus the table's length and presence constraints;
  3. caps an owner at 200 analyses (the size of the analysis list), serialized per owner with an
     advisory lock, so Save As cannot be used to create unbounded copies of a dataset;
  4. copies only rows of the source analysis.
- Browser roles still cannot write `ingestion_attempts` or the new `is_save_as_copy` column.

## API

`POST /api/analysis-targets/[targetId]/save-as` with `{ "name": "Weekend shortlist" }`:

| Case                                          | Response                                                           |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Success                                       | `201` with `{ id, name, sourceUrl, platform }` of the new analysis |
| Not signed in                                 | `401`                                                              |
| Not JSON                                      | `415 INVALID_CONTENT_TYPE`                                         |
| Body over 4 KB                                | `413 SAVE_AS_REQUEST_TOO_LARGE`                                    |
| Invalid name                                  | `400 INVALID_ANALYSIS_TARGET_INPUT` with field issues              |
| Missing, malformed or another user's analysis | `404 TARGET_NOT_FOUND`                                             |
| Owner already has 200 analyses                | `409 ANALYSIS_LIMIT`                                               |
| Anything else                                 | `500 SAVE_AS_FAILED` (generic; only the error category is logged)  |

## Coordination

- **S3-009 re-ingest (#137, Deep):** refresh requires a succeeded attempt, and the copy has one, so
  refreshing a copy works without changes. One small follow-up: #137's
  `reserve_reingestion_attempt` counts paid starts on its own. Once both PRs are merged, its count
  should also skip `is_save_as_copy` rows. Until then, copying an analysis that was ingested in the
  last 24 hours can count one extra start for that owner (conservative, never a free start).
- **S3-006 Q&A history (#138):** not copied, as recorded in `docs/s3-006-persist-qa-history.md`.
- **S3-018 Markdown export:** a copy exports like any other analysis.

## Tests

| Test                                                             | What it proves                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/db/save-analysis-as.test.sql`                             | Privileges; denial for anon, no user, missing and foreign analyses; name rules; exact review and summary copy with new IDs; last success after a failed refresh; never-ingested copy; rename, refresh and delete independence; copy of a copy; copies excluded from the paid-start budget; forged copy markers rejected; the 200 cap. |
| `tests/unit/services/analysis-targets/save-analysis-as.test.ts`  | RPC arguments and safe mapping of not-found, limit and every other failure.                                                                                                                                                                                                                                                           |
| `tests/unit/app/api/analysis-targets/save-as-route.test.ts`      | Auth, content type, ownership before body, name validation, size limit, limit conflict, generic failures without details.                                                                                                                                                                                                             |
| `tests/unit/lib/api/analysis-save-as.test.ts`                    | Browser client request shape and response validation (rejects a "copy" with the source's ID).                                                                                                                                                                                                                                         |
| `tests/unit/components/analysis-targets/SaveAnalysisAs.test.tsx` | Suggested name, cancel, validation, single submit, navigation to the copy, error messages, expired session, abort on unmount.                                                                                                                                                                                                         |
| `tests/e2e/auth/save-as-analysis.spec.ts`                        | In the browser: copy opens with the same reviews and "Ingested" state, both appear in the sidebar, renaming the copy leaves the original, another user is denied, deleting the copy keeps the original.                                                                                                                               |

## Deployment

Migration `20261128180000_save_analysis_as.sql` sorts after every other migration, including
S3-006's `20261128120000`. Apply it with the team's `supabase db push --remote` procedure after this
PR merges (see the deployment note in `docs/s3-006-persist-qa-history.md` for the pending list).
Until it is applied, Save As returns `500 SAVE_AS_FAILED` and nothing else changes.
