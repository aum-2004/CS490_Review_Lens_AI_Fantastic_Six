# S3-014 — View Matching or Supporting Reviews

Issue: #120. Author: Shawn. AI assistance: OpenAI Codex; original available dialogue and tool
records are retained in `ai-transcripts/2026-11-25_shawn_S3-014_codex.md`.

## Selection contract and scope

ReviewLens currently sends all authorized persisted reviews within its context limits. It has no
question-specific search/ranking layer. Therefore, this story's relevant set is the **unique review
IDs cited by the validated model response**, not every review supplied to the model and not a
claim that all potentially relevant reviews have been discovered.

The workspace already resolves server-validated citation IDs against its active target's loaded
reviews. This implementation reuses that path and the existing `SupportingReviews` component:

- Up to three numbered supporting reviews remain immediately visible beside the answer.
- When the cited set is larger, **View all N supporting reviews** expands the entire cited set in
  its existing citation order. The preview is repeated in that full list, as its explanation states.
- Every citation remains available; three is only an inline presentation limit, not an evidence
  selection or model limit. Answer quotations and their citation numbering remain unchanged.
- The section explicitly says these are cited reviews, **not the complete saved review dataset**.
- Stored review text, rating, and date are shown. Missing records retain their numbered
  **Review not available** slot; no missing text, date, or reviewer metadata is fabricated.
- The native disclosure supports Enter/Space, focus indication, and narrow layouts without a new
  dependency or dialog framework.

The full saved-review browser belongs to S3-015. This story does not implement search, rating/date
filters, refresh, history, exports, or a new API. It does not change the model/provider/quota contract.

## Data and security boundaries

The backend still authenticates the user and checks target ownership before loading review data.
The response validator still checks citations and quotes against the authorized model context.
`buildCitationView` restricts client resolution to the active target; expanding a list cannot fetch
foreign or additional records. The explorer uses only resolved `Citation` objects and makes no
network request. Text remains escaped React text; the display-only `<br>` formatter is preserved.
Reviewer names/source metadata are not added to AI context or the supporting-evidence display.

Existing `ReviewQuestions` cleanup removes the explorer with its answer on a new submission,
account/target transition, or Activity hide/restore. Non-answers do not show supporting evidence.
Exact quotation provenance does not prove semantic entailment; this UI does not add that guarantee.

## Canonical rule mapping

The canonical Sprint 3 rules were supplied in the task's instructor materials:

| Rule      | Implementation/evidence                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| S3-BR-020 | Full cited set can be inspected beyond the inline sample.                                                                            |
| S3-BR-021 | Existing server checks and active-target citation resolution remain authoritative; integration tests reject foreign-target evidence. |
| S3-BR-022 | Displays stored text/rating/date; unavailable records are labeled, and markup is inert.                                              |
| S3-BR-023 | Supporting-review expansion complements the already merged complete dataset browser; it does not replace it.                         |
| S3-BR-024 | Cited subset resolution uses active-target persisted reviews; no cross-target query or mutation is introduced.                       |

## Integration handoff

S3-013 PR #127 was still open when this work began. It hardens empty/missing-citation responses in
`ReviewQuestions.tsx` and `citations.ts`; this story leaves both files and its changed tests alone.
Its fail-closed invariant is compatible with this read-only presentation. Reconcile with its final
approved head before merge, and retain the response-validator, component, and security regressions.

S3-015 PR #129 is already in the baseline. Its complete review list remains independent. Coordinate
future S3-016 filtering so a browsing filter does not silently replace or broaden an answer's cited
evidence. Persisted-history integration must retain stable target/review associations; it is outside
this story.

## Verification and demo

New component/integration tests cover preview/full-set boundaries, citation order, matching stored
fields, unavailable records, inert markup, uncited/foreign exclusion, and state cleanup. A dedicated
browser account owns seven fixture reviews, of which six are cited, making the distinction visible
without changing existing accounts' data. Browser tests use a mocked Q&A response and local fixture
provider; they do not certify hosted RLS or live-model behavior and make no paid calls.

Manual happy path: open an owned target, obtain a grounded answer citing more than three reviews,
and expand **View all N supporting reviews**. Verify the later cited reviews and numbering. For
three or fewer citations, all are already inline and no expansion action is needed. A real model is
not guaranteed to cite more than three; use the deterministic browser case for reliable rehearsal.

Failure/scope path: switch targets/accounts, start another question, or obtain a non-answer. Old
supporting evidence must disappear. A missing cited record must show unavailable without a broader
lookup. Inspect the separate complete saved-review list to distinguish uncited records.

Local verification on the `24f083fb` main baseline:

- Focused component/integration and inherited citation suites: 24/24 passed.
- Full Jest with coverage: 112 suites / 2,052 tests passed; no skipped tests.
- Line/statement coverage: 96.10%; branches: 93.67%; functions: 95.47%.
- Changed-line coverage: 100% (54/54 source lines); 4/4 changed branch outcomes covered.
- Formatting, ESLint, explicit TypeScript checks, migration filename checks and production build
  passed. Build generated all 12 static pages.
- Dedicated browser case passed in development and production, including keyboard open/close,
  375px layout, citation-only membership and reload cleanup. Desktop/mobile screenshots remain
  outside the source tree in the isolated checkout's ignored `test-results` folder.
- Full production authentication browser suite: 42 passed / 2 failed. The failures are the existing
  target-creation cases at `analysis-targets.spec.ts:99` and `:177`, which expect the old
  `Target created. You can now start ingestion.` text. Their snapshots show successful workspace
  navigation. Both failures were independently reproduced on a separate unchanged-main
  `24f083fb` production build without the S3-014 source or fixture changes. They predate this story
  and remain unchanged here.
- Temporary combination with S3-013 `fa106e14` plus current main: the 11 new tests passed. Three
  mutations were caught: truncating the expanded set (5 test failures), omitting the explorer
  (9 failures), and removing active-target resolution (1 failure). All mutations were restored.

No PR/remote CI or public-deployment verification is claimed. Independent review and applicable
deployed acceptance remain separate from local deterministic checks. Before merging S3-013's
stricter validator, its owner must also reconcile existing browser stubs that still omit
`citedReviewIds` (for example, `stale-review-context.spec.ts`); the new S3-014 fixture already returns
the explicit current citation contract.
