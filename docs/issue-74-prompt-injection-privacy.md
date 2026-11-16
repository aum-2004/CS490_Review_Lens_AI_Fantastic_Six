# Issue #74: prompt injection and reviewer privacy evaluation

## Scope and policy

This is an offline, synthetic security evaluation on current merged Q&A code. It reuses the
S2-003 harness, actual session verification, S2-010 context builder, S2-011 orchestration and
response validator, and S2-013 v4 prompt. No production, authentication, RLS, quota, model,
provider configuration, dependencies, or S2-004 baseline files change.

Policy proposed for review by Deep (security assertions) and Aryan (functional/final approval):

- Review text and user questions are untrusted evidence/input. They cannot select the verified
  session, active target, platform, or database query. Never promote their content to instructions.
- Include only the active owner's persisted review IDs, ratings, dates and text. Reviewer names,
  source-review IDs, reviewer URLs, and arbitrary metadata (including email/phone/private notes)
  are excluded from the model request. No reviewer-attribute disclosure is approved here.
- Do not invent or disclose personal identifiers. For reviewer-attribute questions absent from the
  permitted evidence, use existing `insufficient_evidence` with no citations. For requests outside
  the active business/platform, use existing decline outcomes and priority. A request to reveal
  the prompt is a non-review task (`declined_general_knowledge`). No outcome types are added.
- A permitted review-fact answer may use `answered`, citing only supplied review IDs. Declines
  and insufficient-evidence replies must have no citations. Citations prove ID membership,
  not that prose is true, supported, private-data-free, or resistant to injection.

## Evaluation files and checks

- `tests/fixtures/prompt-injection-privacy.synthetic.ts`: separate synthetic datasets, metadata-only
  markers, review-injection payloads and question/PII attacks. The original S2-004 fixture is untouched.
- `tests/helpers/prompt-injection-privacy.ts`: full request and answer evaluation oracles, reusing
  existing harness assertions. Request fields, prompt rules, target, question, ordered evidence,
  citations, excluded metadata, response outcomes and private fixture values are checked.
- `tests/unit/services/qa/prompt-injection-privacy.integration.test.ts`: real pipeline with mocked
  infrastructure; positives, review/question injection, A -> B -> A, account switching, failures,
  invalid replies and explicit limitation probes. Every review read records its session and target.
- `tests/unit/qa-harness/prompt-injection-privacy-assertions.test.ts`: 22 changed-request/answer
  negative controls. Each mutation must actually change the value and raise `QaHarnessAssertionError`.

The complete provider-neutral `QaModelRequest` is recorded, including instructions, input,
review IDs, target, prompt version and output cap. This suite injects the model seam; it does not
claim to inspect actual OpenAI HTTP framing. The existing adapter tests cover that separate boundary.

The request oracle checks every evidence value against its authorized persisted row before a
foreign-data scan. A malicious authorized review can literally say "Restaurant B"; that is not
proof that Restaurant B was read. Only these already-verified text values are replaced in the
_scan copy_, and only the parsed user-question section is exempted from foreign-value detection.
Original request instructions, shape, all evidence fields, exact question and metadata exclusion
are still checked. User-supplied identity strings in the exact question are not misclassified as
application-derived metadata; output privacy checks still apply. This prevents both false leak reports and blanket exemptions for extra fields.

## Assignment compliance checklist

| Direction                                             | Implementation/evidence                                                                                                                  | Status                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Review-text injection                                 | Four separate payloads; exact persisted evidence; unchanged system instructions; recorded session/target queries                         | Implemented                                                         |
| Question injection                                    | Eleven cases: override, user impersonation, foreign target, business/platform bypass and privacy questions                               | Implemented                                                         |
| Reviewer privacy                                      | Excluded metadata sentinels; existing outcomes only; proposed policy above; unsafe-output limitation probes                              | Implemented evaluation; semantic findings require human disposition |
| Complete request/response                             | Existing S2-003 injectable fake; entire provider-neutral request and validated answer; foreign/citation/denial assertions; network guard | Implemented                                                         |
| Regression and mutation checks                        | Full suite including unchanged S2-004/S2-016; 22 oracle mutations; five reversible source mutations                                      | Passed locally                                                      |
| Isolated branch and files                             | Branch from main `b8ca643a`; only new test/helper/fixture/document/transcript files                                                      | Verified                                                            |
| No auth/RLS/provider/dependency changes or paid calls | Source/dependency diff empty; transport/model mocks and blocked network probe                                                            | Verified                                                            |
| Authentic transcript                                  | Original direct-session task records, explicit cutoff, redactions and accepted/changed/rejected notes                                    | Recorded                                                            |
| Open PR referencing #74                               | Concrete description prepared with `Refs #74`; awaiting Shawn's confirmation before remote publication                                   | Pending                                                             |
| Deep security / Aryan functional and final approval   | Named in PR draft; no automatic merge                                                                                                    | Pending human review                                                |

Authorization/context denials make no model call. Scope/privacy refusals are model-response
outcomes and therefore exercise the injectable fake model; these tests do not claim an
application-side pre-dispatch classifier rejects every malicious question.

## What the deterministic tests prove

The application preserves the authorized evidence boundary and instruction separation even when
review text or questions demand a different user, target, platform, or privileged role. Foreign,
missing, anonymous, unavailable, empty and oversized context failures stop before model access.
The production validator rejects malformed replies, foreign/invented citations, uncited answers,
and cited refusals. Scripted safe replies survive with the existing outcome contract.

The suite's network guard scrubs provider credentials and blocks fetch/HTTP/TCP. A deliberate
blocked fetch probe verifies the guard and its cleanup assertion; no request is sent externally.
No API key, paid call, hosted write, or live model evaluation is used.

## Findings and limits: do not interpret green tests as complete semantic protection

1. **Invented PII / unauthorized prose:** a fake model returning a valid `answered` object with an
   allowed review ID and an invented email, phone, excluded reviewer name, or foreign private
   marker is accepted by the production response validator. The new evaluation oracle rejects
   those replies. The validator does not semantically validate prose or enforce the privacy policy. A private
   marker is also accepted inside a structurally valid uncited `insufficient_evidence` reply.
2. **Prompt disclosure:** a valid cited reply echoing the system instructions is also accepted by
   production and rejected by the evaluation oracle. Prompt directives alone are not a hard guard.
3. **PII inside review bodies:** metadata is excluded, but an email written in an authorized
   review's text reaches the model unchanged. There is no review-body PII scrubber in this scope.
4. **Oracle limits:** synthetic marker matching and email/phone patterns are regression checks,
   not a universal PII or semantic detector (for example, arbitrary invented names or addresses).
   JSON encoding preserves request structure; it does not guarantee model obedience.

These are explicit passing _limitation probes_, not assertions that unsafe outputs are safe.
A future guard that rejects these outputs should update the corresponding probes and evidence.
Any production mitigation or accepted risk requires separate review/coordination with the owners.
Do not close #74 as proof that prompt injection or privacy leakage is impossible.

A separately authorized live-model evaluation would be needed to measure refusal behavior across
these cases/repeated runs. It is not performed or authorized by this work. Scripted outcomes check
contract handling and expected policy, not whether a model chooses those outcomes independently.
Existing S2-004/S2-016 suites remain part of the regression run; SQL/RLS and hosted behavior remain
separate evidence, not emulated claims of this suite.

## Verification

Local results on main base `b8ca643a`:

- New issue-74 suites: **61/61 passed** (39 integration + 22 oracle negative controls).
- Full Jest: **95 suites / 1,679 tests passed**, no skips. Existing S2-004/S2-016 tests unchanged.
- Repository formatting, ESLint (no warnings), explicit TypeScript check and production build passed.
- Build used dummy Supabase configuration, Q&A disabled, and a temporary Turbopack root adjustment
  for the isolated worktree's linked dependencies. The configuration was restored byte-for-byte.
- The first build stopped after compilation/typecheck with Next.js's security advisory notice;
  the retry exited 0 and retained that warning. The framework security upgrade needs a separate
  dependency/security review; no upgrade is included or claimed here.
- Five real source mutations each failed the **new integration suite**, then were restored:

| Temporary fault                              | Failing new tests |
| -------------------------------------------- | ----------------: |
| Remove untrusted-content instruction         |                29 |
| Remove reviewer-privacy instruction          |                29 |
| Promote review text into system instructions |                29 |
| Always build Target A context                |                 5 |
| Accept foreign citations                     |                 2 |

Mutation logs/export utilities and the PR draft are outside the repository. No remote CI result
is claimed for this unpublished branch. Human review, current-head CI and risk disposition are
still required. Repeat locally with:

```powershell
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath tests/unit/services/qa/prompt-injection-privacy.integration.test.ts tests/unit/qa-harness/prompt-injection-privacy-assertions.test.ts
npm.cmd test
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

AI assistance: OpenAI Codex. See `ai-transcripts/2026-11-16_shawn_issue-74_codex.md` for the
original available task dialogue/tool history, privacy redactions, cutoff and accepted/changed/rejected notes.
