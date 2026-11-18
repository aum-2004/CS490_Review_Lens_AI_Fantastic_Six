# PR #100 CI and main integration

PR head reviewed: `751e2ff333b44fbc51df32f2d786104cb900e26a`.
Integrated main: `bea1d490050f600eb561db9a979e031d03a25d4f` (PR #101 authentication and PR #102 review citations).

The first pending merge targeted `5403aeb`; after the rate-limit interruption, a fresh fetch found PR #102. The earlier resolutions were backed up and the pending merge was refreshed without creating a commit.

## CI failure

The application CI job stopped at **Check formatting**. The latest branch commit
had included 478 files from a nested `review-pr101` checkout plus its ZIP archive.
Prettier was checking those duplicate files; they also introduced duplicate Jest
packages and unrelated TypeScript source discovery.

The review checkout and archive are removed from Git tracking, while their local
files are preserved. Root Git, Prettier, ESLint, TypeScript, and Jest discovery
ignore this local review-artifact convention. Real application source, normal
tests, and coverage thresholds remain included and unchanged.

## Merge resolution

- Preserved PR #101's default signed-in redirect from `/login` to My Targets or a
  validated protected destination. The old intermediate account panel is not
  restored.
- Retained the visible **Dark mode** control and `aria-pressed` on the signed-out
  form and safe authentication-error page.
- Preserved the merged live registration password requirements, show/hide
  controls, field resets, and provider-authoritative password enforcement.
- Retained PR #102's server-validated citation IDs, numbered references and Supporting Reviews. The workspace passes the active target's loaded evidence without reviewer names; a regression test covers that handoff.
- Combined the actual-form/redirect tests from main with theme and safe-error
  tests from this branch. No conflict markers remain in application or test files.
- Updated the UI standards to describe the merged login behavior.

## Previous authentication-only checkpoint

- Full coverage suite: **100 suites / 1,785 tests passed**.
- Normal pre-commit changed-code gate: **100% (439/439 lines)** against the
  existing HEAD merge-base; coverage policy unchanged.
- Supplemental direct diff against integrated main `5403aeb267bb`:
  **100% (352/352 lines)**, covering the prospective PR delta after this merge.
- Formatting, lint, typecheck, migration filename validation, and production
  build passed using the standard commands directly in this checkout.
- A production browser check passed for registration guidance, password
  visibility/reset, default sign-in and signed-in redirects, persisted theme,
  and mobile layout.
- No SQL changed and the database suite was not rerun locally. The earlier
  GitHub database job passed; new CI must cover the final pushed merge commit.

## Final integrated validation

Final results for `bea1d49`:

- Full clean coverage run: **104 suites / 1,853 tests passed**.
- Normal pre-commit gate: **100% (625/625 lines)** against the existing HEAD merge-base.
- Supplemental direct comparison with integrated main: **100% (359/359 lines)**, using the unchanged policy.
- Formatting, lint, typecheck, migration validation and production build passed.
- The production browser check passed for the combined auth/password/theme flow, numbered supporting reviews without raw UUID labels, target-switch reset and mobile layout.

A first run hit a stale Jest Haste-map entry from the temporary recovery copy. Generated `.next` modules are now excluded from discovery and the test cache was cleared; the clean full rerun above passed, including all six dependency-resolution tests. The local sample provider was restarted after the interruption before the successful browser check. A standalone smoke-script URL was corrected to an absolute API URL; no authentication bypass or application dependency change was introduced.

The merge is prepared locally with resolved files and no commit or push. The
normal changed-code gate before committing still uses the old HEAD merge-base;
an additional direct comparison against integrated main checks the prospective
PR delta. After the merge commit, CI will naturally use the new main merge-base.

Tests use synthetic identities and controlled services. No hosted migration or
paid provider/model call is performed.

AI assistance: OpenAI Codex. The
[recorded integration continuation](../ai-transcripts/2026-11-18_melissa_PR-100_main-integration_codex.md)
retains the available original messages and tool results, including failed
attempts and the interruption. User-home paths and credentials are redacted.
