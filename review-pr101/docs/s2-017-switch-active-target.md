# S2-017 — Switch the active AnalysisTarget

Issue: #68. Author: melissa. Branch: `s2-017`.

The workspace header offers **Switch target**, expanding keyboard-accessible links to the
authenticated user's targets. Each option includes its saved source to distinguish duplicate
names. Escape closes the list and returns focus to the trigger. The current target is labeled “(active)” and uses
`aria-current="page"`. Selection navigates to the target's existing workspace URL, so refresh,
direct links, and browser history use the same active-target identity. The top navigation stays
unchanged. The workspace header, ingestion card, and Q&A identify the current analysis context.

The server verifies authentication and ownership before loading the switch list, ingestion, or
reviews. The switch list reuses `listAnalysisTargets` with the verified session user and the
session-scoped client. Only IDs, names, and source URLs are passed to the switcher. The existing 200-target
list bound applies; the current target is always included, and **View all targets** returns to
My Targets. A list failure leaves the current workspace usable and explains how to retry.

The existing target-scoped Q&A route and context builder remain authoritative. There is no
separate global target store or new context cache. Existing Q&A resets and pending-request
cancellation apply when navigating between targets. Empty or unavailable review data continues
to disable Q&A, with backend validation preventing an ungrounded model call.

Rules: S2-BR-001, S2-BR-014, S2-BR-022 through S2-BR-026. No schema, dependency-version,
provider, or authorization-policy changes.

## Verification

- Focused switcher/workspace review tests: 19 passed, including duplicate names, untrusted text,
  Escape/focus, switch-list failure, empty selection, active marker, and authentication ordering.
- Full Jest run: 80 suites, 1,468 tests passed, including real Q&A orchestration with deterministic
  provider fixtures, A/B target isolation, cross-user denial, and empty datasets.
- Changed-code coverage against the starting `HEAD`: 100% (112/112 changed lines); gate passed.
- ESLint, formatting, TypeScript, and production build passed. The initial sandboxed build could
  not fetch the existing Inter font; rerunning with network permission passed.
- Production browser run: all 14 tests passed, covering the new switcher flow plus existing target
  workspace and Q&A regression specs.
  Uses the real app and local identity/database fixtures; paid providers stay disabled, with
  mocked Q&A responses only for UI assertions. Backend dataset isolation is checked in Jest.
- Screenshots: `test-results/s2-017-switch-1280.png` and
  `test-results/s2-017-switch-375.png` (generated, ignored by Git). Mobile inspection confirmed
  visible actions, wrapped context, and no page overflow.

The first development-mode browser run reached its assertions and screenshots but stalled during
server shutdown and was interrupted. The production browser rerun is recorded in the transcript.
No push, commit, pull request, or deployment was performed. Human review and hosted CI remain
outside this local implementation.

AI transcript: [melissa / Codex](../ai-transcripts/2026-11-15_melissa_S2-017_codex.md).

Follow-up: [code and security review](s2-017-code-security-review.md).

Dependency update: [main integration](s2-017-main-integration.md) supersedes the pre-integration
test totals above. The S2-006 review summary card now explicitly names the selected target and
platform; the switcher, ingestion, summary, and Q&A share the verified workspace target.
