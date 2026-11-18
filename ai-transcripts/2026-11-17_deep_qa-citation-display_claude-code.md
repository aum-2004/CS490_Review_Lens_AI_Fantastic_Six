# AI session transcript: Q&A citation display fix

- Date: 2026-11-17
- Author: deep
- Tool: Claude Code (Claude Opus 5.5)
- Branch: `fix/qa-citation-display` (from `main` at `5403aeb`)
- Issue: none filed yet; the ID in the filename is descriptive. Replace with `Refs #<issue>` when one exists.
- Redactions: local absolute paths replaced with `<repo>`. No secrets, credentials, or `.env*` contents were read or printed.

## Prompt (summary of the original request)

Live Q&A testing showed answers containing long raw review UUIDs instead of readable citations.
The backend already validates `citedReviewIds`, but the questions API omitted them and the
frontend did not render them. Asked for the smallest safe correction:

- add the already-validated `citedReviewIds` to the successful questions API response
  (strings, deduplicated, first-appearance order, capped);
- update the client type and runtime validation to accept only well-formed citation arrays;
- show citations as `[1]`, `[2]`, never raw UUIDs; resolve against the already-loaded
  active-target reviews; show "Review not available" for validated IDs not loaded;
- replace only exact, validated UUIDs in the answer text (case-insensitive, including inside
  brackets/parentheses), leaving other UUIDs untouched;
- add a "Supporting Reviews" section; render review text as plain text;
- clear citations on target/account change, reusing the S2-019 guards;
- refusals, insufficient evidence, errors and quota-exceeded carry no citations;
- preserve ownership checks, fail-closed validation, quota (5 attempts), model and S2-013 v4 prompt;
- tests, three mutation checks, transcript, and report.

Ground rules: no `.env*` reads, `QA_ENABLED`/`INGESTION_ENABLED` stay false, no live or paid API
calls, no new dependencies or migrations.

The user then added: **do not commit, push, or create a PR, and do not change someone else's
code.**

## Session log

1. **Git state.** Confirmed branch `fix/qa-citation-display`, working tree clean. (The
   session's initial snapshot showed a different branch; a fresh `git status` confirmed the
   correct one.)
2. **Inspection.** Read `qa-response.ts`, the questions `route.ts`, `review-questions.ts`,
   `ReviewQuestions.tsx`, `ReviewList.tsx`, `ProtectedTargetWorkspace.tsx`, the review service
   types, and the existing route, client and component tests. Findings:
   - `parseQaModelReply` already rejects IDs outside the request's review set
     (`UNGROUNDED_ANSWER`), dedupes, requires ≥1 citation for `answered`, and rejects citations on
     non-answers (`UNEXPECTED_CITATIONS`). The route dropped `citedReviewIds` from the response.
   - The workspace already loads all active-target reviews (paged) after the ownership check.
   - Q&A context is capped at `MAX_CONTEXT_REVIEWS = 100`.
3. **Ownership conflict.** `git blame` showed every file the fix needs was authored by teammates.
   Getting `citedReviewIds` into the response at all requires editing `route.ts`. Asked the user;
   they chose **"Minimal edits, uncommitted"**: new logic in new files, small additive wiring in
   teammate files, nothing committed.
4. **Implementation.**
   - New `src/lib/qa/citations.ts` (shared, no server-only imports):
     `responseCitations` (server: answered-only, strings, dedupe, cap 100),
     `parseCitedReviewIds` (client: array, ≤100, UUID-format strings, no case-insensitive
     duplicates, none on non-answers; missing field → `[]`), and `buildCitationView` (numbering,
     active-target-only matching, exact cited-UUID replacement including bracketed lists).
   - New `src/components/reviews/SupportingReviews.tsx` (plain-text rendering, "Review not
     available" fallback, no IDs shown).
   - Teammate files, additive only: `route.ts` (+3 lines), `review-questions.ts` (type field and
     validation; the client now rebuilds the object instead of returning the raw payload),
     `ReviewQuestions.tsx` (optional `reviews` prop, target-match guard, render view),
     `ProtectedTargetWorkspace.tsx` (passes a minimal review projection: id, target id, rating,
     text, date; no metadata or reviewer names).
   - Teammate tests: one-line fixture updates for the new required field
     (`ReviewQuestions.test.tsx`, `review-questions.test.ts`).
5. **New tests.** `tests/unit/lib/qa/citations.test.ts`,
   `tests/unit/lib/api/review-questions.citations.test.ts`,
   `tests/unit/components/reviews/ReviewQuestions.citations.test.tsx`,
   `tests/unit/app/api/analysis-targets/[targetId]/questions/route.test.ts` (runs the real
   `answerQuestion` → `parseQaModelReply` pipeline with fake auth, context, quota and model; no
   network).
6. **Error and correction.** The first route-test run failed one case because the test used a
   non-existent outcome name (`declined_entity_or_platform`). Fixed to the real enum values
   `declined_other_entity` and `declined_other_platform`.
7. **Lint.** One warning (an unused destructured variable in a new test) was fixed.
8. **Full Jest.** 1 failure, unrelated: `tests/unit/scripts/migrations/migration-versions.test.ts`
   expects empty stderr, but local Node v23.10.0 (project requires ≥24 per `.nvmrc`) prints an
   `ExperimentalWarning`. Not touched.
9. **Mutation checks.** The user's restore step (`git checkout -- .`) would have discarded the
   uncommitted fix, so each mutation instead backed up `src/lib/qa/citations.ts`, mutated it, ran
   the most relevant test file, restored from backup, and verified the hash and `git status`.

## Results

| Check | Result |
| --- | --- |
| Prettier (`format:check`) | pass |
| ESLint | 0 errors, 0 warnings |
| TypeScript (`typecheck`) | pass |
| Focused suites (client, component, route, helper) | 272/272 pass, before the lint fix and final additions |
| Full Jest | 1827/1828 pass; 1 unrelated Node-version failure (above) |
| Production build | pass |
| Changed-line coverage | 100% (186/186), gate PASS |
| Mutation (a) skip active-target filter → `citations.test.ts` | 1 test failed |
| Mutation (b) stop array-shape validation → `review-questions.citations.test.ts` | 6 tests failed |
| Mutation (c) no UUID replacement → `ReviewQuestions.citations.test.tsx` | 4 tests failed |

## Accepted / changed / rejected

- **Accepted:** additive response field; shared citation module; client fails closed on
  malformed or contradictory citations; numbering from server order; plain-text rendering.
- **Changed from the request:** no commit, push, or PR (per the user). Mutation restore used a
  file backup instead of `git checkout -- .`. The transcript filename uses a descriptive ID
  because there is no issue number yet.
- **Rejected:** server-side rewriting of the answer text (it would change the existing response
  contract); passing full `Review` objects to the client (exposes metadata and reviewer names
  unnecessarily).

## Backward compatibility

A success response **without** `citedReviewIds` (the old shape) still parses, as an answer with no
citations: no numbering, no Supporting Reviews section, and the text is unchanged (the
pre-existing behavior). A response where `citedReviewIds` is present but malformed fails closed
with the generic "unexpected response" error.

## Limitations

- Membership validation proves a cited review belongs to the active dataset, not that it
  semantically supports the claim (pre-existing `qa-response.ts` limitation).
- A bracket group mixing cited and uncited UUIDs renders as e.g. `[[1], <uuid>]`.
- Client-side citation IDs must be UUIDs (the DB `reviews.id` type); non-UUID IDs fail closed.
- Not yet verified in a live browser session; the user asked for no live model calls.
- Independent security review pending. No approval claimed.
