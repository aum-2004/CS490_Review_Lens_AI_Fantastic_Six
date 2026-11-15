# S2-019: Prevent stale review context

Issue: [#70](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/70).
Author: Shawn. Local verification: 2026-11-15, based on main at 2a9e54b6.

## Behavior and requirements

Every question uses the current route's target ID and newly authenticated persisted
review context. No review evidence, owner claim, previous answer or provider thread
is accepted from the browser. S2-019 adds lifecycle protection to the existing Q&A
form rather than a second context store or parallel request coordinator.

| Requirement                                                        | Implementation and evidence                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-BR-022: only the authenticated user's reviews enter AI context  | The unchanged S2-010 builder re-verifies session and ownership before reading reviews. Real-builder/adapter tests switch accounts, deny the previous account's target and inspect both counting and generation bodies.                         |
| S2-BR-023: target changes change subsequent Q&A datasets           | A -> B -> A tests inspect exact review IDs, text, ratings and dates in each outgoing body. Browser tests submit from each active workspace.                                                                                                    |
| S2-BR-024: previously selected target reviews do not remain active | No cross-request context cache or provider conversation history. Form lifecycle cleanup clears answers, question drafts, errors and pending state. Old successes, failures and authentication errors cannot affect a restored/current request. |
| Explicit transitions rather than isolated targets                  | Tests cover A -> B -> A, account changes, overlapping requests completing in reverse order, hide/restore, browser back/forward, reload and logout while pending.                                                                               |
| Cache boundaries                                                   | No new application context cache, database Q&A history or retrieval index. Requests use no-store; generation uses store:false and omits conversation/previous_response_id. Next Activity is handled explicitly below.                          |

## Client lifecycle

Installed Next 16.4.3 documentation explains that Cache Components preserves hidden
pages with React Activity, including state and DOM. bfcacheId changes on fresh
navigation but is restored on back/forward; it is not a logout or refresh epoch.

ReviewQuestions keys its form by the server-verified user ID, target ID,
navigation identity and review availability. The user ID is a UI reset key, not an
authorization credential; it is never sent as an owner override in the Q&A request.
ProtectedTargetWorkspace supplies it from requirePageUser(), after server identity
verification. Backend checks remain authoritative.

A layout-effect cleanup aborts the old fetch and clears transient form state when
Activity hides the page or the component unmounts. The UI tracks the current
request's pending state separately from react-hook-form's asynchronous submission
state. An old promise's finally block cannot unlock or clear a newer request after
restoration. Success and error handling both check request ownership.

Navigating away deliberately discards Q&A drafts and answers. Returning begins a
fresh question; it does not restore historical answers as current analysis.

## Verification

- Full Jest with coverage: 80 suites / 1,473 tests passed, zero skips.
- Changed-code gate against origin/main: 32/32 changed production lines covered;
  7/7 changed branch outcomes covered. Overall full-suite line coverage: 94.11%.
- Focused component + real pipeline + production-route integration: 70 tests passed.
- Production build, ESLint, explicit TypeScript check and formatting passed.
- Full production-build Edge auth/protected-workspace browser suite: 31/31 passed.
- Browser evidence is in tests/e2e/auth/stale-review-context.spec.ts: real Next
  production build and local fake Supabase, intercepted answer responses, Edge.
  Provider-boundary evidence is separate: real builder, answer service and adapter,
  synthetic model configuration, fake HTTP and network guard. No paid calls.
- Existing production-route integration also runs in the full suite. It checks
  session/ownership failures, context failures, private responses, budget and quota.
- Three restored source-fault challenges were caught: retaining an old answer
  (1 failure), allowing old finally to unlock a new request (3 failures), and
  dropping the user reset key (2 failures). Sources were restored and focused
  tests passed again afterward.

The broader browser run exposed an existing target-creation assertion failure,
reproduced on an unchanged main-equivalent production build. The workspace has two
legitimate Not ingested labels (target details and ingestion panel). The test now
asserts the ingestion panel's status specifically rather than counting the entire
page. No product status behavior was changed for that correction.

## Compatibility and handoff

S2-010's buildReviewDatasetContext(targetId), S2-011 answerQuestion(), the questions
route, response envelope, token counting, durable quota and provider configuration
are unchanged. This story has no migration, dependency or environment change.
Q&A remains off by default. Existing S2-003 fixtures and harness are reused.

A separate, unpublished composition of S2-006 533b78f8 and S2-017 b46f6ecd with
this implementation retained summary, target selector and Q&A. TypeScript and
47 focused tests passed after including each story's updated test fixtures.
This is compatibility evidence, not an approval of those PRs or proof of an
automatic merge. Their shared workspace reconciliation must preserve
userId={user.id} on ReviewQuestions as well as summary and selector functionality.
No other story's production code is included in this delivery branch. S2-018's
older isolated foundation is preserved separately.

## Boundaries and remaining review gates

An already dispatched provider request cannot be recalled by aborting a browser
fetch. Its completion stays scoped to the original request and cannot update the
new workspace. Subsequent questions independently rebuild authorized context.
store:false avoids application conversation storage; it does not assert that a
provider retains no operational data under its own policies.

Tests use fake infrastructure: they do not certify hosted RLS deployment, live
model semantic grounding, provider retention policy or an instantaneous logout
broadcast to an already-visible second browser tab. Every subsequent Q&A request
still re-verifies identity. Same-browser supported logout/login and account prop
changes are covered explicitly.

Before merge: run current-head GitHub CI, obtain normal and independent
security-focused reviews under AI-Assisted-Development section 7, and complete team
acceptance. No remote review, PR edit, push, merge or issue closure was performed
by this local implementation session. Keep #70 open until those gates are met.

AI assistance: [scoped original-message record and verification notes](../ai-transcripts/2026-11-15_shawn_S2-019_codex.md).
