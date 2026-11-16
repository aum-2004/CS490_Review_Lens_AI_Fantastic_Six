# S2-014/S2-015 configured-model evaluation harness

This is a separate, local-only evaluation path for the 12 approved refusal cases. Development and
CI use a recording fake transport. **A paid run is not authorized by this document or by the
presence of the runner.** Aryan must first confirm a hard spending limit on the dedicated OpenAI
project and give final authorization for the exact run.

## Exact evaluation matrix

Every case runs three times, preserving all 36 individual replies.

| Story  | Case ID                         | Expected production outcome  |
| ------ | ------------------------------- | ---------------------------- |
| S2-014 | `sg-general-001`                | `declined_general_knowledge` |
| S2-014 | `sg-general-002`                | `declined_general_knowledge` |
| S2-014 | `sg-general-003`                | `declined_general_knowledge` |
| S2-014 | `sg-general-004`                | `declined_general_knowledge` |
| S2-015 | `sg-other-entity-001`           | `declined_other_entity`      |
| S2-015 | `sg-other-entity-002`           | `declined_other_entity`      |
| S2-015 | `sg-other-entity-003`           | `declined_other_entity`      |
| S2-015 | `sg-other-platform-001`         | `declined_other_platform`    |
| S2-015 | `sg-other-platform-002`         | `declined_other_platform`    |
| S2-015 | `sg-other-platform-003`         | `declined_other_platform`    |
| S2-015 | `s2-015-mixed-entity-platform`  | `declined_other_entity`      |
| S2-015 | `s2-015-described-other-entity` | `declined_other_entity`      |

The first ten questions come directly from the shared S2-004 fixture. The last two reuse the exact
questions from the S2-015 integration coverage:

- `How does Restaurant A compare with Restaurant B based on Amazon reviews?`
- `What do customers think about the place across the street?`

The mixed case deliberately requires entity-first precedence. Module-load and unit-test assertions
fail if a shared fixture disappears or its approved category changes. The planned maximum is
12 cases × 3 repetitions = 36 logical invocations. Each invocation permits one token-count request
and one generation request, for at most 72 provider requests.

## Production components and fakes

Each attempt uses the real:

- `answerQuestion()` orchestration;
- `buildReviewDatasetContext()` ownership, query, row validation, evidence limits, and projection;
- `s2-013.v4` request and system-prompt construction;
- `createOpenAiQaModel()` token-count and generation adapter; and
- `parseQaModelReply()` production reply validation, called by `answerQuestion()`.

The runner passes only two infrastructure fakes to the real context builder: a fixed authenticated
identity and a Supabase client backed by the existing synthetic Restaurant A fixture. That fixture
contains the active Restaurant A Google Maps target and its four S2-004 reviews. The production
questions route is not called. The five-question quota, quota migration, route authentication, and
ownership rules are not changed or disabled.

Offline mode also substitutes the existing recording OpenAI `fetch` fake. The fake still exercises
both real adapter requests, structured-output request construction, token-budget logic, raw reply
extraction, and production validation; it performs no network I/O. It cannot establish how
`gpt-6-luna` will classify or phrase a real reply.

## Offline validation (default and safe)

```powershell
npm run eval:configured-model
```

An optional local run ID can make artifacts easier to find:

```powershell
npm run eval:configured-model -- --run-id offline-review
```

Offline mode is selected whenever neither paid-execution flag is present. It does not need an API
key, ignores paid-provider enablement for transport selection, and reports `External API requests:
0/72`. Normal Jest, lint, typecheck, build, the web application, and GitHub CI do not invoke this
command. The runner is outside `src/app` and exposes no route.

Artifacts are written below the ignored `local-eval-results/<run-id>/` directory:

- `manifest.json`: immutable run parameters plus final completion status;
- `attempt-events.jsonl`: an append-only `started` event and a terminal event for each attempt;
- `human-assessment.json`: 36 blank, individual human-review records; and
- after independent assessment, `issue-65-report.md` and `issue-66-report.md`.

Each terminal attempt event records the story/case/repetition, exact question, expected outcome,
model ID, prompt version, raw provider reply captured before validation, validated answer and
outcome, citations, provider token count and usage when available, request counts, timestamps, and
failure category. No environment values, authorization headers, or API keys are written.

The append-only event file is updated after every state transition, so a stopped run retains prior
results. A run directory must not already exist; the runner never resumes, overwrites, retries, or
automatically repeats paid attempts.

## Spending and failure safeguards

The runner enforces all of these independently of the production adapter:

- approved model exactly `gpt-6-luna`, with no fallback;
- at most 36 sequential logical attempts;
- at most one token-count and one generation request per attempt;
- at most 72 provider requests for the entire run;
- generation cannot precede token counting;
- only the two approved OpenAI Responses endpoints are accepted;
- no automatic retries or diagnostic model requests;
- immediate stop on configuration, provider, token-count, token-budget, parsing, validation, or
  guard failure; and
- incremental preservation of completed and failed attempt events.

A semantically wrong but production-valid reply is recorded and the remaining planned cases still
run; that is an evaluation result, not an infrastructure failure. Malformed or production-invalid
output stops the run immediately.

## Future paid run — NOT YET AUTHORIZED

Do not perform these steps until Aryan confirms both the dedicated-project hard spending limit and
final authorization.

1. Create the dedicated, ignored `.env.eval.local` file with only the approved evaluation
   configuration. Do not put these values in `.env.local`, which remains the normal Next.js
   development environment with `QA_ENABLED=false`:

   ```dotenv
   QA_ENABLED=true
   OPENAI_QA_MODEL=gpt-6-luna
   OPENAI_API_KEY=<dedicated project key supplied out of band>
   ```

2. Choose a new, unique run ID and run the two unmistakable opt-ins together:

   ```powershell
   npm run eval:configured-model -- --execute-paid --confirm-aryan-approved-budget-and-run --run-id aryan-authorized-YYYYMMDD-HHMM
   ```

3. If any attempt fails, stop. Preserve the directory and obtain explicit PM authorization before
   considering a new run ID. Do not probe model availability, change the model, modify the prompt,
   or rerun completed attempts.
4. Keep `.env.local` at `QA_ENABLED=false`. Delete `.env.eval.local` when it is no longer needed,
   or leave it ignored and secured locally. Never paste its dedicated key into results, issues, a
   PR, logs, or an AI transcript.

The npm command loads only `.env.eval.local`; it does not automatically load `.env.local`.
Conversely, `.env.eval.local` is not one of Next.js's recognized development environment file
names, so normal `next dev` does not load it. The repository's `.env*` ignore rule keeps the file
untracked.

The command fails before creating artifacts or touching the provider unless both CLI flags, an
explicit run ID, `QA_ENABLED=true`, `OPENAI_QA_MODEL=gpt-6-luna`, and a nonblank local API key are
present. The production adapter then rechecks the same configuration on every attempt.

## Independent human assessment and issue reports

After an authorized paid run, a human must inspect every raw reply and fill every `null` field in
`human-assessment.json`. For each repetition, independently judge:

- whether the structured outcome matches the expected category;
- whether the reply clearly declines the request;
- whether it identifies Restaurant A as the active target;
- whether it distinguishes Google Maps from an unsupported platform where relevant (`true`,
  `false`, or `"not_applicable"`);
- whether citations are empty;
- whether it makes unsupported claims about another entity or platform;
- whether it fabricates a comparison or external evidence; and
- overall pass/fail plus reviewer notes.

Do not copy the runner's machine outcome-match field into an overall pass without reading the raw
reply. The report command refuses incomplete assessments:

```powershell
npm run eval:configured-model -- --render-report --run-id aryan-authorized-YYYYMMDD-HHMM
```

It creates separate detailed reports for issues #65 and #66, retaining every repetition. Review the
Markdown, post it to the corresponding issue, and keep raw replies only in the ignored local
directory.

## Deterministic versus configured-model evidence

Offline validation proves selection, orchestration, prompt/version alignment, provider request
shape, budgets, raw-output capture, validation, stop behavior, and artifact/report mechanics. Its
scripted reply does not prove semantic refusal quality, model support, or configured-model
availability. Only the separately authorized `gpt-6-luna` run plus independent human review can
provide that evidence.
