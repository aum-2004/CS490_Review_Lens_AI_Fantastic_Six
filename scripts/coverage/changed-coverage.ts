// S2-001: changed-code coverage gate.
//
// Combines Jest's Istanbul-format coverage (coverage/coverage-final.json) with
// `git diff` against the merge-base of a base ref, and fails when the lines a
// change adds or modifies are not exercised by the automated test suite.
//
// All logic lives here so Jest can test it. check-changed-coverage.ts is only
// the process entry point. This module must stay runnable by Node's built-in
// TypeScript type stripping: use `import type` for types and no enums,
// namespaces or constructor parameter properties.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const DEFAULT_BASE_REF = "origin/main";
export const DEFAULT_COVERAGE_FILE = "coverage/coverage-final.json";

export const EXIT_PASS = 0;
export const EXIT_BELOW_THRESHOLD = 1;
export const EXIT_ERROR = 2;

export type PatternRule = {
  pattern: string;
  reason: string;
};

export type PathThreshold = PatternRule & {
  minimumLinePercent: number;
};

export type ChangedCoveragePolicy = {
  /** Minimum percentage of coverable changed lines, across the whole change, that tests execute. */
  minimumLinePercent: number;
  /** Fail any changed file whose coverable changed lines are all unexecuted. */
  failFilesWithNoCoveredChangedLines: boolean;
  /** Files the gate measures. Must mirror `collectCoverageFrom` in jest.config.ts. */
  include: string[];
  /** Files Jest never measures (the negated `collectCoverageFrom` patterns). */
  notMeasured: PatternRule[];
  /** Stricter (or different) aggregate thresholds for specific areas. */
  pathThresholds: PathThreshold[];
  /** Team-approved exclusions. Every entry must carry a reviewable reason. */
  exclusions: PatternRule[];
};

/** Thrown for configuration and input problems. These never count as a pass. */
export class ChangedCoverageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChangedCoverageError";
  }
}

// ---------------------------------------------------------------------------
// Glob matching (small, dependency-free subset: `**`, `*`, `?`, `{a,b}`)
// ---------------------------------------------------------------------------

export function globToRegExp(glob: string): RegExp {
  let source = "";
  let braceDepth = 0;
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        const followedBySlash = glob[index + 2] === "/";
        // `**/` matches zero or more whole directories; a bare `**` matches anything.
        source += followedBySlash ? "(?:[^/]+/)*" : ".*";
        index += followedBySlash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      braceDepth += 1;
      source += "(?:";
    } else if (char === "}" && braceDepth > 0) {
      braceDepth -= 1;
      source += ")";
    } else if (char === "," && braceDepth > 0) {
      source += "|";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  if (braceDepth !== 0) {
    throw new ChangedCoverageError(`Invalid glob pattern (unbalanced braces): ${glob}`);
  }
  return new RegExp(`^${source}$`);
}

export function matchesGlob(filePath: string, glob: string): boolean {
  return globToRegExp(glob).test(filePath);
}

function findRule<T extends PatternRule>(filePath: string, rules: T[]): T | undefined {
  return rules.find((rule) => matchesGlob(filePath, rule.pattern));
}

// ---------------------------------------------------------------------------
// Diff parsing
// ---------------------------------------------------------------------------

/** Repo-relative POSIX path -> sorted, de-duplicated changed line numbers. */
export type ChangedLines = Map<string, number[]>;

function unquoteGitPath(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
}

/**
 * Parses `git diff --unified=0` output into the line numbers each file has in
 * its *new* version. Deleted files and pure renames contribute no lines.
 */
export function parseUnifiedDiff(diffText: string): ChangedLines {
  const result = new Map<string, Set<number>>();
  let currentFile: string | null = null;
  let inFileHeader = false;

  for (const line of diffText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      currentFile = null;
      inFileHeader = true;
      continue;
    }
    if (inFileHeader && line.startsWith("+++ ")) {
      const target = unquoteGitPath(line.slice(4).replace(/\t$/, ""));
      currentFile = target === "/dev/null" ? null : target.replace(/^b\//, "");
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunk) {
      inFileHeader = false;
      if (currentFile === null) continue;
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      const lines = result.get(currentFile) ?? new Set<number>();
      for (let lineNumber = start; lineNumber < start + count; lineNumber += 1) {
        lines.add(lineNumber);
      }
      result.set(currentFile, lines);
    }
  }

  return new Map(
    [...result.entries()]
      .filter(([, lines]) => lines.size > 0)
      .map(([file, lines]) => [file, [...lines].sort((a, b) => a - b)]),
  );
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  const lines = text.split("\n");
  return lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
}

export type GitRunner = (args: string[]) => string;

export function createGitRunner(cwd: string): GitRunner {
  return (args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
}

export type ChangeSet = {
  mergeBase: string;
  changedLines: ChangedLines;
};

/**
 * Lines added or modified relative to the merge-base of `baseRef` and HEAD,
 * including uncommitted and untracked work so a local run matches the PR.
 */
export function collectChangedLines(options: {
  baseRef: string;
  git: GitRunner;
  readFile: (repoRelativePath: string) => string;
}): ChangeSet {
  const { baseRef, git, readFile } = options;
  let mergeBase: string;
  try {
    mergeBase = git(["merge-base", baseRef, "HEAD"]).trim();
  } catch {
    throw new ChangedCoverageError(
      `Could not find a merge-base between "${baseRef}" and HEAD. Fetch the base branch ` +
        `(for example \`git fetch origin main\`) and make sure the clone has full history ` +
        `(CI checkout needs fetch-depth: 0).`,
    );
  }
  if (!/^[0-9a-f]{40,64}$/.test(mergeBase)) {
    throw new ChangedCoverageError(`Unexpected merge-base output for "${baseRef}": ${mergeBase}`);
  }

  const diff = git([
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--unified=0",
    "--find-renames",
    "--diff-filter=d",
    mergeBase,
    "--",
  ]);
  const changedLines = parseUnifiedDiff(diff);

  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter((file) => file.length > 0);
  for (const file of untracked) {
    const lineCount = countLines(readFile(file));
    if (lineCount > 0) {
      changedLines.set(
        file,
        Array.from({ length: lineCount }, (_, index) => index + 1),
      );
    }
  }

  return { mergeBase, changedLines };
}

// ---------------------------------------------------------------------------
// Coverage loading
// ---------------------------------------------------------------------------

type IstanbulLocation = { start: { line: number }; end: { line: number } };

type IstanbulFileCoverage = {
  statementMap: Record<string, IstanbulLocation>;
  s: Record<string, number>;
  branchMap?: Record<string, { locations?: IstanbulLocation[]; loc?: IstanbulLocation }>;
  b?: Record<string, number[]>;
};

export type FileLineCoverage = {
  /** Coverable line -> execution count (Istanbul line semantics: statement start lines). */
  lines: Map<number, number>;
  /** Branch outcomes keyed by the line each outcome starts on. */
  branches: { line: number; covered: boolean }[];
};

export type CoverageMap = Map<string, FileLineCoverage>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocation(value: unknown): value is IstanbulLocation {
  return (
    isRecord(value) &&
    isRecord(value.start) &&
    typeof value.start.line === "number" &&
    isRecord(value.end) &&
    typeof value.end.line === "number"
  );
}

function toRepoPath(rootDir: string, coveredFile: string): string {
  const relative = path.relative(rootDir, path.resolve(rootDir, coveredFile));
  return relative.split(path.sep).join("/");
}

/** Parses Jest's coverage-final.json, refusing anything that is not usable coverage. */
export function parseCoverageJson(
  jsonText: string,
  rootDirs: string[],
  sourceLabel: string,
): CoverageMap {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new ChangedCoverageError(
      `Coverage file ${sourceLabel} is not valid JSON (${(error as Error).message}). ` +
        `Re-run the tests with coverage.`,
    );
  }
  if (!isRecord(parsed)) {
    throw new ChangedCoverageError(
      `Coverage file ${sourceLabel} must contain an object keyed by file path.`,
    );
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    throw new ChangedCoverageError(
      `Coverage file ${sourceLabel} contains no files. Coverage was not collected.`,
    );
  }

  const coverage: CoverageMap = new Map();
  for (const [key, value] of entries) {
    if (!isRecord(value) || !isRecord(value.statementMap) || !isRecord(value.s)) {
      throw new ChangedCoverageError(
        `Coverage entry "${key}" in ${sourceLabel} is malformed (missing statementMap or s).`,
      );
    }
    const fileCoverage = value as IstanbulFileCoverage;
    const lines = new Map<number, number>();
    for (const [id, location] of Object.entries(fileCoverage.statementMap)) {
      const count = fileCoverage.s[id];
      if (!isLocation(location) || typeof count !== "number") {
        throw new ChangedCoverageError(
          `Coverage entry "${key}" in ${sourceLabel} has a malformed statement "${id}".`,
        );
      }
      const line = location.start.line;
      lines.set(line, Math.max(lines.get(line) ?? 0, count));
    }

    const branches: FileLineCoverage["branches"] = [];
    for (const [id, branch] of Object.entries(fileCoverage.branchMap ?? {})) {
      const counts = fileCoverage.b?.[id];
      const locations = branch.locations ?? [];
      locations.forEach((location, index) => {
        const loc = isLocation(location) ? location : branch.loc;
        if (isLocation(loc) && Array.isArray(counts) && typeof counts[index] === "number") {
          branches.push({ line: loc.start.line, covered: counts[index] > 0 });
        }
      });
    }

    const coveredFile = typeof value.path === "string" ? value.path : key;
    const candidates = rootDirs.map((root) => toRepoPath(root, coveredFile));
    const repoPath = candidates.find((candidate) => !candidate.startsWith("..")) ?? candidates[0];
    coverage.set(repoPath, { lines, branches });
  }
  return coverage;
}

export function loadCoverageFile(coverageFile: string, rootDir: string): CoverageMap {
  let jsonText: string;
  try {
    jsonText = fs.readFileSync(coverageFile, "utf8");
  } catch {
    throw new ChangedCoverageError(
      `Coverage file not found: ${coverageFile}. Run \`npm run coverage:changed\` (runs the ` +
        `tests with coverage first) or \`npm run test:coverage\` before \`coverage:changed:check\`.`,
    );
  }
  const roots = [rootDir];
  try {
    roots.push(fs.realpathSync(rootDir));
  } catch {
    // The real path is only a fallback for symlinked checkouts.
  }
  return parseCoverageJson(jsonText, roots, coverageFile);
}

// ---------------------------------------------------------------------------
// Type-only module detection
// ---------------------------------------------------------------------------

/**
 * True when a TypeScript module emits no runtime code (only types, interfaces
 * and type imports/exports). Such files are never loaded by tests, so V8
 * reports every line as unexecuted even though there is nothing to execute.
 */
export function isTypeOnlyModule(source: string, fileName: string): boolean {
  const output = ts.transpileModule(source, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.Preserve,
      removeComments: true,
    },
    reportDiagnostics: false,
  }).outputText;
  const emitted = ts.createSourceFile("emitted.js", output, ts.ScriptTarget.ES2022, false);
  return emitted.statements.every(
    (statement) =>
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.length === 0,
  );
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type FileResult = {
  file: string;
  coverableChangedLines: number;
  coveredChangedLines: number;
  uncoveredLines: number[];
  changedBranches: number;
  coveredChangedBranches: number;
};

export type SkippedFile = {
  file: string;
  reason: string;
};

export type Failure = {
  kind: "overall" | "path-threshold" | "uncovered-file";
  message: string;
};

export type ChangedCoverageResult = {
  passed: boolean;
  files: FileResult[];
  skipped: SkippedFile[];
  totals: {
    coverableChangedLines: number;
    coveredChangedLines: number;
    percent: number | null;
    changedBranches: number;
    coveredChangedBranches: number;
  };
  pathResults: {
    pattern: string;
    minimumLinePercent: number;
    coverable: number;
    covered: number;
    percent: number | null;
  }[];
  failures: Failure[];
};

export function percent(covered: number, total: number): number | null {
  return total === 0 ? null : Math.floor((covered / total) * 10000) / 100;
}

export function evaluateChangedCoverage(options: {
  changedLines: ChangedLines;
  coverage: CoverageMap;
  policy: ChangedCoveragePolicy;
  readFile: (repoRelativePath: string) => string;
}): ChangedCoverageResult {
  const { changedLines, coverage, policy, readFile } = options;
  const files: FileResult[] = [];
  const skipped: SkippedFile[] = [];
  const missingFromCoverage: string[] = [];

  for (const [file, lines] of [...changedLines.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!policy.include.some((pattern) => matchesGlob(file, pattern))) continue;

    const notMeasured = findRule(file, policy.notMeasured);
    if (notMeasured) {
      skipped.push({ file, reason: notMeasured.reason });
      continue;
    }
    const exclusion = findRule(file, policy.exclusions);
    if (exclusion) {
      skipped.push({ file, reason: `excluded: ${exclusion.reason}` });
      continue;
    }

    const fileCoverage = coverage.get(file);
    if (!fileCoverage) {
      missingFromCoverage.push(file);
      continue;
    }

    const changed = new Set(lines);
    const coverable = lines.filter((line) => fileCoverage.lines.has(line));
    const uncoveredLines = coverable.filter((line) => (fileCoverage.lines.get(line) ?? 0) === 0);
    const changedBranchOutcomes = fileCoverage.branches.filter((branch) =>
      changed.has(branch.line),
    );

    if (coverable.length === 0) {
      skipped.push({ file, reason: "no executable changed lines" });
      continue;
    }
    if (uncoveredLines.length === coverable.length && isTypeOnlyModule(readFile(file), file)) {
      skipped.push({ file, reason: "type-only module (emits no runtime code)" });
      continue;
    }

    files.push({
      file,
      coverableChangedLines: coverable.length,
      coveredChangedLines: coverable.length - uncoveredLines.length,
      uncoveredLines,
      changedBranches: changedBranchOutcomes.length,
      coveredChangedBranches: changedBranchOutcomes.filter((branch) => branch.covered).length,
    });
  }

  if (missingFromCoverage.length > 0) {
    throw new ChangedCoverageError(
      `These changed source files have no entry in the coverage report: ` +
        `${missingFromCoverage.join(", ")}. The report is stale or was produced by a partial ` +
        `test run. Re-run the full suite with coverage (\`npm run coverage:changed\`).`,
    );
  }

  const sum = (pick: (file: FileResult) => number, subset = files) =>
    subset.reduce((total, file) => total + pick(file), 0);
  const coverableChangedLines = sum((file) => file.coverableChangedLines);
  const coveredChangedLines = sum((file) => file.coveredChangedLines);
  const overallPercent = percent(coveredChangedLines, coverableChangedLines);

  const failures: Failure[] = [];
  if (overallPercent !== null && overallPercent < policy.minimumLinePercent) {
    failures.push({
      kind: "overall",
      message:
        `Changed-line coverage is ${overallPercent}% (${coveredChangedLines}/` +
        `${coverableChangedLines}); the required minimum is ${policy.minimumLinePercent}%.`,
    });
  }

  const pathResults = policy.pathThresholds.map((rule) => {
    const subset = files.filter((file) => matchesGlob(file.file, rule.pattern));
    const coverable = sum((file) => file.coverableChangedLines, subset);
    const covered = sum((file) => file.coveredChangedLines, subset);
    const rulePercent = percent(covered, coverable);
    if (rulePercent !== null && rulePercent < rule.minimumLinePercent) {
      failures.push({
        kind: "path-threshold",
        message:
          `Changed-line coverage for ${rule.pattern} is ${rulePercent}% (${covered}/` +
          `${coverable}); the required minimum there is ${rule.minimumLinePercent}% ` +
          `(${rule.reason}).`,
      });
    }
    return {
      pattern: rule.pattern,
      minimumLinePercent: rule.minimumLinePercent,
      coverable,
      covered,
      percent: rulePercent,
    };
  });

  if (policy.failFilesWithNoCoveredChangedLines) {
    for (const file of files.filter((result) => result.coveredChangedLines === 0)) {
      failures.push({
        kind: "uncovered-file",
        message:
          `${file.file}: none of its ${file.coverableChangedLines} changed lines are executed ` +
          `by any test (lines ${formatLineRanges(file.uncoveredLines)}).`,
      });
    }
  }

  return {
    passed: failures.length === 0,
    files,
    skipped,
    totals: {
      coverableChangedLines,
      coveredChangedLines,
      percent: overallPercent,
      changedBranches: sum((file) => file.changedBranches),
      coveredChangedBranches: sum((file) => file.coveredChangedBranches),
    },
    pathResults,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

export function formatLineRanges(lines: number[]): string {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const ranges: string[] = [];
  let index = 0;
  while (index < sorted.length) {
    const start = sorted[index];
    let end = start;
    while (index + 1 < sorted.length && sorted[index + 1] === end + 1) {
      index += 1;
      end = sorted[index];
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    index += 1;
  }
  return ranges.join(", ");
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(2)}%`;
}

export type ReportContext = {
  baseRef: string;
  mergeBase: string;
  policy: ChangedCoveragePolicy;
};

function policyLine(policy: ChangedCoveragePolicy): string {
  const parts = [`at least ${policy.minimumLinePercent}% of coverable changed lines`];
  for (const rule of policy.pathThresholds) {
    parts.push(`${rule.minimumLinePercent}% within ${rule.pattern}`);
  }
  if (policy.failFilesWithNoCoveredChangedLines) {
    parts.push("no changed file may have 0% changed-line coverage");
  }
  return parts.join("; ");
}

export function formatTextReport(result: ChangedCoverageResult, context: ReportContext): string {
  const out: string[] = [];
  out.push(
    `Changed-code coverage (S2-001) vs ${context.baseRef} (merge-base ` +
      `${context.mergeBase.slice(0, 12)})`,
  );
  out.push(`Policy: ${policyLine(context.policy)}.`);
  out.push("");

  if (result.files.length === 0) {
    out.push("No coverable changed source lines. Nothing to gate.");
  } else {
    const width = Math.max(4, ...result.files.map((file) => file.file.length));
    out.push(`${"File".padEnd(width)}  Covered/Changed  Line %   Uncovered changed lines`);
    for (const file of result.files) {
      const ratio = `${file.coveredChangedLines}/${file.coverableChangedLines}`;
      const filePercent = percent(file.coveredChangedLines, file.coverableChangedLines);
      out.push(
        `${file.file.padEnd(width)}  ${ratio.padStart(15)}  ${formatPercent(filePercent).padStart(
          7,
        )}  ${file.uncoveredLines.length > 0 ? formatLineRanges(file.uncoveredLines) : "-"}`,
      );
    }
    out.push("");
    out.push(
      `Overall changed-line coverage: ${formatPercent(result.totals.percent)} ` +
        `(${result.totals.coveredChangedLines}/${result.totals.coverableChangedLines}); ` +
        `required ${context.policy.minimumLinePercent}%.`,
    );
    for (const pathResult of result.pathResults.filter((entry) => entry.coverable > 0)) {
      out.push(
        `${pathResult.pattern}: ${formatPercent(pathResult.percent)} ` +
          `(${pathResult.covered}/${pathResult.coverable}); required ` +
          `${pathResult.minimumLinePercent}%.`,
      );
    }
    out.push(
      `Changed branch outcomes covered (informational, not gated): ` +
        `${result.totals.coveredChangedBranches}/${result.totals.changedBranches}.`,
    );
  }

  if (result.skipped.length > 0) {
    out.push("");
    out.push("Not gated:");
    for (const skipped of result.skipped) out.push(`  ${skipped.file} (${skipped.reason})`);
  }

  out.push("");
  if (result.passed) {
    out.push("PASS: changed-code coverage requirements are met.");
  } else {
    out.push("FAIL: changed-code coverage requirements are not met:");
    for (const failure of result.failures) out.push(`  - ${failure.message}`);
    out.push("");
    out.push(
      "Add or extend tests that execute the uncovered lines listed above, then re-run " +
        "`npm run coverage:changed`. See docs/changed-code-coverage.md.",
    );
  }
  return `${out.join("\n")}\n`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[|`*_]/g, (char) => `\\${char}`);
}

export function formatMarkdownReport(
  result: ChangedCoverageResult,
  context: ReportContext,
): string {
  const out: string[] = [];
  out.push(`### Changed-code coverage: ${result.passed ? "PASS" : "FAIL"}`);
  out.push("");
  out.push(
    `Compared with \`${context.baseRef}\` (merge-base \`${context.mergeBase.slice(0, 12)}\`). ` +
      `Policy: ${escapeMarkdown(policyLine(context.policy))}.`,
  );
  out.push("");
  if (result.files.length === 0) {
    out.push("No coverable changed source lines.");
  } else {
    out.push(
      `**Overall:** ${formatPercent(result.totals.percent)} ` +
        `(${result.totals.coveredChangedLines}/${result.totals.coverableChangedLines} changed lines)`,
    );
    out.push("");
    out.push("| File | Covered / changed | Line % | Uncovered changed lines |");
    out.push("| --- | ---: | ---: | --- |");
    for (const file of result.files) {
      out.push(
        `| ${escapeMarkdown(file.file)} | ${file.coveredChangedLines} / ` +
          `${file.coverableChangedLines} | ${formatPercent(
            percent(file.coveredChangedLines, file.coverableChangedLines),
          )} | ${file.uncoveredLines.length > 0 ? formatLineRanges(file.uncoveredLines) : "-"} |`,
      );
    }
  }
  if (result.failures.length > 0) {
    out.push("");
    out.push("**Failures:**");
    for (const failure of result.failures) out.push(`- ${escapeMarkdown(failure.message)}`);
  }
  if (result.skipped.length > 0) {
    out.push("");
    out.push(
      `<details><summary>Not gated (${result.skipped.length})</summary>\n\n` +
        result.skipped
          .map((skipped) => `- ${escapeMarkdown(skipped.file)}: ${escapeMarkdown(skipped.reason)}`)
          .join("\n") +
        "\n\n</details>",
    );
  }
  return `${out.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// CLI orchestration (the entry point only wires process I/O to this)
// ---------------------------------------------------------------------------

export type Environment = Readonly<Record<string, string | undefined>>;

export type CliOptions = {
  baseRef: string;
  coverageFile: string;
  summaryFile: string | null;
};

export function parseCliArgs(argv: string[], env: Environment): CliOptions {
  const options: CliOptions = {
    baseRef: env.CHANGED_COVERAGE_BASE || DEFAULT_BASE_REF,
    coverageFile: DEFAULT_COVERAGE_FILE,
    summaryFile: env.GITHUB_STEP_SUMMARY || null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equals = arg.indexOf("=");
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : arg.slice(equals + 1);
    const takeValue = () => {
      const value = inlineValue ?? argv[(index += 1)];
      if (value === undefined || value === "") {
        throw new ChangedCoverageError(`Missing value for ${flag}.`);
      }
      return value;
    };
    if (flag === "--base") options.baseRef = takeValue();
    else if (flag === "--coverage") options.coverageFile = takeValue();
    else if (flag === "--summary") options.summaryFile = takeValue();
    else {
      throw new ChangedCoverageError(
        `Unknown argument "${arg}". Usage: coverage:changed:check ` +
          `[--base <ref>] [--coverage <coverage-final.json>] [--summary <file.md>]`,
      );
    }
  }
  return options;
}

export type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type CliDependencies = {
  cwd: string;
  policy: ChangedCoveragePolicy;
  git?: GitRunner;
};

export function runCli(
  argv: string[],
  env: Environment,
  io: CliIo,
  dependencies: CliDependencies,
): number {
  try {
    const options = parseCliArgs(argv, env);
    const git = dependencies.git ?? createGitRunner(dependencies.cwd);
    const rootDir = git(["rev-parse", "--show-toplevel"]).trim();
    const readFile = (file: string) => fs.readFileSync(path.join(rootDir, file), "utf8");

    const coverage = loadCoverageFile(path.resolve(dependencies.cwd, options.coverageFile), rootDir);
    const { mergeBase, changedLines } = collectChangedLines({
      baseRef: options.baseRef,
      git,
      readFile,
    });
    const result = evaluateChangedCoverage({
      changedLines,
      coverage,
      policy: dependencies.policy,
      readFile,
    });
    const context = { baseRef: options.baseRef, mergeBase, policy: dependencies.policy };

    io.stdout(formatTextReport(result, context));
    if (options.summaryFile) {
      fs.appendFileSync(options.summaryFile, formatMarkdownReport(result, context));
    }
    return result.passed ? EXIT_PASS : EXIT_BELOW_THRESHOLD;
  } catch (error) {
    if (error instanceof ChangedCoverageError) {
      io.stderr(`Changed-code coverage check could not run: ${error.message}\n`);
      return EXIT_ERROR;
    }
    throw error;
  }
}
