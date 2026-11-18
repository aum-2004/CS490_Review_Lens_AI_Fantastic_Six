Refs #2, #18. Follows #27. Integrates #101 and #102.

## Summary

Applies the Analyst Studio design with a left navigation rail, **RL** branding,
updated workspace panels, and a persisted light/dark preference on sign-in and
protected pages. UI/UX standards document the resulting layout and interactions.

The workspace keeps live collection status synchronized, distinguishes persisted
dataset metrics, supports Enter/Shift+Enter question composition, and handles
maximum-length target names on mobile. Target switching and supporting review
evidence stay scoped to the active verified account and target.

## Reviewer feedback

- CI unit tests execute the actual layout initializer for valid preferences,
  invalid/malicious values, and both storage-read and storage-access failures.
  Failed/invalid reads leave `data-theme` absent for the system fallback.
- The toggle's visible/accessibility label is **Dark mode** with `aria-pressed`;
  the overriding `aria-label` is removed. Tests cover system changes, explicit
  preferences, multiple controls, and subscription cleanup.
- The original implementation conversation and tool history are exported and
  linked below, including failed attempts. User-home paths and credentials are
  redacted; internal reasoning/account metadata and binary images are excluded.
- Issue references are explicit above; no already-closed issue is claimed anew.

## CI correction and main integration

The application job on `751e2ff` failed at formatting because a nested
`review-pr101` checkout and ZIP were committed with the branch. They are removed
from Git tracking while their local files are preserved. Git and development
tools exclude local review artifacts; Jest also excludes generated `.next`
packages from module discovery. Application sources and coverage thresholds
remain included.

The prepared merge integrates main at `bea1d49`, retaining PR #101's default
sign-in redirect, password requirements, visibility controls and resets, and
PR #102's server-validated numbered review citations. The citation handoff uses
active-target evidence without reviewer names. No new database migration,
dependency version, prompt rule, or ownership-policy change is introduced.

## Validation and publication status

- **104 Jest suites / 1,853 tests passed** in the clean full coverage run.
- **100% changed-line coverage**: 625/625 lines before the merge commit; the direct diff against integrated main is 359/359.
- Formatting, lint, typecheck, migration validation, production build and the combined production browser smoke test passed.

Detailed local validation results are recorded in the
[main integration report](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/docs/pr-100-main-integration.md).

The integrated changes are staged locally with no unresolved conflicts; **no
commit or push has been performed**. Current GitHub CI still describes the
published head until the integration is committed and pushed. Fresh CI must pass
on that commit before approval. New integration-record links resolve after push.

Tests use synthetic identities and controlled model replies. Hosted Supabase/RLS,
live paid-provider/model behavior, and the SQL suite were not exercised locally;
no SQL changed.

## AI assistance and records

OpenAI Codex assisted with implementation, testing, integration, security review,
and documentation. The author remains responsible for the changes and independent
teammate approval.

- [Original implementation transcript](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/ai-transcripts/2026-11-17_melissa_PR-100_codex.md)
- [Approval follow-up transcript](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/ai-transcripts/2026-11-17_melissa_PR-100_approval-followup_codex.md)
- [Main/CI integration transcript](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/ai-transcripts/2026-11-18_melissa_PR-100_main-integration_codex.md)
- [Functionality/security review](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/docs/pr-100-functionality-security-review.md)
