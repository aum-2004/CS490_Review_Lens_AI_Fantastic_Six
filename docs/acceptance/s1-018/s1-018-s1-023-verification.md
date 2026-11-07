# S1-018 / S1-023 local verification

Date: 2026-11-06, America/New_York. Branch: `s1-018`.

## Checks

- Jest: 42 suites, 541 tests passed after integrating merged S1-019 commit `0388c43`.
- TypeScript: `npm run typecheck` passed.
- ESLint: `npm run lint` passed.
- Prettier: `npm run format:check` passed.
- Browser regression: 20 tests passed with installed Microsoft Edge using
  `PLAYWRIGHT_CHANNEL=msedge npm run test:e2e:auth` (PowerShell env syntax locally).
- SQL: the auth shim, all three migrations and all six SQL test files passed in
  isolated PGlite PostgreSQL. The runner strips only psql meta-command lines before
  execution. Native PostgreSQL 16 remains the required CI database job.
- Production build: `npm run build` passed, including the workspace and ingestion
  status/reconciliation routes. Network access was needed for Inter.

## Evidence and limits

The follow-up regressions verify approval withdrawal/restoration without another
paid submission; stale unbound expiry after binding; binding retry without another
provider start; late authenticated callback recovery; duplicate terminal callbacks;
spoofed/tampered callback rejection; and hiding prior success during a pending start.
The callback tests verify both correlation and native provider body signatures.
See `docs/s1-023-job-recovery.md` for configuration and operator recovery steps.

`desktop.png` and `mobile.png` show the workspace at 1280px and 375px.
`url-provenance.png` shows the completed URL-job identity disclosure. Images were
visually inspected; responsive overflow is also asserted by the browser test. A
Next.js development indicator may appear in these development-server captures.

Browser tests use real Next.js/auth/Supabase SDK requests against the local fixture.
The fixture supplies persisted synthetic reviews and owner-scoped attempt states;
it is not deployed application code. Service/route tests inject verified synthetic
provider results. SQL tests exercise the actual RPCs and RLS, including transaction
rollback, idempotent finalization, blocked uncertain starts, read-only browser
privileges, cross-user denial, source-URL completion with explicit provider-resolved
provenance, and configured-identity mismatch. Returned URL identities are not promoted
to target configuration and are not described as independent proof of a URL match.

No paid provider extraction or real-review persistence was performed. Both live
gates remain disabled by default; no storage-terms approval is asserted. No hosted
database migration was applied. S1-019's source-URL submission service is integrated
with the reserved, owner-scoped S1-023 lifecycle. Its latest nested identity checks
and regression tests are retained.

The local branch was fast-forwarded to merged S1-019 commit `0388c43`; existing
018/023 working changes were restored and adjusted, with their safety stash retained.
No new commit, push, PR, hosted merge or remote issue closure was performed.
Teammate/security review, human acceptance and PR CI remain acceptance steps before
merge. Local verification is not a substitute for those steps.

## Final UI and transcript follow-up

Review text, reviewer names and ingestion prose now use `max-w-prose`, including
the provider-identity disclosure. Long names still wrap within the mobile card.
The refreshed screenshots were visually inspected after this change.

After the width change, all 541 tests / 42 Jest suites, all seven workspace browser
tests, formatting, lint, typecheck and production build passed. The earlier full
20-test browser run and six SQL-file run remain the integration baseline; no
database behavior changed in this follow-up.

The original user/assistant messages were recovered from this task's local session
log and retained, after redaction screening, in
[the original-message transcript](../../../ai-transcripts/2026-11-06_codex_S1-018-S1-023_original.md).
It includes the scope changes, failed approaches and corrections as originally
communicated, and the final follow-up. Earlier continuation records are historical
supporting records, not substitutes for that transcript. Link the original-message
transcript in the PR; author review of its contents remains required.
