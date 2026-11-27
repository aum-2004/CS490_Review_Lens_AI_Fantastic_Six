# S3-013 Supporting Evidence Verification

**Story:** S3-013 — Show Supporting Evidence with Grounded Answers

**Issue:** #119

**Author:** Neel Patel (`neel-0064`)

**AI assistance:** OpenAI Codex; session record:
`ai-transcripts/2026-11-24_neel-0064_S3-013_codex.md`

## Authoritative scope

Issue #119 requires a grounded answer to show representative evidence from the active persisted
review dataset, preserve enough identity to verify the evidence against real Review records, and
avoid fabricated quotations or reviewer metadata. It references S3-BR-020 through S3-BR-022. The
repository contains the story-to-rule reference in `Sprint3Issues.csv`, but it does not contain the
canonical definitions of those three rules. This verification therefore does not invent rule text.

The issue's guidance describes two to five excerpts as reasonable, not mandatory. The application
keeps every citation needed for the answer's claims rather than imposing a new display limit that
could separate a claim from its evidence.

## Existing implementation inherited from Sprint 2

The complete evidence path already existed on `main` before S3-013:

1. `buildReviewDatasetContext` authenticates from the cookie session, verifies target ownership,
   and loads only that target's persisted reviews with an explicit field projection.
2. `buildQaModelRequest` sends stable Review IDs with persisted rating, date, and text as untrusted
   JSON data. Reviewer names and source metadata are excluded.
3. `parseQaModelReply` rejects unknown Review IDs, claims without evidence, and quotations that are
   not a contiguous normalized span of the cited persisted review. Exact quote matching verifies
   provenance; it does not prove complete semantic entailment, which remains an acknowledged
   limitation.
4. The question route returns only the validated, deduplicated citation IDs for an answered result.
5. `askReviewQuestion` validates the response envelope. `buildCitationView` resolves IDs only
   against reviews already loaded for the active target and replaces raw UUIDs with numbered
   labels.
6. `ReviewQuestions` displays the answer and its adjacent `SupportingReviews`. The evidence text,
   rating, and optional date come from the persisted Review objects, not model-authored metadata.
7. Target, account, and preserved-page changes abort old requests and clear transient answers.
   Review text remains a React text child, and PR #106's display-only line-break formatting remains
   in use.

Existing tests already cover fabricated or foreign IDs, fabricated quotations, wrong-target and
cross-user isolation, missing reviews, duplicate citations, non-answer outcomes, stale target and
account state, optional dates, and script-like text rendered inertly.

## Gap and S3-013 change

The successful browser-response validator retained compatibility with an older response shape: an
`answered` payload with a missing or empty `citedReviewIds` field was accepted. The current server
cannot produce that shape, but accepting it at the API boundary allowed a future regression or
unexpected response to render a purported grounded answer without supporting evidence.

S3-013 closes that narrow gap:

- `parseCitedReviewIds` now fails closed when an answered response has no citations.
- `ReviewQuestions` independently refuses to render an answered result without at least one
  citation, protecting the evidence invariant even if its API helper is bypassed in a future call
  site.
- Focused tests verify missing and empty citation lists are rejected, the invalid answer is not
  displayed, valid multi-review evidence still maps in citation order, non-answers still carry no
  evidence, and PR #106's safe formatting behavior remains intact.

No model prompt, provider configuration, quota, review retrieval, database schema, migration,
dependency, or evidence-count limit changed.

## Security and ownership verification

- Authentication and ownership remain server-side and derive identity from the verified session.
- Citation validation is still restricted to the exact authorized review context sent to the model.
- Client-side resolution still filters by the active target before returning any Review object.
- Missing and foreign Review records remain unavailable and never fall back to a broader query.
- Reviewer names are neither sent to the model nor displayed as citation metadata.
- Review and answer text continue to render as escaped React text; no raw-HTML API is used.
- No live OpenAI, Outscraper, or Supabase service was called by the automated tests.

## Validation

The focused citation, API, component, and review-formatting run passed 6 suites and 117 tests. The
corrected production target-switching suite passed 9 tests. Full local results:

- `npm run format:check`: passed.
- `npm run check:migrations`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed, including Next.js route generation.
- `npm test`: passed 107 suites and 2,034 tests.
- `npm run build`: passed the Next.js 16.4.6 production build with 12/12 static pages.
- Full coverage: 95.55% lines (9,803/10,259); all 107 suites and 2,034 tests passed.
- Changed-code coverage: 100% (7/7 source lines), with 8/8 changed branch outcomes covered.

The authenticated Playwright file ran against the local fixture provider: three scenarios passed,
but the empty-target scenario and the new supporting-evidence scenario stopped at the shared login
helper. Fresh dev- and production-server reruns logged an authentication-operation failure before
the workspace loaded, so no S3-013 browser assertion executed or failed locally. The database test
could not start because this Windows environment has no `bash` command. Neither blocker affects a
changed database path, and the same evidence behavior is covered by passing API, component, and
production-workspace Jest tests.
