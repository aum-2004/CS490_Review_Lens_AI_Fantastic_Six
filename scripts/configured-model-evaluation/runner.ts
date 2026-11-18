import path from "node:path";

import { answerQuestion, type QaModelReply } from "@/services/qa/answer-question";
import {
  createOpenAiQaModel,
  OPENAI_INPUT_TOKENS_URL,
  OPENAI_RESPONSES_URL,
  type QaEnv,
} from "@/services/qa/openai-qa-client";
import { buildReviewDatasetContext } from "@/services/qa/review-context";
import { SYSTEM_PROMPT_VERSION } from "@/services/qa/system-prompt";
import {
  buildConfiguredModelAttemptPlan,
  CONFIGURED_MODEL_CASE_COUNT,
  CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT,
  CONFIGURED_MODEL_LOGICAL_CALL_LIMIT,
  CONFIGURED_MODEL_REPETITIONS,
  type ConfiguredModelAttemptPlan,
} from "../../tests/fixtures/configured-model-evaluation";
import { getQaDataset } from "../../tests/fixtures/qa/datasets";
import { createFakeOpenAiFetch, openAi } from "../../tests/helpers/qa-harness/fake-openai-fetch";
import { extractQuestion } from "../../tests/helpers/qa-harness/fake-model";
import { createFakeSupabase } from "../../tests/helpers/qa-harness/fake-supabase";
import {
  createEvaluationArtifactStore,
  type AttemptRequestCounts,
  type EvaluationArtifactStore,
  type EvaluationAttemptRecord,
  type EvaluationFailureRecord,
  type EvaluationMode,
  type RunManifest,
} from "./artifacts";

export const APPROVED_QA_MODEL = "gpt-6-luna";
export const DEFAULT_EVALUATION_OUTPUT_ROOT = "local-eval-results";
export const PAID_CONFIRMATION_FLAG = "--confirm-aryan-approved-budget-and-run";

const OFFLINE_ENV: QaEnv = Object.freeze({
  QA_ENABLED: "true",
  OPENAI_API_KEY: "offline-recording-fake-not-a-live-key",
  OPENAI_QA_MODEL: APPROVED_QA_MODEL,
});

export class EvaluationGuardError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvaluationGuardError";
  }
}

export interface PaidExecutionOptions {
  readonly executePaid: boolean;
  readonly authorizationConfirmed: boolean;
  readonly runId: string | undefined;
  readonly env: QaEnv;
}

export function validatePaidExecution(options: PaidExecutionOptions): QaEnv {
  if (!options.executePaid || !options.authorizationConfirmed) {
    throw new EvaluationGuardError(
      "PAID_OPT_IN_REQUIRED",
      `Paid execution requires both --execute-paid and ${PAID_CONFIRMATION_FLAG}.`,
    );
  }
  if (!options.runId) {
    throw new EvaluationGuardError(
      "PAID_RUN_ID_REQUIRED",
      "Paid execution requires an explicit unique --run-id.",
    );
  }
  if (options.env.QA_ENABLED !== "true") {
    throw new EvaluationGuardError(
      "QA_DISABLED",
      'Paid execution requires QA_ENABLED to be exactly "true".',
    );
  }
  if (options.env.OPENAI_QA_MODEL?.trim() !== APPROVED_QA_MODEL) {
    throw new EvaluationGuardError(
      "UNAPPROVED_MODEL",
      `OPENAI_QA_MODEL must be exactly ${APPROVED_QA_MODEL}; no fallback is allowed.`,
    );
  }
  const apiKey = options.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new EvaluationGuardError(
      "API_KEY_NOT_CONFIGURED",
      "Paid execution requires OPENAI_API_KEY in the local environment.",
    );
  }
  return Object.freeze({
    QA_ENABLED: "true",
    OPENAI_QA_MODEL: APPROVED_QA_MODEL,
    OPENAI_API_KEY: apiKey,
  });
}

interface AttemptCounter {
  tokenCount: number;
  generation: number;
  external: number;
}

/** Narrowly exported so guard tests can exercise request caps without changing the 36-attempt plan. */
export class RequestLedger {
  private current: AttemptCounter | undefined;
  private externalTotal = 0;
  private adapterTotal = 0;

  constructor(
    private readonly baseFetcher: typeof fetch,
    private readonly externalTransport: boolean,
  ) {}

  readonly fetcher: typeof fetch = async (input, init) => {
    if (!this.current) {
      throw new EvaluationGuardError("REQUEST_OUTSIDE_ATTEMPT", "Provider request had no attempt.");
    }
    const url = String(input instanceof Request ? input.url : input);
    const stage =
      url === OPENAI_INPUT_TOKENS_URL
        ? "tokenCount"
        : url === OPENAI_RESPONSES_URL
          ? "generation"
          : undefined;
    if (!stage) {
      throw new EvaluationGuardError("UNAPPROVED_ENDPOINT", "Provider endpoint is not approved.");
    }
    if (this.current[stage] >= 1) {
      throw new EvaluationGuardError(
        "PER_ATTEMPT_REQUEST_LIMIT",
        `A logical attempt may make at most one ${stage} request.`,
      );
    }
    if (stage === "generation" && this.current.tokenCount !== 1) {
      throw new EvaluationGuardError(
        "GENERATION_BEFORE_TOKEN_COUNT",
        "Generation requires exactly one successful token-count request first.",
      );
    }
    if (this.adapterTotal >= CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT) {
      throw new EvaluationGuardError(
        "RUN_REQUEST_LIMIT",
        `The run cannot exceed ${CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT} provider requests.`,
      );
    }

    this.current[stage] += 1;
    this.adapterTotal += 1;
    if (this.externalTransport) {
      this.current.external += 1;
      this.externalTotal += 1;
    }
    return this.baseFetcher(input, init);
  };

  beginAttempt(): void {
    if (this.current) {
      throw new EvaluationGuardError("ATTEMPT_OVERLAP", "Logical attempts must run sequentially.");
    }
    this.current = { tokenCount: 0, generation: 0, external: 0 };
  }

  finishAttempt(): AttemptRequestCounts {
    if (!this.current) {
      throw new EvaluationGuardError("ATTEMPT_NOT_STARTED", "No logical attempt is active.");
    }
    const counts = { ...this.current };
    this.current = undefined;
    return counts;
  }

  get externalRequests(): number {
    return this.externalTotal;
  }
}

function offlineTransport(plan: readonly ConfiguredModelAttemptPlan[]): typeof fetch {
  const outcomes = new Map(plan.map((attempt) => [attempt.question, attempt.expectedOutcome]));
  return createFakeOpenAiFetch({
    generation: (body) => {
      const question = extractQuestion(String(body.input));
      const outcome = question ? outcomes.get(question) : undefined;
      if (!outcome) return openAi.status(400, "Unapproved offline evaluation question.");
      return openAi.completed({
        outcome,
        claims: [],
        coverage: "none",
      });
    },
  }).fetcher;
}

function errorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

function failureStage(
  error: unknown,
  rawReply: string | null,
  counts: AttemptRequestCounts,
): EvaluationFailureRecord["stage"] {
  if (error instanceof EvaluationGuardError) return "guard";
  const name = error instanceof Error ? error.name : "UnknownError";
  const code = errorCode(error);
  if (name === "QaResponseError" || rawReply !== null) return "validation";
  if (name === "QaBudgetError" || code === "REQUEST_TOO_LARGE") return "token_budget";
  if (counts.generation === 1) return "generation";
  if (counts.tokenCount === 1) return "token_count";
  if (name === "QaModelError") return "configuration";
  if (name === "ReviewContextError" || name === "TargetNotFoundError") return "context";
  return "unknown";
}

function safeFailure(
  error: unknown,
  rawReply: string | null,
  counts: AttemptRequestCounts,
): EvaluationFailureRecord {
  const stage = failureStage(error, rawReply, counts);
  return {
    stage,
    name: error instanceof Error ? error.name : "UnknownError",
    code: errorCode(error),
    message: `Evaluation stopped during ${stage.replaceAll("_", " ")}.`,
  };
}

function baseAttemptRecord(
  attempt: ConfiguredModelAttemptPlan,
  timestamp: string,
): EvaluationAttemptRecord {
  return {
    ...attempt,
    status: "started",
    timestamp,
    completedAt: null,
    modelId: APPROVED_QA_MODEL,
    promptVersion: SYSTEM_PROMPT_VERSION,
    rawModelReplyText: null,
    validatedOutcome: null,
    validatedAnswer: null,
    citedReviewIds: [],
    countedInputTokens: null,
    providerUsage: null,
    requestCounts: { tokenCount: 0, generation: 0, external: 0 },
    structuredOutcomeMatchesExpected: null,
    failure: null,
  };
}

function initialManifest(runId: string, mode: EvaluationMode, startedAt: string): RunManifest {
  return {
    schemaVersion: 1,
    runId,
    mode,
    status: "running",
    startedAt,
    completedAt: null,
    modelId: APPROVED_QA_MODEL,
    promptVersion: SYSTEM_PROMPT_VERSION,
    caseCount: CONFIGURED_MODEL_CASE_COUNT,
    repetitions: CONFIGURED_MODEL_REPETITIONS,
    plannedLogicalCalls: CONFIGURED_MODEL_LOGICAL_CALL_LIMIT,
    logicalCallLimit: CONFIGURED_MODEL_LOGICAL_CALL_LIMIT,
    plannedExternalRequestMaximum: CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT,
    externalRequestLimit: CONFIGURED_MODEL_EXTERNAL_REQUEST_LIMIT,
    completedAttempts: 0,
    externalRequestsMade: 0,
    note:
      mode === "offline"
        ? "Recording fake transport; zero external requests. Human assessment remains required."
        : "Explicitly authorized paid transport. Human assessment remains required.",
  };
}

export interface RunConfiguredModelEvaluationOptions {
  readonly mode: EvaluationMode;
  readonly runId: string;
  readonly outputRoot?: string;
  readonly env?: QaEnv;
  readonly executePaid?: boolean;
  readonly authorizationConfirmed?: boolean;
  /** Tests only. The CLI never supplies a transport override. */
  readonly transportOverride?: { readonly fetcher: typeof fetch; readonly external: boolean };
  readonly now?: () => Date;
}

export interface ConfiguredModelEvaluationResult {
  readonly completed: boolean;
  readonly completedAttempts: number;
  readonly externalRequests: number;
  readonly artifactDirectory: string;
  readonly failure: EvaluationFailureRecord | null;
}

export async function runConfiguredModelEvaluation(
  options: RunConfiguredModelEvaluationOptions,
): Promise<ConfiguredModelEvaluationResult> {
  const plan = buildConfiguredModelAttemptPlan();
  if (plan.length > CONFIGURED_MODEL_LOGICAL_CALL_LIMIT) {
    throw new EvaluationGuardError("RUN_CALL_LIMIT", "Logical-call limit exceeded.");
  }
  const now = options.now ?? (() => new Date());
  const outputRoot = path.resolve(options.outputRoot ?? DEFAULT_EVALUATION_OUTPUT_ROOT);
  const env =
    options.mode === "paid"
      ? validatePaidExecution({
          executePaid: options.executePaid === true,
          authorizationConfirmed: options.authorizationConfirmed === true,
          runId: options.runId,
          env: options.env ?? process.env,
        })
      : OFFLINE_ENV;
  const transport =
    options.transportOverride ??
    (options.mode === "offline"
      ? { fetcher: offlineTransport(plan), external: false }
      : { fetcher: fetch, external: true });
  const ledger = new RequestLedger(transport.fetcher, transport.external);
  const callProductionModel = createOpenAiQaModel({ fetcher: ledger.fetcher, env });

  const dataset = getQaDataset("restaurantA");
  const fakeSupabase = createFakeSupabase([dataset]);
  const startedAt = now().toISOString();
  let manifest = initialManifest(options.runId, options.mode, startedAt);
  const artifacts: EvaluationArtifactStore = await createEvaluationArtifactStore({
    outputRoot,
    manifest,
    plan,
  });

  let completedAttempts = 0;
  for (const attempt of plan) {
    const started = baseAttemptRecord(attempt, now().toISOString());
    await artifacts.appendAttempt(started);
    ledger.beginAttempt();
    const rawCapture: { reply?: QaModelReply } = {};
    let settledRequestCounts: AttemptRequestCounts | undefined;

    try {
      const answer = await answerQuestion(dataset.target.id, attempt.question, {
        buildReviewDatasetContext: (targetId) =>
          buildReviewDatasetContext(targetId, {
            getAuthenticatedUser: async () => ({
              id: dataset.owner.id,
              email: dataset.owner.email,
            }),
            createSupabaseServerClient: async () =>
              fakeSupabase.client() as unknown as Awaited<
                ReturnType<(typeof import("@/lib/supabase/server"))["createSupabaseServerClient"]>
              >,
          }),
        callModel: async (request) => {
          rawCapture.reply = await callProductionModel(request);
          return rawCapture.reply;
        },
      });
      const requestCounts = ledger.finishAttempt();
      settledRequestCounts = requestCounts;
      if (requestCounts.tokenCount !== 1 || requestCounts.generation !== 1) {
        throw new EvaluationGuardError(
          "INCOMPLETE_PROVIDER_SEQUENCE",
          "A completed attempt requires one token-count and one generation request.",
        );
      }
      const rawReply = rawCapture.reply;
      if (!rawReply) {
        throw new EvaluationGuardError(
          "RAW_REPLY_NOT_CAPTURED",
          "The production model boundary did not expose a raw reply.",
        );
      }
      completedAttempts += 1;
      await artifacts.appendAttempt({
        ...started,
        status: "completed",
        completedAt: now().toISOString(),
        rawModelReplyText: rawReply.text,
        validatedOutcome: answer.outcome,
        validatedAnswer: answer.answer,
        citedReviewIds: answer.citedReviewIds,
        countedInputTokens: rawReply.countedInputTokens ?? null,
        providerUsage: rawReply.usage ?? null,
        requestCounts,
        structuredOutcomeMatchesExpected: answer.outcome === attempt.expectedOutcome,
      });
    } catch (error) {
      let requestCounts = settledRequestCounts;
      if (!requestCounts) {
        try {
          requestCounts = ledger.finishAttempt();
        } catch {
          requestCounts = { tokenCount: 0, generation: 0, external: 0 };
        }
      }
      const failure = safeFailure(error, rawCapture.reply?.text ?? null, requestCounts);
      await artifacts.appendAttempt({
        ...started,
        status: "failed",
        completedAt: now().toISOString(),
        rawModelReplyText: rawCapture.reply?.text ?? null,
        countedInputTokens: rawCapture.reply?.countedInputTokens ?? null,
        providerUsage: rawCapture.reply?.usage ?? null,
        requestCounts,
        failure,
      });
      manifest = {
        ...manifest,
        status: "failed",
        completedAt: now().toISOString(),
        completedAttempts,
        externalRequestsMade: ledger.externalRequests,
      };
      await artifacts.finish(manifest);
      return {
        completed: false,
        completedAttempts,
        externalRequests: ledger.externalRequests,
        artifactDirectory: artifacts.directory,
        failure,
      };
    }
  }

  manifest = {
    ...manifest,
    status: "completed",
    completedAt: now().toISOString(),
    completedAttempts,
    externalRequestsMade: ledger.externalRequests,
  };
  await artifacts.finish(manifest);
  return {
    completed: true,
    completedAttempts,
    externalRequests: ledger.externalRequests,
    artifactDirectory: artifacts.directory,
    failure: null,
  };
}
