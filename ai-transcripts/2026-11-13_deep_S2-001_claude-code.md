
❯ You are helping me implement story S2-001 — Add Changed-Code Coverage Gate
  for ReviewLens AI (NJIT CS 490 team project, Sprint 2).

  ## Story (authoritative text)
  Outcome: The CI pipeline measures automated test coverage for changed or
  newly added code and rejects a pull request that fails the team's required
  threshold.

  Technical Guidance:
  - The team may select an appropriate coverage tool and threshold for its
  technology stack.
  - The objective is not to maximize a vanity percentage. The objective is to
  prevent significant new behavior from entering the codebase without automated
  verification.
  - The team should document: (1) the selected coverage mechanism, (2) the
  required threshold or policy, (3) which code is excluded and why, if
  exclusions exist, (4) how a developer can run the coverage check locally.
  - A deliberately under-tested change should be capable of causing the gate to
  fail.

  Rules: S2-BR-027 through S2-BR-031 (AI testing):
  - 027: the team must maintain automated tests for the Q&A orchestration
  layer.
  - 028: maintain a representative scope-guard evaluation set (accepted and
  rejected question types).
  - 029: CI tests must not depend on an exact natural-language response from a
  nondeterministic live model.
  - 030: tests verify behavioral properties (accepted/rejected scope, correct
  dataset selection, no cross-user context).
  - 031: live-model testing may supplement but never replace deterministic
  tests.

  Sprint 2 CI/Definition of Done context: every PR already runs lint, build and
  unit tests; Sprint 2 adds required integration tests, a changed-code
  coverage gate "or equivalent mechanism that prevents newly changed code from
  bypassing meaningful automated test coverage", and required AI
  orchestration/scope-guard tests. A PR with any failing required check must
  not be mergeable, and CI output must stay visible to reviewers. A story is
  only done when "changed-code coverage requirements pass" and the PR has a
  short Test Evidence section.

  ## Repo context
  Next.js + React + TypeScript (strict), Jest 30 via next/jest (jest.config.ts,
  testMatch tests/unit/**/*.test.{ts,tsx}, jsdom default, node env via /**
  @jest-environment node */), Playwright e2e, SQL/RLS tests via
  tests/db/run.sh, ESLint 9 + Prettier (100 cols, double quotes). CI:
  .github/workflows/ci.yml runs format:check, lint, typecheck, npm test, build
  with no secrets, Node 24. Branch protection is on. The deterministic Q&A
  harness (S2-003, PR #83) is already on main under tests/helpers/qa-harness
  and tests/fixtures/qa.

  ## Step 0 — Discover (NO code yet)
  1. Run `gh issue list --search "S2-001"` and `gh issue view <n>`; quote any
  extra acceptance criteria. If there are none, the story text above is the
  spec.
  2. Read jest.config.ts, package.json scripts, ci.yml,
  docs/engineering-standards.md, docs/AI-Assisted-Development.md, existing
  coverage config/thresholds, and the PR template (for the Test Evidence
  section).
  3. Run the current suite with coverage (`npx jest --coverage`) and report
  what is measured today, what the baseline coverage is, and which files would
  be excluded by default.
  4. Propose a design for a CHANGED-CODE gate (lines added or modified in the
  PR versus the base branch, not whole-repo percentage). Compare at least: (a)
  a small in-repo Node/TS script combining Jest's lcov/coverage-final.json with
  `git diff -U0 base...HEAD`, (b) diff-cover or a similar tool, (c) a
  third-party service. Recommend one and justify any new dependency. Prefer
  in-repo, no secrets, no external service.
  5. Propose the policy: threshold (and whether it applies to line or branch
  coverage), exclusions with reasons (tests, fixtures, generated files, config,
  type-only files, etc.), and how these edge cases behave: PR with no source
  changes (docs-only), only test changes, deleted and renamed files, new files
  with 0 coverage, files Jest never loads (so they have no coverage entry), and
  code covered only by Playwright or SQL tests.
  6. Propose how it interacts with the existing open PRs and rollout (e.g. a
  modest starting threshold; whether to ship warning-only first). Flag anything
  in ci.yml that needs fetch-depth or base-branch fetching for the diff.
  7. Present the plan: files to create/modify, threshold values, test approach,
  risks. WAIT for my approval before coding.

  ## Requirements (after approval)
  1. Gate script (TypeScript or Node, matching repo conventions): computes
  changed-line coverage, exits nonzero with a clear message listing each
  uncovered changed file and line range and the threshold vs actual, and passes
  cleanly when there are no coverable changes. Deterministic, no network.
  2. Unit tests for the script with negative and edge cases: below threshold
  fails, at threshold passes, no changes passes, excluded files ignored,
  deleted/renamed files, new untested file fails, malformed or missing coverage
  file gives a clear error rather than a silent pass.
  3. A demonstration that a deliberately under-tested change makes the gate
  FAIL (a committed fixture/test of the failure path, plus instructions for a
  throwaway draft PR that I will open to show the failing CI run). Do not leave
  the under-tested change in the real PR.
  4. An npm script to run the check locally (e.g. `npm run coverage:changed`)
  that works against `origin/main` by default.
  5. Wire it into ci.yml for pull_request events with the history needed for
  the diff, using the same Node version and no secrets. Keep CI output readable
  for reviewers. Keep job structure compatible with required-check names in
  branch protection (tell me if a required check name must be added).
  6. Docs (README section or docs/ file): the selected mechanism, the
  threshold/policy, exclusions and why, how to run locally, how to read a
  failure, and how to request an exclusion.
  7. Do not weaken existing tests or lower existing coverage settings. Do not
  edit teammates' files or production code. Any ci.yml change must be flagged
  clearly for the PR description.
  8. Optional, only if you recommend it in the plan: a stricter threshold for
  the Q&A orchestration code (src/services/qa) given S2-BR-027 to S2-BR-031.

  ## Process
  Use branch feature/s2-001-changed-code-coverage-gate (create from origin/main
  if it doesn't exist; verify with git log that it has no stale commits).
  Small logical commits. Before finishing, run format:check, lint, typecheck,
  npm test (with coverage), the new gate locally against origin/main, and
  build, and show the output. Run the gate tests 3 times to check for
  flakiness. Do not push; I will push.

  ## Deliverables
  1. The code, tests and docs above.
  2. A PR description draft: what/why, "Refs #<issue number>" (never "Closes"
  unless I say the story is complete), files changed, the ci.yml change called
  out, how to run locally, a Test Evidence section, and a note that AI was
  used.
  3. The exact steps for me to demonstrate the failing gate on a throwaway
  draft PR.
  4. A heads-up message for the team about the new threshold and which open PRs
  could be affected.
  5. A transcript-friendly summary of the session.

  Start with Step 0 only.
  DO NOT COMMIT OR PUSH

⏺ I'll start with Step 0 discovery only — no code changes.

  Listed 3 directories, ran 4 shell commands (ctrl+o to expand)

⏺ Coverage ran (57 suites, 821 tests pass). Now checking the overall summary and
  how the v8 data treats type-only and never-loaded files.

  Ran 3 shell commands (ctrl+o to expand)

⏺ S2-001 Step 0: discovery and proposed plan

  I haven't written any code, changed any files or committed anything. Coverage
  output went only to the scratchpad.

  1. Issue

  The story is issue #52 "S2-001 - Add Changed-Code Coverage Gate" (open,
  unassigned, label sprint-2). It has no acceptance criteria beyond the story
  text you pasted, so that text is the spec. There is no PR template in the repo
  (no .github/pull_request_template.md), so the PR description will have to
  supply the Test Evidence section.

  Branch status: feature/s2-001-changed-code-coverage-gate has no commits of its
  own. It is 1 commit behind origin/main, missing ed686a2 S2-013: System Prompt
  (#76). A git merge --ff-only origin/main fixes that without creating a
  commit. I need your OK to do it.

  2. Current setup

  - Jest (jest.config.ts) uses the coverageProvider: "v8" provider. It measures
    src/**/*.{ts,tsx} except *.d.ts and src/app/layout.tsx. No thresholds are
    set, coverageReporters is left at the defaults, and /coverage is in
    .gitignore and .prettierignore.
  - package.json already has test:coverage (jest --coverage --runInBand). There
    is no scripts/ directory yet.
  - CI (ci.yml (.github/workflows/ci.yml)) has one job, "Lint, typecheck, test,
    build", and checks out with the default fetch-depth: 1. The diff needs the
    base branch's history, which a depth-1 checkout doesn't have. CI runs npm
    test without coverage and runs on both pull_request and push: main. Note
    that .github/workflows/** is prettier-ignored.
  - Standards: engineering standards §10 says to explain any new dependency, and
    §13 says to link the issue. AI-Assisted Development §3 says the PR must
    disclose AI use and the tool.

  3. Baseline: jest --coverage today

  57 suites and 821 tests pass in about 33s. Jest measures 87 files.

  ┌────────────────────┬─────────────────┬───────┐
  │       Metric       │ Covered / total │   %   │
  ├────────────────────┼─────────────────┼───────┤
  │ Lines / statements │ 5293 / 5749     │ 92.06 │
  ├────────────────────┼─────────────────┼───────┤
  │ Branches           │ 1320 / 1430     │ 92.30 │
  ├────────────────────┼─────────────────┼───────┤
  │ Functions          │ 209 / 229       │ 91.26 │
  └────────────────────┴─────────────────┴───────┘

  How the v8 provider counts lines, which the design depends on:
  - It records one statement per source line. In files that tests load, blank
    lines, comments and type declarations count as covered. That makes line
    numbers easy to match, but inflates the percentage slightly.
  - Files that tests never load still get an entry, at 0%. This happens because
    collectCoverageFrom is set. So a new untested file shows every line as
    uncovered instead of being missing.
  - This also applies to files that contain only types. For example,
    src/types/analysis-target.ts shows 13 uncovered lines because type imports
    are erased at runtime. Without an exclusion, a new type-only file would fail
    the gate unfairly.

  At 0% today (mostly exercised only by Playwright, or thin wrappers):
  - all src/app/analysis-targets/** page/layout/loading/error files
  - src/app/login/{page,loading}.tsx
  - RetryTargetsButton.tsx
  - lib/supabase/{client,ingestion-admin}.ts
  - src/types/analysis-target.ts

  Excluded by default: everything outside src/ (tests, fixtures, helpers,
  configs, scripts), *.d.ts, src/app/layout.tsx, and non-TypeScript files (.css,
  .md, .ico, .sql).

  4. Design options

  Option: (a) In-repo TypeScript script: coverage-final.json plus git diff -U0
  -M
    <merge-base>
  Pros: No new dependency, no network, no secrets; runs the same locally and in
    CI; policy is reviewable in code; unit-testable
  Cons: We maintain about 300 lines
  ────────────────────────────────────────
  Option: (b) diff-cover
  Pros: Mature
  Cons: It's a Python tool, so CI needs a Python install that isn't pinned in
    package-lock. Local runs need pip. Exclusions and the 0%-file rule are
  harder
     to customise. Not on the approved stack.
  ────────────────────────────────────────
  Option: (c) Codecov, Coveralls, etc.
  Pros: Nice PR comments
  Cons: External service, needs a token or app install, and sends repo data to a

    third party. Conflicts with "no secrets / no external service".

  I recommend (a), with no new dependency. Node 24 can run .ts files directly by
  stripping types, so we don't need tsx or ts-node. Its one limitation affects
  how the script imports its own modules:
  - I'd check during implementation that tsc accepts the import paths.
  - The fallback is to keep all the logic in one module that the CLI wrapper
    imports.

  5. Proposed policy

  - What is measured: changed line coverage, meaning lines added or modified in
    the PR, compared with the merge-base of the branch and origin/main.
    - Branch coverage is printed for information only and doesn't gate. v8's
      branch data is too coarse to map reliably onto individual changed lines.
  - Threshold:
    - ≥ 80% of coverable changed lines across the whole PR.
    - Any changed source file with 0% changed-line coverage fails, whatever the
      overall percentage. This catches one untested new module hidden inside a
      large, well-tested PR.
  - Stricter rule for Q&A orchestration (optional, recommended): ≥ 90% for
    src/services/qa/**, supporting S2-BR-027 (the rule that the Q&A
    orchestration layer must have automated tests).
    - I'll measure open PRs #79 and #84 against it before making it final.
  - Exclusions: these live in a typed policy file in the repo, and every entry
    needs a written reason (changing it goes through normal PR review).
    - Automatic: *.d.ts, src/app/layout.tsx (matching the Jest config), and
      files that produce no runtime code. I'd detect the last kind by
      transpiling the file with typescript, which is already a dev dependency,
      and checking for empty output. That handles src/types/* without excluding
      a folder by name.
    - Not excluded by default: Next.js route files such as page/loading/error.
      Code covered only by Playwright or SQL tests needs either a unit test or a
      reviewed exclusion entry. These suites don't produce Jest coverage, and
      merging their coverage is out of scope.
    - /* v8 ignore next */ comments (if this Jest version honours them; I'll
      check) are allowed only with a reason that reviewers can see in the diff.

  Edge cases

  ┌────────────────────────────────────┬────────────────────────────────────┐
  │                Case                │             Behaviour              │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Docs-only PR, or a PR that only    │ Passes with "No coverable changed  │
  │ changes tests                      │ lines"                             │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Deleted file                       │ Ignored, because it has no added   │
  │                                    │ lines                              │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │                                    │ Rename detection is on (-M), so a  │
  │ Renamed file                       │ pure rename adds no lines and only │
  │                                    │  edited lines count                │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ New file with 0% coverage          │ Fails                              │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │                                    │ Still gets an entry at 0% because  │
  │ File Jest never loads              │ of collectCoverageFrom, so it      │
  │                                    │ fails                              │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Changed in-scope file missing from │                                    │
  │  coverage-final.json (for example  │ Hard error, not a silent pass      │
  │ after a partial jest path run)     │                                    │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Coverage file missing or malformed │ Hard error                         │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Base ref not available             │ Hard error: "run git fetch origin  │
  │                                    │ main"                              │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │                                    │ Included in the diff against the   │
  │ Local uncommitted changes          │ merge-base, so the local result    │
  │                                    │ matches what the PR will show      │
  └────────────────────────────────────┴────────────────────────────────────┘

  npm scripts
  - coverage:changed runs full coverage, then the gate, against origin/main by
    default; --base overrides it.
  - coverage:changed:check runs only the gate, reusing an existing coverage
    report. CI uses this one.

  Output: a list of uncovered changed lines per file, shown as ranges, plus
  "threshold X% vs actual Y%". In CI the same table also goes to
  $GITHUB_STEP_SUMMARY so reviewers can read it on the PR.

  6. CI wiring and rollout

  ci.yml changes (to be called out in the PR):
  - Checkout uses fetch-depth: 0 so the merge-base exists. The repo is small, so
    this is cheap.
  - The "Unit tests" step changes from npm test to a coverage run with the json
    and text-summary reporters. The tests are the same, run once, and the log
    doesn't get the 90-line coverage table.
  - A new step, "Changed-code coverage", runs only on pull_request, against
    --base origin/${{ github.base_ref }}.
  - Everything stays in the existing job, so the required check name "Lint,
    typecheck, test, build" doesn't change and branch protection needs no edit.
    A separate job would need a new required check added.

  Rollout: I recommend enforcing it from the start rather than warning first.
  - The baseline is 92%, and the Sprint 2 Definition of Done requires the gate
    to pass.
  - A PR that legitimately can't meet it can use the reviewed exclusion list.

  Open PRs affected: the gate applies to any PR whose CI reruns after this
  merges.

  ┌─────┬────────┬─────────────────────────────────────┐
  │ PR  │ Story  │            Touches src/             │
  ├─────┼────────┼─────────────────────────────────────┤
  │ #85 │ S2-007 │ IngestionPanel.tsx                  │
  ├─────┼────────┼─────────────────────────────────────┤
  │ #84 │ S2-009 │ Q&A route, UI, services/qa/*        │
  ├─────┼────────┼─────────────────────────────────────┤
  │ #80 │ S2-006 │ review-summary service, route, card │
  ├─────┼────────┼─────────────────────────────────────┤
  │ #79 │ S2-011 │ services/qa/*                       │
  ├─────┼────────┼─────────────────────────────────────┤
  │ #78 │ S2-010 │ services/qa/review-context.ts       │
  └─────┴────────┴─────────────────────────────────────┘

  #77, #75 and #73 are tests and docs only, so they're unaffected. Before
  finalising the thresholds, I'd run the gate locally against each PR's branch,
  read-only, and put the numbers in the heads-up message to the team.

  7. Plan

  Files to create
  - scripts/coverage/changed-coverage.ts: pure logic (parse the diff, load and
    check coverage, apply the policy, format the report)
  - scripts/coverage/changed-coverage-policy.ts: thresholds and the reasoned
    exclusions
  - scripts/coverage/check-changed-coverage.ts: the CLI (arguments, git calls,
    exit code, step summary)
  - tests/unit/scripts/coverage/changed-coverage.test.ts, using the node test
    environment
  - tests/fixtures/changed-coverage/*: synthetic diff and coverage fixtures,
    including the deliberately under-tested change that must fail
  - docs/changed-code-coverage.md: mechanism, policy, exclusions, local run, how
    to read a failure, how to request an exclusion

  Files to modify
  - package.json: two scripts only, no dependencies
  - .github/workflows/ci.yml: as described in section 6
  - README.md: a short link to the new doc
  - jest.config.ts: add scripts/**/*.ts to collectCoverageFrom, so the gate's
    own code goes through the gate. This only adds coverage and lowers nothing.

  Tests:
  - Below the threshold fails; exactly at it passes.
  - No changes passes; docs-only and test-only changes pass.
  - Excluded and type-only files are ignored.
  - Deleted files are ignored; renamed files count only their edited lines.
  - A new untested file fails; the 0%-file rule fails even when the overall
    percentage is high.
  - The Q&A threshold applies.
  - Missing or malformed coverage, a missing file entry and a bad base ref each
    give a clear error.
  - The line ranges in the report are formatted correctly.
  - I'll run the suite 3 times to check for flakiness.

  Risks
  - v8 counts comment and blank lines in loaded files as covered, which inflates
    the percentage slightly. I'll document it.
  - In CI the PR is checked out as a merge commit, so the diff has to be
    computed against the merge-base. I'll test this.
  - Node's type stripping limits which TypeScript syntax the script can use (no
    enums, import type only).
  - next/jest compiles TypeScript with SWC for tests while Node strips types at
    runtime, so I'll check both paths.

  Process: your message says not to commit, which overrides "small logical
  commits" in the pasted brief. I'll leave everything uncommitted and give you a
  suggested commit split.

  Decisions I need from you

  1. OK to fast-forward the branch to origin/main? This creates no commit.
  2. Threshold 80% changed lines overall plus the 0%-file rule, and 90% for
     src/services/qa/** pending the PR #79/#84 measurements?
  3. Put the gate step in the existing job, so no branch-protection change is
     needed?
  4. Add scripts/** to collectCoverageFrom so the gate checks its own code?

❯ Approved with changes:
  1. Branch is already fast-forwarded to origin/main (ed686a2, verified). Skip
  that step.
  2. Thresholds: 80% changed lines overall + the 0%-file rule. The 90% rule for
  src/services/qa/** applies only if #78, #79 and #84 all pass it in your
  read-only measurement; otherwise use 80% there for now. Report the numbers
  per PR (#78, #79, #80, #84, #85).
  3. Gate step goes in the existing job; required check name unchanged.
  4. Add scripts/** to collectCoverageFrom; keep the CLI wrapper thin and put
  logic in the tested module.
  - Commits are fine (small, logical). Just don't push.
  - If the measurement shows PRs failing only on thin Next.js wrapper files
  (page/loading/error covered by Playwright), propose narrow reasoned
  exclusions instead of lowering the threshold. Never exclude files with real
  logic. Show me the proposed exclusion list before applying.
  - Verify the script runs under Node 23.10 (local) and 24 (CI semantics).
  - Keep the deliberately under-tested failure fixture under tests/fixtures,
  never under src.
    Proceed with implementation.
    DO NOT PUSH OR COMMIT OR CHANGE OTHER TEAMMATES CODE

  Ran 1 shell command (ctrl+o to expand)

⏺ The branch is at ed686a2, and since you asked for no commits, I'm leaving all
  changes uncommitted and will suggest a commit split at the end. Next I'm
  checking a few conventions before writing the gate module. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ Node 24.22.2 is installed under nvm, so I can test the script on both Node
  23.10 and Node 24. Next I'm writing the main gate module.

⏺ Write(scripts/coverage/changed-coverage.ts)
  ⎿  Wrote 820 lines to scripts/coverage/changed-coverage.ts
       1 // S2-001: changed-code coverage gate.
       2 //
       3 // Combines Jest's Istanbul-format coverage (coverage/coverage-f
         inal.json) with
       4 // `git diff` against the merge-base of a base ref, and fails wh
         en the lines a
       5 // change adds or modifies are not exercised by the automated te
         st suite.
       6 //
       7 // All logic lives here so Jest can test it. check-changed-cover
     … +814 lines (~28 KB) (ctrl+o to expand)

⏺ Update(scripts/coverage/changed-coverage.ts)
  ⎿  Added 2 lines, removed 1 line
      335        });
      336      }
      337  
      338 -    const candidates = rootDirs.map((root) => toRepoPath(root,
          - value.path ?? key));                                         
      338 +    const coveredFile = typeof value.path === "string" ? value
          +.path : key;                                                  
      339 +    const candidates = rootDirs.map((root) => toRepoPath(root,
          + coveredFile));                                               
      340      const repoPath = candidates.find((candidate) => !candidate
           .startsWith("..")) ?? candidates[0];
      341      coverage.set(repoPath, { lines, branches });
      342    }

⏺ Write(scripts/coverage/changed-coverage-policy.ts)
  ⎿  Wrote 29 lines to scripts/coverage/changed-coverage-policy.ts
       1 // S2-001 changed-code coverage policy. Changes to this file are
          policy changes:
       2 // they need a reason in the PR and teammate approval. See docs/
         changed-code-coverage.md.
       3
       4 import type { ChangedCoveragePolicy } from "./changed-coverage";
       5
       6 export const changedCoveragePolicy: ChangedCoveragePolicy = {
       7   minimumLinePercent: 80,
       8   failFilesWithNoCoveredChangedLines: true,
     … +21 lines (ctrl+o to expand)

⏺ Write(scripts/coverage/check-changed-coverage.ts)
  ⎿  Wrote 20 lines to scripts/coverage/check-changed-coverage.ts
       1 // Entry point for `npm run coverage:changed:check`. Only wires
         process I/O; all
       2 // behavior lives in ./changed-coverage.ts (unit-tested). Node r
         uns this file
       3 // directly with built-in type stripping, so sibling modules are
          loaded by URL.
       4
       5 import type * as ChangedCoverage from "./changed-coverage";
       6 import type * as Policy from "./changed-coverage-policy";
       7
     … +13 lines (ctrl+o to expand)

⏺ Now a smoke run of the CLI under Node 23.10 and 24 against the coverage report
  I generated earlier, plus a typecheck.

  Ran 1 shell command (ctrl+o to expand)

⏺ The script runs on both Node versions; the "no entry in the coverage report"
  exit is expected, since that report predates the new scripts. I'm fixing an
  ES2017-incompatible regex flag and silencing Node's typeless-module warning in
  the npm script next. · summary

⏺ Update(scripts/coverage/changed-coverage.ts)
  ⎿  Added 3 lines, removed 1 line
      748    };
      749    for (let index = 0; index < argv.length; index += 1) {
      750      const arg = argv[index];
      751 -    const [flag, inlineValue] = arg.includes("=") ? arg.split(
          -/=(.*)/s, 2) : [arg, undefined];                              
      751 +    const equals = arg.indexOf("=");                          
      752 +    const flag = equals === -1 ? arg : arg.slice(0, equals);  
      753 +    const inlineValue = equals === -1 ? undefined : arg.slice(
          +equals + 1);                                                  
      754      const takeValue = () => {
      755        const value = inlineValue ?? argv[(index += 1)];
      756        if (value === undefined || value === "") {

  Read 1 file (ctrl+o to expand)

⏺ Update(package.json)
  ⎿  Added 2 lines
      16      "test": "jest --runInBand",
      17      "test:watch": "jest --watch",
      18      "test:coverage": "jest --coverage --runInBand",
      19 +    "coverage:changed": "jest --coverage --runInBand --coverage
         +Reporters=json --coverageReporters=text-summary && npm run cove
         +rage:changed:check --",                                        
      20 +    "coverage:changed:check": "node --disable-warning=Experimen
         +talWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scrip
         +ts/coverage/check-changed-coverage.ts",                        
      21      "test:qa": "jest --runInBand tests/unit/qa-harness",
      22      "test:e2e": "playwright test",
      23      "test:e2e:auth": "playwright test --config=playwright.auth.
          config.ts",

⏺ Update(jest.config.ts)
  ⎿  Added 6 lines, removed 1 line
       7  
       8  const config: Config = {
       9    clearMocks: true,
      10 -  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts", 
         -"!src/app/layout.tsx"],                                        
      10 +  collectCoverageFrom: [                                       
      11 +    "src/**/*.{ts,tsx}",                                       
      12 +    "scripts/**/*.ts",                                         
      13 +    "!src/**/*.d.ts",                                          
      14 +    "!src/app/layout.tsx",                                     
      15 +  ],                                                           
      16    coverageProvider: "v8",
      17    moduleNameMapper: {
      18      "^@/(.*)$": "<rootDir>/src/$1",

⏺ Next: the deliberately under-tested fixture (kept under tests/fixtures, as you
  asked) and the gate's test suite.

  Ran 1 shell command (ctrl+o to expand)

⏺ Write(tests/fixtures/changed-coverage/under-tested-change/rating-label.ts)
  ⎿  Wrote 19 lines to
     tests/fixtures/changed-coverage/under-tested-change/rating-label.ts
       1 // S2-001 failure-path fixture: a deliberately under-tested chan
         ge.
       2 //
       3 // The gate tests copy this file into a throwaway git repository
          as a new
       4 // `src/lib/rating-label.ts` and pair it with coverage-final.jso
         n, in which only
       5 // the "positive" path ran. The gate must reject that change. Th
         is file is never
       6 // part of the application and lives under tests/fixtures on pur
     … +14 lines (ctrl+o to expand)

⏺ Bash(node -e '
      const fs=require("fs");…)
  ⎿  Created tests/fixtures/changed-coverage/under-tested-change/coverage-f
     inal.json (+310 -0)
        1 +{                                                             
        2 +  "src/lib/rating-label.ts": {                                
        3 +    "path": "src/lib/rating-label.ts",                        
        4 +    "all": false,                                             
        5 +    "statementMap": {                                         
        6 +      "0": {                                                  
        7 +        "start": {                                            
        8 +          "line": 1,                                          
        9 +          "column": 0                                         
       10 +        },                                                    
       11 +        "end": {                                              
       12 +          "line": 1,                                          
       13 +          "column": 67                                        
       14 +        }                                                     
       15 +      },                                                      
       16 +      "1": {                                                  
       17 +        "start": {                                            
       18 +          "line": 2,                                          
       19 +          "column": 0                                         
       20 +        },                                                    
       21 +        "end": {                                              
       22 +          "line": 2,                                          
       23 +          "column": 2                                         
       24 +        }                                                     
       25 +      },                                                      
       26 +      "2": {                                                  
       27 +        "start": {                                            
       28 +          "line": 3,                                          
       29 +          "column": 0                                         
       30 +        },                                                    
       31 +        "end": {                                              
       32 +          "line": 3,                                          
       33 +          "column": 73                                        
       34 +        }                                                     
       35 +      },                                                      
       36 +      "3": {                                                  
       37 +        "start": {                                            
       38 +          "line": 4,                                          
       39 +          "column": 0                                         
       40 +        },                                                    
     … 270 more lines (ctrl+o to expand)
  ⎿  (files that changed while this command ran, by the command or by
     another process; a convenience view, not a review or audit of the
     command)

⏺ Write(tests/unit/scripts/coverage/changed-coverage.test.ts)
  ⎿  Wrote 821 lines to
     tests/unit/scripts/coverage/changed-coverage.test.ts
       1 /** @jest-environment node */
       2
       3 import { execFileSync, spawnSync } from "node:child_process";
       4 import fs from "node:fs";
       5 import os from "node:os";
       6 import path from "node:path";
       7
       8 import {
       9   ChangedCoverageError,
      10   collectChangedLines,
     … +811 lines (ctrl+o to expand)

⏺ Update(tests/unit/scripts/coverage/changed-coverage.test.ts)  ⎿  Added 1 line, removed 7 lines
      716  
      717      it("exits 1 for the deliberately under-tested fixture chan
           ge", () => {
      718        write("src/lib/rating-label.ts", fs.readFileSync(path.jo
           in(FIXTURE_DIR, "rating-label.ts"), "utf8"));
      719 -      const fixtureCoverage = JSON.parse(                     
      720 -        fs.readFileSync(path.join(FIXTURE_DIR, "coverage-final
          -.json"), "utf8"),                                             
      721 -      );                                                      
      719        write(
      720          "coverage/coverage-final.json",
      724 -        JSON.stringify({                                      
      725 -          ...fixtureCoverage,                                 
      726 -          [path.join(repo, "src/kept.ts")]: { statementMap: {}
          -, s: {} },                                                    
      727 -        }),                                                   
      721 +        fs.readFileSync(path.join(FIXTURE_DIR, "coverage-final
          +.json"), "utf8"),                                             
      722        );
      723        const { output, io } = capture();
      724  

⏺ Bash(npx prettier --write scripts tests/unit/scripts
      tests/fixtures/changed-coverage package.json jest.config.ts >/dev/null &&
      npx jest --runInBand tests/unit/script…)
  ⎿  Updated tests/fixtures/changed-coverage/under-tested-change/coverage-f
     inal.json (+2 -6)
      270        }
      271      },
      272      "b": {
      273 -      "0": [                                                  
      274 -        1                                                     
      275 -      ],                                                      
      276 -      "1": [                                                  
      277 -        0                                                     
      278 -      ]                                                       
      273 +      "0": [1],                                               
      274 +      "1": [0]                                                
      275      },
      276      "fnMap": {
      277        "0": {

⏺ Two tests are failing: the regex test had a wrong word-order assumption, which
  is a bug in the test itself, and the git-repo test fails because the "new"
  file matches the deleted one, so git counts it as a move with no added lines.
  I'll give that test file distinct content and document the rename behaviour.
  · summary

⏺ Bash(f=tests/unit/scripts/coverage/changed-coverage.test.ts && perl -0pi -e
      's#/src\\/never-collected\.ts\.\*no entry in the coverage report/#/no
      entry in the covera…)
  ⎿  Updated tests/unit/scripts/coverage/changed-coverage.test.ts (+3 -3)
      483          new Map([["src/never-collected.ts", [1]]]),
      484          new Map([["src/a.ts", lineCoverage(1, [1])]]),
      485        ),
      486 -    ).toThrow(/src\/never-collected.ts.*no entry in the covera
          -ge report/);                                                  
      486 +    ).toThrow(/no entry in the coverage report: src\/never-col
          +lected.ts/);                                                  
      487    });
      488  
      489    it("reports changed branch outcomes for information only", (
           ) => {
     ...
      637      write("src/kept.ts", lines(5).replace("v2 = 2", "v2 = 22")
           );
      638      git("mv", "src/renamed-before.ts", "src/renamed-after.ts")
           ;
      639      git("rm", "--quiet", "src/deleted.ts");
      640 -    write("src/committed-new.ts", lines(2));                  
      640 +    write("src/committed-new.ts", lines(2, "export const n"));
      641      git("add", ".");
      642      git("commit", "--quiet", "--no-gpg-sign", "-m", "feature w
           ork");
      643 -    write("src/committed-new.ts", lines(3));                  
      643 +    write("src/committed-new.ts", lines(3, "export const n"));
      644      write("src/untracked.ts", lines(4));
      645      write("docs/notes.md", "# notes\n");
      646  

⏺ All 67 tests pass. A Node warning leaked into the output, though, so I'm
  checking where it comes from.

  Ran 2 shell commands (ctrl+o to expand)

⏺ The Jest warning on Node 23 was already there before my changes. I'm adding a
  test for the move-as-rename case, then running the full coverage suite and
  gate. · summary

⏺ Update(tests/unit/scripts/coverage/changed-coverage.test.ts)
  ⎿  Added 13 lines
      659      });
      660    });
      661  
      662 +  it("treats a moved file as a rename and counts only the line
          +s edited after the move", () => {                             
      663 +    git("mv", "src/renamed-before.ts", "src/lib/moved.ts");   
      664 +    write("src/lib/moved.ts", lines(8, "export const r").repla
          +ce("r7 = 7", "r7 = 77"));                                     
      665 +                                                              
      666 +    const { changedLines } = collectChangedLines({            
      667 +      baseRef: "main",                                        
      668 +      git: createGitRunner(repo),                             
      669 +      readFile,                                               
      670 +    });                                                       
      671 +                                                              
      672 +    expect(Object.fromEntries(changedLines)).toEqual({ "src/li
          +b/moved.ts": [8] });                                          
      673 +  });                                                         
      674 +                                                              
      675    it("explains how to fix a missing base ref", () => {
      676      expect(() =>
      677        collectChangedLines({ baseRef: "origin/missing", git: cr
           eateGitRunner(repo), readFile }),

  Ran 1 shell command (ctrl+o to expand)

⏺ git mv needs the destination folder to exist first, so that one is a
  test-setup bug.

⏺ Update(tests/unit/scripts/coverage/changed-coverage.test.ts)
  ⎿  Added 1 line
      660    });
      661  
      662    it("treats a moved file as a rename and counts only the line
           s edited after the move", () => {
      663 +    fs.mkdirSync(path.join(repo, "src/lib"));                 
      664      git("mv", "src/renamed-before.ts", "src/lib/moved.ts");
      665      write("src/lib/moved.ts", lines(8, "export const r").repla
           ce("r7 = 7", "r7 = 77"));
      666  

  Ran 1 shell command (ctrl+o to expand)

⏺ The gate passes on this branch at 95.87% changed-line coverage, but the
  20-line check-changed-coverage.ts entry point shows 0% because Jest can't load
  it, so I'll propose a justified exclusion before applying anything. Next I'm
  measuring the open PRs read-only in temporary worktrees. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ PRs #78 and #79 both pass at 100%. Now #80, #84 and #85.

  Ran 1 shell command (ctrl+o to expand)

⏺ I removed all my worktrees; the four leftover "prunable" ones were from
  earlier sessions and I left them alone. PR #84 changes dependencies, so I'm
  checking whether its 5 failing tests come from running against main's
  node_modules before trusting its numbers. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ Those 5 failures sit in a deepmerge test from PR #84 that my symlinked
  node_modules doesn't include, so src/ coverage is unaffected. All three Q&A
  PRs are at 100%, so I'm raising the stricter Q&A threshold to 90% and then
  wiring up CI. · summary

⏺ Update(scripts/coverage/changed-coverage-policy.ts)
  ⎿  Added 2 lines, removed 2 lines
      20    pathThresholds: [
      21      {
      22        pattern: "src/services/qa/**",
      23 -      minimumLinePercent: 80,                                  
      24 -      reason: "Q&A orchestration layer (S2-BR-027)",           
      23 +      minimumLinePercent: 90,                                  
      24 +      reason: "Q&A orchestration layer must stay verified by de
         +terministic tests (S2-BR-027-031)",                            
      25      },
      26    ],
      27  

⏺ Update(tests/unit/scripts/coverage/changed-coverage.test.ts)
  ⎿  Added 5 lines, removed 1 line
      811      ).toEqual(changedCoveragePolicy.notMeasured.map((rule) => 
           rule.pattern));
      812    });
      813  
      814 -  it("gives every exclusion and path threshold a reason and ke
          -eps the 80% floor", () => {                                   
      814 +  it("gives every exclusion and path threshold a reason and ke
          +eps the agreed thresholds", () => {                           
      815      expect(changedCoveragePolicy.minimumLinePercent).toBe(80);
      816 +    expect(                                                   
      817 +      changedCoveragePolicy.pathThresholds.find((rule) => rule
          +.pattern === "src/services/qa/**")                            
      818 +        ?.minimumLinePercent,                                 
      819 +    ).toBe(90);                                               
      820      expect(changedCoveragePolicy.failFilesWithNoCoveredChanged
           Lines).toBe(true);
      821      for (const rule of [
      822        ...changedCoveragePolicy.exclusions,

  Read 1 file (ctrl+o to expand)

⏺ Update(.github/workflows/ci.yml)
  ⎿  Added 15 lines, removed 2 lines
      22      steps:
      23        - name: Check out code
      24          uses: actions/checkout@v6
      25 +        with:                                                  
      26 +          # S2-001: the changed-code coverage gate diffs agains
         +t the PR base branch,                                          
      27 +          # so it needs history back to the merge-base.        
      28 +          fetch-depth: 0                                       
      29  
      30        - name: Set up Node.js
      31          uses: actions/setup-node@v6
     ...
      45        - name: Type check
      46          run: npm run typecheck
      47  
      44 -      - name: Unit tests                                       
      45 -        run: npm test                                          
      48 +      # Same suite as `npm test`, plus coverage data for the ch
         +anged-code gate.                                               
      49 +      - name: Unit tests (with coverage)                       
      50 +        run: npm run test:coverage -- --coverageReporters=json 
         +--coverageReporters=text-summary                               
      51  
      52        - name: Build
      53          run: npm run build
      54  
      55 +      # S2-001: fail the PR when added or modified lines are no
         +t executed by tests.                                           
      56 +      # Policy: scripts/coverage/changed-coverage-policy.ts; do
         +cs/changed-code-coverage.md.                                   
      57 +      - name: Changed-code coverage                            
      58 +        if: github.event_name == 'pull_request'                
      59 +        env:                                                   
      60 +          CHANGED_COVERAGE_BASE: origin/${{ github.base_ref }} 
      61 +        run: npm run coverage:changed:check                    
      62 +                                                               
      63    database:
      64      name: Database tests
      65      runs-on: ubuntu-24.04

⏺ CI is wired. Next: the docs and a README pointer.

  Read 1 file (ctrl+o to expand)

⏺ Bash(python3 - <<'EOF'
      p="README.md"…)
  ⎿  Updated README.md (+33 -16)
      110  
      111  ## Available scripts
      112  
      113 -| Command                 | What it does                      
          -                                                           |  
      114 -| ----------------------- | ----------------------------------
          ----------------------------------------------------------- |  
      115 -| `npm run dev`           | Starts the development server at <
          -http://localhost:3000>                                     |  
      116 -| `npm run build`         | Creates an optimized production bu
          -ild in `.next/`                                            |  
      117 -| `npm run start`         | Serves the production build (run `
          -npm run build` first)                                      |  
      118 -| `npm run lint`          | Runs ESLint across the project    
          -                                                           |  
      119 -| `npm run format`        | Formats supported project files wi
          -th Prettier                                                |  
      120 -| `npm run format:check`  | Verifies formatting without changi
          -ng files                                                   |  
      121 -| `npm run typecheck`     | Generates Next.js route types, the
          -n runs TypeScript without emitting                         |  
      122 -| `npm run test`          | Runs Jest unit and component tests
          -; no browser is required                                   |  
      123 -| `npm run test:watch`    | Re-runs relevant Jest tests while 
          -files change                                               |  
      124 -| `npm run test:coverage` | Runs Jest and writes an HTML/text 
          -coverage report to `coverage/`                             |  
      125 -| `npm run test:qa`       | Runs only the deterministic Q&A ha
          -rness suites (no network, no OpenAI, no Supabase)          |  
      126 -| `npm run test:e2e`      | Starts the app and runs Playwright
          - tests in headless Chromium                                |  
      127 -| `npm run test:e2e:auth` | Runs authentication browser tests 
          -against an isolated local test provider                    |  
      128 -| `npm run test:db`       | Applies `supabase/migrations/` to 
          -a throwaway local PostgreSQL database and runs `tests/db/` |  
      113 +| Command                          | What it does             
          +                                                              
          +      |                                                       
      114 +| -------------------------------- | -------------------------
          +--------------------------------------------------------------
          +----- |                                                       
      115 +| `npm run dev`                    | Starts the development se
          +rver at <http://localhost:3000>                               
          +      |                                                       
      116 +| `npm run build`                  | Creates an optimized prod
          +uction build in `.next/`                                      
          +      |                                                       
      117 +| `npm run start`                  | Serves the production bui
          +ld (run `npm run build` first)                                
          +      |                                                       
      118 +| `npm run lint`                   | Runs ESLint across the pr
          +oject                                                         
          +      |                                                       
      119 +| `npm run format`                 | Formats supported project
          + files with Prettier                                          
          +      |                                                       
      120 +| `npm run format:check`           | Verifies formatting witho
          +ut changing files                                             
          +      |                                                       
      121 +| `npm run typecheck`              | Generates Next.js route t
          +ypes, then runs TypeScript without emitting                   
          +      |                                                       
      122 +| `npm run test`                   | Runs Jest unit and compon
          +ent tests; no browser is required                             
          +      |                                                       
      123 +| `npm run test:watch`             | Re-runs relevant Jest tes
          +ts while files change                                         
          +      |                                                       
      124 +| `npm run test:coverage`          | Runs Jest and writes an H
          +TML/text coverage report to `coverage/`                       
          +      |                                                       
      125 +| `npm run test:qa`                | Runs only the determinist
          +ic Q&A harness suites (no network, no OpenAI, no Supabase)    
          +      |                                                       
      126 +| `npm run coverage:changed`       | Runs Jest with coverage, 
          +then the S2-001 changed-code coverage gate against `origin/mai
          +n`    |                                                       
      127 +| `npm run coverage:changed:check` | Runs only the gate, reusi
          +ng an existing `coverage/coverage-final.json`                 
          +      |                                                       
      128 +| `npm run test:e2e`               | Starts the app and runs P
          +laywright tests in headless Chromium                          
          +      |                                                       
      129 +| `npm run test:e2e:auth`          | Runs authentication brows
          +er tests against an isolated local test provider              
          +      |                                                       
      130 +| `npm run test:db`                | Applies `supabase/migrati
          +ons/` to a throwaway local PostgreSQL database and runs `tests
          +/db/` |                                                       
      131  
      132  ### Run automated tests
      133  
     … 21 more lines (ctrl+o to expand)

⏺ Write(docs/changed-code-coverage.md)
  ⎿  Wrote 149 lines to docs/changed-code-coverage.md
      1 # Changed-Code Coverage Gate (S2-001)
      2
      3 **Story:** S2-001 (#52) | **Related rules:** S2-BR-027 to S2-BR-0
        31 | **Enforced in:** the required
      4 CI check **Lint, typecheck, test, build**
      5
      6 The gate makes sure significant new behavior cannot enter `main`
        without automated verification.
      7 It measures only the lines a pull request **adds or modifies**, n
        ot the whole-repository
     … +142 lines (ctrl+o to expand)

⏺ Bash(npx prettier --write docs/changed-code-coverage.md scripts
      tests/unit/scripts >/dev/null && npm run format:check 2>&1 | tail -3 &&
      npm run lint 2>&1 | tail -8 &…)
  ⎿  Updated docs/changed-code-coverage.md (+25 -25)
      10  
      11  ## 1. Mechanism
      12  
      13 -| Piece         | What it is                                   
         -                                                 |             
      14 -| ------------- | ---------------------------------------------
         ------------------------------------------------- |             
      15 -| Coverage data | Jest's V8 provider (`coverageProvider: "v8"` 
         -in `jest.config.ts`), written as `coverage/coverage-final.json`
         - |                                                             
      16 -| Changed lines | `git diff --unified=0 --find-renames` from th
         -e merge-base of the base branch and `HEAD`, plus uncommitted an
         -d untracked files |                                            
      13 +| Piece         | What it is                                   
         +                                                               
         +                                                               
         +  |                                                            
      14 +| ------------- | ---------------------------------------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +- |                                                            
      15 +| Coverage data | Jest's V8 provider (`coverageProvider: "v8"` 
         +in `jest.config.ts`), written as `coverage/coverage-final.json`
         +                                                               
         +  |                                                            
      16 +| Changed lines | `git diff --unified=0 --find-renames` from th
         +e merge-base of the base branch and `HEAD`, plus uncommitted an
         +d untracked files                                              
         +  |                                                            
      17  | Gate          | `scripts/coverage/changed-coverage.ts` (logic
          , unit-tested) run by `scripts/coverage/check-changed-coverage.
          ts` (entry point) with Node's built-in TypeScript type strippin
          g |
      18 -| Policy        | `scripts/coverage/changed-coverage-policy.ts`
         -                                                 |             
      19 -| CI            | `.github/workflows/ci.yml`: `Unit tests (with
         - coverage)` then `Changed-code coverage` (pull requests only) |
      18 +| Policy        | `scripts/coverage/changed-coverage-policy.ts`
         +                                                               
         +                                                               
         +  |                                                            
      19 +| CI            | `.github/workflows/ci.yml`: `Unit tests (with
         + coverage)` then `Changed-code coverage` (pull requests only)  
         +                                                               
         +  |                                                            
      20  
      21  No new dependency, no external service, no secrets and no netwo
          rk access. The diff runs entirely
      22  against the local clone, so CI checks out with `fetch-depth: 0`
          .
     ...
      42  
      43  ### Edge cases
      44  
      45 -| Situation                                              | Beha
         -vior                                                           
         -                   |                                           
      46 -| ------------------------------------------------------ | ----
         ----------------------------------------------------------------
         ------------------- |                                           
      47 -| Docs-only or tests-only change                         | Pass
         -: "No coverable changed source lines"                          
         -                   |                                           
      48 -| Deleted file                                           | Igno
         -red (no added lines)                                           
         -                   |                                           
      49 -| Renamed or moved file                                  | Only
         - lines edited after the move count; a pure move adds no lines  
         -                   |                                           
      50 -| New file no test loads                                 | Fail
         -s: it is in the report at 0% because `collectCoverageFrom` incl
         -udes every source file |                                       
      51 -| New file containing only types/interfaces              | Not 
         -gated: it emits no runtime code (detected with the TypeScript c
         -ompiler)           |                                           
      52 -| Changed file missing from the coverage report          | **Er
         -ror** (exit 2): the report is stale or from a partial `jest <pa
         -th>` run           |                                           
      53 -| Missing, empty or malformed `coverage-final.json`      | **Er
         -ror** (exit 2), never a silent pass                            
         -                   |                                           
      54 -| Base branch not fetched / shallow clone                | **Er
         -ror** (exit 2) with the fix (`git fetch origin main`)          
         -                   |                                           
      45 +| Situation                                                   |
         + Behavior                                                      
         +                                                |              
      46 +| ----------------------------------------------------------- |
         + --------------------------------------------------------------
         +----------------------------------------------- |              
      47 +| Docs-only or tests-only change                              |
         + Pass: "No coverable changed source lines"                     
         +                                                |              
      48 +| Deleted file                                                |
         + Ignored (no added lines)                                      
         +                                                |              
      49 +| Renamed or moved file                                       |
         + Only lines edited after the move count; a pure move adds no li
         +nes                                             |              
      50 +| New file no test loads                                      |
         + Fails: it is in the report at 0% because `collectCoverageFrom`
         + includes every source file                     |              
      51 +| New file containing only types/interfaces                   |
         + Not gated: it emits no runtime code (detected with the TypeScr
         +ipt compiler)                                   |              
      52 +| Changed file missing from the coverage report               |
         + **Error** (exit 2): the report is stale or from a partial `jes
         +t <path>` run                                   |              
     … 29 more lines (ctrl+o to expand)
  ⎿  (timeout 5m)

⏺ Typecheck flags one problem: Next.js makes NODE_ENV required on
  NodeJS.ProcessEnv, so {} doesn't fit in tests. I'll switch the gate to a plain
  string record type.

⏺ Bash(f=scripts/coverage/changed-coverage.ts && grep -n "NodeJS.ProcessEnv" $f
      && perl -pi -e 's/env: NodeJS\.ProcessEnv/env: Environment/g' $f && perl
      -0pi -e 's/(ex…)  ⎿  Updated scripts/coverage/changed-coverage.ts (+4 -2)
      734  // CLI orchestration (the entry point only wires process I/O t
           o this)
      735  // -----------------------------------------------------------
           ----------------
      736  
      737 +export type Environment = Readonly<Record<string, string | und
          +efined>>;                                                     
      738 +                                                              
      739  export type CliOptions = {
      740    baseRef: string;
      741    coverageFile: string;
      742    summaryFile: string | null;
      743  };
      744  
      743 -export function parseCliArgs(argv: string[], env: NodeJS.Proce
          -ssEnv): CliOptions {                                          
      745 +export function parseCliArgs(argv: string[], env: Environment)
          +: CliOptions {                                                
      746    const options: CliOptions = {
      747      baseRef: env.CHANGED_COVERAGE_BASE || DEFAULT_BASE_REF,
      748      coverageFile: DEFAULT_COVERAGE_FILE,
     ...
      786  
      787  export function runCli(
      788    argv: string[],
      787 -  env: NodeJS.ProcessEnv,                                     
      789 +  env: Environment,                                           
      790    io: CliIo,
      791    dependencies: CliDependencies,
      792  ): number {
  ⎿  (timeout 5m)

⏺ Typecheck and lint pass now. The only exclusion candidate is the gate's own
  entry point, and I need your decision on it before I apply anything. · summary

⏺ User answered Claude's questions:
  ⎿  · The gate's own 20-line entry point,
     scripts/coverage/check-changed-coverage.ts, fails the 0%-file rule. Jest
     can't load it because of top-level await and import.meta. A subprocess test
     does run it, but Jest's coverage doesn't see subprocesses. All of its
     logic is in changed-coverage.ts, which is at 98% coverage. None of the
     measured PRs (#78, #79, #80, #84, #85) needed any exclusion. How should I
     handle the entry point? → Policy exclusion (Recommended)

  Searched for 1 pattern (ctrl+o to expand)

⏺ Bash(python3 - <<'EOF'
      p="scripts/coverage/changed-coverage-policy.ts"…)
  ⎿  Updated docs/changed-code-coverage.md (+3 -3)
      73  
      74  **Team-approved exclusions** (`exclusions` in the policy file):
      75  
      76 -| Pattern | Reason |                                           
      77 -| ------- | ------ |                                           
      78 -| _none_  |        |                                           
      76 +| Pattern                                      | Reason        
         +                                                               
         +                                                               
         +                                                               
         +                                                               
         +                                  |                            
      77 +| -------------------------------------------- | --------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +---------------------------------------------------------------
         +--------------------------------- |                            
      78 +| `scripts/coverage/check-changed-coverage.ts` | Thin process e
         +ntry point (argument/environment/output wiring only, no logic).
         + Jest cannot load its top-level `await` and `import.meta`; its 
         +behavior is verified by a subprocess test in `tests/unit/script
         +s/coverage/changed-coverage.test.ts`, and all logic lives in th
         +e measured `changed-coverage.ts`. |                            
      79  
      80  Exclusions are never applied to files containing real logic, an
          d lowering a threshold is not an
      81  acceptable substitute for tests.
  ⎿  Updated scripts/coverage/changed-coverage-policy.ts (+9 -1)
      25      },
      26    ],
      27  
      28 -  exclusions: [],                                              
      28 +  exclusions: [                                                
      29 +    {                                                          
      30 +      pattern: "scripts/coverage/check-changed-coverage.ts",   
      31 +      reason:                                                  
      32 +        "thin process entry point (argv/env/stdout wiring only,
         + no logic); Jest cannot load its " +                           
      33 +        "top-level await and import.meta, and its behavior is v
         +erified by the subprocess test " +                             
      34 +        "in tests/unit/scripts/coverage/changed-coverage.test.t
         +s",                                                            
      35 +    },                                                         
      36 +  ],                                                           
      37  };

⏺ The exclusion is applied. Running the full verification now: format, lint,
  typecheck, the full suite with coverage, the gate against origin/main, and the
  build.

  Ran 1 shell command (ctrl+o to expand)

⏺ All 933 tests pass and the gate is at 98.14% with the entry point excluded.
  Next I'm running the build, the gate tests on Node 23.10 and 24, and the CLI
  under Node 24. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ The build passes and the gate tests are stable across Node 23.10 and 24.22.2.
  Next I'll show the gate failing on a temporary under-tested file in src/, then
  delete it. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ The 0%-file rule flagged the untested file despite 97.46% overall coverage, so
  the command exited 1. I've deleted the demo file and the working tree now has
  only the intended changes; next I'll pull the final diff stats. · summary

  Ran 1 shell command (ctrl+o to expand)

⏺ I've built and verified the changed-code coverage gate, but nothing is
  committed or pushed. All changes are in your working tree on
  feature/s2-001-changed-code-coverage-gate.

  Measurement of the open PRs

  I checked out each PR's head in a temporary worktree in the scratchpad, ran
  its full Jest suite with coverage, ran the gate against origin/main, then
  removed the worktree. I didn't change any teammate's branch or code.

  ┌──────────────┬───────────────────────┬────────────────────┬────────┐
  │      PR      │ Changed lines covered │ src/services/qa/** │ Result │
  ├──────────────┼───────────────────────┼────────────────────┼────────┤
  │ #78 (S2-010) │ 166/166 (100%)        │ 100%               │ pass   │
  ├──────────────┼───────────────────────┼────────────────────┼────────┤
  │ #79 (S2-011) │ 807/807 (100%)        │ 100%               │ pass   │
  ├──────────────┼───────────────────────┼────────────────────┼────────┤
  │ #80 (S2-006) │ 186/186 (100%)        │ none               │ pass   │
  ├──────────────┼───────────────────────┼────────────────────┼────────┤
  │ #84 (S2-009) │ 1410/1417 (99.50%)    │ 973/973 (100%)     │ pass   │
  ├──────────────┼───────────────────────┼────────────────────┼────────┤
  │ #85 (S2-007) │ 4/4 (100%)            │ none               │ pass   │
  └──────────────┴───────────────────────┴────────────────────┴────────┘

  - Q&A threshold: #78, #79 and #84 all clear 90% in src/services/qa/**, so the
    90% rule is applied.
  - #84 caveat: it adds dependencies that my run didn't install. Five tests in
    tests/unit/dependencies/deepmerge.test.ts failed for that reason. They don't
    touch src/, so the coverage numbers above still hold.
  - Exclusions: no PR failed because of thin Next.js page/loading/error files,
    so I'm not proposing any of those. The only exclusion is the gate's own
    20-line entry point, which you approved.

  What changed

  - New:
    - scripts/coverage/changed-coverage.ts: all the logic, 98% covered.
    - changed-coverage-policy.ts: thresholds and the reasoned exclusion.
    - check-changed-coverage.ts: the thin entry point.
    - 68 tests in tests/unit/scripts/coverage/changed-coverage.test.ts.
    - The deliberately under-tested fixture in
      tests/fixtures/changed-coverage/under-tested-change/.
    - docs/changed-code-coverage.md.
  - Modified:
    - package.json: two scripts, no new dependencies.
    - jest.config.ts: scripts/**/*.ts added to the measured files.
    - README.md: a new section. Prettier also re-padded the scripts table, which
      makes the diff look bigger than it is.
    - .github/workflows/ci.yml, as shown below.
  - No new dependency: Node 24 runs the TypeScript script directly. I confirmed
    it works on both Node 23.10.0 and Node 24.22.2.

  Verification

  ┌────────────────────────────────────┬────────────────────────────────────┐
  │               Check                │               Result               │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ format:check, lint, typecheck      │ pass                               │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Full suite with coverage           │ 60 suites, 933 tests pass;         │
  │                                    │ whole-repo line coverage 92.91%    │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Gate against origin/main           │ PASS, 98.14% (846/862)             │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ build                              │ pass                               │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Gate tests                         │ 68/68 pass, 3 runs on Node 23.10   │
  │                                    │ and 3 on Node 24.22.2              │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Gate run under Node 24             │ PASS                               │
  ├────────────────────────────────────┼────────────────────────────────────┤
  │ Under-tested change (temporary     │ FAIL, exit 1: the 0%-file rule     │
  │ untested src/ file, deleted        │ fired even though overall coverage │
  │ afterwards)                        │  was 97.46%                        │
  └────────────────────────────────────┴────────────────────────────────────┘

  The "Type Stripping is experimental" warning that shows up in local Jest runs
  was already there before my changes. Jest prints it when it loads
  jest.config.ts on Node 23.

  ---

  Deliverable 1: Suggested commits

  To run whenever you choose to commit:
  1. feat(S2-001): add changed-code coverage gate and policy: scripts/coverage/*
     and jest.config.ts
  2. test(S2-001): cover the gate, including an under-tested failure fixture:
     tests/unit/scripts/** and tests/fixtures/changed-coverage/**
  3. ci(S2-001): run coverage and the changed-code gate on pull requests:
     .github/workflows/ci.yml and package.json
  4. docs(S2-001): document the changed-code coverage gate:
     docs/changed-code-coverage.md and README.md

  Save this session's transcript under ai-transcripts/, following the team's
  S1-004 convention.

  Deliverable 2: PR description draft

  Written for: teammates reviewing the PR.

  ## S2-001: Add Changed-Code Coverage Gate

  Refs #52

  ### What / why
  CI now measures test coverage of the lines a PR **adds or modifies** (not the
  whole-repo %) and
  fails the PR when it is too low, so significant new behavior can't merge
  without automated tests.

  **Policy**
  - ≥ 80% of coverable changed lines covered.
  - ≥ 90% inside `src/services/qa/**`, the Q&A orchestration layer (S2-BR-027 to
  031).
  - No changed file may have 0% changed-line coverage.
  - A PR with no source changes (docs, tests, CSS, SQL) passes.

  **Mechanism**
  - Jest's existing V8 coverage (`coverage-final.json`) combined with
    `git diff --unified=0 --find-renames` from the merge-base.
  - An in-repo TypeScript script run by Node 24's built-in type stripping.
  - No new dependency, no external service, no secrets, no network.
  - Full docs: `docs/changed-code-coverage.md`.

  ### ⚠️ CI workflow change (`.github/workflows/ci.yml`)
  - Checkout uses `fetch-depth: 0` so the merge-base is available.
  - `Unit tests` becomes `Unit tests (with coverage)`: the same suite, run once,
  with JSON coverage output.
  - New final step `Changed-code coverage`, run on `pull_request` only. Its
  results table also appears in the job Summary tab.
  - Everything is in the existing job, so the required check **"Lint, typecheck,
  test, build" is unchanged** and branch protection needs no edit.

  ### Files changed
  - `scripts/coverage/changed-coverage.ts`: gate logic, unit-tested
  - `scripts/coverage/changed-coverage-policy.ts`: thresholds and the one
  reasoned exclusion
  - `scripts/coverage/check-changed-coverage.ts`: thin entry point (the excluded
  file)
  - `tests/unit/scripts/coverage/changed-coverage.test.ts`: 68 tests
  - `tests/fixtures/changed-coverage/under-tested-change/*`: deliberately
  under-tested change that must fail
  - `jest.config.ts`: adds `scripts/**/*.ts` to `collectCoverageFrom` (adds
  coverage, lowers nothing)
  - `package.json`: `coverage:changed` and `coverage:changed:check`
  - `docs/changed-code-coverage.md`, `README.md`

  ### Exclusions
  - `scripts/coverage/check-changed-coverage.ts`: a 20-line entry point that
  only wires arguments and output. Jest can't load its top-level
  `await`/`import.meta`; a subprocess test exercises it.
  - Not measured, as in Jest today: `*.d.ts`, `src/app/layout.tsx`, and
  type-only modules (detected per file with the TypeScript compiler).

  ### Run locally
      git fetch origin main
      npm run coverage:changed

  ### Test Evidence
  - `npm run format:check` / `lint` / `typecheck` / `build`: pass
  - Full suite with coverage: 60 suites, 933 tests pass; whole-repo line
  coverage 92.91%
  - `npm run coverage:changed` on this branch: PASS, 98.14% changed-line
  coverage (846/862)
  - Gate tests cover:
    - below the threshold fails; exactly at it passes
    - no changes, docs-only and tests-only changes pass
    - excluded, unmeasured and type-only files are ignored
    - deleted files are ignored; renamed or moved files count only their edited
  lines
    - a new untested file fails; a 0% file fails even when the total is high
    - the Q&A threshold applies to `src/services/qa/**`
    - missing, empty or malformed coverage, a stale or partial report, and a
  missing base ref each give a clear error (exit 2)
    - the real entry point runs in a subprocess
  - Gate tests pass 3/3 runs on Node 23.10 and 3/3 on Node 24.22.2
  - Failure demo:
    - The committed fixture fails at 52.63% (10/19; lines 11-19 uncovered).
    - A temporary untested `src/` file failed the gate locally with exit 1. The
  file was deleted afterwards.
    - Live CI failure: <link to throwaway draft PR>
  - Read-only measurement of the open PRs (all pass): #78 100%, #79 100%, #80
  100%, #84 99.50%, #85 100%

  ### AI assistance
  Built with Claude Code (Claude Opus 5.5). The author reviewed every line.
  Transcript: `ai-transcripts/<file>`.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)

  Deliverable 3: Showing the failing gate on a throwaway draft PR

  Do this after you push the real branch. Targeting the S2-001 branch keeps the
  demo PR's diff down to the one demo file.

  git fetch origin
  git switch -c demo/s2-001-gate-fails
  origin/feature/s2-001-changed-code-coverage-gate
  cat > src/lib/utils/coverage-gate-demo.ts <<'EOF'
  // DEMO ONLY (S2-001): deliberately untested. Do not merge.
  export function describeRating(rating: number): string {
    if (rating >= 4) return "positive";
    if (rating === 3) return "mixed";
    return "negative";
  }
  EOF
  npm run coverage:changed -- --base
  origin/feature/s2-001-changed-code-coverage-gate   # expect FAIL, exit 1
  git add src/lib/utils/coverage-gate-demo.ts
  git commit -m "demo(S2-001): deliberately untested change (do not merge)"
  git push -u origin demo/s2-001-gate-fails
  gh pr create --draft --base feature/s2-001-changed-code-coverage-gate \
    --title "DEMO: S2-001 gate must fail (do not merge)" \
    --body "Throwaway PR demonstrating the changed-code coverage gate rejecting
  an untested change. Refs #52"

  - Expected result: the "Lint, typecheck, test, build" check fails at the
    Changed-code coverage step with src/lib/utils/coverage-gate-demo.ts: none of
    its 6 changed lines are executed by any test (lines 1-6). The same table
    appears in the run's Summary tab.
  - Afterwards: copy the run link into the real PR's Test Evidence, then clean
    up:
  gh pr close <n> --delete-branch
  git switch feature/s2-001-changed-code-coverage-gate
  git branch -D demo/s2-001-gate-fails

  Deliverable 4: Heads-up message for the team

  Written for: the CS490 teammates, posted in the team channel.

  ▎ Heads-up: changed-code coverage gate (S2-001) is coming to CI. Once it
  ▎ merges, the required check "Lint, typecheck, test, build" will also fail a
  ▎ PR if:
  ▎ - fewer than 80% of the source lines it adds or changes are run by Jest
  ▎ tests,
  ▎ - fewer than 90% are run in src/services/qa/**, or
  ▎ - any changed file has 0% of its changed lines covered (for example, a new
  ▎ file no test imports).
  ▎
  ▎ Docs, tests, CSS and SQL-only PRs aren't affected.
  ▎
  ▎ Check locally before pushing:
  ▎ git fetch origin main
  ▎ npm run coverage:changed
  ▎ A failure lists the exact uncovered line numbers for each file.
  ▎
  ▎ I measured the open PRs and all of them pass today: #78 100%, #79 100%, #80
  ▎ 100%, #84 99.5%, #85 100%. #73, #75 and #77 have no src/ changes.
  ▎
  ▎ The gate applies to any PR whose CI reruns after S2-001 merges, so keep
  ▎ adding tests with new code. Code tested only by Playwright or SQL tests
  ▎ isn't counted. If that's unavoidable for a thin file, request an exclusion
  ▎ in your PR (see docs/changed-code-coverage.md §6), and a teammate must
  ▎ approve it. Required check names don't change.

  Deliverable 5: Session summary

  - Discovery:
    - Issue #52 has no acceptance criteria beyond the story text.
    - The repo has no PR template.
    - The baseline was 92.06% line coverage at that point. Jest's v8 coverage
      lists files tests never load at 0%, and that includes files that contain
      only types.
    - CI checked out with depth 1.
    - Of the options (in-repo script, diff-cover, a hosted service), I
      recommended the in-repo script, and you approved it with changes.
  - Implementation:
    - Gate module, policy and thin entry point, all runnable directly by Node
      with no new dependency.
    - 68 tests, including a real temporary git repository for
      rename/delete/untracked cases and a subprocess run of the entry point.
    - A failure fixture kept under tests/fixtures.
    - CI wiring inside the existing job, docs, and a README section.
  - Problems found and fixed during the work:
    - An ES2018-only regex flag (the repo targets ES2017).
    - Next.js makes NODE_ENV a required field on the environment type.
    - Git's rename detection treating a delete plus an identical add as a move.
      That's the intended behaviour, and it's now documented and tested.
    - Two test-setup bugs.
  - Decisions:
    - 80% overall with the 0%-file rule.
    - The 90% Q&A rule is applied, because #78, #79 and #84 all measured 100%.
    - The one exclusion (the entry point) was approved by you.
    - No wrapper exclusions were needed.
  - Process: nothing committed or pushed, no teammate code touched, and the
    temporary demo file was deleted. Four stale "prunable" git worktrees from
    earlier sessions still exist; I left them alone.