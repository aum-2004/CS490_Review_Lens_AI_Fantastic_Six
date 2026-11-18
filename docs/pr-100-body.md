Refs #2, #18. Follows #27.

## Summary

Implements the Analyst Studio design with a left navigation rail, **RL** branding,
updated workspace panels, and a persisted theme choice on sign-in and protected
pages. Updates the UI/UX standards to match.

The review follow-up adds CI unit tests that execute the actual layout theme
initializer, including invalid stored values and storage failures. The shared
toggle uses the visible **Dark mode** label with `aria-pressed`, tracks system
changes until a preference is selected, and keeps multiple controls synchronized.

Workspace status, keyboard submission, maximum-length target names, and input
contrast were corrected during the functionality/security review. Authentication,
ownership checks, prompt behavior, database migrations, and dependency versions
remain unchanged.

## Validation

- Full local Jest coverage run: **99 suites / 1,721 tests passed**.
- Changed-code coverage: **100% (354/354 lines)** with the existing policy.
- Formatting, migration validation, lint, typecheck, and production build passed
  in a clean tracked-file snapshot.
- Production browser checks passed for toggle accessibility, reload/sign-in
  persistence, and mobile/desktop controls.

Local follow-up validation is recorded in the
[review follow-up](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/docs/pr-100-review-followup.md).
CI was green on `e4aed0e`; fresh CI must cover the follow-up commit before approval.
Tests use synthetic identities and controlled services. Hosted Supabase/RLS and
live paid-provider/model behavior were not verified.

## Review and AI assistance

OpenAI Codex assisted with implementation, testing, security review, and
documentation. The author remains responsible for the changes and independent
teammate approval.

- [Implementation transcript](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/ai-transcripts/2026-11-17_melissa_PR-100_codex.md)
- [Review continuation](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/ai-transcripts/2026-11-17_ui-changes_PR-100_review_codex.md)
- [Functionality/security findings](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/blob/ui-changes/docs/pr-100-functionality-security-review.md)

The implementation transcript is exported from the original session, including
failed attempts and tool records. User-home paths and credentials are redacted;
internal reasoning/account metadata and binary images are omitted and identified.
