# AI session — S2-013 follow-up: clarify decline definitions

- **Date:** 2026-11-14
- **Author:** Aryan Modi (`aum-2004`)
- **Story:** S2-013 — Define and Apply the ReviewLens System Prompt (follow-up; relates to S2-014)
- **Tool:** Claude Code (Claude Opus 5.5)
- **Branch:** `feature/S2-013-decline-definitions`
- **Pull request:** to be opened (refs #64, #65)

## Transcript scope and redaction

This file preserves the S2-013 follow-up portions of a larger Claude Code session: the S2-014
(PR #75) re-reviews that found the classification conflict, the agreement with Neel on the fix, and
the implementation. Unrelated parts of the session (other PR reviews, Sprint 1 work, demo
preparation) were omitted. Messages are copied verbatim; tool calls and their raw output are not
reproduced. Local filesystem paths and the author's email address are redacted. No credentials,
API keys, or `.env` values appeared in these portions.

## Human review notes

### Accepted

- Neel's proposed distinction: open-ended recommendations or rankings that name no specific
  business are `declined_general_knowledge`; questions about a specific, named business, product,
  or entity other than the target are `declined_other_entity`.
- Rule 6, rule 7, and the two outcome definitions reworded; `SYSTEM_PROMPT_VERSION` bumped from
  `s2-013.v3` to `s2-013.v4`; decline priority unchanged.
- Two new prompt tests and one updated test. All three were checked to fail against the v3 prompt
  and pass against v4.
- Docs updated: outcome table, priority section, and a short section explaining the change.

### Changed or corrected

- Done as a separate PR after S2-011 (#79) merged, because #79 also edited `system-prompt.ts`.
- Built in a separate worktree so uncommitted work on the author's S2-012 branch was untouched.

### Verification

- `npm run format:check`, `npm run lint`, `npm run typecheck`: passed.
- Full Jest: 65 suites, 1,079 tests passed.
- No model or provider calls were made.

## Transcript

### Aryan

NEEL PATEL — 12:27 AM
@Aryan Modi 
Hey Aryan, I've addressed your review findings on S2-014 PR #75.

Latest commit: 32302fb

I updated the evaluator to use the real S2-004 types, added the explicit category-to-outcome mapping, reused Deep's expectDeclined(), retained independent scope-clarity evaluation, added the missing New York restaurants question, and improved safe error diagnostics.

I also added deterministic integration tests using the real S2-010 context builder, S2-013 request construction, and Deep's fake model.

GitHub CI #178 passed, and my full local Jest run passed 933 tests.

Could you re-review the resolved findings and current integration implementation?

I understand your final acceptance requirement for the real S2-011 answerQuestion() pipeline is still pending #79. I'll complete that integration before marking the PR ready to merge.

Thanks!

### Claude

Neel addressed all my points, and the code looks good. Leave another **Comment**, not an approval: it's still a draft and waiting on #79, as Neel says himself. There's one new issue, which his New York question fix created.

**Checked against my earlier notes (latest commit `32302fb2`):**
1. **Uses S2-013's outcome:** fixed. The "declined" check now uses `outcome === "declined_general_knowledge"`.
2. **Category-name mapping:** fixed. `SCOPE_GUARD_CATEGORY_TO_QA_OUTCOME` maps all five categories, and the TypeScript type forces it to stay complete.
3. **Reuse Deep's `expectDeclined()`:** fixed.
4. **New York question:** added as `sg-general-004`, and the fixture tests now expect 16 cases.
5. **Real types and error details:** fixed. It uses the real `ScopeGuardEvaluationCase`, and failures now include a short fixed explanation. Neel chose not to include the raw error text, so nothing sensitive can end up in results, which is reasonable.
6. **Integration test:** new. It sends the four questions through the real S2-010 context builder and the S2-013 request builder, using Deep's fake model and network guard. It checks that the prompt is applied, that the context contains only this target's reviews, and that no reviewer names leak.

**New issue: the New York question conflicts with your S2-013 decline priority.** Your prompt says `declined_other_entity` covers questions "about a different product, business, or entity", and that outcome wins over `declined_general_knowledge` ([system-prompt.ts:34-42](src/services/qa/system-prompt.ts)). "Best restaurants in New York" is about other businesses, so a model following your prompt should reply `declined_other_entity`. S2-014's check requires exactly `declined_general_knowledge`, so a correct refusal would fail and be labeled "question_was_not_declined". Pick one fix:
- Move the question to the other-entity category, which is S2-015's set.
- Accept any decline outcome for this one case.
- Change the S2-013 definitions so general recommendations count as general knowledge. You own that file.

**Smaller notes:**
- **The integration test only proves the plumbing.** The fake model is set to always decline, so the test shows the request is built correctly, not that the real model refuses. It also checks the raw JSON directly instead of running the evaluator. Once #79 merges, Phase 2 should call `answerQuestion()` and pass the result through `evaluateGeneralKnowledgeRefusals` with `assessGeneralKnowledgeQaAnswer`.
- **A wrong decline type gets the wrong label.** If the model declines with another decline outcome, the failure reads "question_was_not_declined", which is misleading. A separate failure such as `wrong_decline_outcome` would make results easier to read.
- **#77 shares the fixture.** Neel's S2-015 PR uses the same question set. After either PR merges, the other should be updated from `main` so the 16-case change is tested together with it.

**Comment to paste** (choose "Comment"):

> Re-reviewed 32302fb2. All earlier findings are resolved: real S2-004 types, one explicit category→outcome mapping, reuse of `expectDeclined()`, the New York case added, and safe fixed diagnostics. The integration test through the real S2-010 context builder and S2-013 request builder with the fake model and network guard is a good addition.
>
> One issue to resolve before final approval:
> - **sg-general-004 conflicts with the S2-013 decline priority.** The prompt defines `declined_other_entity` as questions about "a different product, business, or entity", and it wins over general knowledge. "Best restaurants in New York" is about other businesses, so a correct model reply would be `declined_other_entity`, and this suite would report it as `question_was_not_declined`. Options: move it to the other-entity category, accept any decline outcome for that case, or I adjust the S2-013 definitions. Let's agree on which.
>
> Notes for the final pass after #79:
> - The current integration test proves request wiring (the fake model always declines) and checks raw JSON. Please run the cases through `answerQuestion()` → `evaluateGeneralKnowledgeRefusals` with `assessGeneralKnowledgeQaAnswer`.
> - Consider a separate failure such as `wrong_decline_outcome` so a decline with another decline category isn't reported as "not declined".
> - #77 uses the same fixture. Whichever merges second should be updated from main so the 16-case change is tested with it.

The New York conflict involves your S2-013 definitions, so you and Neel should decide which fix to use before he finishes Phase 2.

### Aryan

NEEL PATEL — 2:13 PM
@Aryan Modi 
Please mention me the Story number so I can easily check it
Hey Aryan, thanks for catching the classification conflict in sg-general-004.

I agree that the current S2-013 definitions make the expected outcome ambiguous.

My preference is to clarify the S2-013 category definitions rather than move the case or accept any decline outcome.

Since issue #65 explicitly includes "What are the best restaurants in New York?" as a general-knowledge example, I think broad, open-ended recommendation questions should use declined_general_knowledge.

Questions about a specifically identified external entity, like Restaurant B, should use declined_other_entity.

We can preserve the existing entity-before-platform-before-general decline priority for questions where multiple categories genuinely apply.

If you're okay with that distinction, could you update the shared S2-013 prompt definitions and relevant tests? I'll keep sg-general-004 under general knowledge and update my S2-014 coverage accordingly.

I also agree with adding wrong_decline_outcome separately from question_was_not_declined, while keeping Deep's expectDeclined() checks.

Once #79 merges, I'll run all four cases through the real answerQuestion() → evaluateGeneralKnowledgeRefusals() pipeline and add the remaining negative tests.

I'll also reconcile PR #77 with main when the shared fixture change merges.

Thanks!

### Claude

Agree with Neel's proposal. Your S2-013 prompt already contradicts itself on exactly this point:
- Rule 6 lists "recommendations for other businesses" as a **general-knowledge** decline.
- The outcome definition sends questions about "a different product, business, or entity" to **other-entity**, and the priority makes other-entity win.

Neel's distinction removes the contradiction. Open-ended recommendations and rankings that don't name a business count as general knowledge. A question about a specific, named business other than the target counts as other-entity. The existing priority order still applies when several categories genuinely match.

**Do it after #79 (S2-011) merges, as a small follow-up PR.**
- **#79 already changes `system-prompt.ts`** and its tests, so editing the same file in parallel would cause conflicts.
- **S2-013 (#76) is already merged**, so this needs its own short PR referencing #64 and #65. Bump `SYSTEM_PROMPT_VERSION` in that PR as well.

Wording for the change:
- **Rule 6:** "…coding, writing tasks, or open-ended recommendations or rankings that do not name a specific business (for example, the best restaurants in a city)."
- **Rule 7:** "Decline questions about a specific, named product, business, or entity other than ${targetName}…"
- **`declined_general_knowledge`:** "the question is not about analyzing these reviews, including open-ended recommendations that name no specific business."
- **`declined_other_entity`:** "the question is about a specific, named product, business, or entity other than ${targetName}."

**Reply to Neel:**

> Hey Neel, agreed on all of it.
>
> **S2-013 (#64):** I'll clarify the definitions so open-ended recommendations or rankings that don't name a specific business (like "best restaurants in New York") are `declined_general_knowledge`, while questions about a specific named business other than the target (like Restaurant B) are `declined_other_entity`. The entity → platform → general priority stays for questions where several genuinely apply. Rule 6 currently lists "recommendations for other businesses" under general knowledge, which contradicts the other-entity definition, so this fixes that too. I'll do it as a small follow-up PR right after **S2-011 (#79)** merges, since #79 also touches `system-prompt.ts`. I'll bump the prompt version and add tests for both cases.
>
> **S2-014 (#65, PR #75):** keep sg-general-004 under general knowledge. 👍 on adding `wrong_decline_outcome` while keeping `expectDeclined()`.
>
> **S2-015 (#66, PR #77):** please also check your other-entity cases still match the "specific named business" wording once the follow-up lands.
>
> I'll tag the story number in my messages from now on.

Neel asked you to include story numbers in messages to him, which the reply covers. Once #79 merges, I can write the S2-013 follow-up for you: the prompt changes, the version bump, and tests for both question types.

### Aryan

NEEL PATEL — 3:54 PM
@Aryan Modi 
Hey Aryan, I've completed the final deterministic integration for S2-014 PR #75.

Latest commit: 2c3c4a1

All four S2-004 general-knowledge cases now run through the real S2-010 context builder, S2-013 request construction, S2-011 answerQuestion(), production response validation, and S2-014 evaluator.

I also added separate failure reporting for wrong_decline_outcome, question_was_not_declined, and invalid_decline_response, while retaining Deep's expectDeclined().

The New York case remains general knowledge as we agreed.

Full local Jest: 1,110 passed, no skips. GitHub CI #184 also passed.

Could you review this final deterministic integration and let me know if anything else needs correcting?

I'll keep the PR Draft until your S2-013 prompt clarification lands, then reconcile with main, rerun tests, and complete the approved configured-model evaluation.

Thanks!

### Claude

Most of that diff is just `main` being merged in. Here's what the PR changes relative to `main`:

### Claude

PR #75 (S2-014) is now complete on the code side. I found nothing that needs correcting. Leave a **Comment** saying it looks good, and approve once Neel marks it ready. He'll push again after your S2-013 change lands, and that push would dismiss an approval made now.

**What I checked (`2c3c4a18`, test files only, 8 changed relative to `main`):**
- **Full real path:** all four general-knowledge cases go through the real S2-010 context, the S2-013 request builder, your S2-011 `answerQuestion()` and its response validation, then the S2-014 evaluator. Only the model and the database responses are faked, and a network guard confirms nothing leaves the test.
- **Failure labels:**
  - A substantive answer or "insufficient evidence" is reported as `question_was_not_declined`.
  - A decline with another decline outcome, such as other-entity or other-platform, is reported as `wrong_decline_outcome`.
  - A malformed model reply is reported as `question_execution_failed`. So is a decline that cites reviews, because your S2-011 validation rejects it with `UNEXPECTED_CITATIONS` first.
  - A valid decline that just says "No." fails the scope-clarity check.
- **Agreed changes:** Deep's `expectDeclined()` is still used, and the New York question stays under general knowledge.
- **CI** passes, and the PR merges cleanly.

**Two minor notes (not blocking):**
- **`invalid_decline_response` can't happen in the real path.** Your S2-011 validation rejects cited declines before the evaluator sees them. It's harmless as a backup check, but the doc shouldn't suggest it gets triggered in practice.
- **The tests label their scope-clarity value as human review.** The value is fixed in the tests rather than judged by anyone, which is fine for a deterministic test. In the real-model run, an actual person or an approved evaluator needs to make that call.

**The next step is yours: the S2-013 follow-up.** Neel is keeping #75 as a draft until your definition change lands. With the current prompt, a real model may reply `declined_other_entity` to the New York question. Also, the "configured-model evaluation" he mentions makes paid OpenAI calls, so as PM you need to approve it explicitly and keep it out of CI.

**Comment to paste** (choose "Comment"):

> **S2-014 (#65):** Re-reviewed 2c3c4a18. This looks good, and I have nothing else to correct. All four cases now run through the real S2-010 context, S2-013 request construction, S2-011 `answerQuestion()` and its validation, then the evaluator, with only the model and DB I/O faked. The failure split (`question_was_not_declined` / `wrong_decline_outcome` / execution failure for malformed or cited declines / scope clarity for a bare "No.") is clear and well tested.
>
> Minor: `invalid_decline_response` can't occur through the production path, since S2-011 rejects cited declines first (as your test shows). Fine as a backup, but worth noting in the doc.
>
> I'll open the **S2-013 (#64)** definition clarification next and tag you. After you reconcile with it, mark this ready and I'll approve. For the configured-model evaluation: since it makes paid OpenAI calls, please run it manually outside CI and send me the results. I'll approve it as PM before it runs.

I can start the S2-013 follow-up now on a new branch from `main`. It would cover the wording for rules 6 and 7 and the two outcome definitions, a `SYSTEM_PROMPT_VERSION` bump, tests for both question types and a transcript. I'll show you the diff before pushing.

### Aryan

013 is not already merged?

### Claude

Yes, the original S2-013 PR (#76) was merged on Nov 13. What's still open is a small new change to the S2-013 prompt, agreed with Neel after the merge:
- **The problem:** the merged prompt contradicts itself. Rule 6 lists "recommendations for other businesses" as general knowledge, but the `declined_other_entity` definition, which wins by priority, covers any "different business". For "What are the best restaurants in New York?", the model could pick either outcome.
- **The fix:** open-ended recommendations that name no specific business count as general knowledge, and questions about a specific, named business count as other-entity. This means a few lines in `system-prompt.ts`, a version bump and tests.

This goes in a new PR on top of `main`, under issue #64 and titled something like "S2-013 follow-up: clarify decline definitions". You don't need to unmerge or reopen #76. Neel is waiting on it before he finalizes S2-014 (#75). Should I draft it?

### Aryan

I can start the S2-013 follow-up now on a new branch from main. It would cover the wording for rules 6 and 7 and the two outcome definitions, a SYSTEM_PROMPT_VERSION bump, tests for both question types and a transcript. I'll show you the diff before pushing.
"YES PLEASE"

### Claude

You're on the S2-012 branch with uncommitted changes. I'll do this in a separate worktree so your checkout isn't touched.

### Claude

The S2-004 other-entity questions on `main` all name a specific business or product (Restaurant B, Coffee Shop C, Product X), so they're unaffected by the new wording. Making the edits now.

### Claude

Now the tests: I'm updating the other-entity assertion and adding cases for both question types.

### Claude

The tests pass. Next I'll confirm they fail against the old v3 prompt, so they're actually checking something.

### Claude

All 3 changed or new tests fail against the old prompt and pass against the new one. Next are the full checks.

### Claude

Everything passes. Now the transcript, following the format of your S1-014 one.

