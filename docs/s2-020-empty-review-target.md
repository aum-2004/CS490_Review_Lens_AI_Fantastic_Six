# S2-020 — Handle a target without review data

Rules: S2-BR-007, S2-BR-010, S2-BR-011, S2-BR-025.

The workspace keeps the question input and Ask question button visible but disabled
until saved reviews are available. A shared neutral alert explains the reason and
is linked to both controls with `aria-describedby`.

| Saved reviews  | Latest ingestion                                                      | Q&A behavior                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty          | Not started or status unavailable                                     | Explain that no saved reviews are available and direct the user to complete ingestion in the Ingestion panel.                                                                                        |
| Empty          | Succeeded                                                             | Explain that ingestion completed but saved reviews are missing; direct the user to reload and contact the project team if the problem persists. A successful status alone does not enable questions. |
| Empty          | Failed                                                                | Explain the failed ingestion and missing saved reviews; direct the user to resolve the failure in the Ingestion panel.                                                                               |
| Empty          | Processing                                                            | Explain that ingestion is in progress; ask the user to wait for completion.                                                                                                                          |
| Failed to load | Any                                                                   | Explain that reviews could not be loaded and must be reloaded before asking questions. Do not claim the dataset is empty.                                                                            |
| Empty          | Collection disabled, storage not approved, or recovery not configured | Use the same unavailable reason as the Ingestion panel, with a next step that does not require starting collection. This takes priority over ingestion-state instructions.                           |
| Present        | Any                                                                   | Use the existing saved-review Q&A workflow. A later failed ingestion preserves earlier saved evidence.                                                                                               |

Ingestion actions remain in the existing Ingestion panel. No additional ingestion
action or paid provider call is introduced. When availability changes, the existing
form key resets the answer and question, aborts pending requests, and ignores late
responses. Questions become available after saved reviews load on refresh.

The existing authoritative backend guard remains in place:
`buildReviewDatasetContext` authenticates the caller, verifies target ownership,
and loads fresh persisted reviews for that target. An empty dataset raises
`NO_REVIEW_DATA`; the questions route returns HTTP 409 with a user-safe ingestion
instruction. This occurs before quota reservation, provider configuration, token
counting, or model generation. Neither another target's evidence nor general
knowledge is used as fallback. No database migration is needed.

Verification covers workspace states, disabled controls and their accessible
descriptions, synthetic form submission, recovery after ingestion, removal of stale
answers, cancellation of pending requests, direct API requests asking for review
facts or general knowledge, and switching from a populated target to an empty one.
The real context/orchestration/provider-adapter integration tests assert that empty
requests consume no quota and invoke neither provider endpoint. Browser tests use
the real application with the existing local synthetic auth/data fixture, with no
live provider calls, at desktop and mobile widths and after reload.

The ingestion availability reason is calculated once in the workspace and reused
by the ingestion panel and unavailable-Q&A explanation. Tests cover all three
configuration blockers across fresh, failed, processing, and completed ingestion,
and verify that previously saved reviews still permit Q&A under each blocker.
Review-load failures retain their reload instruction rather than claiming an empty
dataset. The branch is reconciled with the merged S2-018, S2-019, and S2-006 work;
their files remain identical to current main outside the S2-020 changes.

Validation on 2026-11-15:

- `npm run lint`, `npm run typecheck`, `npm run format:check`, and `git diff --check`: passed.
- Full Jest coverage run after reconciling main and reviewer feedback: 86 suites and 1,573 tests passed; overall line coverage 94.31%.
- `npm run coverage:changed:check -- --base origin/main`: passed, 100% changed-line coverage.
- `npm run test:e2e:auth -- review-questions.spec.ts stale-review-context.spec.ts`: all nine tests passed against the reconciled production build. The local runner needed its own fixture/server processes stopped after all test cases completed so teardown could finish.
- `npm run build`: passed after a network-enabled retry to download the existing Inter font. The initial restricted build failed on that download; browser checks used the font fallback.

Tests use synthetic data and isolated model calls. No live ingestion or model request
was performed. Changes remain local on `s2-020`; nothing was pushed.

AI assistance: Codex, with melissa. Transcript:
[2026-11-15_melissa_S2-020_codex.md](../ai-transcripts/2026-11-15_melissa_S2-020_codex.md).
Review findings and follow-up validation:
[s2-020-review.md](s2-020-review.md).
