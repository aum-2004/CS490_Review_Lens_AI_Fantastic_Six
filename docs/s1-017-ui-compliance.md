# S1-017 UI/UX compliance follow-up

## Shared component requirement — implementation addressed

The S1-017 UI now composes the shared components named by UI/UX §8.1:

- `AppShell` uses `Navigation` for the existing wordmark, My Targets, New Target and account menu.
- The list page and its error boundary use `PageHeader` for the h1 and description. It also supports breadcrumb navigation and an optional action for other protected pages.
- `TargetList` uses `EmptyState`, with a decorative icon, explanation and a single creation action.
- The data-failure panel and route error boundary use `ErrorState` and its shared `ErrorAlert`. Account-menu errors also use `ErrorAlert`.

The extraction preserves the route destinations, authentication guards, owner-scoped queries, safe error copy and underlying PascalCase primitives. S1-015's separate `Alert` primitive is not imported from its unmerged branch or duplicated; these are shared page/feedback compositions using the existing Card primitive.

## S1-023 integration on the current branch

The user's S1-017 closure note assigns the card-badge integration to S1-023. That
integration is now implemented on the combined S1-018/S1-023 branch: TargetCard
uses the same four-state IngestionStatus component as the workspace. The backend
view explicitly confirms no attempt before the UI shows "Not ingested". Missing,
truncated or unavailable status is shown as unavailable, never as no ingestion.
No standards exception is required for this implementation.

The following records the historical pre-integration deferral proposal.

## Historical ingestion-status requirement — deferral was not approved

UI/UX §§5.5 and 8.1 require the shared `IngestionStatus` badge on target cards. At
the S1-017 checkpoint this requirement was not satisfied. The implementation note
about absent ingestion data was not a reviewed exception and was not approval.

At the inspected main/017 snapshots, there is no persisted `IngestionAttempt` model, owner-scoped status query or shared `IngestionStatus` component. [S1-023](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/23) owns recording and reporting ingestion results. The S1-017 list currently selects only target identity/display fields; neither the absence of a status field nor a failed lookup proves that no ingestion occurred.

**Proposed standards clarification, requiring reviewer/team approval before it applies:**

> When S1-017 lands before persisted ingestion-result integration, target cards may temporarily omit IngestionStatus. Once S1-023 exposes a session/owner-scoped authoritative ingestion-state contract, target listing and workspace integration must render the same shared IngestionStatus component using the four existing states. Render “Not ingested” only when that contract confirms no attempt exists. Missing/unavailable status must never be presented as “Not ingested” or successful ingestion. This exception ends when the agreed status contract is integrated.

This proposal does not introduce an extra status, claim badge compliance, modify the normative UI/UX standards, or implement S1-023 inside S1-017. If the reviewer rejects the deferral, S1-017 must wait for an agreed status contract and integrate the real badge before approval.

**Historical status:** the proposed exception was not approved. It is superseded
by the actual S1-023 integration above, subject to normal teammate/CI review.

## Validation checkpoint

After the shared-component extraction: 349 unit tests in 28 suites, 13 isolated auth/target browser tests, formatting, lint, explicit typecheck and production build passed. These checks do not resolve or approve the proposed ingestion-status exception.
