// Entry point for `npm run coverage:changed:check`. Only wires process I/O; all
// behavior lives in ./changed-coverage.ts (unit-tested). Node runs this file
// directly with built-in type stripping, so sibling modules are loaded by URL.

import type * as ChangedCoverage from "./changed-coverage";
import type * as Policy from "./changed-coverage-policy";

const gate: typeof ChangedCoverage = await import(
  new URL("./changed-coverage.ts", import.meta.url).href
);
const { changedCoveragePolicy }: typeof Policy = await import(
  new URL("./changed-coverage-policy.ts", import.meta.url).href
);

process.exitCode = gate.runCli(
  process.argv.slice(2),
  process.env,
  { stdout: (text) => process.stdout.write(text), stderr: (text) => process.stderr.write(text) },
  { cwd: process.cwd(), policy: changedCoveragePolicy },
);
