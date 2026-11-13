/**
 * S2-003 harness-owned copy of the Q&A model-boundary contract.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ PENDING TEAM AGREEMENT. Nothing here is production code and nothing here is authoritative. │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * The real definitions live in unmerged PRs and are NOT imported, so this harness can merge to
 * `main` independently:
 *
 * - `QaModelRequest`, `QA_OUTCOMES`, `QA_DECLINE_PRIORITY`, input format, budget constants:
 *   Aryan, S2-013 (`src/services/qa/system-prompt.ts`, PR #76).
 * - `QaModelReply`, `QaModelCaller`, `QaAnswer`, reply validation rules: Aryan, S2-011
 *   (`src/services/qa/answer-question.ts`, `qa-response.ts`, PR #79).
 * - Context errors and `answerActiveTargetQuestion(targetId, question, { callModel })`: Shawn,
 *   S2-010 (`src/services/qa/review-context.ts`, PR #78 / #82).
 *
 * Every item below mirrors those files as of PR #82 head `9261b86` (2026-11-12). When they merge,
 * the S2-003 follow-up PR adds compile-time checks that these copies are assignable to and from
 * the real types, then replaces each copy with a re-export. Do not extend this file with new
 * production behaviour; propose changes to the owning story instead.
 */

/** Mirror of S2-013 `QA_OUTCOMES`. */
export const QA_OUTCOMES = [
  "answered",
  "insufficient_evidence",
  "declined_general_knowledge",
  "declined_other_entity",
  "declined_other_platform",
] as const;

export type QaOutcome = (typeof QA_OUTCOMES)[number];

/** Mirror of S2-013 `QA_DECLINE_PRIORITY` (the decline outcomes). */
export const QA_DECLINE_OUTCOMES = [
  "declined_other_entity",
  "declined_other_platform",
  "declined_general_knowledge",
] as const satisfies readonly QaOutcome[];

export type QaDeclineOutcome = (typeof QA_DECLINE_OUTCOMES)[number];

export function isDeclineOutcome(outcome: QaOutcome): outcome is QaDeclineOutcome {
  return (QA_DECLINE_OUTCOMES as readonly QaOutcome[]).includes(outcome);
}

/** Mirror of S2-013 `QaModelRequest`: the provider-neutral request handed to the model seam. */
export interface QaModelRequest {
  promptVersion: string;
  targetId: string;
  /** System-level instructions (the ReviewLens system prompt). */
  instructions: string;
  /** User-turn content: the review dataset followed by the question. */
  input: string;
  /** IDs of the reviews included in `input`. */
  reviewIds: string[];
  estimatedInputTokens: number;
  maxOutputTokens: number;
}

/** Mirror of S2-011 `QaModelReply`: the raw provider reply, before validation. */
export interface QaModelReply {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Mirror of S2-011 `QaModelCaller`: the single model seam the harness replaces. */
export type QaModelCaller = (request: QaModelRequest) => Promise<QaModelReply>;

/** The JSON object the S2-013 prompt asks the model to return (mirror of `QA_REPLY_JSON_SCHEMA`). */
export interface QaModelReplyPayload {
  outcome: QaOutcome;
  answer: string;
  citedReviewIds: string[];
}

/** Mirror of S2-011 `QaAnswer`: the validated answer returned to callers. */
export interface QaAnswer {
  outcome: QaOutcome;
  answer: string;
  citedReviewIds: string[];
  promptVersion: string;
  targetId: string;
}

/**
 * Mirror of the S2-013 user-turn layout. The harness reads the question back out of `input` so
 * scripts can match on it. PENDING AGREEMENT: ask S2-013 to export a parser or add a `question`
 * field to `QaModelRequest`, so the harness does not depend on prompt formatting.
 */
export const QA_INPUT_QUESTION_HEADER = "QUESTION (JSON string):";

/** Mirror of S2-013 request-budget constants (application budget, not a model limit). */
export const QA_MAX_REQUEST_TOKENS = 16_000;
export const QA_RESERVED_OUTPUT_TOKENS = 1_500;
export const ESTIMATED_BYTES_PER_TOKEN = 3;

/** Mirror of S2-013 `REVIEW_PLATFORM_LABELS`. */
export const REVIEW_PLATFORM_LABELS = { google_maps: "Google Maps" } as const;

/**
 * Error names and codes the pipeline throws (S2-010, S2-011, S2-013, S1-013). Golden cases assert
 * on `name` and `code`, never on message text, so they hold for both the reference pipeline and
 * the real one.
 */
export const QA_PIPELINE_ERRORS = {
  targetNotFound: { name: "TargetNotFoundError", code: "TARGET_NOT_FOUND" },
  noReviewData: { name: "ReviewContextError", code: "NO_REVIEW_DATA" },
  contextUnavailable: { name: "ReviewContextError", code: "REVIEW_CONTEXT_UNAVAILABLE" },
  emptyQuestion: { name: "QaPromptError", code: "EMPTY_QUESTION" },
  requestTooLarge: { name: "QaPromptError", code: "REQUEST_TOO_LARGE" },
  invalidModelResponse: { name: "QaResponseError", code: "INVALID_MODEL_RESPONSE" },
  ungroundedAnswer: { name: "QaResponseError", code: "UNGROUNDED_ANSWER" },
  modelTimeout: { name: "QaModelError", code: "MODEL_TIMEOUT" },
  modelUnavailable: { name: "QaModelError", code: "MODEL_UNAVAILABLE" },
  modelRateLimited: { name: "QaModelError", code: "MODEL_RATE_LIMITED" },
} as const satisfies Record<string, { name: string; code: string }>;

export type QaPipelineErrorKey = keyof typeof QA_PIPELINE_ERRORS;
export type QaPipelineErrorShape = (typeof QA_PIPELINE_ERRORS)[QaPipelineErrorKey];

/** A test identity. In the real pipeline this becomes the mocked verified Supabase session. */
export interface QaActor {
  readonly id: string;
  readonly email: string;
}

/**
 * Harness-defined orchestration entry point. The harness calls whatever implements this:
 * the contract reference pipeline in PR 1, and in PR 2 an adapter that sets the fake verified
 * session for `actor` and calls `answerActiveTargetQuestion(targetId, question, { callModel })`.
 */
export interface QaPipelineInput {
  readonly actor: QaActor;
  readonly targetId: unknown;
  readonly question: string;
  readonly callModel: QaModelCaller;
}

export type QaPipeline = (input: QaPipelineInput) => Promise<QaAnswer>;
