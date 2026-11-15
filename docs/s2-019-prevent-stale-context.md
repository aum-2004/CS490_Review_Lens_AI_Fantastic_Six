# S2-019: Prevent stale review context

Issue: [#70](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/70).
Author: Shawn. Initial verification: 2026-11-15 on main 2a9e54b6.
The follow-up below verifies integration with merged S2-016 on main 98ea93b8.

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

## Initial implementation verification (main 2a9e54b6)

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

AI assistance: [recovered complete available story dialogue](../ai-transcripts/2026-11-15_shawn_S2-019_codex.md).

## Integrated acceptance checkpoint after S2-016 merged

Normally merged current main 98ea93b8 (S2-016 #73) with no conflicts. The merged
security oracle includes the reviewed source-ID, metadata-only and escaped
reviewer-name/URL assertions. No production-code adjustment was necessary.

- Full integrated Jest with coverage: 83 suites / 1,517 tests passed, zero skips.
- Changed-code gate: 32/32 lines and 7/7 branch outcomes; overall line coverage 94.11%.
- Combined focused matrix: 130 tests passed, including stale-context adapter
  tests, S2-016 route/answer tests, shared assertions, Q&A production-route
  integration and the client lifecycle suite.
- All 31 production-build Edge auth/workspace browser scenarios passed.
- Production build, explicit TypeScript, ESLint and formatting passed.
- PR diff remains the original eight S2-019 files; merging main does not add
  another story's production implementation to this PR.
- 006 and 017 are not implementation dependencies for this story. Their later
  workspace reconciliation must preserve the verified user reset key.

No additional implementation defect was identified in this integration check.
Implementation and deterministic local acceptance are complete. Remaining merge
gates are the updated head's GitHub CI, teammate functional review, independent
security-focused review and final team acceptance. PR #92 still had no GitHub
review submissions at the start of this follow-up. Earlier CI #213 passed for
f1b28062; it does not certify the new local merge/update. Keep #70 open until merge
and final acceptance, and do not mark approvals or remote checks complete locally.

## Transcript compliance correction

The original excerpt-and-notes submission did not satisfy section 6. The primary
retained VS Code session was subsequently located. The transcript is now a direct,
redacted export of all available user/assistant messages in the explicitly listed
S2-019 story turns, with original tool records preserving failed commands, errors,
corrections and validation. It includes planning, implementation, draft publication,
current-main integration, the authorized push and this compliance correction.

This is a complete story-scoped record through its explicit snapshot cutoff, not
a selection of response excerpts or a claim to export unrelated project stories.
System/developer instructions, hidden reasoning, duplicate event notifications,
internal approval-reviewer logs and binary attachments are excluded. No missing
messages were reconstructed. Exported message counts are checked against the
selected direct-session source records; a reproducible utility and count audit
are retained locally outside the repository. Privacy redactions do not replace
or summarize original dialogue. The previous excerpt file remains in Git history
and an unchanged external checkpoint.

The recovered source corrects the earlier statement that direct-session recovery
was unavailable. No policy exception is claimed or needed for the recovery approach;
the reviewer should verify this revised evidence against section 6. Functional
feedback reported no blocking defect. Independent security review is still required.
