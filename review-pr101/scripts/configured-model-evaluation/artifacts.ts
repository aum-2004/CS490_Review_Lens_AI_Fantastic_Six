import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { QaOutcome } from "@/services/qa/system-prompt";
import type {
  ConfiguredModelAttemptPlan,
  ConfiguredModelStory,
} from "../../tests/fixtures/configured-model-evaluation";

export type EvaluationMode = "offline" | "paid";

export interface ProviderUsageRecord {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface AttemptRequestCounts {
  readonly tokenCount: number;
  readonly generation: number;
  readonly external: number;
}

export interface EvaluationFailureRecord {
  readonly stage:
    | "configuration"
    | "context"
    | "token_count"
    | "token_budget"
    | "generation"
    | "validation"
    | "guard"
    | "unknown";
  readonly name: string;
  readonly code: string | null;
  readonly message: string;
}

export interface EvaluationAttemptRecord extends ConfiguredModelAttemptPlan {
  readonly status: "started" | "completed" | "failed";
  readonly timestamp: string;
  readonly completedAt: string | null;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly rawModelReplyText: string | null;
  readonly validatedOutcome: QaOutcome | null;
  readonly validatedAnswer: string | null;
  readonly citedReviewIds: readonly string[];
  readonly countedInputTokens: number | null;
  readonly providerUsage: ProviderUsageRecord | null;
  readonly requestCounts: AttemptRequestCounts;
  readonly structuredOutcomeMatchesExpected: boolean | null;
  readonly failure: EvaluationFailureRecord | null;
}

export interface HumanAssessment {
  readonly attemptNumber: number;
  readonly story: ConfiguredModelStory;
  readonly caseId: string;
  readonly repetition: number;
  structuredOutcomeMatchesExpected: boolean | null;
  clearlyDeclinedOutOfScopeRequest: boolean | null;
  clearlyIdentifiesActiveTarget: boolean | null;
  distinguishesGoogleMapsFromUnsupportedPlatforms: boolean | "not_applicable" | null;
  citationsAreEmpty: boolean | null;
  makesUnsupportedExternalClaims: boolean | null;
  fabricatesComparisonOrExternalEvidence: boolean | null;
  overallPass: boolean | null;
  reviewerNotes: string;
}

type CompletedHumanAssessment = Omit<
  HumanAssessment,
  | "structuredOutcomeMatchesExpected"
  | "clearlyDeclinedOutOfScopeRequest"
  | "clearlyIdentifiesActiveTarget"
  | "distinguishesGoogleMapsFromUnsupportedPlatforms"
  | "citationsAreEmpty"
  | "makesUnsupportedExternalClaims"
  | "fabricatesComparisonOrExternalEvidence"
  | "overallPass"
> & {
  structuredOutcomeMatchesExpected: boolean;
  clearlyDeclinedOutOfScopeRequest: boolean;
  clearlyIdentifiesActiveTarget: boolean;
  distinguishesGoogleMapsFromUnsupportedPlatforms: boolean | "not_applicable";
  citationsAreEmpty: boolean;
  makesUnsupportedExternalClaims: boolean;
  fabricatesComparisonOrExternalEvidence: boolean;
  overallPass: boolean;
};

export interface RunManifest {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly mode: EvaluationMode;
  readonly status: "running" | "completed" | "failed";
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly caseCount: number;
  readonly repetitions: number;
  readonly plannedLogicalCalls: number;
  readonly logicalCallLimit: number;
  readonly plannedExternalRequestMaximum: number;
  readonly externalRequestLimit: number;
  readonly completedAttempts: number;
  readonly externalRequestsMade: number;
  readonly note: string;
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporary, filePath);
}

export interface EvaluationArtifactStore {
  readonly directory: string;
  readonly manifestPath: string;
  readonly attemptsPath: string;
  readonly assessmentPath: string;
  appendAttempt(record: EvaluationAttemptRecord): Promise<void>;
  finish(manifest: RunManifest): Promise<void>;
}

export async function createEvaluationArtifactStore(options: {
  readonly outputRoot: string;
  readonly manifest: RunManifest;
  readonly plan: readonly ConfiguredModelAttemptPlan[];
}): Promise<EvaluationArtifactStore> {
  await mkdir(options.outputRoot, { recursive: true });
  const directory = path.resolve(options.outputRoot, options.manifest.runId);
  await mkdir(directory, { recursive: false });

  const manifestPath = path.join(directory, "manifest.json");
  const attemptsPath = path.join(directory, "attempt-events.jsonl");
  const assessmentPath = path.join(directory, "human-assessment.json");
  await writeJsonAtomically(manifestPath, options.manifest);
  await writeFile(attemptsPath, "", { encoding: "utf8", flag: "wx" });

  const assessments: HumanAssessment[] = options.plan.map((attempt) => ({
    attemptNumber: attempt.attemptNumber,
    story: attempt.story,
    caseId: attempt.id,
    repetition: attempt.repetition,
    structuredOutcomeMatchesExpected: null,
    clearlyDeclinedOutOfScopeRequest: null,
    clearlyIdentifiesActiveTarget: null,
    distinguishesGoogleMapsFromUnsupportedPlatforms: null,
    citationsAreEmpty: null,
    makesUnsupportedExternalClaims: null,
    fabricatesComparisonOrExternalEvidence: null,
    overallPass: null,
    reviewerNotes: "",
  }));
  await writeJsonAtomically(assessmentPath, assessments);

  return {
    directory,
    manifestPath,
    attemptsPath,
    assessmentPath,
    async appendAttempt(record) {
      await writeFile(attemptsPath, `${JSON.stringify(record)}\n`, {
        encoding: "utf8",
        flag: "a",
      });
    },
    async finish(manifest) {
      await writeJsonAtomically(manifestPath, manifest);
    },
  };
}

function markdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

function mark(value: boolean | "not_applicable"): string {
  if (value === "not_applicable") return "N/A";
  return value ? "Yes" : "No";
}

function assertCompleteAssessment(value: unknown): asserts value is CompletedHumanAssessment[] {
  if (!Array.isArray(value) || value.length !== 36) {
    throw new Error("Human assessment must contain all 36 individual attempts.");
  }
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Every human assessment entry must be an object.");
    }
    const assessment = entry as Partial<HumanAssessment>;
    const booleans = [
      assessment.structuredOutcomeMatchesExpected,
      assessment.clearlyDeclinedOutOfScopeRequest,
      assessment.clearlyIdentifiesActiveTarget,
      assessment.citationsAreEmpty,
      assessment.makesUnsupportedExternalClaims,
      assessment.fabricatesComparisonOrExternalEvidence,
      assessment.overallPass,
    ];
    if (booleans.some((candidate) => typeof candidate !== "boolean")) {
      throw new Error(`Attempt ${String(assessment.attemptNumber)} is not fully assessed.`);
    }
    if (
      typeof assessment.distinguishesGoogleMapsFromUnsupportedPlatforms !== "boolean" &&
      assessment.distinguishesGoogleMapsFromUnsupportedPlatforms !== "not_applicable"
    ) {
      throw new Error(`Attempt ${String(assessment.attemptNumber)} needs a platform assessment.`);
    }
    if (typeof assessment.reviewerNotes !== "string") {
      throw new Error(`Attempt ${String(assessment.attemptNumber)} needs reviewer notes text.`);
    }
  }
}

export async function renderIssueReports(outputRoot: string, runId: string): Promise<string[]> {
  const directory = path.resolve(outputRoot, runId);
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as
    RunManifest | undefined;
  if (!manifest || manifest.status !== "completed") {
    throw new Error("Issue reports can be rendered only for a completed evaluation run.");
  }
  const assessments: unknown = JSON.parse(
    await readFile(path.join(directory, "human-assessment.json"), "utf8"),
  );
  assertCompleteAssessment(assessments);
  const terminalAttempts = (await readFile(path.join(directory, "attempt-events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as EvaluationAttemptRecord)
    .filter(({ status }) => status === "completed");
  const attemptsByNumber = new Map(
    terminalAttempts.map((attempt) => [attempt.attemptNumber, attempt] as const),
  );
  if (terminalAttempts.length !== 36 || attemptsByNumber.size !== 36) {
    throw new Error("Completed run artifacts must contain 36 unique terminal attempts.");
  }
  for (const assessment of assessments) {
    const attempt = attemptsByNumber.get(assessment.attemptNumber);
    if (
      !attempt ||
      assessment.story !== attempt.story ||
      assessment.caseId !== attempt.id ||
      assessment.repetition !== attempt.repetition
    ) {
      throw new Error(`Human assessment ${assessment.attemptNumber} does not match its attempt.`);
    }
  }

  const outputs: string[] = [];
  for (const story of ["S2-014", "S2-015"] as const) {
    const selected = assessments.filter((assessment) => assessment.story === story);
    const passed = selected.filter((assessment) => assessment.overallPass).length;
    const issue = story === "S2-014" ? 65 : 66;
    const lines = [
      `# ${story} configured-model evaluation results`,
      "",
      `Run: \`${markdown(manifest.runId)}\`  `,
      `Model: \`${markdown(manifest.modelId)}\`  `,
      `Prompt: \`${markdown(manifest.promptVersion)}\`  `,
      `Human-assessed result: **${passed}/${selected.length} passed**`,
      "",
      "Each repetition was independently reviewed; structured-output success alone was not treated as a semantic pass.",
      "",
      "| Attempt | Case | Rep | Outcome match | Declines | Active target | Platform | Empty citations | External claims | Fabrication | Pass | Notes |",
      "| ---: | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...selected.map(
        (assessment) =>
          `| ${assessment.attemptNumber} | ${markdown(assessment.caseId)} | ${assessment.repetition} | ${mark(assessment.structuredOutcomeMatchesExpected)} | ${mark(assessment.clearlyDeclinedOutOfScopeRequest)} | ${mark(assessment.clearlyIdentifiesActiveTarget)} | ${mark(assessment.distinguishesGoogleMapsFromUnsupportedPlatforms)} | ${mark(assessment.citationsAreEmpty)} | ${mark(assessment.makesUnsupportedExternalClaims)} | ${mark(assessment.fabricatesComparisonOrExternalEvidence)} | ${mark(assessment.overallPass)} | ${markdown(assessment.reviewerNotes)} |`,
      ),
      "",
      `Prepared for issue #${issue}. Raw provider replies remain in the ignored local run directory and are not included here.`,
      "",
    ];
    const reportPath = path.join(directory, `issue-${issue}-report.md`);
    await writeFile(reportPath, lines.join("\n"), { encoding: "utf8", flag: "wx" });
    outputs.push(reportPath);
  }
  return outputs;
}
