# Changed-Code Coverage Gate (S2-001)

**Story:** S2-001 (#52) | **Related rules:** S2-BR-027 to S2-BR-031 | **Enforced in:** the required
CI check **Lint, typecheck, test, build**

The gate makes sure significant new behavior cannot enter `main` without automated verification.
It measures only the lines a pull request **adds or modifies**, not the whole-repository
percentage, so a PR is judged on its own changes and old untested code neither blocks nor excuses
it.

## 1. Mechanism

| Piece         | What it is                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage data | Jest's V8 provider (`coverageProvider: "v8"` in `jest.config.ts`), written as `coverage/coverage-final.json`                                                                 |
| Changed lines | `git diff --unified=0 --find-renames` from the merge-base of the base branch and `HEAD`, plus uncommitted and untracked files                                                |
| Gate          | `scripts/coverage/changed-coverage.ts` (logic, unit-tested) run by `scripts/coverage/check-changed-coverage.ts` (entry point) with Node's built-in TypeScript type stripping |
| Policy        | `scripts/coverage/changed-coverage-policy.ts`                                                                                                                                |
| CI            | `.github/workflows/ci.yml`: `Unit tests (with coverage)` then `Changed-code coverage` (pull requests only)                                                                   |

No new dependency, no external service, no secrets and no network access. The diff runs entirely
against the local clone, so CI checks out with `fetch-depth: 0`.

A line is **coverable** when the coverage report lists a statement starting on it, and
**covered** when that statement ran at least once (Istanbul line semantics). Branch coverage of
changed lines is printed for information but does not gate: V8 branch ranges are too coarse to
attribute reliably to individual changed lines.

## 2. Policy

A pull request passes only when **all** of these hold:

1. At least **80%** of all coverable changed lines are covered.
2. At least **90%** of coverable changed lines inside `src/services/qa/**` are covered. The Q&A
   orchestration layer must stay verified by deterministic tests (S2-BR-027 to S2-BR-031). Every
   open Q&A PR at the time of adoption (#78, #79, #84) measured 100% here.
3. **No changed file has 0% changed-line coverage.** This stops one untested module from hiding
   inside an otherwise well-tested PR.

When a PR has no coverable changed lines (documentation, tests, CSS, SQL or workflow changes only),
the gate passes and says so.

### Edge cases

| Situation                                                   | Behavior                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Docs-only or tests-only change                              | Pass: "No coverable changed source lines"                                                                     |
| Deleted file                                                | Ignored (no added lines)                                                                                      |
| Renamed or moved file                                       | Only lines edited after the move count; a pure move adds no lines                                             |
| New file no test loads                                      | Fails: it is in the report at 0% because `collectCoverageFrom` includes every source file                     |
| New file containing only types/interfaces                   | Not gated: it emits no runtime code (detected with the TypeScript compiler)                                   |
| Changed file missing from the coverage report               | **Error** (exit 2): the report is stale or from a partial `jest <path>` run                                   |
| Missing, empty or malformed `coverage-final.json`           | **Error** (exit 2), never a silent pass                                                                       |
| Base branch not fetched / shallow clone                     | **Error** (exit 2) with the fix (`git fetch origin main`)                                                     |
| Code exercised only by Playwright or SQL (`tests/db`) tests | Not credited: those suites do not produce Jest coverage. Add a unit test, or request an exclusion (section 5) |

Exit codes: `0` pass, `1` coverage requirements not met, `2` the check could not run.

## 3. What is measured and what is excluded

The gate measures exactly what Jest measures (`collectCoverageFrom`); a unit test keeps the two
lists in sync.

| Scope                                   | Measured? | Why                                                     |
| --------------------------------------- | --------- | ------------------------------------------------------- |
| `src/**/*.{ts,tsx}`                     | Yes       | Application code                                        |
| `scripts/**/*.ts`                       | Yes       | Repository tooling, including this gate                 |
| `src/**/*.d.ts`                         | No        | Declaration files contain no runtime code               |
| `src/app/layout.tsx`                    | No        | Already excluded from Jest coverage in `jest.config.ts` |
| Type-only modules (detected per file)   | No        | No runtime code to execute                              |
| `tests/**`, fixtures, helpers           | No        | Test code is not itself the behavior under test         |
| Config files, docs, CSS, SQL, workflows | No        | Not TypeScript source executed by Jest                  |

**Team-approved exclusions** (`exclusions` in the policy file):

| Pattern                                      | Reason                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/coverage/check-changed-coverage.ts` | Thin process entry point (argument/environment/output wiring only, no logic). Jest cannot load its top-level `await` and `import.meta`; its behavior is verified by a subprocess test in `tests/unit/scripts/coverage/changed-coverage.test.ts`, and all logic lives in the measured `changed-coverage.ts`. |

Exclusions are never applied to files containing real logic, and lowering a threshold is not an
acceptable substitute for tests.

## 4. Run it locally

```bash
git fetch origin main          # the gate compares against origin/main
npm run coverage:changed       # full Jest run with coverage, then the gate
```

Other forms:

```bash
npm run coverage:changed:check                     # gate only; reuse coverage/coverage-final.json
npm run coverage:changed -- --base origin/develop  # compare against another base
npm run coverage:changed:check -- --coverage path/to/coverage-final.json
```

The local result includes uncommitted and untracked files, so it matches what the PR will show once
pushed. Always use a **full** coverage run: `jest <single file> --coverage` produces a partial
report, and the gate will refuse it rather than guess. Requires Node 24 (the team baseline);
Node 23.6 or later also works.

## 5. Reading a failure

```text
Changed-code coverage (S2-001) vs origin/main (merge-base ed686a266df6)
Policy: at least 80% of coverable changed lines; 90% within src/services/qa/**; no changed file may have 0% changed-line coverage.

File                     Covered/Changed  Line %   Uncovered changed lines
src/lib/rating-label.ts            10/19   52.63%  11-19

Overall changed-line coverage: 52.63% (10/19); required 80%.

FAIL: changed-code coverage requirements are not met:
  - Changed-line coverage is 52.63% (10/19); the required minimum is 80%.
```

- **Uncovered changed lines** are line numbers in the file as it is in your branch. Open the file,
  find those lines, and add a test that executes them, usually a failure, validation or edge case
  that has no test yet.
- **"none of its N changed lines are executed"** means no test imports the file at all.
- In CI the same table appears in the job's **Summary** tab (`$GITHUB_STEP_SUMMARY`), and the full
  text is in the `Changed-code coverage` step log.
- **Exit 2** means the check could not run (no coverage file, partial report, base branch not
  fetched). The message says what to run; this never counts as a pass.

## 6. Requesting an exclusion

Exclusions are for code that cannot reasonably be unit-tested in Jest **and** has no real logic:
for example, a thin Next.js `loading.tsx` that is verified by Playwright.

1. Add an entry to `exclusions` in `scripts/coverage/changed-coverage-policy.ts` with the
   narrowest pattern possible (prefer one file over a glob) and a specific `reason`.
2. Add the same row to the exclusions table in section 3.
3. In the PR description, explain why a Jest test is not practical and which other test (for
   example a Playwright spec) covers the behavior.
4. A teammate other than the author must approve the policy change. Policy changes, including
   threshold changes, follow the same review rules as `docs/engineering-standards.md`.

Inline V8 ignore comments are discouraged; if one is unavoidable it must carry a reason in the same
comment and be called out in the PR.

## 7. Known limitations

- V8 records one statement per source line. In files that tests load, comment and blank lines and
  type annotations count as covered, which inflates the changed-line percentage slightly.
- The gate does not merge Playwright or SQL test coverage.
- In CI the PR is checked out as GitHub's merge commit. The gate diffs that commit against the
  merge-base with the base branch, so it measures the PR's own changes as they will merge.
