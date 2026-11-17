# PR #100 functionality and security review

Review date: November 17, 2026. Branch: `ui-changes`.

## Scope and authority

Reviewed the UI changes relative to `origin/main` at `730b28d577ff`, the existing
CI corrections, and the adjustments made during this review. Followed the supplied
Product Requirements, Technical Specifications, UX and Interface Guidance, and
Sprint 1/Sprint 2 business rules. Sprint 2 defines the active scope; later-sprint
deployment requirements are not treated as implemented by this UI change.

The review includes the changed components and their authentication, target
ownership, ingestion, summary, and Q&A integration boundaries. It is a code and
local regression review, not an independent penetration test or hosted acceptance.
No database migrations, provider integrations, authentication policy, prompt
version, package versions, or coverage thresholds were changed.

No new critical/high-severity security defect was demonstrated in the reviewed
changes. The functional/accessibility findings below were corrected. This finding
is limited to the inspected boundaries and local tests, not a guarantee that the
entire application or deployed environment is vulnerability-free.

## Findings and corrections

| Priority | Finding                                                                                                                                                                                                       | Correction and regression evidence                                                                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2       | The redesigned context bar rendered a server snapshot of ingestion status while the panel updated locally. Starting collection could leave the header at **Not ingested** while the panel said **Ingesting**. | `WorkspaceIngestionProvider` now shares confirmed live status and pending state between the header and controls. Its instance is keyed by verified account, target, and persisted run. Tests exercise pending, processing, partial completion, failure, account/target changes, and separate workspace instances. |
| P2       | Replacing the question input with a textarea removed the existing Enter-to-submit interaction. The full Q&A browser flow expected Enter to send a question.                                                   | Enter uses the form's existing validated submission path; Shift+Enter inserts a line. IME composition does not submit. Help text is connected to the field. Unit and browser tests verify the behavior without extra model calls.                                                                                 |
| P2       | A valid 120-character target name could force the summary's flex child outside a 375px viewport.                                                                                                              | The summary text has explicit shrink and width constraints. The real creation/workspace browser regression checks the document width after creating a maximum-length target.                                                                                                                                      |
| P2       | Input boundaries had low contrast against their surfaces: approximately 1.28:1 in light mode and 1.51:1 in dark mode.                                                                                         | Dedicated input borders use `#8190a7` and `#66758c`, approximately 3.24:1 against white and 3.37:1 against the dark card. Decorative panel borders retain the reference palette. Browser checks verify the field colors in both themes. This is a targeted contrast check, not a complete WCAG certification.     |
| P3       | The target switcher's generic accessible name omitted the selected name visible on its trigger.                                                                                                               | Its accessible name now includes **Switch target: {name}**. Existing disclosure, Escape, focus-restoration, ownership, and navigation checks remain in place.                                                                                                                                                     |
| P3       | A broad browser heading query became ambiguous when the new collection card also displayed the target as a heading.                                                                                           | Target-list assertions now scope to the target list, preserving their creation and navigation assertions rather than removing them.                                                                                                                                                                               |

The review summary remains a persisted dataset snapshot. Its visible snapshot
caption distinguishes saved count/rating/skipped metrics from current collection
progress. Terminal collection results still refresh the server-derived metrics;
the UI does not calculate a speculative average from a job-status response.

## Requirements traceability

| Requirements                                             | Reviewed behavior and evidence                                                                                                                                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1-BR-001 through S1-BR-006                              | Production authentication still uses Supabase. Pages and APIs verify identity independently of navigation visibility. Browser coverage includes registration confirmation, sign-in, refresh, logout, expired sessions, and anonymous denial.            |
| S1-BR-007 through S1-BR-011, S1-BR-016, S1-BR-018        | Owners come from verified sessions. Target ownership precedes child-data reads. Foreign and missing resources share safe denial. Negative API/browser and service tests cover forged owner arguments and cross-user reads/ingestion/Q&A.                |
| S1-BR-014, S1-BR-015, S1-BR-017                          | Target creation retains server validation, the fixed Google Maps platform, safe source rules, persistence handoff, and refresh behavior. Browser tests create multiple targets and verify a 120-character name on mobile.                               |
| S1-BR-020 through S1-BR-025; S2-BR-001 through S2-BR-007 | Count and rating summaries remain derived from persisted rows. Skipped records are distinct from saved reviews. Complete, partial, failed, unknown, and empty states are exercised. Existing saved reviews remain visible after a failed collection.    |
| S2-BR-008 through S2-BR-021                              | Q&A retains its active target, validation, loading, error, answered, insufficient-evidence, and scope-refusal outcomes. Suggested questions fill the composer without submitting. Existing deterministic scope/prompt tests run in the full unit suite. |
| S2-BR-022 through S2-BR-026                              | Context is rebuilt from authorized persisted reviews. Tests inspect model-bound context and exercise A-to-B-to-A navigation, delayed 200/401 responses, history, logout, account changes, empty datasets, and forged client evidence.                   |
| S2-BR-027 through S2-BR-031                              | Full Jest coverage and the unchanged changed-code gate are required. Browser tests use synthetic fixtures and controlled Q&A replies; they do not replace model-boundary tests or hosted checks.                                                        |
| UX sections 3–11; technical specifications sections 3–8  | Navigation, target context, live status, distinct failures, keyboard controls, labels, responsive layout, theme persistence, and untrusted-text rendering were inspected and tested.                                                                    |

## Security review

### Identity and data isolation

`ProtectedTargetWorkspace` still authenticates before loading target data and
checks ownership before requesting child rows. The new provider receives only
already-authorized presentation data. It is local React state, not a cache or an
authorization mechanism. No owner identifier from this client state authorizes an
API request.

The Q&A route and context builder retain independent identity and ownership
checks. The client sends a question to an encoded target route; it does not supply
review evidence or a trusted owner ID. Pending Q&A is cancelled/cleared across
target and account transitions. Missing review data is rejected before paid model
work. Existing prompt-injection, privacy, cross-user-context, quota, and size-limit
tests are included in the full unit run.

The repository's RLS migrations were inspected for owner predicates and restricted
grants, including the authenticated summary RPC. This is source inspection;
deployment of those policies in hosted Supabase was not verified here.

### Untrusted input and rendering

The theme initializer is a fixed script, with no request or user string
interpolated into executable code. A saved preference is accepted only when it is
exactly `light` or `dark`. The browser regression stores an HTML/event-handler
payload as the preference and verifies that it creates no DOM element or script
effect.

Target names, source display text, review text, and Q&A answers remain rendered
through React text nodes. The browser regression returns HTML/event-handler markup
as a model answer and verifies literal display without execution. Existing target
list/switcher tests verify escaped names and fixed internal switch destinations.
External source links retain opener/referrer protections and supported-source
validation remains at the server boundary.

### Credentials, local preview, and dependencies

No example-login check was introduced into application authentication code. The
sample provider remains under `tests/fixtures`, binds to loopback, and provides
synthetic test identities and data only. `.env.local` is ignored by Git and was
not added to the branch. Production sessions continue to be checked by Supabase;
the local fixture is not evidence of production managed-authentication acceptance.

The application changes persist only the non-sensitive theme preference in
localStorage. They add no token, password, review, answer, or owner storage there.
Public Supabase configuration remains separate from server-only privileged,
review-provider, and model credentials. No authentication, provider, or database
credential was introduced into the changed application source. A limited tracked
source scan for common private-key/API-token patterns found no matches; this is
not an exhaustive historical secret scan.

`npm audit --omit=dev --json` reported **zero known production dependency
advisories** at review time. No dependency was changed. This result does not prove
the absence of application vulnerabilities or assess every development dependency.

## Validation and limits

- Full final Jest coverage run: **98 suites / 1,709 tests passed**.
- Changed-line coverage against `origin/main`: **100% (338/338 lines)**.
- Full authenticated browser suite: **38/38 cases passed**; focused theme,
  field-boundary color, keyboard, and unsafe-content browser checks also passed
  after the final color adjustments.
- Repository-wide formatting, migration filename validation, lint, typecheck,
  production build, and whitespace checks passed.
- Production dependency audit: **zero known advisories**.
- Desktop/mobile screenshots were inspected. The Windows browser-runner teardown
  required stopping its own processes after the cases passed. The local preview
  and synthetic provider were restored on loopback afterward.

These local checks use synthetic data and mocked external model boundaries.
They do not prove a real paid extraction, live model quality, hosted RLS grants,
production HTTP/security headers, deployment health, or the course's live demo
readiness. A real Sprint 2 demonstration still requires the prepared real review
datasets and working services described by the supplied demo requirements.

No PostgreSQL client/container runtime was available for rerunning the SQL suite locally.
No SQL changed; the PR's earlier GitHub database job had passed, but that is not
fresh hosted verification. Fresh CI on the final pushed commit and the team's
independent human/code/security review remain required. This self-review does not
satisfy a separate teammate approval.

User-specific filesystem paths are omitted from this report and redacted in the
[available review-session record](../ai-transcripts/2026-11-17_ui-changes_PR-100_review_codex.md).
That record preserves this continuation's available conversation with explicit
redactions and identifies its tool-export limitations. No commit or push is
performed by this review.
