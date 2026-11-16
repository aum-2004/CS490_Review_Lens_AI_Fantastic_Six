# S2-018: Change Q&A context when the target changes

Refs [#69](https://github.com/aum-2004/CS490_Review_Lens_AI_Fantastic_Six/issues/69).
Owner: Shawn. Completion checkpoint: 2026-11-15.

## Implementation and integration

The final local implementation integrates main at `d59b5099`, including S2-006's
persisted summary and S2-019's account/Activity/request lifecycle protections.
The existing production routes and context builder already provide fresh,
authorized target context; this story verifies that behavior end to end rather
than adding a second context cache or another Q&A implementation. No production
source, migration, dependency or runtime configuration differs from that main.

The earlier partial draft omitted summary assertions because S2-006 was unmerged.
That limitation is resolved here. The preserved old composed checkout remains
untouched; no unmerged production overlays or unused coordinators were copied.

## Requirement matrix

| Requirement                               | Completed deterministic evidence                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New context contains Target B's reviews   | Eight real-route cases exercise ownership, builder, prompt, reply validation and provider adapter over synthetic database/provider HTTP. Both counting and generation bodies are checked across A -> B -> A.                                                                             |
| Target A's reviews are no longer supplied | Distinct review markers, IDs, fresh persisted rows, complete request inspection, distinct sequential questions and prior-question exclusion. Foreign, missing, unavailable, empty and signed-out requests fail without another provider call.                                            |
| Summary information corresponds to B      | Real summary GET route/store/service aggregate checks use distinguishable persisted fixture rows. Nine workspace/form cases include real summary service/card, target-specific count/rating/status/skipped records, A -> B -> A, refresh, empty B, and safe B failure without A metrics. |
| UI clearly identifies B as active         | Actual workspace heading, Q&A target label, review list, summary and question request URL change together. Production-browser navigation covers A -> B -> A, refresh and late responses.                                                                                                 |

Rules: S2-BR-023 and S2-BR-024. S2-019's account and preserved-page regressions are
retained unchanged. An ingestion failure with saved reviews does not disable Q&A;
a genuinely empty dataset does. A failed summary read displays a safe error rather
than stale metrics or a fabricated zero.

## Security boundaries

- Identity comes from the verified session; parent ownership is checked before
  child data and rechecked in the context/summary services.
- Questions contain only the question; browser evidence and owner claims are not
  accepted as persisted context. Every question rebuilds context from saved rows.
- Complete counting/generation requests use only the selected target's evidence;
  previous questions are excluded. No provider conversation/cache is introduced.
- Missing/foreign targets are indistinguishable; context failures prevent model
  calls. Summary denial occurs before the aggregate RPC.
- Private/no-store responses and sanitized errors remain intact.
- The browser fixture now implements the summary RPC with synthetic data and
  session/target checks. It is a test double, not an authentication implementation
  or evidence that hosted RLS or migrations have been verified.

## Verification

- Full Jest with coverage: 88 suites / 1,568 tests passed, zero skips.
- Line/statement coverage: 94.25%; branches 94.04%; functions 93.29%.
- Focused switching/workspace plus S2-019 component tests: 37 passed.
- Final complete production-build Edge auth/workspace/Q&A suite: 33/33 passed.
- Production-build Edge switching/lifecycle subset: 6 passed.
- Workspace browser rerun: 8 passed after scoping ingestion badge assertions
  separately from the newly successful summary card. The earlier broad run found
  two old count assertions, not a production defect; both are retained and fixed.
- Production build, explicit typecheck, ESLint, formatting and migration-version
  validation passed. A temporary uncommitted Turbopack root was needed only for
  this isolated worktree's linked dependencies; original config was restored.
- Deliberate mutations were caught: stale summary metrics (3 tests failed), wrong
  aggregate target (1 failed), and prior question in the next request (1 failed).
  Every mutation was restored byte-for-byte and focused tests passed afterward.
- Changed coverage passed during integration; after committing main as a parent,
  this story has no changed production lines relative to main.

No paid model calls, live ingestion, hosted database changes or .env.local access.
Provider behavior is deterministic: browser replies are intercepted, while real
provider serialization and response validation run separately over fake HTTP.
This proves structural isolation and switching, not semantic truth of AI answers.

## Review, deployment and remaining external steps

Local story requirements are covered against merged main. Before merging #93,
push only with Shawn's confirmation, obtain fresh head CI and normal/independent
security reviews, and record team acceptance. The PR and issue are not changed by
this local completion work.

S2-017 #91 is still a separate draft selector feature. Existing target routes and
navigation satisfy the transitions verified here; its merge is not required to
invent a second selector in S2-018. Its owner must reconcile it with current main;
rerun these tests when that UI integrates. No claim is made that unmerged #91 or
S2-020 #94 has been accepted or tested as part of this head.

Hosted summary/quota migration deployment remains Aryan's documented rollout
handoff, not something exercised by these fake transports. Keep paid Q&A disabled
until the hosted prerequisites and team authorization are confirmed.

## AI assistance

Codex. The complete available story-scoped original direct-session dialogue is
recovered with privacy redactions in
[the recovered transcript](../ai-transcripts/2026-11-15_shawn_S2-018_recovered_codex.md).
It includes original failed approaches, fixes and tool records, with an explicit
snapshot cutoff and scope limitations. Historical Nov 12/14/15 files are retained
for provenance; the summary checkpoints are not substitutes for original dialogue.
