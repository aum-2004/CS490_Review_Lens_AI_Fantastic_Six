import "server-only";

import { runGroundedQaRequest, type QaReviewContextBuilder } from "@/services/qa/qa-request";
import { parseQaModelReply, type QaAnswer } from "@/services/qa/qa-response";
import type { QaModelRequest } from "@/services/qa/system-prompt";

/** Raw reply from a model provider, before validation. */
export interface QaModelReply {
  /** The model's text output; expected to be the S2-013 JSON reply. */
  text: string;
  /** Provider-reported token usage, when available. */
  usage?: { inputTokens: number; outputTokens: number };
  /**
   * Input tokens reported by OpenAI's token-count endpoint before generation. It should equal
   * `usage.inputTokens`; log both to confirm in the smoke test.
   */
  countedInputTokens?: number;
}

/** Calls a model provider. Production: `createOpenAiQaModel()`. Tests: a deterministic fake. */
export type QaModelCaller = (request: QaModelRequest) => Promise<QaModelReply>;

export interface AnswerQuestionDependencies {
  /** S2-010's `buildReviewDatasetContext`. */
  buildReviewDatasetContext: QaReviewContextBuilder;
  callModel: QaModelCaller;
}

/**
 * S2-011: answers a question about the active target from its reviews.
 *
 * Order: authorized review context (S2-010) → model request (S2-013) → model call → reply
 * validation. A failure at any step throws and nothing unvalidated is returned. Errors are
 * ReviewContextError / TargetNotFoundError (S2-010), QaPromptError (request, including
 * REQUEST_TOO_LARGE from the pre-generation budget check), QaBudgetError (invalid token count),
 * QaModelError (provider, including failed token-count calls), or QaResponseError (reply).
 */
export async function answerQuestion(
  targetId: unknown,
  question: string,
  { buildReviewDatasetContext, callModel }: AnswerQuestionDependencies,
): Promise<QaAnswer> {
  return runGroundedQaRequest(targetId, question, {
    buildReviewDatasetContext,
    invokeModel: async (request) => parseQaModelReply((await callModel(request)).text, request),
  });
}
