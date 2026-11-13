import {
  allQaDatasets,
  QA_USERS,
  type QaDatasetKey,
  type QaFixtureDataset,
} from "../../fixtures/qa/datasets";
import {
  goldenTargetId,
  type QaGoldenCase,
  type QaGoldenStep,
} from "../../fixtures/qa/golden-cases";
import {
  expectAnswerHasNoForeignData,
  expectContextOnlyForTarget,
  expectDeclined,
  expectErrorShape,
  expectGroundedAnswer,
  expectInsufficientEvidence,
  expectNoForeignData,
  expectNoReviewerIdentity,
  expectSystemPromptApplied,
  QaHarnessAssertionError,
} from "./assertions";
import { QA_PIPELINE_ERRORS, type QaActor, type QaAnswer, type QaPipeline } from "./contract";
import {
  createFakeQaModel,
  type FakeQaModel,
  type QaReplySpec,
  type QaScriptRule,
  type RecordedQaModelCall,
} from "./fake-model";
import { installNetworkGuard, type NetworkGuard } from "./network-guard";
import { createReferencePipeline } from "./reference-pipeline";

/**
 * S2-003 deterministic Q&A test harness. See the "Deterministic Q&A test harness" README section.
 *
 *   const qa = createQaTestHarness({ script: [{ when: { questionIncludes: "pizza" },
 *                                               then: reply.answered([reviewId]) }] });
 *   const result = await qa.ask(targetId, "How is the pizza?");
 *   expectSystemPromptApplied(qa.model.lastCall().request, dataset);
 *   qa.cleanup();
 *
 * Or let Jest manage the lifecycle with `setupQaTestHarness(...)`.
 */

export interface QaTestHarnessOptions {
  /** The stand-in persisted data. Default: every fixture dataset. */
  readonly datasets?: readonly QaFixtureDataset[];
  /** The verified identity for `ask`. Default: User A. */
  readonly actor?: QaActor;
  readonly script?: readonly QaScriptRule[];
  readonly fallback?: QaReplySpec | "fail";
  /**
   * The orchestration under test. Default: the contract reference pipeline over `datasets`.
   * S2-003 PR 2 passes an adapter around the real `answerActiveTargetQuestion`.
   */
  readonly pipeline?: QaPipeline;
}

export type QaAskResult =
  | {
      readonly ok: true;
      readonly answer: QaAnswer;
      /** Model calls made during this `ask` only. */
      readonly calls: readonly RecordedQaModelCall[];
    }
  | {
      readonly ok: false;
      readonly errorName: string;
      readonly errorCode: string | undefined;
      readonly error: unknown;
      readonly calls: readonly RecordedQaModelCall[];
    };

export interface QaTestHarness {
  readonly model: FakeQaModel;
  readonly network: NetworkGuard;
  readonly datasets: readonly QaFixtureDataset[];
  readonly actor: QaActor;
  setActor(actor: QaActor): void;
  dataset(key: QaDatasetKey): QaFixtureDataset;
  /** Runs one question through the pipeline. Never throws for pipeline errors; returns them. */
  ask(targetId: unknown, question: string): Promise<QaAskResult>;
  /** Clears the call log, rule usage and network attempts, and restores the default actor. */
  reset(): void;
  /**
   * Restores the network and environment. Throws if any real network access was attempted or any
   * model call was unscripted during the test, even if the code under test swallowed the error.
   */
  cleanup(): void;
}

function errorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

export function createQaTestHarness(options: QaTestHarnessOptions = {}): QaTestHarness {
  const datasets = options.datasets ?? allQaDatasets();
  const defaultActor = options.actor ?? QA_USERS.userA;
  const pipeline = options.pipeline ?? createReferencePipeline(datasets);
  const model = createFakeQaModel({ rules: options.script, fallback: options.fallback });
  const network = installNetworkGuard();
  let actor: QaActor = defaultActor;
  let cleanedUp = false;

  return {
    model,
    network,
    datasets,
    get actor() {
      return actor;
    },
    setActor(next) {
      actor = next;
    },
    dataset(key) {
      const found = datasets.find((candidate) => candidate.key === key);
      if (!found) throw new Error(`Dataset "${key}" is not loaded in this harness.`);
      return found;
    },
    async ask(targetId, question) {
      const before = model.calls.length;
      try {
        const answer = await pipeline({ actor, targetId, question, callModel: model.callModel });
        return { ok: true, answer, calls: model.calls.slice(before) };
      } catch (error) {
        return {
          ok: false,
          errorName: error instanceof Error ? error.name : "UnknownError",
          errorCode: errorCode(error),
          error,
          calls: model.calls.slice(before),
        };
      }
    },
    reset() {
      model.reset();
      network.clearAttempts();
      actor = defaultActor;
    },
    cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      network.restore();
      network.assertNoAttempts();
      const unscripted = model.calls.filter((call) => call.matchedRule === undefined);
      if (unscripted.length > 0) {
        throw new QaHarnessAssertionError(
          `${unscripted.length} unscripted Q&A model call(s): ` +
            unscripted.map((call) => JSON.stringify(call.question)).join(", "),
        );
      }
    },
  };
}

/**
 * Jest lifecycle helper: a fresh harness before each test and `cleanup()` after it.
 *
 *   const qa = setupQaTestHarness({ script: [...] });
 *   it("...", async () => { await qa().ask(...); });
 */
export function setupQaTestHarness(
  options: QaTestHarnessOptions | (() => QaTestHarnessOptions) = {},
): () => QaTestHarness {
  let current: QaTestHarness | undefined;
  beforeEach(() => {
    current = createQaTestHarness(typeof options === "function" ? options() : options);
  });
  afterEach(() => {
    const harness = current;
    current = undefined;
    harness?.cleanup();
  });
  return () => {
    if (!current) throw new Error("setupQaTestHarness() is only available inside a test.");
    return current;
  };
}

// --- Golden cases ----------------------------------------------------------------------------

export interface QaGoldenStepRun {
  readonly step: QaGoldenStep;
  readonly result: QaAskResult;
}

export interface QaGoldenRunOptions {
  readonly datasets?: readonly QaFixtureDataset[];
  readonly pipeline?: QaPipeline;
}

function checkStep(harness: QaTestHarness, { step, result }: QaGoldenStepRun): void {
  const { expect: expected } = step;
  const shouldCall = expected.result !== "error" || expected.modelCalled;

  if (!shouldCall) {
    if (result.calls.length !== 0) {
      throw new QaHarnessAssertionError(
        `The model was called ${result.calls.length} time(s); expected none.`,
      );
    }
  } else {
    if (result.calls.length !== 1) {
      throw new QaHarnessAssertionError(
        `The model was called ${result.calls.length} time(s); expected one.`,
      );
    }
    if (step.target === "missing") {
      throw new QaHarnessAssertionError("A missing target can never reach the model.");
    }
    const active = harness.dataset(step.target);
    const foreign = harness.datasets.filter((candidate) => candidate.key !== active.key);
    const { request } = result.calls[0];
    expectSystemPromptApplied(request, active);
    // Foreign data first: a leaked row would also fail the context check, but this names the leak.
    expectNoForeignData(request, foreign);
    expectContextOnlyForTarget(request, active);
    expectNoReviewerIdentity(request, active);

    if (result.ok) {
      expectAnswerHasNoForeignData(result.answer, foreign);
      if (expected.result === "answered") expectGroundedAnswer(result.answer, request);
      if (expected.result === "insufficient_evidence")
        expectInsufficientEvidence(result.answer, request);
      if (expected.result === "declined") expectDeclined(result.answer, expected.outcome);
    }
  }

  if (expected.result === "error") {
    if (result.ok) {
      throw new QaHarnessAssertionError(
        `Expected ${expected.error}, but the pipeline answered with "${result.answer.outcome}".`,
      );
    }
    expectErrorShape(result.error, QA_PIPELINE_ERRORS[expected.error]);
  } else if (!result.ok) {
    throw new QaHarnessAssertionError(
      `Expected "${expected.result}", but the pipeline failed with ${result.errorName}/${result.errorCode}.`,
    );
  }
}

/**
 * Runs a golden case in its own fresh harness (network blocked, one scripted reply per step) and
 * checks every step. Throws `QaHarnessAssertionError` naming the case and step on failure.
 */
export async function runGoldenCase(
  goldenCase: QaGoldenCase,
  options: QaGoldenRunOptions = {},
): Promise<QaGoldenStepRun[]> {
  const script: QaScriptRule[] = goldenCase.steps.flatMap((step, index) =>
    step.reply
      ? [
          {
            name: `${goldenCase.id}#${index}`,
            when: { targetId: goldenTargetId(step.target), question: step.question },
            then: step.reply,
            times: 1,
          },
        ]
      : [],
  );
  const harness = createQaTestHarness({ ...options, script });
  const runs: QaGoldenStepRun[] = [];
  try {
    for (const [index, step] of goldenCase.steps.entries()) {
      harness.setActor(QA_USERS[step.actor]);
      const run = { step, result: await harness.ask(goldenTargetId(step.target), step.question) };
      runs.push(run);
      try {
        checkStep(harness, run);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new QaHarnessAssertionError(`${goldenCase.id} step ${index + 1}: ${reason}`);
      }
    }
  } catch (error) {
    // Restore the network even on failure, but report the step failure rather than cleanup's.
    try {
      harness.cleanup();
    } catch {
      // The step failure above is the more useful report.
    }
    throw error;
  }
  harness.cleanup();
  return runs;
}

export * from "./assertions";
export * from "./contract";
export * from "./fake-model";
export * from "./network-guard";
export { createReferencePipeline, REFERENCE_PROMPT_VERSION } from "./reference-pipeline";
