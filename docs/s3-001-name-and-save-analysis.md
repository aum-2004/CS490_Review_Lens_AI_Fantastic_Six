# S3-001 — Name and Save an Analysis

Issue: #107. Branch: `s3-001`. Author: melissa. AI assistance: OpenAI Codex.

Creating a target saves an analysis with the user-chosen target name. The form now
explains this behavior. The protected application rail lists saved analyses by that
name and opens the existing workspace. Names are independent of source URLs.

## Persistence and ownership

The existing `analysis_targets` row is the saved analysis identity. No duplicate
analysis table, migration, or separate save operation is needed for this story:

| Required value          | Existing persistence                                           |
| ----------------------- | -------------------------------------------------------------- |
| Analysis name           | `analysis_targets.name`, chosen in TargetForm                  |
| Owner                   | `analysis_targets.owner_id`, derived from the verified session |
| Source reference        | `analysis_targets.source_url`                                  |
| AnalysisTarget identity | `analysis_targets.id`                                          |
| Current review dataset  | `reviews.analysis_target_id` references that identity          |

New analyses start with an empty dataset. Ingestion adds persisted reviews to the
same target. Sidebar navigation writes neither the source nor reviews. Existing
targets appear automatically, and names remain subject to the shared client/server
validation: visible nonempty text, no unsafe controls, at most 120 characters.
The name field is independent of the URL field. Post-save rename is S3-002.

Every AppShell caller passes the server-verified user ID. The shell uses the existing
session-scoped Supabase client and owner-filtered list service, with database RLS
as an additional boundary. Only IDs and names reach sidebar navigation. The list
inherits the existing newest-first, 200-target bound; My Targets remains available.
Load failures preserve workspace content and offer a retry without database details.

## Functionality and security review

The pre-PR review reproduced a stale sidebar after saving a second analysis and
using browser Back to revisit the first workspace. API-based creation did not
invalidate Next's client history cache. TargetForm now refreshes the client router
after replacing the route with the saved workspace. A production browser regression
verifies that both saved names remain available after Back. Unit tests verify that
refresh follows successful navigation and does not run for failed or stale saves.

The review traced every protected shell caller to its verified session guard,
checked the owner-filtered repository queries and existing RLS policies, and checked
that source URLs and review associations remain unchanged. Names render as escaped
React text, sidebar links use encoded target IDs, and load failures omit database
details. A browser regression verifies sign-out and Back show sign-in without an
accessible sidebar, then checks both the HTTP response and rendered workspace deny
a different user's target name and review data. The sign-out visibility assertion
accounts for Next's hidden inactive Activity route trees; it does not claim to erase
previously downloaded browser memory.

## Validation

- Unit tests cover verified-owner wiring, minimal sidebar data, active links,
  duplicate names, escaped text, empty lists, and recoverable failures.
- Existing API/repository tests cover authenticated saving, rejected invalid names,
  forged owner arguments, source persistence, and owner-filtered listing.
- Browser tests in `tests/e2e/auth/saved-analyses.spec.ts` cover choosing a name
  unrelated to the URL, trimming, a fresh login, refresh, same workspace identity,
  persisted reviews, cross-user sidebar isolation, a 375px viewport, saving followed
  by Back navigation, sign-out, and unauthorized direct workspace requests.

Local check results are recorded below after execution. No push, remote migration,
deployment, or CI run is performed by this task.

- `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build`: passed.
- Final `npm run coverage:changed`: 109 suites and 2,038 tests passed. This includes
  the existing Q&A orchestration, scope-guard, and cross-user regression tests.
- Production browser regression: 15 passed across `analysis-targets.spec.ts`,
  `saved-analyses.spec.ts`, and `switch-target.spec.ts`.
- Desktop and mobile screenshots were rendered and visually inspected. The browser
  suite also verifies a 120-character name at mobile width without page overflow.
- Changed-code coverage after the review fix: 100% (93/93 changed lines), including all six modified
  application files; the required 80% threshold is preserved.

The initial full unit run found one stale help-text expectation (2,037 other tests
passed). The expectation was updated. Browser regression also exposed stale success
copy assertions and a retry selector that needed scoping after adding the sidebar.
These test assertions now match the documented UI; no unrelated application behavior
was changed. The production browser run required building with the same local fixture
configuration as its server. Test server processes were stopped after their completed
assertions to release Windows teardown waits.

Transcript: [melissa / Codex](../ai-transcripts/2026-11-25_melissa_S3-001_codex.md).
Review continuation: [melissa / Codex review](../ai-transcripts/2026-11-25_melissa_S3-001_review_codex.md).
