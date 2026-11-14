// S2-001 changed-code coverage policy. Changes to this file are policy changes:
// they need a reason in the PR and teammate approval. See docs/changed-code-coverage.md.

import type { ChangedCoveragePolicy } from "./changed-coverage";

export const changedCoveragePolicy: ChangedCoveragePolicy = {
  minimumLinePercent: 80,
  failFilesWithNoCoveredChangedLines: true,

  // Mirrors `collectCoverageFrom` in jest.config.ts (a unit test keeps them in sync).
  include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
  notMeasured: [
    { pattern: "src/**/*.d.ts", reason: "declaration file; contains no runtime code" },
    {
      pattern: "src/app/layout.tsx",
      reason: "root layout already excluded from Jest coverage in jest.config.ts",
    },
  ],

  pathThresholds: [
    {
      pattern: "src/services/qa/**",
      minimumLinePercent: 90,
      reason: "Q&A orchestration layer must stay verified by deterministic tests (S2-BR-027-031)",
    },
  ],

  exclusions: [
    {
      pattern: "scripts/coverage/check-changed-coverage.ts",
      reason:
        "thin process entry point (argv/env/stdout wiring only, no logic); Jest cannot load its " +
        "top-level await and import.meta, and its behavior is verified by the subprocess test " +
        "in tests/unit/scripts/coverage/changed-coverage.test.ts",
    },
  ],
};
