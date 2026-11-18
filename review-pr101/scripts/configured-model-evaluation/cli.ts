import path from "node:path";

import { renderIssueReports } from "./artifacts";
import {
  DEFAULT_EVALUATION_OUTPUT_ROOT,
  PAID_CONFIRMATION_FLAG,
  runConfiguredModelEvaluation,
} from "./runner";

interface CliOptions {
  readonly executePaid: boolean;
  readonly authorizationConfirmed: boolean;
  readonly renderReport: boolean;
  readonly runId: string | undefined;
}

export function parseArguments(args: readonly string[]): CliOptions {
  let executePaid = false;
  let authorizationConfirmed = false;
  let renderReport = false;
  let runId: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute-paid") executePaid = true;
    else if (argument === PAID_CONFIRMATION_FLAG) authorizationConfirmed = true;
    else if (argument === "--render-report") renderReport = true;
    else if (argument === "--run-id") {
      runId = args[index + 1];
      index += 1;
      if (!runId) throw new Error("--run-id requires a value.");
    } else {
      throw new Error(`Unknown configured-model evaluation argument: ${argument}`);
    }
  }
  return { executePaid, authorizationConfirmed, renderReport, runId };
}

export function safeRunId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)) {
    throw new Error("Run IDs may contain only letters, digits, dots, underscores, and hyphens.");
  }
  return value;
}

function defaultOfflineRunId(now: () => Date): string {
  return `offline-${now().toISOString().replaceAll(":", "-").replace(".", "-")}`;
}

export interface ConfiguredModelCliDependencies {
  readonly outputRoot?: string;
  readonly now?: () => Date;
  readonly runEvaluation?: typeof runConfiguredModelEvaluation;
  readonly renderReports?: typeof renderIssueReports;
  readonly logger?: Pick<Console, "info" | "error">;
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  dependencies: ConfiguredModelCliDependencies = {},
): Promise<void> {
  const options = parseArguments(args);
  const outputRoot = path.resolve(dependencies.outputRoot ?? DEFAULT_EVALUATION_OUTPUT_ROOT);
  const now = dependencies.now ?? (() => new Date());
  const runEvaluation = dependencies.runEvaluation ?? runConfiguredModelEvaluation;
  const renderReports = dependencies.renderReports ?? renderIssueReports;
  const logger = dependencies.logger ?? console;
  if (options.renderReport) {
    if (options.executePaid || options.authorizationConfirmed) {
      throw new Error("Report rendering cannot be combined with paid-execution flags.");
    }
    if (!options.runId) throw new Error("--render-report requires --run-id.");
    const reports = await renderReports(outputRoot, safeRunId(options.runId));
    logger.info(`Rendered ${reports.length} independently assessed issue reports.`);
    for (const report of reports) logger.info(report);
    return;
  }

  const paidIntent = options.executePaid || options.authorizationConfirmed;
  const runId = safeRunId(options.runId ?? defaultOfflineRunId(now));
  const result = await runEvaluation({
    mode: paidIntent ? "paid" : "offline",
    runId,
    outputRoot,
    executePaid: options.executePaid,
    authorizationConfirmed: options.authorizationConfirmed,
    env: process.env,
  });
  logger.info(`Configured-model evaluation artifacts: ${result.artifactDirectory}`);
  logger.info(`Completed logical attempts: ${result.completedAttempts}/36`);
  logger.info(`External API requests: ${result.externalRequests}/72`);
  if (!result.completed) {
    process.exitCode = 1;
    logger.error(
      `Evaluation stopped after the first failure (${result.failure?.name}/${result.failure?.code ?? "no-code"}).`,
    );
  }
}

export async function runCli(
  args: readonly string[] = process.argv.slice(2),
  dependencies: ConfiguredModelCliDependencies = {},
): Promise<void> {
  try {
    await main(args, dependencies);
  } catch (error) {
    process.exitCode = 1;
    const name = error instanceof Error ? error.name : "UnknownError";
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "no-code";
    const message = error instanceof Error ? error.message : "Configured-model evaluation failed.";
    (dependencies.logger ?? console).error(`${name}/${code}: ${message}`);
  }
}
