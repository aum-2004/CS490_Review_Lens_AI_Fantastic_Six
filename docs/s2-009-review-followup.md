# S2-009 review follow-up — 2026-11-14

Author: melissa. AI assistance: Codex. Local code/merge commit: `6272d01`.

## Main reconciliation

Merged main `54c3a3a`, containing S2-013 follow-up #89, into `s2-009`.
The merge was clean. `system-prompt.ts`, its tests and S2-011/S2-013 docs now
match main exactly. No prompt changes from #89 remain in this PR's file diff;
its original commits remain in branch ancestry because #89 was squash-merged.

The prompt stays `s2-013.v4`: open-ended recommendations without a particular
business use `declined_general_knowledge`; other businesses, named or described,
including comparisons, use `declined_other_entity` subject to the existing
review-evidence comparison rule. No prompt rule was rewritten in this follow-up.

## Ownership-before-body regression

Added two cases to the existing actual-route integration suite. A foreign target
with either `text/plain` or malformed `application/json` must return
**404 `TARGET_NOT_FOUND`**, retain private/no-store headers and leave the body unread.
Neither review reads, the Q&A pipeline, quota reservation nor provider calls may occur.
The existing owned-target tests still require 415 for unsupported content types
and 400 for malformed JSON, so the new cases pin ordering rather than blanket rejection.

Verified the reviewer's specific mutation: temporarily removed only the route's
`getOwnedTargetOrThrow` call, ran the new cases, then restored the original route
bytes in `finally`. Both tests failed as intended: text/plain returned 415 and
malformed JSON returned 400 instead of 404. No mutation remains in the working tree
or commit. The restored focused suite passed all 48 cases before the probe;
the complete restored run is recorded below.

## Validation and remaining acceptance

The production source, package manifests/lockfile, dependency patch and migrations
are unchanged from published `e1bf613`. Its application and database CI checks passed.
No new dependency, SQL change, UI behavior or provider configuration was introduced.
This update adds test coverage and merges already reviewed main history.

- Full restored run: **1,302 tests / 71 suites passed**, none skipped.
- Changed-code gate passed against main `54c3a3a`: **508/515 lines (98.64%)**;
  changed Q&A service lines **33/33 (100%)**. The upstream prompt is no longer
  part of the changed-line denominator. No coverage threshold was changed.
- Lint, typecheck, formatting and whitespace checks passed.
- Build/browser/database checks were not repeated for this test-only update:
  Git confirms the production source, dependencies and SQL exactly match the
  previously tested/published head. New-head remote CI still needs to run after push.

The merge check targets main `54c3a3a`; future main
changes can require another reconciliation. No push or hosted operation was performed
for this follow-up; the earlier `e1bf613` push remains published.

Keep Q&A disabled until the quota migration's hosted verification is complete.
Request current-head normal/security reconfirmation after publishing the update;
older approvals and passing CI do not automatically approve the new head.
Hosted/live-model acceptance remains separate from deterministic local tests.

PR update: `pr-s2-009.md`.
Original follow-up dialogue (melissa; filesystem paths redacted):
`ai-transcripts/2026-11-14_melissa_S2-009_review-followup_codex.md`.
