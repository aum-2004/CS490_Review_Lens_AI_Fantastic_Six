# S1-022 — AI-Assisted Development Transcript (Claude Code session, part 4)

Project: ReviewLens AI
Story: S1-022 — Persist Ingested Reviews with Target Ownership
Tool: Claude Code (Claude Opus 5.5) in VS Code
Date: November 6, 2026

> **Scope:** continues `ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md`, starting with the first turn after that file ends. It covers preparing the part 3 transcript, the PR description update, and the review round after `93fee53`: least-privilege writes on `public.reviews` (no UPDATE or DELETE, column-limited INSERT, with new DB regression tests) and cleaning NUL and lone UTF-16 surrogates in `cleanString` and `toJsonValue` (with new unit tests).
>
> **Source:** exported from Claude Code with `/export`. Only the turns after part 3's last turn are kept, so nothing is duplicated. The dialogue is as exported; tool calls and their output appear collapsed ("ctrl+o to expand"). Local file-system paths and the local username were redacted as `<local path>` and `<user>`.
>
> **Not in this file:** the turns after this export was taken (preparing this file) are not included here; they are in `ai-transcripts/2026-11-06_deep_S1-022_claude-code-part5.md`.

---

❯ <ide_opened_file>The user opened the file
  <local path>/Desktop/CS490_Review_Lens_AI_Fantastic_Six/ai-transcripts/202
  6-11-06_deep_S1-022_claude-code-part3.md in the IDE. This may or may not be
  related to the current task.</ide_opened_file>

❯ Export this session again:

  /export ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md
  The name matches part 2's YYYY-MM-DD_deep_S1-022_claude-code-partN.md; change
  the date if you'd rather use the session date, Nov 5.
  i just did this not 2 or 3

⏺ You've done step 1 (the export). I'll do step 2 now (trimming, redacting,
  header and note), without committing. First I'll find where part 2 ended
  inside this export.

  Ran 1 shell command (ctrl+o to expand)

⏺ Part 3 picks up at line 4202, after part 2's last reply, and I'm backing up
  the raw export before going on.

⏺ Bash(S=<local path>
      ntastic-Six/1b56e8b9-5259-4b54-b0c5-216a72b3d0b7/scratchpad;
      F=ai-transcripts/2026-11-0…)
  ⎿  1 file changed (binary, mode only or too large to show)

⏺ Part 3 is down to 922 lines, and the remaining matches are only search
  patterns quoted in the dialogue. Next I'll check that the P1 turns are
  included, then run the checks and the diff stat.

  Ran 1 shell command (ctrl+o to expand)

⏺ Part 2's header still says its later turns aren't included anywhere. They're
  now in part 3, so I'll add a pointer there too.

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

⏺ Update(ai-transcripts/2026-11-06_deep_S1-022_claude-code-part2.md)
  ⎿  Added 1 line, removed 1 line
       9  >
      10  > **Source:** exported from Claude Code with `/export`. Only th
          e turns after the Nov 5 file's last turn are kept, so nothing i
          s duplicated. The dialogue is as exported; tool calls and their
           output appear collapsed ("ctrl+o to expand"). Local file-syste
          m paths and the local username were redacted as `<local path>` 
          and `<user>`.
      11  >
      12 -> **Not in this file:** the independent PR #37 (S1-009) securit
         -y review, which is in `ai-transcripts/2026-11-05_deep_S1-009_cl
         -aude-code.md` and did not happen during these turns. The export
         - ends with Shawn's re-review of `79eeec6`; the turns that follo
         -wed (preparing this file and the commit commands) are not inclu
         -ded.                                                           
      12 +> **Not in this file:** the independent PR #37 (S1-009) securit
         +y review, which is in `ai-transcripts/2026-11-05_deep_S1-009_cl
         +aude-code.md` and did not happen during these turns. The export
         + ends with Shawn's re-review of `79eeec6`; the turns that follo
         +wed (preparing this file and the commit commands) are not inclu
         +ded here; they are in `ai-transcripts/2026-11-06_deep_S1-022_cl
         +aude-code-part3.md`.                                           
      13  
      14  ---
      15  

  Ran 1 shell command (ctrl+o to expand)

⏺ I've cleaned up the part 3 transcript, and nothing is committed or pushed.
  Only two transcript files changed, and format check and lint both pass.

  2026-11-06_deep_S1-022_claude-code-part3.md
  (ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md)
  - Trimmed from 5,100 lines to 922. It starts with the first turn after part 2
    ends (after Shawn's re-review) and runs through the PR-placeholder turn, so
    nothing is duplicated.
  - Covers:
    - preparing part 2 (bfc4838)
    - the P1 privilege fix and the TRUNCATE tests (f49ac62)
    - the PR description questions
  - Contains no S1-009 review material.
  - Added: a header and scope note in the same format as part 2, and a
    completion note citing f49ac62, the local Postgres 17 run (29 checks), and
    CI run 42162170418 (https://github.com/aum-2004/CS490_Review_Lens_AI_Fantast
    ic_Six/actions/runs/42162170418).
  - Redacted: paths and the username. The only matches left are search patterns
    quoted in the dialogue, and there are no tokens or keys.
  - Dialogue unchanged. The raw export is backed up at
    <local path>
    icpart3.raw.md.

  Part 2: its header now points to part 3 for the turns that come after it (a
  one-line change).

  On the PR description (on GitHub), replace the two placeholder lines:
  - CI on f49ac62: "Lint, typecheck, test, build" and "Database tests" passed:
  https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/actions/runs/42
  162170418
  - `ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md` (Claude Code:
  part 2 preparation and the P1 privilege fix)

  When you're ready to commit:
  git add ai-transcripts/2026-11-06_deep_S1-022_claude-code-part2.md
  ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md
  git commit -m "docs(S1-022): fill review placeholders and add part-3
  transcript"
  git push

❯ <user>@<host> CS490_Review_Lens_AI_Fantastic_Six % git add
  ai-transcripts/2026-11-06_deep_S1-022_claude-code-part2.md
  ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3
  fatal: pathspec 'ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3' did
  not match any files
  <user>@<host> CS490_Review_Lens_AI_Fantastic_Six %

⏺ The second path is missing the .md at the end. When one path doesn't match,
  git add stages nothing at all, so run it again with the full name:

  git add ai-transcripts/2026-11-06_deep_S1-022_claude-code-part2.md
  ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md
  git status

  git status should show both files under "Changes to be committed". Then:

  git commit -m "docs(S1-022): fill review placeholders and add part-3
  transcript"
  git push

❯ what to put in PR Description
  Summary

  Persists S1-021 normalized reviews under an AnalysisTarget. A review has no
  owner column; it inherits ownership through its target (S1-BR-007,
  S1-BR-022).

  Migration 20261104000000_create_reviews.sql: reviews table with an
  analysis_target_id FK (cascade delete), checks for text, rating (1–5), URL
  and metadata, and RLS on select, insert, update and delete through
  analysis_targets. Privileges are revoked from both anon and authenticated
  before granting authenticated only SELECT, INSERT, UPDATE and DELETE, so it
  keeps no inherited TRUNCATE, REFERENCES or TRIGGER.
  saveReviews / getReviewsForTarget check target ownership on the server with
  S1-014's getAnalysisTargetById. A missing target and another user's target
  both throw the same TargetNotFoundError; the HTTP mapping comes with the
  route in S1-013.
  getReviewsForTarget returns every review of the target: listReviews reads
  page by page and fails the whole read if any page fails
  userId must come from the verified session (requireApiUser().user.id), never
  the request (S1-BR-010)
  sanitizeMetadata removes NUL characters and values JSON can't store, and
  drops metadata over 16 KB while keeping the review
  Closes #22

  Changes since review

  Round 1 (Shawn, at 3a6198c), fixed in 79eeec6:

  [P2] Pagination: listReviews() pages with .range(), keeping the target filter
  and created_at, id order on every page. It stops on an empty page, so a
  project "Max rows" lower than the page size still returns everything. A
  failed page throws ReviewPersistenceError; no partial result is returned.
  Regression tests: empty target, single page, 1,001 reviews across two pages,
  a server cap below the page size, and a later-page failure. The old one-query
  version fails 5 of them.
  Transcripts:
  paths redacted; headers and scope notes added
  the unrelated S1-009 review moved to its own transcript
  the Nov 3 gap explicitly marked unrecoverable (not reconstructed)
  Round 2 (Shawn, at 79eeec6), documentation only:

  CI evidence updated to 79eeec6 and its passing run
  the later Claude Code turns (PR preparation, pre-review, pagination fix)
  added as a part 2 transcript
  Round 3 (P1 privilege finding), fixed in f49ac62:

  [P1] Inherited privileges: the migration revoked only from anon, so
  authenticated kept the default ALL, including TRUNCATE, which RLS does not
  apply to. A probe on the old migration showed one user's TRUNCATE
  public.reviews deleting both users' reviews. The migration now runs revoke
  all ... from anon, authenticated before the grant. analysis_targets already
  did this, so reviews was the only affected table.

  Regression tests (tests/db/reviews-privileges.test.sql):

  authenticated lacks TRUNCATE, REFERENCES and TRIGGER, and keeps
  SELECT/INSERT/UPDATE/DELETE
  anon has no privilege
  TRUNCATE as authenticated fails with insufficient_privilege
  both users' seeded reviews are unchanged afterwards
  The test fails on the old migration and passes on the fix.

  Dependencies

  S1-014 (#35) and S1-021 (#34) are both merged. src/services/reviews/types.ts
  and normalize.ts match main exactly.

  Test Evidence

  Unit tests (tests/unit/services/reviews/) cover the story's five checks:

  reviews are persisted
  text and rating match the input
  reviews belong to the intended target
  target A's reviews don't appear for target B
  a user can't read through another user's target
  They also cover cross-user saves, a nonexistent target, an invalid batch
  saving nothing, metadata cleanup, S1-021 normalizeBatch output, and
  multi-page retrieval with a later-page failure.

  SQL tests (npm run test:db) check the same rules against the real RLS
  policies:

  tests/db/reviews.test.sql:
  another user can't add, change or delete reviews
  a review can't be moved onto another user's target
  anonymous and no-session requests are denied
  constraints are enforced
  deleting a target deletes its reviews
  tests/db/reviews-privileges.test.sql: no TRUNCATE, REFERENCES or TRIGGER for
  authenticated, no privileges for anon, and TRUNCATE denied with no data lost
  CI on <NEW_SHA>: "Lint, typecheck, test, build" and "Database tests" passed:
  <NEW_RUN_LINK>

  Local, on f49ac62:

  bash tests/db/run.sh on PostgreSQL 17: both migrations applied and all 29
  checks passed (13 in analysis-targets, 5 in reviews-privileges, 11 in
  reviews). CI runs PostgreSQL 16.
  format, lint, typecheck, 252 unit tests and build pass
  Sprint 1 decisions

  Duplicate source_review_ids are stored as-is. A non-unique
  (analysis_target_id, source_review_id) index supports finding them in a later
  sprint.
  Metadata over 16 KB, or that can't be stored, is dropped and the review is
  kept, matching S1-021's handling of bad optional fields.
  Security review

  This PR changes RLS and writes review data, so it needs the additional
  security-focused review required by S1-004 §7, separate from the normal code
  review. Still outstanding before merge.

  AI assistance

  Claude (claude.ai) and Claude Code (Claude Opus 5.5) were used.

  ai-transcripts/2026-11-03_deep_S1-022_claude.md (claude.ai chat)
  ai-transcripts/2026-11-05_deep_S1-022_claude-code.md (Claude Code: review and
  fixes)
  ai-transcripts/2026-11-06_deep_S1-022_claude-code-part2.md (Claude Code,
  later turns: PR preparation, pre-review, pagination fix)
  The unrelated S1-009 review from the same session:
  ai-transcripts/2026-11-05_deep_S1-009_claude-code.md
  ai-transcripts/<date>_deep_S1-022_claude-code-part3.md (Claude Code: P1
  privilege fix)

⏺ Written for: Shawn and the other PR #42 reviewers.

  Only three things change: the two placeholders are filled in, and a Round 4
  entry is added for the docs-only commit. Everything else is your current text.
  Replace the whole description with:

  ## Summary
  Persists S1-021 normalized reviews under an AnalysisTarget. A review has no
  owner column; it inherits ownership through its target (S1-BR-007, S1-BR-022).

  - Migration `20261104000000_create_reviews.sql`: `reviews` table with an
  `analysis_target_id` FK (cascade delete), checks for text, rating (1–5), URL
  and metadata, and RLS on select, insert, update and delete through
  `analysis_targets`. Privileges are revoked from both `anon` and
  `authenticated` before granting `authenticated` only SELECT, INSERT, UPDATE
  and DELETE, so it keeps no inherited TRUNCATE, REFERENCES or TRIGGER.
  - `saveReviews` / `getReviewsForTarget` check target ownership on the server
  with S1-014's `getAnalysisTargetById`. A missing target and another user's
  target both throw the same `TargetNotFoundError`; the HTTP mapping comes with
  the route in S1-013.
  - `getReviewsForTarget` returns **every** review of the target: `listReviews`
  reads page by page and fails the whole read if any page fails
  - `userId` must come from the verified session (`requireApiUser().user.id`),
  never the request (S1-BR-010)
  - `sanitizeMetadata` removes NUL characters and values JSON can't store, and
  drops metadata over 16 KB while keeping the review

  Closes #22

  ## Changes since review
  **Round 1 (Shawn, at 3a6198c), fixed in 79eeec6:**
  - **[P2] Pagination:** `listReviews()` pages with `.range()`, keeping the
  target filter and `created_at, id` order on every page. It stops on an empty
  page, so a project "Max rows" lower than the page size still returns
  everything. A failed page throws `ReviewPersistenceError`; no partial result
  is returned.
  - **Regression tests:** empty target, single page, 1,001 reviews across two
  pages, a server cap below the page size, and a later-page failure. The old
  one-query version fails 5 of them.
  - **Transcripts:**
    - paths redacted; headers and scope notes added
    - the unrelated S1-009 review moved to its own transcript
    - the Nov 3 gap explicitly marked unrecoverable (not reconstructed)

  **Round 2 (Shawn, at 79eeec6), documentation only:**
  - CI evidence updated to 79eeec6 and its passing run
  - the later Claude Code turns (PR preparation, pre-review, pagination fix)
  added as a part 2 transcript

  **Round 3 (P1 privilege finding), fixed in f49ac62:**
  - **[P1] Inherited privileges:** the migration revoked only from `anon`, so
  `authenticated` kept the default ALL, including TRUNCATE, which RLS does not
  apply to. A probe on the old migration showed one user's `TRUNCATE
  public.reviews` deleting both users' reviews. The migration now runs `revoke
  all ... from anon, authenticated` before the grant. `analysis_targets` already
  did this, so `reviews` was the only affected table.
  - **Regression tests** (`tests/db/reviews-privileges.test.sql`):
    - `authenticated` lacks TRUNCATE, REFERENCES and TRIGGER, and keeps
  SELECT/INSERT/UPDATE/DELETE
    - `anon` has no privilege
    - TRUNCATE as `authenticated` fails with `insufficient_privilege`
    - both users' seeded reviews are unchanged afterwards

    The test fails on the old migration and passes on the fix.

  **Round 4 (review of f49ac62), documentation only:**
  - CI evidence updated to f49ac62 and its passing run
  - the part 3 transcript (part 2 preparation and the P1 privilege fix) added
  and linked; part 2 now points to it

  ## Dependencies
  S1-014 (#35) and S1-021 (#34) are both merged. `src/services/reviews/types.ts`
  and `normalize.ts` match `main` exactly.

  ## Test Evidence
  - **Unit tests** (`tests/unit/services/reviews/`) cover the story's five
  checks:
    1. reviews are persisted
    2. text and rating match the input
    3. reviews belong to the intended target
    4. target A's reviews don't appear for target B
    5. a user can't read through another user's target

    They also cover cross-user saves, a nonexistent target, an invalid batch
  saving nothing, metadata cleanup, S1-021 `normalizeBatch` output, and
  multi-page retrieval with a later-page failure.
  - **SQL tests** (`npm run test:db`) check the same rules against the real RLS
  policies:
    - `tests/db/reviews.test.sql`:
      - another user can't add, change or delete reviews
      - a review can't be moved onto another user's target
      - anonymous and no-session requests are denied
      - constraints are enforced
      - deleting a target deletes its reviews
    - `tests/db/reviews-privileges.test.sql`: no TRUNCATE, REFERENCES or TRIGGER
  for `authenticated`, no privileges for `anon`, and TRUNCATE denied with no
  data lost
  - **CI on f49ac62:** "Lint, typecheck, test, build" and "Database tests"
  passed: https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/actions
  /runs/42162170418
  - **Local, on f49ac62:**
    - `bash tests/db/run.sh` on PostgreSQL 17: both migrations applied and all
  29 checks passed (13 in `analysis-targets`, 5 in `reviews-privileges`, 11 in
  `reviews`). CI runs PostgreSQL 16.
    - format, lint, typecheck, 252 unit tests and build pass

  ## Sprint 1 decisions
  - Duplicate `source_review_id`s are stored as-is. A non-unique
  `(analysis_target_id, source_review_id)` index supports finding them in a
  later sprint.
  - Metadata over 16 KB, or that can't be stored, is dropped and the review is
  kept, matching S1-021's handling of bad optional fields.

  ## Security review
  This PR changes RLS and writes review data, so it needs the additional
  security-focused review required by S1-004 §7, separate from the normal code
  review. **Still outstanding before merge.**

  ## AI assistance
  Claude (claude.ai) and Claude Code (Claude Opus 5.5) were used.
  - `ai-transcripts/2026-11-03_deep_S1-022_claude.md` (claude.ai chat)
  - `ai-transcripts/2026-11-05_deep_S1-022_claude-code.md` (Claude Code: review
  and fixes)
  - `ai-transcripts/2026-11-06_deep_S1-022_claude-code-part2.md` (Claude Code,
  later turns: PR preparation, pre-review, pagination fix)
  - `ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md` (Claude Code:
  part 2 preparation and the P1 privilege fix)
  - The unrelated S1-009 review from the same session:
  `ai-transcripts/2026-11-05_deep_S1-009_claude-code.md`

  Two things to check before you save it:
  - The Security review line: if the P1 finding came from the S1-004 §7 security
    reviewer and they've now approved, change "Still outstanding before merge"
    to "Completed by @name at f49ac62". Otherwise leave it.
  - CI for the docs commit: the docs-only commit gets its own CI run. f49ac62 is
    the last code commit, so citing it is accurate.

❯ You are finishing PR S1-022 on the current branch. Resolve ALL open review
  items below in one pass. Work only on this branch, keep the diff minimal, and
  do not push.

  Before editing: run `git status`, `git log --oneline -8` and `git branch
  --show-current`. Confirm the branch is S1-022-persist-reviews with a clean
  tree. Then give me a short plan and wait for my approval.

  OPEN ITEMS

  A. Least-privilege writes on public.reviews (P2)
  - File: supabase/migrations/20261104000000_create_reviews.sql
  - Nothing in the app updates or deletes reviews. Remove the UPDATE and DELETE
  grants AND the reviews_update_own / reviews_delete_own policies.
  - Replace the table-wide INSERT grant with a column-level INSERT grant
  covering only the columns the app actually writes. Read the real insert code
  in src/services/reviews/ to get the exact list. Exclude id and created_at.
  - Keep: `revoke all on table public.reviews from anon, authenticated;`, a
  SELECT grant to authenticated, the column-limited INSERT grant, and the
  select and insert RLS policies. Do not reintroduce TRUNCATE, REFERENCES or
  TRIGGER.
  - Do not edit older migrations. Edit this one in place, since it is unmerged.
  - Update the DB tests in tests/db/. Replace tests that expected UPDATE/DELETE
  with regression tests proving, as the owning authenticated user: UPDATE is
  denied, DELETE is denied, INSERT with an explicit id or created_at is denied,
  a normal insert still works, and the existing TRUNCATE, ownership and RLS
  tests still pass. Add one test that deleting an analysis target still removes
  its reviews with DELETE revoked.

  B. Malformed characters (P2)
  - Postgres rejects lone UTF-16 surrogates (for example \ud83d) and NUL
  (\u0000) in text and JSON. One bad character fails an entire batch of up to
  30 reviews, and retries fail again.
  - Find cleanString, toJsonValue, normalizeBatch and sanitizeMetadata
  (src/services/reviews/). Strip NUL and replace lone surrogates with U+FFFD
  using String.prototype.toWellFormed() (engines.node is >=24). Apply it in
  cleanString and recursively in toJsonValue, including object keys.
  - Add unit tests: a lone surrogate is replaced, a valid emoji pair is
  preserved unchanged, NUL is removed, nested metadata strings are cleaned, and
  a batch containing one malformed review now saves in full.

  C. Documentation
  - Run: `grep -rn "<NEW_SHA>\|<NEW_RUN_LINK>" . --exclude-dir=node_modules
  --exclude-dir=.git`. Do NOT fill these in yet. The final commit hash and CI
  run do not exist until I push. List every file and line so I can fill them in
  afterwards.
  - The reviewer also requires the original "part 3" AI transcript covering the
  privilege fix to be committed under ai-transcripts/, with the placeholder
  reference to it replaced by the real filename. Match the naming convention
  and format of the existing files in ai-transcripts/. Look for the real
  transcript (ai-transcripts/, the repo root, ~/Downloads, Claude Code session
  exports). NEVER write or reconstruct a transcript from memory. If you cannot
  find the real one, stop and tell me exactly what is missing so I can export
  it myself.
  - Add an ai-transcripts entry for this session only if the existing
  convention requires one for each fix round. Follow the pattern already in
  that folder.

  D. Do not edit the GitHub PR description. At the end, remind me to change
  "Closes #22" to "Refs #22" myself, because nothing has been verified against
  hosted Supabase yet.

  RULES
  - No changes to application behavior beyond items A and B. No unrelated
  refactors.
  - Never weaken, skip or delete a test to make it pass. If a test fails, show
  the failure and your diagnosis.
  - Do not claim a check passed unless you ran it and saw it pass. If the DB
  tests cannot run locally (for example no Docker), say so plainly.

  VERIFY (report actual output of each)
  1. `bash tests/db/run.sh` (or the repo's documented DB test command)
  2. `npm run lint`
  3. `npm run format:check`
  4. `npm test`
  5. `npm run typecheck`
  6. `npm run build`

  COMMIT
  One commit (plus a second only for the transcript if it is separate):
  "S1-022: restrict reviews write privileges and sanitize malformed
  characters". Show `git show --stat` afterward. Do not push.

  FINAL REPORT
  - Files changed and why
  - Each verification result
  - The placeholder locations still to fill in after the push
  - Anything you could not do or verify
  DO NOT COMMIT AND OUSH

⏺ The pasted task says to check the branch first and wait for your approval
  before editing, so I'll start with the read-only checks.

  Ran 1 shell command (ctrl+o to expand)

⏺ The branch is S1-022-persist-reviews, the tree is clean, and it matches GitHub
  at 93fee53 (part 3 is already committed). Next, the facts the plan depends
  on, all read-only.

  Ran 1 shell command (ctrl+o to expand)

⏺ I have everything the plan needs. Your rule is to wait for approval, so I
  haven't edited anything. Per your note, I also won't commit or push at the
  end; I'll stop with the changes uncommitted for you to review.

  Starting point: branch S1-022-persist-reviews, clean tree, matching GitHub at
  93fee53.

  Plan

  A. Least-privilege writes
  (supabase/migrations/20261104000000_create_reviews.sql, edited in place)
  - Grants: keep revoke all ... from anon, authenticated and grant select ... to
    authenticated. Replace the table-wide INSERT with a column-level grant on
    exactly the columns toInsertRow writes (supabase-review-store.ts):
    analysis_target_id, review_text, rating, source_review_id, reviewer_name,
    review_date, review_url, source_metadata. That excludes id and created_at.
    Drop the UPDATE and DELETE grants.
  - Policies: remove reviews_update_own (:75) and reviews_delete_own (:88), and
    keep the select and insert policies.
  - Comment: update the header comment, which currently says "see and change".
  - tests/db/reviews-privileges.test.sql: change the "keeps SELECT, INSERT,
    UPDATE, DELETE" check (:54-60) so it asserts SELECT and the column-level
    INSERT are held, and that table-wide INSERT, UPDATE and DELETE are not
    (using has_column_privilege for the columns). Add, as the owning user:
    - UPDATE denied
    - DELETE denied
    - INSERT with an explicit id denied
    - INSERT with an explicit created_at denied
    - a normal insert works
    - the owner deleting their own target still removes its reviews with DELETE
      revoked

    Postgres runs foreign-key cascades as the table owner, so this should pass;
    the test will prove it. The TRUNCATE tests stay unchanged.
  - tests/db/reviews.test.sql: two tests assumed UPDATE and DELETE were granted,
    and I'll replace them as you asked:
    - "User B cannot update or delete User A's reviews" (:110-125)
    - "a review cannot be moved onto another user's target" (:128-142)

    Both become "denied with insufficient_privilege" checks, plus a check that
    User A's rows are unchanged afterwards. All other ownership and RLS tests
    stay as they are.

  B. Malformed characters
  - src/services/reviews/normalize.ts (:10-15): cleanString uses the shared
    helper, which cleanId, cleanUrl and reviewerName all go through. This file
    is S1-021's code (now on main). Your item B asks for the change, so I'll
    make the minimal edit there and say so in the PR.
  - src/services/reviews/review-service.ts (toJsonValue): apply the same helper
    to strings and object keys, recursively.
  - The helper: remove NUL, then .toWellFormed(). It's available on your local
    Node (v23.10; engines requires ≥24) and replaces a lone \ud83d with U+FFFD
    while leaving valid emoji pairs intact.
  - Unit tests (normalize.test.ts, review-service.test.ts):
    - a lone surrogate is replaced
    - an emoji pair is unchanged
    - NUL is removed
    - nested metadata strings and keys are cleaned
    - a batch containing one malformed review saves in full. The fake store will
      assert that every string reaching it is well-formed and NUL-free, so the
      test is meaningful.

  C. Documentation
  - Placeholders: the repo grep finds <NEW_SHA> and <NEW_RUN_LINK> only inside
    the part 3 transcript (lines 790, 791, 804, 824, 826 and 874). These are
    verbatim quotes of earlier dialogue, not placeholders to fill in; filling
    them would alter the original conversation. The only real placeholders are
    in the PR description on GitHub, which you'll edit.
  - The part 3 transcript is already committed (93fee53) as
    ai-transcripts/2026-11-06_deep_S1-022_claude-code-part3.md. Nothing needs
    searching for, and nothing will be written from memory.
  - A part 4 transcript follows the folder's convention of one file per fix
    round. It can only be exported after this work is done, so you'd run /export
    at the end and I'd trim and redact it the same way.

  D. I won't edit the PR description. I'll remind you about "Closes #22" → "Refs
  #22" at the end.

  Verification: bash tests/db/run.sh on a throwaway local Postgres 17, the same
  way as last round (CI uses 16), then lint, format check, test, typecheck and
  build. I'll report the actual output of each.

  Approve this plan, or tell me what to change?

❯ what fix do here??
  [P2] Users have more write access than the app needs (create_reviews.sql:53)

  Problem: nothing in the app updates or deletes reviews, but authenticated can
  do both. As the owner in a local test, I rewrote a 1-star review to 5 stars,
  changed its created_at, and moved it to my other target. I could also set id
  and created_at when inserting.
  Impact: this only affects the user's own data, but #35 removed direct updates
  for the same reason.
  Fix: remove the UPDATE and DELETE grants and policies, and limit INSERT to
  the columns the app writes. Target deletion still removed its reviews with
  DELETE revoked. The tests that expect these privileges need updating.
  [P2] One malformed character can fail a whole save (review-service.ts:45)

  Problem: a cut-off emoji (a lone surrogate like \ud83d) gets through both
  normalizeBatch and sanitizeMetadata, but Postgres rejects it.
  Impact: a save of up to 30 reviews would fail as a unit, and retrying the
  same data would fail again.
  Fix: clean these characters in cleanString and toJsonValue, and add a test.
  Not confirmed: I reproduced the rejection in Postgres using a JSON insert
  format, not through the real Supabase API. I also haven't seen Outscraper
  return such a character.
  [P2] Closes #22 would close the story before it's verified on Supabase

  Problem: nothing here has run against hosted Supabase, and the tests mock its
  API.
  Fix: use Refs #22 until the migration is applied and a real two-user check
  passes, as we did for #14.

⏺ That review is the same set of items as the plan I just gave you. The plan
  covers all three, so nothing needs to change:

  Review finding: P2: more write access than the app needs
    (create_reviews.sql:53)
  Fix in the plan: A. Drop the UPDATE and DELETE grants and the
    reviews_update_own / reviews_delete_own policies. Limit INSERT to the 8
    columns toInsertRow writes, excluding id and created_at. Replace the tests
    that expected UPDATE and DELETE, and add "denied" tests for each case the
    reviewer reproduced: rewriting a rating, changing created_at, moving a
    review, setting id or created_at on insert. Add the test that deleting a
    target still removes its reviews.
  ────────────────────────────────────────
  Review finding: P2: one malformed character fails a whole save
    (review-service.ts:45)
  Fix in the plan: B. Remove NUL and run .toWellFormed() in cleanString
    (normalize.ts) and in toJsonValue, including object keys. Add unit tests,
    including that a batch with one malformed review saves in full.
  ────────────────────────────────────────
  Review finding: P2: "Closes #22" is too early
  Fix in the plan: D. You change "Closes #22" to "Refs #22" in the PR
  description
    yourself, as you did for #14. It stays that way until the migration is
    applied to hosted Supabase and a real two-user check passes.

  On the reviewer's "not confirmed" note about lone surrogates: the fix is cheap
  and harmless either way, since valid text, including emoji, passes through
  unchanged. I'll say in the PR that it wasn't reproduced through the real
  Supabase API.

  If you approve, I'll make A and B and run the DB tests on a throwaway local
  Postgres plus all the npm checks. Nothing gets committed or pushed. Go ahead?
❯ Fix the Issues if there are any DO NOT COMMIT OR PUSH yet

⏺ Approved, so I'll start with A. I'll read the migration's RLS section first.

  Read 1 file (ctrl+o to expand)

⏺ Update(supabase/migrations/20261104000000_create_reviews.sql)
  ⎿  Added 10 lines, removed 3 lines
      43    on public.reviews (analysis_target_id, source_review_id)
      44    where source_review_id is not null;
      45  
      46 --- Row Level Security: a signed-in user can only see and change
         - Reviews of their own targets                                  
      46 +-- Row Level Security: a signed-in user can only see and add Re
         +views of their own targets                                     
      47  -- (S1-BR-008, S1-BR-009). Server code must still check target 
          ownership; RLS is defense in depth.
      48  alter table public.reviews enable row level security;
      49  
      50  -- Supabase grants new tables ALL to anon and authenticated by 
          default. Revoke from both first so
      51  -- authenticated does not keep TRUNCATE (not subject to RLS), R
          EFERENCES, or TRIGGER.
      52 +--                                                             
      53 +-- The app only reads and inserts Reviews, so these grants are 
         +the write boundary: no UPDATE or                               
      54 +-- DELETE, and INSERT only on the columns the app writes, so cl
         +ients cannot choose id or                                      
      55 +-- created_at. Reviews are still removed when their target is d
         +eleted (on delete cascade).                                    
      56  revoke all on table public.reviews from anon, authenticated;
      53 -grant select, insert, update, delete                           
      54 -  on table public.reviews to authenticated;                    
      57 +grant select on table public.reviews to authenticated;         
      58 +grant insert (                                                 
      59 +  analysis_target_id, review_text, rating, source_review_id, re
         +viewer_name, review_date,                                      
      60 +  review_url, source_metadata                                  
      61 +) on table public.reviews to authenticated;                    
      62  
      63  create policy reviews_select_own
      64    on public.reviews

⏺ Update(supabase/migrations/20261104000000_create_reviews.sql)
  ⎿  Removed 23 lines
       77      select 1 from public.analysis_targets t
       78      where t.id = reviews.analysis_target_id and t.owner_id = (
           select auth.uid())
       79    ));
       80 -                                                              
       81 --- `with check` also stops a Review from being moved onto anot
          -her user's target.                                            
       82 -create policy reviews_update_own                              
       83 -  on public.reviews                                           
       84 -  for update                                                  
       85 -  to authenticated                                            
       86 -  using (exists (                                             
       87 -    select 1 from public.analysis_targets t                   
       88 -    where t.id = reviews.analysis_target_id and t.owner_id = (
          -select auth.uid())                                            
       89 -  ))                                                          
       90 -  with check (exists (                                        
       91 -    select 1 from public.analysis_targets t                   
       92 -    where t.id = reviews.analysis_target_id and t.owner_id = (
          -select auth.uid())                                            
       93 -  ));                                                         
       94 -                                                              
       95 -create policy reviews_delete_own                              
       96 -  on public.reviews                                           
       97 -  for delete                                                  
       98 -  to authenticated                                            
       99 -  using (exists (                                             
      100 -    select 1 from public.analysis_targets t                   
      101 -    where t.id = reviews.analysis_target_id and t.owner_id = (
          -select auth.uid())                                            
      102 -  ));                                                         

⏺ The migration is updated. Now the DB tests; first the two reviews.test.sql
  sections that assumed UPDATE and DELETE.

  Read 1 file (ctrl+o to expand)

⏺ Update(tests/db/reviews.test.sql)
  ⎿  Added 26 lines, removed 7 lines
      107  $$;
      108  \echo 'ok - User B cannot add reviews to User A''s target'
      109  
      110 +-- authenticated has no UPDATE or DELETE privilege on reviews,
          + so both are denied outright.                                 
      111  do $$
      111 -declare                                                       
      112 -  affected integer;                                           
      112  begin
      113    update public.reviews
      114    set review_text = 'Edited by B'
      115    where analysis_target_id = '77777777-7777-4777-8777-77777777
           7771';
      117 -  get diagnostics affected = row_count;                       
      118 -  assert affected = 0, 'User B updated User A''s reviews';    
      116 +  raise exception 'User B updated User A''s reviews';         
      117 +exception                                                     
      118 +  when insufficient_privilege then null;                      
      119 +end                                                           
      120 +$$;                                                           
      121  
      122 +do $$                                                         
      123 +begin                                                         
      124    delete from public.reviews where analysis_target_id = '77777
           777-7777-4777-8777-777777777771';
      121 -  get diagnostics affected = row_count;                       
      122 -  assert affected = 0, 'User B deleted User A''s reviews';    
      125 +  raise exception 'User B deleted User A''s reviews';         
      126 +exception                                                     
      127 +  when insufficient_privilege then null;                      
      128  end
      129  $$;
      125 -\echo 'ok - User B cannot update or delete User A''s reviews' 
      130  
      131 +set request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555
          +555555555"}';                                                 
      132 +                                                              
      133 +do $$                                                         
      134 +begin                                                         
      135 +  assert (                                                    
      136 +    select count(*) from public.reviews                       
      137 +    where analysis_target_id = '77777777-7777-4777-8777-777777
          +777771'                                                       
      138 +  ) = 3, 'User A''s reviews changed after User B''s update and
          + delete attempts';                                            
      139 +  assert not exists (                                         
      140 +    select 1 from public.reviews where review_text = 'Edited b
          +y B'                                                          
      141 +  ), 'User B''s update changed a review';                     
      142 +end                                                           
      143 +$$;                                                           
      144 +\echo 'ok - User B cannot update or delete User A''s reviews, 
          +and they are unchanged'                                       
      145 +                                                              
      146  -- -----------------------------------------------------------
           ----------------------------------
      147  -- Reviews cannot be moved to another user's target; no sessio
           n sees nothing
      148  -- -----------------------------------------------------------
           ----------------------------------

⏺ The move test (:128-142) already expects insufficient_privilege and stays
  valid, so I've left it unchanged. Next, reviews-privileges.test.sql.

  Read 1 file (ctrl+o to expand)

⏺ Update(tests/db/reviews-privileges.test.sql)
  ⎿  Added 22 lines, removed 7 lines
      46  \echo 'ok - authenticated has no TRUNCATE, REFERENCES, or TRIGG
          ER privilege on reviews'
      47  
      48  do $$
      49 +declare                                                        
      50 +  writable text;                                               
      51  begin
      52    assert has_table_privilege('authenticated', 'public.reviews',
           'SELECT'),
      53      'authenticated lost SELECT on reviews';
      52 -  assert has_table_privilege('authenticated', 'public.reviews',
         - 'INSERT'),                                                    
      53 -    'authenticated lost INSERT on reviews';                    
      54 -  assert has_table_privilege('authenticated', 'public.reviews',
         - 'UPDATE'),                                                    
      55 -    'authenticated lost UPDATE on reviews';                    
      56 -  assert has_table_privilege('authenticated', 'public.reviews',
         - 'DELETE'),                                                    
      57 -    'authenticated lost DELETE on reviews';                    
      54 +  assert not has_table_privilege('authenticated', 'public.revie
         +ws', 'UPDATE'),                                                
      55 +    'authenticated has UPDATE on reviews';                     
      56 +  assert not has_table_privilege('authenticated', 'public.revie
         +ws', 'DELETE'),                                                
      57 +    'authenticated has DELETE on reviews';                     
      58 +  assert not has_table_privilege('authenticated', 'public.revie
         +ws', 'INSERT'),                                                
      59 +    'authenticated has table-wide INSERT on reviews';          
      60 +                                                               
      61 +  foreach writable in array array[                             
      62 +    'analysis_target_id', 'review_text', 'rating', 'source_revi
         +ew_id', 'reviewer_name',                                       
      63 +    'review_date', 'review_url', 'source_metadata'             
      64 +  ] loop                                                       
      65 +    assert has_column_privilege('authenticated', 'public.review
         +s', writable, 'INSERT'),                                       
      66 +      format('authenticated cannot insert reviews.%s', writable
         +);                                                             
      67 +  end loop;                                                    
      68 +                                                               
      69 +  assert not has_column_privilege('authenticated', 'public.revi
         +ews', 'id', 'INSERT'),                                         
      70 +    'authenticated can insert reviews.id';                     
      71 +  assert not has_column_privilege('authenticated', 'public.revi
         +ews', 'created_at', 'INSERT'),                                 
      72 +    'authenticated can insert reviews.created_at';             
      73  end
      74  $$;
      60 -\echo 'ok - authenticated keeps SELECT, INSERT, UPDATE, and DEL
         -ETE on reviews'                                                
      75 +\echo 'ok - authenticated has SELECT and column-limited INSERT 
         +only (no UPDATE, DELETE, id or created_at)'                    
      76  
      77  do $$
      78  begin

⏺ Update(tests/db/reviews-privileges.test.sql)
  ⎿  Added 136 lines
      114  end
      115  $$;
      116  \echo 'ok - both users'' seeded reviews are still present afte
           r the TRUNCATE attempt'
      117 +                                                              
      118 +-- -----------------------------------------------------------
          +----------------------------------                            
      119 +-- Even the owning user cannot rewrite, delete, or backdate re
          +views (as User C on target C)                                 
      120 +-- -----------------------------------------------------------
          +----------------------------------                            
      121 +set role authenticated;                                       
      122 +set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaa
          +aaaaaaaaa"}';                                                 
      123 +                                                              
      124 +do $$                                                         
      125 +begin                                                         
      126 +  update public.reviews set rating = 5 where review_text = 'C 
          +one';                                                         
      127 +  raise exception 'User C changed the rating of their own revi
          +ew';                                                          
      128 +exception                                                     
      129 +  when insufficient_privilege then null;                      
      130 +end                                                           
      131 +$$;                                                           
      132 +                                                              
      133 +do $$                                                         
      134 +begin                                                         
      135 +  update public.reviews set created_at = '2020-01-01T00:00:00Z
          +' where review_text = 'C one';                                
      136 +  raise exception 'User C changed created_at of their own revi
          +ew';                                                          
      137 +exception                                                     
      138 +  when insufficient_privilege then null;                      
      139 +end                                                           
      140 +$$;                                                           
      141 +                                                              
      142 +do $$                                                         
      143 +begin                                                         
      144 +  update public.reviews                                       
      145 +  set analysis_target_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccc
          +c2'                                                           
      146 +  where review_text = 'C one';                                
      147 +  raise exception 'User C moved their own review to their othe
          +r target';                                                    
      148 +exception                                                     
      149 +  when insufficient_privilege then null;                      
      150 +end                                                           
      151 +$$;                                                           
      152 +\echo 'ok - the owner cannot update their own reviews (rating,
          + created_at, or target)'                                      
      153 +                                                              
      154 +do $$                                                         
      155 +begin                                                         
      156 +  delete from public.reviews where review_text = 'C one';     
      157 +  raise exception 'User C deleted their own review';          
      158 +exception                                                     
      159 +  when insufficient_privilege then null;                      
      160 +end                                                           
      161 +$$;                                                           
      162 +\echo 'ok - the owner cannot delete their own reviews'        
      163 +                                                              
      164 +do $$                                                         
      165 +begin                                                         
      166 +  insert into public.reviews (id, analysis_target_id, review_t
          +ext, rating)                                                  
      167 +  values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'cccccccc-cc
          +cc-4ccc-8ccc-cccccccccccc',                                   
      168 +          'Chosen id', 4);                                    
      169 +  raise exception 'User C inserted a review with a chosen id';
      170 +exception                                                     
      171 +  when insufficient_privilege then null;                      
      172 +end                                                           
      173 +$$;                                                           
      174 +                                                              
      175 +do $$                                                         
      176 +begin                                                         
      177 +  insert into public.reviews (analysis_target_id, review_text,
          + rating, created_at)                                          
      178 +  values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Backdated',
          + 4, '2020-01-01T00:00:00Z');                                  
      179 +  raise exception 'User C inserted a review with a chosen crea
          +ted_at';                                                      
      180 +exception                                                     
      181 +  when insufficient_privilege then null;                      
      182 +end                                                           
      183 +$$;                                                           
      184 +\echo 'ok - the owner cannot choose id or created_at when inse
          +rting'                                                        
      185 +                                                              
      186 +do $$                                                         
      187 +declare                                                       
      188 +  inserted public.reviews;                                    
      189 +begin                                                         
      190 +  insert into public.reviews (                                
      191 +    analysis_target_id, review_text, rating, source_review_id,
          + reviewer_name, review_date,                                  
      192 +    review_url, source_metadata                               
      193 +  ) values (                                                  
      194 +    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'C three', 3, 'src
          +-c3', 'Cam',                                                  
      195 +    '2026-10-01T12:00:00Z', 'https://maps.google.com/review/c3
          +', '{"helpfulVotes": 1}'                                      
      196 +  )                                                           
      197 +  returning * into inserted;                                  
      198 +                                                              
      199 +  assert inserted.id is not null, 'id was not generated';     
      200 +  assert inserted.created_at is not null and inserted.created_
          +at <= now(),                                                  
      201 +    'created_at was not set by the database';                 
      202 +  assert inserted.review_text = 'C three' and inserted.rating 
          += 3, 'values were not persisted';                             
      203 +end                                                           
      204 +$$;                                                           
      205 +\echo 'ok - a normal insert of the app''s columns still works 
          +and returns the row'                                          
      206 +                                                              
      207 +reset role;                                                   
      208 +                                                              
      209 +do $$                                                         
      210 +begin                                                         
      211 +  assert (                                                    
      212 +    select rating from public.reviews where review_text = 'C o
          +ne'                                                           
      213 +  ) = 4, 'User C''s review rating changed';                   
      214 +  assert (                                                    
      215 +    select analysis_target_id from public.reviews where review
          +_text = 'C one'                                               
      216 +  ) = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'User C''s revie
          +w moved target';                                              
      217 +  assert (                                                    
      218 +    select count(*) from public.reviews                       
      219 +    where analysis_target_id = 'cccccccc-cccc-4ccc-8ccc-cccccc
          +cccccc'                                                       
      220 +  ) = 3, 'target C should have its 2 seeded reviews plus the 1
          + normal insert';                                              
      221 +  assert not exists (                                         
      222 +    select 1 from public.reviews where review_text in ('Chosen
          + id', 'Backdated')                                            
      223 +  ), 'a denied insert was saved';                             
      224 +end                                                           
      225 +$$;                                                           
      226 +\echo 'ok - denied writes left User C''s reviews unchanged'   
      227 +                                                              
      228 +-- -----------------------------------------------------------
          +----------------------------------                            
      229 +-- Deleting a target still removes its reviews, even though DE
          +LETE on reviews is revoked                                    
      230 +-- -----------------------------------------------------------
          +----------------------------------                            
      231 +set role authenticated;                                       
      232 +set request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaa
          +aaaaaaaaa"}';                                                 
      233 +                                                              
      234 +delete from public.analysis_targets where id = 'cccccccc-cccc-
          +4ccc-8ccc-cccccccccccc';                                      
      235 +                                                              
      236 +reset role;                                                   
      237 +                                                              
      238 +do $$                                                         
      239 +begin                                                         
      240 +  assert not exists (                                         
      241 +    select 1 from public.analysis_targets where id = 'cccccccc
          +-cccc-4ccc-8ccc-cccccccccccc'                                 
      242 +  ), 'User C could not delete their own target';              
      243 +  assert not exists (                                         
      244 +    select 1 from public.reviews where analysis_target_id = 'c
          +ccccccc-cccc-4ccc-8ccc-cccccccccccc'                          
      245 +  ), 'reviews remained after their target was deleted';       
      246 +  assert (                                                    
      247 +    select count(*) from public.reviews                       
      248 +    where analysis_target_id = 'dddddddd-dddd-4ddd-8ddd-dddddd
          +dddddd'                                                       
      249 +  ) = 3, 'deleting User C''s target removed User D''s reviews'
          +;                                                             
      250 +end                                                           
      251 +$$;                                                           
      252 +\echo 'ok - deleting a target as its owner still removes its r
          +eviews with DELETE revoked'                                   

⏺ The move test needs User C to own a second target, so I'll add it to the seed
  data.

⏺ Update(tests/db/reviews-privileges.test.sql)
  ⎿  Added 2 lines
      20  insert into public.analysis_targets (id, owner_id, name, platfo
          rm, source_url) values
      21    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-
          8aaa-aaaaaaaaaaaa',
      22     'Target C', 'google_maps', 'https://maps.google.com/?cid=10'
          ),
      23 +  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'aaaaaaaa-aaaa-4aaa-
         +8aaa-aaaaaaaaaaaa',                                            
      24 +   'Target C2', 'google_maps', 'https://maps.google.com/?cid=12
         +'),                                                            
      25    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bbbbbbbb-bbbb-4bbb-
          8bbb-bbbbbbbbbbbb',
      26     'Target D', 'google_maps', 'https://maps.google.com/?cid=11'
          );
      27  

⏺ Update(tests/db/reviews-privileges.test.sql)
  ⎿  Added 2 lines, removed 1 line
       4  -- so the migration must revoke those inherited privileges. Run
           with `npm run test:db`.
       5  -- Uses its own ids so it is independent of other test files.
       6  --
       7 --- User C: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa (target C)     
       7 +-- User C: aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa (targets C and 
         +C2)                                                            
       8  -- User D: bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb (target D)
       9  -- Target C: cccccccc-cccc-4ccc-8ccc-cccccccccccc
      10 +-- Target C2: cccccccc-cccc-4ccc-8ccc-ccccccccccc2             
      11  -- Target D: dddddddd-dddd-4ddd-8ddd-dddddddddddd
      12  
      13  \set ON_ERROR_STOP on

⏺ Next I'll start a throwaway Postgres 17 again (localhost only, port 55432) and
  run the DB suite.

  Ran 1 shell command (ctrl+o to expand)

⏺ All 35 checks pass. To make sure the new tests actually catch the old
  over-broad grants, I'll run them against the HEAD version of the migration in
  a temporary copy (your files untouched).

  Ran 1 shell command (ctrl+o to expand)

⏺ Against the old migration, the new test fails with authenticated has UPDATE on
  reviews, so it catches the problem. A is done. Now B: the cleanString code in
  normalize.ts.

  Read 1 file (ctrl+o to expand)

⏺ I'll put the cleanup in one small shared helper that both files use.
  toWellFormed needs ES2024 type definitions, so I'll check the TypeScript
  config first.

  Ran 1 shell command (ctrl+o to expand)

⏺ lib includes esnext, which covers toWellFormed in TS 5.9.3. Creating the
  shared helper:

⏺ Write(src/services/reviews/storable-text.ts)
  ⎿  Wrote 8 lines to src/services/reviews/storable-text.ts
      1 /**
      2  * Makes a string safe to store in Postgres text and jsonb. Postg
        res rejects NUL (\u0000) and
      3  * lone UTF-16 surrogates (for example a cut-off emoji such as "\
        ud83d"), and one such character
      4  * would fail a whole batch insert. NUL is removed and each lone
        surrogate is replaced with
      5  * U+FFFD. Valid surrogate pairs, such as emoji, are left unchang
        ed.
      6  */
     … +2 lines (ctrl+o to expand)

⏺ Update(src/services/reviews/normalize.ts)
  ⎿  Added 6 lines, removed 4 lines
      1 +import { toStorableText } from "./storable-text";               
      2  import {
      3    MAX_RATING,
      4    MIN_RATING,
     ...
       7    type RawReview,
       8  } from "./types";
       9  
       9 -/** Postgres rejects \u0000 in text and jsonb, so it is removed
         - before any other check. */                                    
      10 -const stripNul = (value: string): string => value.split("\u0000
         -").join("");                                                   
      11 -                                                               
      10 +/**                                                            
      11 + * Postgres rejects \u0000 and lone UTF-16 surrogates in text a
         +nd jsonb, so they are cleaned                                  
      12 + * before any other check.                                     
      13 + */                                                            
      14  const cleanString = (value: unknown): string | undefined => {
      15    if (typeof value !== "string") return undefined;
      14 -  const cleaned = stripNul(value).trim();                      
      16 +  const cleaned = toStorableText(value).trim();                
      17    return cleaned === "" ? undefined : cleaned;
      18  };
      19  

  Searched for 1 pattern (ctrl+o to expand)

⏺ Now toJsonValue in review-service.ts: it should use the same helper for
  strings and object keys.

  Read 1 file (ctrl+o to expand)

⏺ Update(src/services/reviews/review-service.ts)
  ⎿  Added 1 line
      1  import { InvalidReviewError, TargetNotFoundError } from "./error
         s";
      2 +import { toStorableText } from "./storable-text";               
      3  import { MAX_RATING, MIN_RATING, type NormalizedReview } from ".
         /types";
      4  
      5  /** A persisted Review. Ownership is inherited through its Analy
         sisTarget (S1-BR-022). */
⏺ Update(src/services/reviews/review-service.ts)
  ⎿  Removed 2 lines
      29  export const MAX_METADATA_BYTES = 16_384;
      30  const MAX_METADATA_DEPTH = 10;
      31  
      32 -const stripNul = (value: string): string => value.split("\u0000
         -").join("");                                                   
      33 -                                                               
      32  const isPlainObject = (value: object): boolean => {
      33    const prototype = Object.getPrototypeOf(value);
      34    return prototype === Object.prototype || prototype === null;

⏺ Update(src/services/reviews/review-service.ts)
  ⎿  Added 4 lines, removed 3 lines
      36  
      37  /**
      38   * Returns a JSON-safe copy of `value`, or undefined if it cann
          ot be stored. Postgres rejects
      39 - * \u0000 in jsonb, so it is removed from keys and strings. Val
         -ues JSON cannot represent                                      
      40 - * (functions, bigint, NaN, class instances, cycles past the de
         -pth limit) are dropped.                                        
      39 + * \u0000 and lone UTF-16 surrogates in jsonb, so keys and stri
         +ngs are cleaned with                                           
      40 + * `toStorableText`. Values JSON cannot represent (functions, b
         +igint, NaN, class instances,                                   
      41 + * cycles past the depth limit) are dropped.                   
      42   */
      43  function toJsonValue(value: unknown, depth: number): unknown {
      44    if (value === null || typeof value === "boolean") return valu
          e;
      44 -  if (typeof value === "string") return stripNul(value);       
      45 +  if (typeof value === "string") return toStorableText(value); 
      46    if (typeof value === "number") return Number.isFinite(value) 
          ? value : undefined;
      47    if (value instanceof Date) {
      48      return Number.isNaN(value.getTime()) ? undefined : value.to
          ISOString();

⏺ Update(src/services/reviews/review-service.ts)
  ⎿  Added 1 line, removed 1 line
      57    const result: Record<string, unknown> = {};
      58    for (const [key, item] of Object.entries(value)) {
      59      const clean = toJsonValue(item, depth + 1);
      60 -    if (clean !== undefined) result[stripNul(key)] = clean;    
      60 +    if (clean !== undefined) result[toStorableText(key)] = clea
         +n;                                                             
      61    }
      62    return result;
      63  }

⏺ The code changes for B are done. Now the unit tests; first how
  normalize.test.ts is laid out.

  Ran 2 shell commands (ctrl+o to expand)

⏺ Your branch lacks S1-021's normalize.test.ts, since it reached main after your
  last merge, so I'm putting the new tests in storable-text.test.ts and running
  main's normalize.test.ts against the changed code.

⏺ Write(tests/unit/services/reviews/storable-text.test.ts)
  ⎿  Wrote 72 lines to tests/unit/services/reviews/storable-text.test.ts
       1 /** @jest-environment node */
       2
       3 import { normalizeBatch, normalizeReview } from "@/services/revi
         ews/normalize";
       4 import { toStorableText } from "@/services/reviews/storable-text
         ";
       5
       6 const LONE_HIGH = "\ud83d"; // first half of an emoji, cut off
       7 const LONE_LOW = "\ude00"; // second half of an emoji on its own
       8 const EMOJI = "😀"; // a valid surrogate pair (grinning face)
     … +64 lines (ctrl+o to expand)

⏺ Now review-service.test.ts: the nested metadata cleanup, and a batch with one
  malformed review saving in full.

  Searched for 1 pattern, read 1 file (ctrl+o to expand)

⏺ Update(tests/unit/services/reviews/review-service.test.ts)
  ⎿  Added 51 lines
      190  
      191      expect(inserted[0][0].sourceMetadata).toEqual({ note: "ab"
            });
      192    });
      193 +                                                              
      194 +  test("saves a whole batch in full when one review has malfor
          +med characters", async () => {                                
      195 +    const { reviews, rejected } = normalizeBatch([            
      196 +      { text: "Fine", rating: 3 },                            
      197 +      {                                                       
      198 +        text: "Cut off \ud83d",                               
      199 +        rating: 4,                                            
      200 +        reviewerName: "Sam\u0000",                            
      201 +        metadata: { "ke\ud83dy": ["ok", { deep: "bad\ude00\u00
          +00" }] },                                                     
      202 +      },                                                      
      203 +      { text: "Emoji 😀", rating: 5 },                        
      204 +    ]);                                                       
      205 +                                                              
      206 +    const saved = await saveReviews(store, userA, "target-a", 
          +reviews);                                                     
      207 +                                                              
      208 +    expect(rejected).toEqual([]);                             
      209 +    expect(saved).toHaveLength(3);                            
      210 +    // Postgres rejects NUL and lone surrogates, so nothing li
          +ke that may reach the store.                                  
      211 +    expect(unstorableStrings(inserted[0])).toEqual([]);       
      212 +    expect(saved.map((review) => review.text)).toEqual([      
      213 +      "Fine",                                                 
      214 +      "Cut off �",                                            
      215 +      "Emoji 😀",                                             
      216 +    ]);                                                       
      217 +    expect(inserted[0][1].sourceMetadata).toEqual({ "ke�y": ["
          +ok", { deep: "bad�" }] });                                    
      218 +  });                                                         
      219  });
      220  
      221 +// Every string (and object key) anywhere in `value` that Post
          +gres would reject.                                            
      222 +function unstorableStrings(value: unknown): string[] {        
      223 +  if (typeof value === "string") {                            
      224 +    return value.isWellFormed() && !value.includes("\u0000") ?
          + [] : [value];                                                
      225 +  }                                                           
      226 +  if (Array.isArray(value)) return value.flatMap(unstorableStr
          +ings);                                                        
      227 +  if (value instanceof Date || value === null || typeof value 
          +!== "object") return [];                                      
      228 +  return Object.entries(value).flatMap(([key, item]) => [     
      229 +    ...unstorableStrings(key),                                
      230 +    ...unstorableStrings(item),                               
      231 +  ]);                                                         
      232 +}                                                             
      233 +                                                              
      234  describe("sanitizeMetadata", () => {
      235    test("removes NUL characters from nested keys and strings", 
           () => {
      236      expect(sanitizeMetadata({ a: { "b\u0000": ["x\u0000", 1] }
            })).toEqual({ a: { b: ["x", 1] } });
      237    });
      238  
      239 +  test("replaces lone surrogates in nested keys and strings an
          +d keeps valid emoji", () => {                                 
      240 +    expect(                                                   
      241 +      sanitizeMetadata({                                      
      242 +        "ti\ud83dtle": "ok 😀",                               
      243 +        nested: { list: ["cut \ud83d", { "\ude00": "x" }] },  
      244 +      }),                                                     
      245 +    ).toEqual({                                               
      246 +      "ti�tle": "ok 😀",                                      
      247 +      nested: { list: ["cut �", { "�": "x" }] },              
      248 +    });                                                       
      249 +  });                                                         
      250 +                                                              
      251    test("drops values JSON cannot represent and keeps the rest"
           , () => {
      252      expect(
      253        sanitizeMetadata({

⏺ Now I'll run the unit tests, plus main's S1-021 normalize.test.ts, copied in
  temporarily and deleted straight after.

⏺ Bash(npx prettier --write src/services/reviews tests/unit/services/reviews
      >/dev/null; npx jest --runInBand tests/unit/services/reviews 2>&1 | grep
      -E "✕|●|Tests:|Su…)
  ⎿  Updated tests/unit/services/reviews/review-service.test.ts (+1 -5)
      209      expect(saved).toHaveLength(3);
      210      // Postgres rejects NUL and lone surrogates, so nothing li
           ke that may reach the store.
      211      expect(unstorableStrings(inserted[0])).toEqual([]);
      212 -    expect(saved.map((review) => review.text)).toEqual([      
      213 -      "Fine",                                                 
      214 -      "Cut off �",                                            
      215 -      "Emoji 😀",                                             
      216 -    ]);                                                       
      212 +    expect(saved.map((review) => review.text)).toEqual(["Fine"
          +, "Cut off �", "Emoji 😀"]);                                  
      213      expect(inserted[0][1].sourceMetadata).toEqual({ "ke�y": ["
           ok", { deep: "bad�" }] });
      214    });
      215  });
  ⎿  Updated tests/unit/services/reviews/storable-text.test.ts (+1 -5)
      63      ]);
      64  
      65      expect(rejected).toEqual([]);
      66 -    expect(reviews.map((review) => review.text)).toEqual([     
      67 -      "Fine",                                                  
      68 -      "Cut off �",                                             
      69 -      `Emoji ${EMOJI}`,                                        
      70 -    ]);                                                        
      66 +    expect(reviews.map((review) => review.text)).toEqual(["Fine
         +", "Cut off �", `Emoji ${EMOJI}`]);                            
      67    });
      68  });

⏺ The unit tests pass, including 41 in the review suites and all 54
  normalize.test.ts tests against the changed cleanString. Prettier rewrapped
  two test files, so I'm checking that the \ufffd escapes survived.

  Searched for 1 pattern (ctrl+o to expand)

⏺ Prettier turned \ufffd into a literal U+FFFD character, which is the same
  string, so the tests are unaffected and I'm leaving it. Next I'm running the
  full verification: the DB suite, then every npm check.

  Ran 1 shell command (ctrl+o to expand)

⏺ Everything passes. I'll shut down and delete the throwaway Postgres, re-run
  the placeholder grep for item C, and collect the final diff.

  Ran 1 shell command (ctrl+o to expand)

⏺ I've fixed both P2 code issues. All the checks below were run and passed, and
  nothing is committed or pushed.

  Files changed and why

  A. Write privileges on reviews
  - supabase/migrations/20261104000000_create_reviews.sql (edited in place; no
    older migration touched):
    - kept revoke all ... from anon, authenticated
    - replaced the UPDATE and DELETE grants with grant select
    - limited INSERT to the 8 columns toInsertRow writes (analysis_target_id,
      review_text, rating, source_review_id, reviewer_name, review_date,
      review_url, source_metadata), so id and created_at are excluded
    - removed the reviews_update_own and reviews_delete_own policies; the select
      and insert policies are unchanged
    - updated the comments to match
  - tests/db/reviews-privileges.test.sql:
    - the "keeps SELECT, INSERT, UPDATE, DELETE" check now asserts SELECT plus
      column-level INSERT only, and no UPDATE, DELETE, table-wide INSERT, id or
      created_at
    - new checks, each run as the owning user:
      - UPDATE of the rating, created_at or target is denied
      - DELETE is denied
      - INSERT with an explicit id or created_at is denied
      - a normal insert works
      - denied writes leave the data unchanged
      - deleting your own target still removes its reviews, even with DELETE
        revoked
    - added a second target for User C so the move test has somewhere to move to
    - the TRUNCATE tests are unchanged
  - tests/db/reviews.test.sql: the one test that expected UPDATE and DELETE to
    succeed but match 0 rows now expects insufficient_privilege and checks that
    User A's reviews are unchanged. Nothing was skipped or deleted. The move
    test already expected insufficient_privilege, so it's unchanged.

  B. Malformed characters
  - src/services/reviews/storable-text.ts (new): toStorableText() removes NUL,
    then runs .toWellFormed(), which replaces lone surrogates with U+FFFD and
    keeps valid emoji pairs.
  - src/services/reviews/normalize.ts: cleanString uses it. This is the shared
    path for text, reviewer name, IDs and URLs. This file is S1-021's code,
    edited minimally because item B requires it.
  - src/services/reviews/review-service.ts: toJsonValue uses it on strings and
    object keys, recursively.
  - tests/unit/services/reviews/storable-text.test.ts (new) and
    review-service.test.ts:
    - a lone surrogate is replaced
    - an emoji pair is unchanged
    - NUL is removed
    - nested metadata keys and strings are cleaned
    - a batch with one malformed review saves in full; the test checks that no
      NUL or lone surrogate reaches the store

  Verification

  ┌───────────────────────────────────────┬─────────────────────────────────┐
  │                Command                │             Result              │
  ├───────────────────────────────────────┼─────────────────────────────────┤
  │ bash tests/db/run.sh (PostgreSQL 17,  │ 35 checks ok, "All database     │
  │ throwaway local instance)             │ tests passed.", exit 0          │
  ├───────────────────────────────────────┼─────────────────────────────────┤
  │ npm run lint                          │ exit 0                          │
  ├───────────────────────────────────────┼─────────────────────────────────┤
  │ npm run format:check                  │ "All matched files use Prettier │
  │                                       │  code style!", exit 0           │
  ├───────────────────────────────────────┼─────────────────────────────────┤
  │ npm test                              │ 19 suites, 261 tests passed,    │
  │                                       │ exit 0                          │
  ├───────────────────────────────────────┼─────────────────────────────────┤
  │ npm run typecheck                     │ "Types generated successfully", │
  │                                       │  exit 0                         │
  ├───────────────────────────────────────┼─────────────────────────────────┤
  │ npm run build                         │ "Compiled successfully", exit 0 │
  └───────────────────────────────────────┴─────────────────────────────────┘

  The new tests catch the bugs they target:
  - Run against the old migration, the DB suite fails with authenticated has
    UPDATE on reviews.
  - All 54 of S1-021's own normalize.test.ts tests (from main) still pass
    against the changed cleanString.

  Placeholders still to fill in after the push

  - In the repo: none to fill in. The only matches are inside the part 3
    transcript (lines 790, 791, 804, 824, 826 and 874), where they're quotes of
    earlier dialogue. Leave them as they are.
  - In the PR description on GitHub: after pushing, add this round's commit SHA
    and CI run link.

  Not done or not verified

  - Database tests on Postgres 16 and hosted Supabase: they ran locally on
    Postgres 17 only. CI runs Postgres 16, and nothing has run against hosted
    Supabase or through its real API. That includes the reviewer's
    lone-surrogate case, which the fix handles but no one has reproduced end to
    end.
  - The part 4 transcript: the folder's convention is one transcript per fix
    round, so this round needs one. It can only be exported after this session,
    so it isn't done. Run /export
    ai-transcripts/2026-11-06_deep_S1-022_claude-code-part4.md, and I'll trim
    and redact it as before.
  - Branch behind main: main now has S1-021's normalize.test.ts, which this
    branch lacks; that's why the new tests went in a separate file. Merging main
    in should be conflict-free, but I haven't done it.
  - No commit or push, as you asked. The pasted commit message for when you're
    ready is S1-022: restrict reviews write privileges and sanitize malformed
    characters.

  Reminder (D): change "Closes #22" to "Refs #22" in the PR description
  yourself. Nothing here has been verified against hosted Supabase yet.
---

## Completion note (added 2026-11-06)

- Review fixes for the round after `93fee53` (least-privilege writes and malformed-character cleaning) were made locally and are not yet committed at the time of this note.
- Local results on those changes: `bash tests/db/run.sh` on PostgreSQL 17 applied both migrations and passed all 35 checks; against the previous migration the new privilege test fails (`authenticated has UPDATE on reviews`). Lint, format, 261 unit tests, typecheck and build passed. S1-021's `normalize.test.ts` from `main` (54 tests) also passed against the changed `cleanString`. CI runs PostgreSQL 16.
- Not verified: hosted Supabase and the real Supabase API, including the lone-surrogate rejection, which was reproduced by the reviewer only in Postgres.
- The commit SHA and CI run for these changes will be added to the PR description after the push.
