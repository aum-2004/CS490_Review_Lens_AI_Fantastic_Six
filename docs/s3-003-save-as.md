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

## Consistent copy during a refresh

A refresh merges its reviews and records its successful attempt in one transaction, holding the
per-analysis `reviewlens:review-merge:<id>` advisory lock (`merge_target_reviews`, S3-011). Save As
takes the same lock on the source before copying. If a refresh of the source is in flight, Save As
waits for it to commit, then copies the reviews and the ingestion summary from that same committed
state. Without the lock, a refresh committing between the two copy steps could pair new reviews
with the old summary. `tests/db/save-analysis-as-concurrency.test.sh` runs this race with two real
sessions and fails if Save As does not wait.

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
  3. refuses Save As once the owner has 200 analyses (the size of the analysis list), serialized
     per owner with an advisory lock, so Save As cannot create unbounded copies of a dataset. The
     cap applies **only to Save As**: creating an analysis from a URL is not capped by this story;
  4. takes the source's review-merge lock so the copy is consistent (see above);
  5. copies only rows of the source analysis.
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
| Owner already has 200 analyses (Save As only) | `409 ANALYSIS_LIMIT`                                               |
| Anything else                                 | `500 SAVE_AS_FAILED` (generic; only the error category is logged)  |

## Coordination

- **S3-009 re-ingest (#137, Deep):** refresh requires a succeeded attempt, and the copy has one, so
  refreshing a copy works without changes. Both paid-start counts must skip `is_save_as_copy` rows,
  so Save As never reduces the owner's refresh budget. This PR already updates
  `reserve_ingestion_attempt`. `reserve_reingestion_attempt` is created by #137's migration
  (`20261127120000`), which sorts **before** this one, so the agreed sequencing is:
  1. #137 merges first.
  2. This PR is rebased on it, and `20261128180000` also replaces `reserve_reingestion_attempt` with
     the same body plus `and not is_save_as_copy` in its count, with a regression test that a copy
     made inside the 24-hour window leaves all five refresh starts available.
  3. This PR must not merge before #137: #137's older migration would otherwise recreate the
     function without the exclusion when applied with `--include-all`.
- **S3-006 Q&A history (#138):** not copied, as recorded in `docs/s3-006-persist-qa-history.md`.
- **S3-018 Markdown export:** a copy exports like any other analysis.

## Tests

| Test                                                             | What it proves                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/db/save-analysis-as.test.sql`                             | Privileges; denial for anon, no user, missing and foreign analyses; name rules; exact review and summary copy with new IDs; last success after a failed refresh; never-ingested copy; rename, refresh and delete independence; copy of a copy; copies excluded from the paid-start budget; forged copy markers rejected; the 200 cap. |
| `tests/db/save-analysis-as-concurrency.test.sh`                  | Two real sessions: Save As waits for an in-flight refresh of the source, then copies reviews and ingestion summary from the same committed state.                                                                                                                                                                                     |
| `tests/unit/services/analysis-targets/save-analysis-as.test.ts`  | RPC arguments and safe mapping of not-found, limit and every other failure.                                                                                                                                                                                                                                                           |
| `tests/unit/app/api/analysis-targets/save-as-route.test.ts`      | Auth, content type, ownership before body, name validation, size limit, limit conflict, generic failures without details.                                                                                                                                                                                                             |
| `tests/unit/lib/api/analysis-save-as.test.ts`                    | Browser client request shape and response validation (rejects a "copy" with the source's ID).                                                                                                                                                                                                                                         |
| `tests/unit/components/analysis-targets/SaveAnalysisAs.test.tsx` | Suggested name, cancel, validation, single submit, navigation to the copy, error messages, expired session, abort on unmount.                                                                                                                                                                                                         |
| `tests/e2e/auth/save-as-analysis.spec.ts`                        | In the browser: copy opens with the same reviews and "Ingested" state, both appear in the sidebar, renaming the copy leaves the original, another user is denied, deleting the copy keeps the original.                                                                                                                               |

## Deployment

Merge order: **#137 (S3-009) before this PR**, for the reason above.

Migrations the shared project will not have yet when this PR merges (last recorded remotely on
2026-11-28: `20261127212801`; see `docs/s3-006-persist-qa-history.md` for how this was checked):

| Version          | Name                                        | From        |
| ---------------- | ------------------------------------------- | ----------- |
| `20261125000000` | `increase_review_question_quota`            | #131        |
| `20261126000000` | `delete_owned_analysis`                     | #134 S3-005 |
| `20261126010000` | `reconcile_detached_ingestion_audits`       | #134 S3-005 |
| `20261126120000` | `prevent_duplicate_reviews`                 | #135 S3-011 |
| `20261127120000` | `reingest_existing_analysis`                | #137 S3-009 |
| `20261128060000` | `restrict_detached_audit_ticket_references` | #134 S3-005 |
| `20261128120000` | `persist_review_qa_history`                 | #138 S3-006 |
| `20261128180000` | `save_analysis_as`                          | this PR     |

Use the coordinated procedure from S3-006's deployment note (Q&A off while the quota migration
changes, then back on):

1. `supabase migration list --remote`: confirm the remote still ends at `20261127212801` and the
   local-only rows are exactly the merged rows of this table. Stop and review anything else.
2. `supabase db push --remote --dry-run --include-all`: confirm it lists those versions in version
   order, and post the output in the team channel.
3. `supabase db push --remote --include-all`, then `supabase migration list --remote` again.
4. Smoke check Save As on an owned analysis: the copy opens "Ingested" with the same review count,
   and `select count(*) from ingestion_attempts where is_save_as_copy` grows by one.

If some of these were already applied by the time this merges, only the remaining ones will be
listed; never run `supabase migration repair` for a version that has not actually been run. Until
`20261128180000` is applied, Save As returns `500 SAVE_AS_FAILED` and nothing else changes.
