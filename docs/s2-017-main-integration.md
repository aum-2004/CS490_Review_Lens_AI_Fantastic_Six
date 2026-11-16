# S2-017 integration with merged dependencies

Author: melissa. Date: 2026-11-15. Branch: `s2-017`.

Integrated `origin/main` at `d59b509`, including S2-006 (#80), S2-016 (#73), and S2-019 (#92),
into the existing S2-017 commit `b46f6ec`. No remote history was rewritten or pushed.

## Conflict resolution

- `ProtectedTargetWorkspace.tsx`: retained the S2-017 owner-filtered switch list and header
  control, plus main's aggregate review summary, independent summary error handling, and verified
  account identity passed to Q&A. All reads remain behind authentication and target ownership.
- `workspace.test.tsx`: combined both sets of imports, mocks, setup, and assertions. Retained
  switch-list/authentication ordering coverage and summary retrieval, refresh, empty/error, and
  selected-target coverage. Denied/anonymous requests must invoke neither summary nor list reads.

## Integration adjustments

- The new review summary card identifies the active target and Google Maps explicitly, using the
  same verified workspace target as the ingestion card and Q&A. Tests assert its name changes
  along with the persisted metrics when the selected target changes.
- The browser fixture supports the merged `get_review_summary` RPC with authenticated ownership
  checks. Its count/average match the existing fixture review rows; newly created targets remain
  empty. No real provider or hosted database is used by this fixture.
- Workspace browser assertions account for the additional status badge in the summary card.
  Switcher coverage checks summary identity before/after selection and browser Back.
- Main's S2-019 account-scoped state, Activity cleanup, request cancellation, and late-response
  protection were retained without modification.

The inherited S2-006 database migration is required in environments that have not yet applied it;
see [its deployment note](s2-006-review-summary.md). This work does not deploy that migration.

## Validation

- Full Jest coverage run: 87 suites, 1,556 tests passed, including summary authorization and
  persistence, cross-user AI context security, and stale-response regressions.
- Full production auth/workspace browser suite: 33/33 passed. The suite covers target selection,
  summary context, refresh/history, late Q&A responses, account transitions, and mobile layout.
- Changed-code coverage gate: 100%.
- Lint, formatting, typecheck, migration filename/version validation, and production build passed.
- No unmerged Git index entries or conflict markers remain in application/test code. Diff
  whitespace checks pass for feature code, tests, and docs. Inherited AI transcript quotations
  of conflict markers and original whitespace were preserved as historical records.
- Inspected the regenerated 375px screenshot: summary metrics and active target fit the viewport.
- Live database tests were not run locally; PostgreSQL client tools are unavailable. The merged
  SQL/RLS tests remain part of hosted CI. No migrations or deployments were executed here.

The merge is finalized locally; pushing remains explicitly prohibited by the task instructions.

Transcript: [melissa / Codex integration](../ai-transcripts/2026-11-15_melissa_S2-017_main-integration_codex.md).
