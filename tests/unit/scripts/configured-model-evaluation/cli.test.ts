/** @jest-environment node */

import path from "node:path";

import {
  main,
  parseArguments,
  runCli,
  safeRunId,
} from "../../../../scripts/configured-model-evaluation/cli";

jest.mock("server-only", () => ({}));

describe("configured-model evaluation CLI", () => {
  const originalExitCode = process.exitCode;

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  function logger() {
    return { info: jest.fn(), error: jest.fn() };
  }

  it("defaults to an offline run with a generated safe run ID", async () => {
    const runEvaluation = jest.fn(async () => ({
      completed: true,
      completedAttempts: 36,
      externalRequests: 0,
      artifactDirectory: "test-artifacts",
      failure: null,
    }));
    const outputRoot = path.join(process.cwd(), "test-output");
    const log = logger();

    await main([], {
      outputRoot,
      now: () => new Date("2026-11-15T12:00:00.000Z"),
      runEvaluation,
      logger: log,
    });

    expect(runEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "offline",
        runId: "offline-2026-11-15T12-00-00-000Z",
        outputRoot: path.resolve(outputRoot),
        executePaid: false,
        authorizationConfirmed: false,
      }),
    );
    expect(log.info).toHaveBeenCalledWith("Completed logical attempts: 36/36");
    expect(log.info).toHaveBeenCalledWith("External API requests: 0/72");
    expect(log.error).not.toHaveBeenCalled();
  });

  it("passes both explicit paid flags and the run ID to the guarded runner", async () => {
    const runEvaluation = jest.fn(async () => ({
      completed: true,
      completedAttempts: 36,
      externalRequests: 72,
      artifactDirectory: "paid-artifacts",
      failure: null,
    }));

    await main(
      ["--execute-paid", "--confirm-aryan-approved-budget-and-run", "--run-id", "authorized-run"],
      { runEvaluation, logger: logger() },
    );

    expect(runEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "paid",
        runId: "authorized-run",
        executePaid: true,
        authorizationConfirmed: true,
      }),
    );
  });

  it("routes report rendering separately and prints both output paths", async () => {
    const renderReports = jest.fn(async () => ["issue-65-report.md", "issue-66-report.md"]);
    const runEvaluation = jest.fn();
    const log = logger();

    await main(["--render-report", "--run-id", "reviewed-run"], {
      renderReports,
      runEvaluation,
      logger: log,
    });

    expect(renderReports).toHaveBeenCalledWith(expect.any(String), "reviewed-run");
    expect(runEvaluation).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith("Rendered 2 independently assessed issue reports.");
    expect(log.info).toHaveBeenCalledWith("issue-65-report.md");
    expect(log.info).toHaveBeenCalledWith("issue-66-report.md");
  });

  it("rejects malformed and conflicting arguments before running anything", async () => {
    expect(() => parseArguments(["--unknown"])).toThrow(/Unknown/);
    expect(() => parseArguments(["--run-id"])).toThrow(/requires a value/);
    expect(() => safeRunId("../escape")).toThrow(/Run IDs/);
    await expect(main(["--render-report"])).rejects.toThrow(/requires --run-id/);
    await expect(
      main(["--render-report", "--execute-paid", "--run-id", "conflict"]),
    ).rejects.toThrow(/cannot be combined/);
  });

  it("reports failures safely without throwing or printing environment values", async () => {
    const log = logger();
    process.exitCode = 0;

    await runCli(["--unknown"], { logger: log });

    expect(process.exitCode).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      "Error/no-code: Unknown configured-model evaluation argument: --unknown",
    );
  });

  it("marks a stopped run unsuccessful and reports only safe failure metadata", async () => {
    const log = logger();
    process.exitCode = 0;
    const runEvaluation = jest.fn(async () => ({
      completed: false,
      completedAttempts: 0,
      externalRequests: 1,
      artifactDirectory: "partial-artifacts",
      failure: {
        stage: "token_count" as const,
        name: "QaModelError",
        code: "MODEL_UNAVAILABLE",
        message: "safe",
      },
    }));

    await main(["--run-id", "partial-run"], { runEvaluation, logger: log });

    expect(process.exitCode).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      "Evaluation stopped after the first failure (QaModelError/MODEL_UNAVAILABLE).",
    );
  });
});
