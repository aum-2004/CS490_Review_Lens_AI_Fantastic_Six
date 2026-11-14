/** @jest-environment node */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ChangedCoverageError,
  collectChangedLines,
  createGitRunner,
  evaluateChangedCoverage,
  EXIT_BELOW_THRESHOLD,
  EXIT_ERROR,
  EXIT_PASS,
  formatLineRanges,
  formatMarkdownReport,
  formatTextReport,
  globToRegExp,
  isTypeOnlyModule,
  loadCoverageFile,
  matchesGlob,
  parseCliArgs,
  parseCoverageJson,
  parseUnifiedDiff,
  percent,
  runCli,
  type ChangedCoveragePolicy,
  type ChangedLines,
  type CoverageMap,
  type FileLineCoverage,
} from "../../../../scripts/coverage/changed-coverage";
import { changedCoveragePolicy } from "../../../../scripts/coverage/changed-coverage-policy";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const FIXTURE_DIR = path.join(REPO_ROOT, "tests/fixtures/changed-coverage/under-tested-change");
const CLI_ENTRY = path.join(REPO_ROOT, "scripts/coverage/check-changed-coverage.ts");

const testPolicy: ChangedCoveragePolicy = {
  minimumLinePercent: 80,
  failFilesWithNoCoveredChangedLines: true,
  include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
  notMeasured: [
    { pattern: "src/**/*.d.ts", reason: "declaration file" },
    { pattern: "src/app/layout.tsx", reason: "excluded in jest.config.ts" },
  ],
  pathThresholds: [{ pattern: "src/services/qa/**", minimumLinePercent: 90, reason: "Q&A" }],
  exclusions: [{ pattern: "src/generated/**", reason: "generated client" }],
};

/** One statement per line, like Jest's V8 provider. `executed` lines get count 1. */
function lineCoverage(totalLines: number, executed: number[]): FileLineCoverage {
  const executedSet = new Set(executed);
  return {
    lines: new Map(
      Array.from({ length: totalLines }, (_, index) => [
        index + 1,
        executedSet.has(index + 1) ? 1 : 0,
      ]),
    ),
    branches: [],
  };
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function evaluate(
  changedLines: ChangedLines,
  coverage: CoverageMap,
  options: { policy?: ChangedCoveragePolicy; files?: Record<string, string> } = {},
) {
  return evaluateChangedCoverage({
    changedLines,
    coverage,
    policy: options.policy ?? testPolicy,
    readFile: (file) => options.files?.[file] ?? "export const value = 1;\n",
  });
}

describe("glob matching", () => {
  it.each([
    ["src/**/*.{ts,tsx}", "src/a.ts", true],
    ["src/**/*.{ts,tsx}", "src/app/x/page.tsx", true],
    ["src/**/*.{ts,tsx}", "src/a.css", false],
    ["src/**/*.{ts,tsx}", "tests/unit/a.test.ts", false],
    ["src/**/*.d.ts", "src/types/env.d.ts", true],
    ["src/app/layout.tsx", "src/app/layout.tsx", true],
    ["src/app/layout.tsx", "src/app/x/layout.tsx", false],
    ["src/services/qa/**", "src/services/qa/deep/answer.ts", true],
    ["src/services/qa/**", "src/services/qanda/answer.ts", false],
    ["src/app/*/page.tsx", "src/app/a/b/page.tsx", false],
    ["src/?.ts", "src/a.ts", true],
    ["src/a.ts", "src/aXts", false],
  ])("%s matches %s -> %s", (glob, file, expected) => {
    expect(matchesGlob(file, glob)).toBe(expected);
  });

  it("rejects unbalanced braces", () => {
    expect(() => globToRegExp("src/{a,b.ts")).toThrow(ChangedCoverageError);
  });
});

describe("parseUnifiedDiff", () => {
  it("collects new-side line numbers for added and modified files", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "index 1111111..2222222 100644",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -3 +3 @@ export const x = 1;",
      "-old",
      "+new",
      "@@ -10,0 +11,3 @@",
      "+a",
      "+b",
      "+c",
      "diff --git a/src/new.ts b/src/new.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/src/new.ts",
      "@@ -0,0 +1,2 @@",
      "+line one",
      "+line two",
      "",
    ].join("\n");
    expect(parseUnifiedDiff(diff)).toEqual(
      new Map([
        ["src/a.ts", [3, 11, 12, 13]],
        ["src/new.ts", [1, 2]],
      ]),
    );
  });

  it("ignores pure deletions, deleted files and pure renames", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -5,2 +4,0 @@",
      "-gone",
      "-gone too",
      "diff --git a/src/old.ts b/src/old.ts",
      "deleted file mode 100644",
      "--- a/src/old.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-x",
      "-y",
      "diff --git a/src/before.ts b/src/after.ts",
      "similarity index 100%",
      "rename from src/before.ts",
      "rename to src/after.ts",
    ].join("\n");
    expect(parseUnifiedDiff(diff)).toEqual(new Map());
  });

  it("attributes edits in a renamed file to its new path only", () => {
    const diff = [
      "diff --git a/src/before.ts b/src/after.ts",
      "similarity index 90%",
      "rename from src/before.ts",
      "rename to src/after.ts",
      "--- a/src/before.ts",
      "+++ b/src/after.ts",
      "@@ -7 +7 @@",
      "-a",
      "+b",
    ].join("\n");
    expect(parseUnifiedDiff(diff)).toEqual(new Map([["src/after.ts", [7]]]));
  });

  it("does not mistake added content starting with +++ for a file header", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -0,0 +1,2 @@",
      "+++ b/src/evil.ts",
      "+ok",
    ].join("\n");
    expect(parseUnifiedDiff(diff)).toEqual(new Map([["src/a.ts", [1, 2]]]));
  });

  it("unquotes paths git had to quote and skips binary files", () => {
    const diff = [
      'diff --git "a/src/we\\"ird.ts" "b/src/we\\"ird.ts"',
      '--- "a/src/we\\"ird.ts"',
      '+++ "b/src/we\\"ird.ts"',
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "diff --git a/public/logo.png b/public/logo.png",
      "Binary files a/public/logo.png and b/public/logo.png differ",
    ].join("\n");
    expect(parseUnifiedDiff(diff)).toEqual(new Map([['src/we"ird.ts', [1]]]));
  });
});

describe("formatLineRanges and percent", () => {
  it("collapses consecutive lines into ranges", () => {
    expect(formatLineRanges([5, 1, 2, 3, 9, 10, 3])).toBe("1-3, 5, 9-10");
    expect(formatLineRanges([])).toBe("");
  });

  it("rounds percentages down so a near miss never displays as passing", () => {
    expect(percent(799, 1000)).toBe(79.9);
    expect(percent(7999, 10000)).toBe(79.99);
    expect(percent(2, 3)).toBe(66.66);
    expect(percent(0, 0)).toBeNull();
  });
});

describe("parseCoverageJson", () => {
  const root = "/repo";
  const entry = {
    statementMap: {
      "0": { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
      "1": { start: { line: 2, column: 0 }, end: { line: 3, column: 5 } },
      "2": { start: { line: 2, column: 6 }, end: { line: 2, column: 9 } },
    },
    s: { "0": 3, "1": 0, "2": 2 },
    branchMap: {
      "0": {
        loc: { start: { line: 2, column: 0 }, end: { line: 2, column: 9 } },
        locations: [
          { start: { line: 2, column: 0 }, end: { line: 2, column: 4 } },
          { start: { line: 4, column: 0 }, end: { line: 4, column: 4 } },
        ],
      },
    },
    b: { "0": [1, 0] },
  };

  it("maps absolute and relative keys to repo paths with Istanbul line semantics", () => {
    const coverage = parseCoverageJson(
      JSON.stringify({ "/repo/src/a.ts": entry, "src/b.ts": entry }),
      [root],
      "test.json",
    );
    expect([...coverage.keys()]).toEqual(["src/a.ts", "src/b.ts"]);
    const fileCoverage = coverage.get("src/a.ts");
    expect(fileCoverage?.lines).toEqual(
      new Map([
        [1, 3],
        [2, 2],
      ]),
    );
    expect(fileCoverage?.branches).toEqual([
      { line: 2, covered: true },
      { line: 4, covered: false },
    ]);
  });

  it("prefers the entry's own path and falls back to an alternate root", () => {
    const coverage = parseCoverageJson(
      JSON.stringify({ whatever: { ...entry, path: "/private/repo/src/c.ts" } }),
      ["/repo", "/private/repo"],
      "test.json",
    );
    expect([...coverage.keys()]).toEqual(["src/c.ts"]);
  });

  it.each([
    ["not JSON", "{oops", /not valid JSON/],
    ["an array", "[]", /object keyed by file path/],
    ["an empty report", "{}", /contains no files/],
    ["an entry without statements", JSON.stringify({ "src/a.ts": { s: {} } }), /malformed/],
    [
      "a statement without a count",
      JSON.stringify({ "src/a.ts": { statementMap: entry.statementMap, s: {} } }),
      /malformed statement "0"/,
    ],
    [
      "a statement without a location",
      JSON.stringify({ "src/a.ts": { statementMap: { "0": { start: {} } }, s: { "0": 1 } } }),
      /malformed statement "0"/,
    ],
  ])("refuses %s with a clear error", (_label, json, message) => {
    expect(() => parseCoverageJson(json, [root], "test.json")).toThrow(ChangedCoverageError);
    expect(() => parseCoverageJson(json, [root], "test.json")).toThrow(message);
  });

  it.each([
    ["an infinite branch count", { ...entry, b: { "0": [1, Infinity] } }, /invalid b count "0"/],
    ["a branch count that is not an array", { ...entry, b: { "0": 1 } }, /invalid b count "0"/],
    ["a branch without a count per outcome", { ...entry, b: { "0": [1] } }, /every outcome/],
    ["a negative function count", { ...entry, f: { "0": -1 } }, /invalid f count "0"/],
    [
      "a branch outcome on line 0",
      {
        ...entry,
        branchMap: {
          "0": { locations: [{ start: { line: 0, column: 0 }, end: { line: 0, column: 1 } }] },
        },
        b: { "0": [1] },
      },
      /outcome 0 has an invalid location/,
    ],
  ])("refuses %s as unusable", (_label, value, message) => {
    // JSON.stringify writes Infinity as null; put it back as the overflowing literal 1e309.
    const parse = () =>
      parseCoverageJson(JSON.stringify({ "src/a.ts": value }).replace("null", "1e309"), [root], "t");
    expect(parse).toThrow(ChangedCoverageError);
    expect(parse).toThrow(message);
  });

  it("accepts the column -1 that Jest's V8 provider emits for some branches", () => {
    const v8Branch = {
      ...entry,
      branchMap: {
        "0": {
          loc: { start: { line: 2, column: -1 }, end: { line: 2, column: 4 } },
          locations: [{ start: { line: 2, column: -1 }, end: { line: 2, column: 4 } }],
        },
      },
      b: { "0": [0] },
    };
    const coverage = parseCoverageJson(JSON.stringify({ "src/a.ts": v8Branch }), [root], "t");
    expect(coverage.get("src/a.ts")?.branches).toEqual([{ line: 2, covered: false }]);
  });

  it("reports a missing coverage file instead of passing", () => {
    expect(() => loadCoverageFile("/definitely/missing/coverage-final.json", "/repo")).toThrow(
      /Coverage file not found/,
    );
  });
});

describe("isTypeOnlyModule", () => {
  it.each([
    ["interfaces and type aliases", "export interface A { id: string }\nexport type B = A[];\n"],
    [
      "type imports and re-exports",
      'import type { A } from "./a";\nexport type { A };\nexport type C = A;\n',
    ],
    ["comments only", "// nothing here\n"],
  ])("is true for %s", (_label, source) => {
    expect(isTypeOnlyModule(source, "src/types/x.ts")).toBe(true);
  });

  it.each([
    ["a constant", "export type A = string;\nexport const MAX = 5;\n"],
    ["a re-export of values", 'export * from "./values";\n'],
    ["a side-effect import", 'import "./polyfill";\n'],
    ["a React component", "export function Box() {\n  return <div />;\n}\n"],
    ["an enum", "export enum Color {\n  Red,\n}\n"],
  ])("is false for %s", (_label, source) => {
    expect(isTypeOnlyModule(source, "src/types/x.tsx")).toBe(false);
  });
});

describe("evaluateChangedCoverage", () => {
  it("passes with nothing to gate when no coverable source lines changed", () => {
    const result = evaluate(
      new Map([
        ["docs/guide.md", [1, 2]],
        ["tests/unit/a.test.ts", [1]],
        ["src/app/globals.css", [3]],
        [".github/workflows/ci.yml", [10]],
      ]),
      new Map([["src/a.ts", lineCoverage(5, [])]]),
    );
    expect(result.passed).toBe(true);
    expect(result.files).toEqual([]);
    expect(result.totals.percent).toBeNull();
  });

  it("fails below the threshold and reports the uncovered line ranges", () => {
    const result = evaluate(
      new Map([["src/a.ts", range(1, 10)]]),
      new Map([["src/a.ts", lineCoverage(10, range(1, 7))]]),
    );
    expect(result.passed).toBe(false);
    expect(result.totals).toMatchObject({ coveredChangedLines: 7, coverableChangedLines: 10 });
    expect(result.files[0].uncoveredLines).toEqual([8, 9, 10]);
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: "overall",
        message: expect.stringContaining("70% (7/10); the required minimum is 80%"),
      }),
    ]);
  });

  it("passes exactly at the threshold", () => {
    const result = evaluate(
      new Map([["src/a.ts", range(1, 10)]]),
      new Map([["src/a.ts", lineCoverage(10, range(1, 8))]]),
    );
    expect(result.totals.percent).toBe(80);
    expect(result.passed).toBe(true);
  });

  it("only counts changed lines, not untouched uncovered lines in the same file", () => {
    const result = evaluate(
      new Map([["src/a.ts", [1, 2]]]),
      new Map([["src/a.ts", lineCoverage(100, [1, 2])]]),
    );
    expect(result.passed).toBe(true);
    expect(result.totals).toMatchObject({ coveredChangedLines: 2, coverableChangedLines: 2 });
  });

  it("fails a new file that no test executes", () => {
    const result = evaluate(
      new Map([["src/services/new-feature.ts", range(1, 6)]]),
      new Map([["src/services/new-feature.ts", lineCoverage(6, [])]]),
    );
    expect(result.passed).toBe(false);
    expect(result.failures.map((failure) => failure.kind)).toEqual(["overall", "uncovered-file"]);
    expect(result.failures[1].message).toContain("src/services/new-feature.ts");
    expect(result.failures[1].message).toContain("lines 1-6");
  });

  it("fails a 0% file even when overall changed-line coverage is high", () => {
    const result = evaluate(
      new Map([
        ["src/big.ts", range(1, 100)],
        ["src/forgotten.ts", [1, 2]],
      ]),
      new Map([
        ["src/big.ts", lineCoverage(100, range(1, 100))],
        ["src/forgotten.ts", lineCoverage(2, [])],
      ]),
    );
    expect(result.totals.percent).toBeGreaterThan(98);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      expect.objectContaining({ kind: "uncovered-file", message: expect.stringContaining("src/forgotten.ts") }),
    ]);
  });

  it("can disable the 0% file rule through policy", () => {
    const result = evaluate(
      new Map([
        ["src/big.ts", range(1, 100)],
        ["src/forgotten.ts", [1]],
      ]),
      new Map([
        ["src/big.ts", lineCoverage(100, range(1, 100))],
        ["src/forgotten.ts", lineCoverage(1, [])],
      ]),
      { policy: { ...testPolicy, failFilesWithNoCoveredChangedLines: false } },
    );
    expect(result.passed).toBe(true);
  });

  it("applies a stricter path threshold to matching files only", () => {
    const coverage = new Map([
      ["src/services/qa/answer.ts", lineCoverage(10, range(1, 8))],
      ["src/other.ts", lineCoverage(10, range(1, 10))],
    ]);
    const result = evaluate(
      new Map([
        ["src/services/qa/answer.ts", range(1, 10)],
        ["src/other.ts", range(1, 10)],
      ]),
      coverage,
    );
    expect(result.totals.percent).toBe(90);
    expect(result.passed).toBe(false);
    expect(result.pathResults).toEqual([
      { pattern: "src/services/qa/**", minimumLinePercent: 90, coverable: 10, covered: 8, percent: 80 },
    ]);
    expect(result.failures).toEqual([
      expect.objectContaining({ kind: "path-threshold", message: expect.stringContaining("Q&A") }),
    ]);
  });

  it("ignores excluded and unmeasured files and says why", () => {
    const result = evaluate(
      new Map([
        ["src/generated/client.ts", range(1, 50)],
        ["src/types/env.d.ts", [1]],
        ["src/app/layout.tsx", [1, 2]],
        ["src/a.ts", [1]],
      ]),
      new Map([["src/a.ts", lineCoverage(1, [1])]]),
    );
    expect(result.passed).toBe(true);
    expect(result.files.map((file) => file.file)).toEqual(["src/a.ts"]);
    expect(result.skipped).toEqual([
      { file: "src/app/layout.tsx", reason: "excluded in jest.config.ts" },
      { file: "src/generated/client.ts", reason: "excluded: generated client" },
      { file: "src/types/env.d.ts", reason: "declaration file" },
    ]);
  });

  it("skips a type-only module that tests never load", () => {
    const result = evaluate(
      new Map([["src/types/review.ts", range(1, 3)]]),
      new Map([["src/types/review.ts", lineCoverage(3, [])]]),
      { files: { "src/types/review.ts": "export interface Review {\n  id: string;\n}\n" } },
    );
    expect(result.passed).toBe(true);
    expect(result.skipped).toEqual([
      { file: "src/types/review.ts", reason: "type-only module (emits no runtime code)" },
    ]);
  });

  it("does not let a never-loaded file with runtime code hide as type-only", () => {
    const result = evaluate(
      new Map([["src/types/review.ts", range(1, 2)]]),
      new Map([["src/types/review.ts", lineCoverage(2, [])]]),
      { files: { "src/types/review.ts": "export type A = string;\nexport const LIMIT = 3;\n" } },
    );
    expect(result.passed).toBe(false);
  });

  it("errors when a changed runtime module has an empty coverage entry", () => {
    expect(() =>
      evaluate(
        new Map([["src/lib/limit.ts", [1, 2]]]),
        new Map([["src/lib/limit.ts", { lines: new Map(), branches: [] }]]),
        { files: { "src/lib/limit.ts": "export const LIMIT = 3;\nexport const MIN = 1;\n" } },
      ),
    ).toThrow(/report is unusable.*emit runtime code.*src\/lib\/limit.ts/);
  });

  it("skips a type-only module whose coverage entry is empty", () => {
    const result = evaluate(
      new Map([["src/types/review.ts", range(1, 3)]]),
      new Map([["src/types/review.ts", { lines: new Map(), branches: [] }]]),
      { files: { "src/types/review.ts": "export interface Review {\n  id: string;\n}\n" } },
    );
    expect(result.passed).toBe(true);
    expect(result.skipped).toEqual([
      { file: "src/types/review.ts", reason: "type-only module (emits no runtime code)" },
    ]);
  });

  it("skips changed lines the coverage report does not consider executable", () => {
    const result = evaluate(
      new Map([["src/a.ts", [40, 41]]]),
      new Map([["src/a.ts", lineCoverage(10, range(1, 10))]]),
    );
    expect(result.passed).toBe(true);
    expect(result.skipped).toEqual([{ file: "src/a.ts", reason: "no executable changed lines" }]);
  });

  it("errors instead of passing when a changed source file is missing from the report", () => {
    expect(() =>
      evaluate(
        new Map([["src/never-collected.ts", [1]]]),
        new Map([["src/a.ts", lineCoverage(1, [1])]]),
      ),
    ).toThrow(/no entry in the coverage report: src\/never-collected.ts/);
  });

  it("reports changed branch outcomes for information only", () => {
    const coverage: CoverageMap = new Map([
      [
        "src/a.ts",
        {
          lines: lineCoverage(5, range(1, 5)).lines,
          branches: [
            { line: 2, covered: true },
            { line: 3, covered: false },
            { line: 5, covered: false },
          ],
        },
      ],
    ]);
    const result = evaluate(new Map([["src/a.ts", [2, 3]]]), coverage);
    expect(result.passed).toBe(true);
    expect(result.totals).toMatchObject({ changedBranches: 2, coveredChangedBranches: 1 });
  });
});

describe("deliberately under-tested change (failure-path fixture)", () => {
  const fixtureSource = fs.readFileSync(path.join(FIXTURE_DIR, "rating-label.ts"), "utf8");
  const fixtureCoverage = fs.readFileSync(path.join(FIXTURE_DIR, "coverage-final.json"), "utf8");
  const lineCount = fixtureSource.trimEnd().split("\n").length;

  it("is rejected by the gate with the policy defined in the repository", () => {
    const result = evaluateChangedCoverage({
      changedLines: new Map([["src/lib/rating-label.ts", range(1, lineCount)]]),
      coverage: parseCoverageJson(fixtureCoverage, ["/repo"], "fixture"),
      policy: changedCoveragePolicy,
      readFile: () => fixtureSource,
    });
    expect(result.passed).toBe(false);
    expect(result.files).toEqual([
      expect.objectContaining({
        file: "src/lib/rating-label.ts",
        coveredChangedLines: 10,
        coverableChangedLines: 19,
        uncoveredLines: range(11, 19),
      }),
    ]);
    const report = formatTextReport(result, {
      baseRef: "origin/main",
      mergeBase: "0123456789abcdef0123456789abcdef01234567",
      policy: changedCoveragePolicy,
    });
    expect(report).toContain("src/lib/rating-label.ts");
    expect(report).toContain("11-19");
    expect(report).toContain("52.63%");
    expect(report).toContain("FAIL: changed-code coverage requirements are not met");
  });
});

describe("reports", () => {
  const context = {
    baseRef: "origin/main",
    mergeBase: "0123456789abcdef0123456789abcdef01234567",
    policy: testPolicy,
  };

  it("renders a passing report with no coverable changes", () => {
    const result = evaluate(new Map(), new Map([["src/a.ts", lineCoverage(1, [1])]]));
    expect(formatTextReport(result, context)).toContain("No coverable changed source lines.");
    expect(formatTextReport(result, context)).toContain("PASS");
    expect(formatMarkdownReport(result, context)).toContain("### Changed-code coverage: PASS");
  });

  it("renders a failing markdown summary for reviewers", () => {
    const result = evaluate(
      new Map([
        ["src/a.ts", range(1, 4)],
        ["src/generated/x.ts", [1]],
      ]),
      new Map([["src/a.ts", lineCoverage(4, [1])]]),
    );
    const markdown = formatMarkdownReport(result, context);
    expect(markdown).toContain("### Changed-code coverage: FAIL");
    expect(markdown).toContain("| src/a.ts | 1 / 4 | 25.00% | 2-4 |");
    expect(markdown).toContain("**Failures:**");
    expect(markdown).toContain("Not gated (1)");
  });
});

describe("parseCliArgs", () => {
  it("defaults to origin/main and the Jest coverage file", () => {
    expect(parseCliArgs([], {})).toEqual({
      baseRef: "origin/main",
      coverageFile: "coverage/coverage-final.json",
      summaryFile: null,
    });
  });

  it("accepts flags, inline values and CI environment", () => {
    expect(
      parseCliArgs(["--base", "origin/dev", "--coverage=out/c.json"], {
        GITHUB_STEP_SUMMARY: "/tmp/summary.md",
      }),
    ).toEqual({ baseRef: "origin/dev", coverageFile: "out/c.json", summaryFile: "/tmp/summary.md" });
    expect(parseCliArgs([], { CHANGED_COVERAGE_BASE: "upstream/main" }).baseRef).toBe(
      "upstream/main",
    );
  });

  it("rejects unknown arguments and missing values", () => {
    expect(() => parseCliArgs(["--threshold", "1"], {})).toThrow(/Unknown argument/);
    expect(() => parseCliArgs(["--base"], {})).toThrow(/Missing value for --base/);
  });
});

describe("against a real git repository", () => {
  // Isolate git from the developer's own config with a real, empty config file.
  // os.devNull is not portable here: Git on Windows rejects "\\.\nul" as GIT_CONFIG_GLOBAL.
  let configDir: string;
  let gitEnv: NodeJS.ProcessEnv;
  let repo: string;

  beforeAll(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "changed-coverage-gitconfig-"));
    const emptyGlobalConfig = path.join(configDir, "gitconfig");
    fs.writeFileSync(emptyGlobalConfig, "");
    gitEnv = {
      ...process.env,
      GIT_CONFIG_GLOBAL: emptyGlobalConfig,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Coverage Gate Test",
      GIT_AUTHOR_EMAIL: "gate@example.invalid",
      GIT_COMMITTER_NAME: "Coverage Gate Test",
      GIT_COMMITTER_EMAIL: "gate@example.invalid",
    };
  });

  afterAll(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, env: gitEnv, encoding: "utf8", stdio: "pipe" });
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), content);
  };
  const lines = (count: number, prefix = "export const v") =>
    Array.from({ length: count }, (_, index) => `${prefix}${index} = ${index};`).join("\n") + "\n";

  beforeEach(() => {
    repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "changed-coverage-")));
    git("init", "--quiet", "--initial-branch=main");
    write("src/kept.ts", lines(5));
    write("src/renamed-before.ts", lines(8, "export const r"));
    write("src/deleted.ts", lines(3));
    git("add", ".");
    git("commit", "--quiet", "--no-gpg-sign", "-m", "base");
    git("checkout", "--quiet", "-b", "feature");
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  const readFile = (file: string) => fs.readFileSync(path.join(repo, file), "utf8");

  it("collects committed, uncommitted and untracked changes; ignores deletes and renames", () => {
    write("src/kept.ts", lines(5).replace("v2 = 2", "v2 = 22"));
    git("mv", "src/renamed-before.ts", "src/renamed-after.ts");
    git("rm", "--quiet", "src/deleted.ts");
    write("src/committed-new.ts", lines(2, "export const n"));
    git("add", ".");
    git("commit", "--quiet", "--no-gpg-sign", "-m", "feature work");
    write("src/committed-new.ts", lines(3, "export const n"));
    write("src/untracked.ts", lines(4));
    write("docs/notes.md", "# notes\n");

    const { mergeBase, changedLines } = collectChangedLines({
      baseRef: "main",
      git: createGitRunner(repo),
      readFile,
    });

    expect(mergeBase).toBe(git("rev-parse", "main").trim());
    expect(Object.fromEntries(changedLines)).toEqual({
      "docs/notes.md": [1],
      "src/committed-new.ts": [1, 2, 3],
      "src/kept.ts": [3],
      "src/untracked.ts": [1, 2, 3, 4],
    });
  });

  it("treats a moved file as a rename and counts only the lines edited after the move", () => {
    fs.mkdirSync(path.join(repo, "src/lib"));
    git("mv", "src/renamed-before.ts", "src/lib/moved.ts");
    write("src/lib/moved.ts", lines(8, "export const r").replace("r7 = 7", "r7 = 77"));

    const { changedLines } = collectChangedLines({
      baseRef: "main",
      git: createGitRunner(repo),
      readFile,
    });

    expect(Object.fromEntries(changedLines)).toEqual({ "src/lib/moved.ts": [8] });
  });

  it("explains how to fix a missing base ref", () => {
    expect(() =>
      collectChangedLines({ baseRef: "origin/missing", git: createGitRunner(repo), readFile }),
    ).toThrow(/git fetch origin main/);
  });

  describe("runCli", () => {
    const capture = () => {
      const output = { stdout: "", stderr: "" };
      return {
        output,
        io: {
          stdout: (text: string) => (output.stdout += text),
          stderr: (text: string) => (output.stderr += text),
        },
      };
    };

    const writeCoverage = (entries: Record<string, number[]>, totals: Record<string, number>) => {
      const json: Record<string, unknown> = {};
      for (const [file, executed] of Object.entries(entries)) {
        const coverage = lineCoverage(totals[file], executed);
        json[path.join(repo, file)] = {
          statementMap: Object.fromEntries(
            [...coverage.lines.keys()].map((line) => [
              String(line),
              { start: { line, column: 0 }, end: { line, column: 1 } },
            ]),
          ),
          s: Object.fromEntries([...coverage.lines].map(([line, count]) => [String(line), count])),
        };
      }
      write("coverage/coverage-final.json", JSON.stringify(json));
    };

    beforeEach(() => {
      write(".gitignore", "coverage/\n");
    });

    it("exits 0 and prints a report when changes are covered", () => {
      write("src/kept.ts", lines(5).replace("v2 = 2", "v2 = 22"));
      writeCoverage({ "src/kept.ts": [1, 2, 3, 4, 5] }, { "src/kept.ts": 5 });
      const summary = path.join(repo, "summary.md");
      const { output, io } = capture();

      const code = runCli(["--base", "main", "--summary", summary], {}, io, {
        cwd: repo,
        policy: testPolicy,
      });

      expect(code).toBe(EXIT_PASS);
      expect(output.stdout).toContain("PASS");
      expect(fs.readFileSync(summary, "utf8")).toContain("### Changed-code coverage: PASS");
    });

    it("exits 1 for the deliberately under-tested fixture change", () => {
      write("src/lib/rating-label.ts", fs.readFileSync(path.join(FIXTURE_DIR, "rating-label.ts"), "utf8"));
      write(
        "coverage/coverage-final.json",
        fs.readFileSync(path.join(FIXTURE_DIR, "coverage-final.json"), "utf8"),
      );
      const { output, io } = capture();

      const code = runCli(["--base=main"], {}, io, { cwd: repo, policy: changedCoveragePolicy });

      expect(code).toBe(EXIT_BELOW_THRESHOLD);
      expect(output.stdout).toContain("src/lib/rating-label.ts");
      expect(output.stdout).toContain("11-19");
      expect(output.stdout).toContain("FAIL");
    });

    it("exits 2 with a clear error when coverage was not collected", () => {
      write("src/kept.ts", lines(6));
      const { output, io } = capture();

      const code = runCli(["--base", "main"], {}, io, { cwd: repo, policy: testPolicy });

      expect(code).toBe(EXIT_ERROR);
      expect(output.stderr).toContain("Coverage file not found");
      expect(output.stdout).toBe("");
    });

    // Raw JSON text, so values like 1e309 reach the gate exactly as a corrupt report would.
    const statement = (line: string | number, count: string | number) =>
      `{"statementMap":{"0":{"start":{"line":${line},"column":0},"end":{"line":${line},` +
      `"column":1}}},"s":{"0":${count}}}`;

    it.each([
      ["an overflowing count (1e309 parses to Infinity)", statement(1, "1e309"), /invalid s count "0" \(Infinity\)/],
      ["a negative count", statement(1, -1), /invalid s count "0" \(-1\)/],
      ["a fractional count", statement(1, 0.5), /invalid s count "0" \(0.5\)/],
      ["a statement on line 0", statement(0, 1), /malformed statement "0"/],
      ["a negative line", statement(-3, 1), /malformed statement "0"/],
      ["a fractional line", statement(1.5, 1), /malformed statement "0"/],
      ["an overflowing line", statement("1e309", 1), /malformed statement "0"/],
    ])("exits 2 for a report with %s", (_label, fileJson, message) => {
      write("src/kept.ts", lines(5).replace("v2 = 2", "v2 = 22"));
      write("coverage/coverage-final.json", `{${JSON.stringify(path.join(repo, "src/kept.ts"))}:${fileJson}}`);
      const { output, io } = capture();

      const code = runCli(["--base", "main"], {}, io, { cwd: repo, policy: testPolicy });

      expect(code).toBe(EXIT_ERROR);
      expect(output.stderr).toMatch(message);
      expect(output.stdout).toBe("");
    });

    it("exits 2 when a changed runtime module has an empty coverage entry", () => {
      write("src/kept.ts", lines(5).replace("v2 = 2", "v2 = 22"));
      write(
        "coverage/coverage-final.json",
        JSON.stringify({ [path.join(repo, "src/kept.ts")]: { statementMap: {}, s: {} } }),
      );
      const { output, io } = capture();

      const code = runCli(["--base", "main"], {}, io, { cwd: repo, policy: testPolicy });

      expect(code).toBe(EXIT_ERROR);
      expect(output.stderr).toContain("report is unusable");
      expect(output.stderr).toContain("src/kept.ts");
      expect(output.stdout).toBe("");
    });

    it("exits 0 when a changed type-only module has an empty coverage entry", () => {
      write("src/types/review.ts", "export interface Review {\n  id: string;\n}\n");
      write(
        "coverage/coverage-final.json",
        JSON.stringify({ [path.join(repo, "src/types/review.ts")]: { statementMap: {}, s: {} } }),
      );
      const { output, io } = capture();

      const code = runCli(["--base", "main"], {}, io, { cwd: repo, policy: testPolicy });

      expect(code).toBe(EXIT_PASS);
      expect(output.stdout).toContain("src/types/review.ts (type-only module");
    });

    it("exits 2 for an unknown argument", () => {
      const { output, io } = capture();
      expect(runCli(["--nope"], {}, io, { cwd: repo, policy: testPolicy })).toBe(EXIT_ERROR);
      expect(output.stderr).toContain("Unknown argument");
    });

    it("lets unexpected programming errors surface", () => {
      const { io } = capture();
      expect(() =>
        runCli([], {}, io, {
          cwd: repo,
          policy: testPolicy,
          git: () => {
            throw new TypeError("boom");
          },
        }),
      ).toThrow("boom");
    });

    it("runs the real entry point under this Node version with type stripping", () => {
      write("src/new-untested.ts", lines(4));
      writeCoverage({ "src/new-untested.ts": [] }, { "src/new-untested.ts": 4 });

      const run = spawnSync(
        process.execPath,
        [
          "--disable-warning=ExperimentalWarning",
          "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
          CLI_ENTRY,
          "--base",
          "main",
        ],
        { cwd: repo, encoding: "utf8", env: { ...gitEnv, GITHUB_STEP_SUMMARY: "" } },
      );

      expect(run.stderr).toBe("");
      expect(run.status).toBe(EXIT_BELOW_THRESHOLD);
      expect(run.stdout).toContain("src/new-untested.ts");
      expect(run.stdout).toContain("none of its 4 changed lines are executed");
    });
  });
});

describe("repository policy", () => {
  it("mirrors collectCoverageFrom in jest.config.ts", () => {
    const jestConfig = fs.readFileSync(path.join(REPO_ROOT, "jest.config.ts"), "utf8");
    const block = /collectCoverageFrom:\s*\[([\s\S]*?)\]/.exec(jestConfig)?.[1] ?? "";
    const patterns = [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(patterns.filter((pattern) => !pattern.startsWith("!"))).toEqual(
      changedCoveragePolicy.include,
    );
    expect(
      patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => pattern.slice(1)),
    ).toEqual(changedCoveragePolicy.notMeasured.map((rule) => rule.pattern));
  });

  it("gives every exclusion and path threshold a reason and keeps the agreed thresholds", () => {
    expect(changedCoveragePolicy.minimumLinePercent).toBe(80);
    expect(
      changedCoveragePolicy.pathThresholds.find((rule) => rule.pattern === "src/services/qa/**")
        ?.minimumLinePercent,
    ).toBe(90);
    expect(changedCoveragePolicy.failFilesWithNoCoveredChangedLines).toBe(true);
    for (const rule of [
      ...changedCoveragePolicy.exclusions,
      ...changedCoveragePolicy.notMeasured,
      ...changedCoveragePolicy.pathThresholds,
    ]) {
      expect(rule.reason.trim().length).toBeGreaterThan(10);
      expect(() => globToRegExp(rule.pattern)).not.toThrow();
    }
    for (const rule of changedCoveragePolicy.pathThresholds) {
      expect(rule.minimumLinePercent).toBeGreaterThanOrEqual(changedCoveragePolicy.minimumLinePercent);
    }
  });
});
