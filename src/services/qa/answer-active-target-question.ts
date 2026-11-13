import "server-only";

import { answerQuestion, type QaModelCaller } from "@/services/qa/answer-question";
import { createOpenAiQaModel } from "@/services/qa/openai-qa-client";
import type { QaAnswer } from "@/services/qa/qa-response";
import { buildReviewDatasetContext } from "@/services/qa/review-context";

export interface ActiveTargetQuestionOptions {
  /** Server-only model seam for deterministic evaluations. Never a browser argument. */
  callModel?: QaModelCaller;
}

/**
 * Concrete S2-010/S2-011 binding. Identity and evidence always come from the real context
 * builder; callers cannot replace them with an owner ID or browser-supplied reviews.
 * The Route Handler still owns input validation, private responses and safe HTTP mapping.
 */
export async function answerActiveTargetQuestion(
  targetId: unknown,
  question: string,
  options: ActiveTargetQuestionOptions = {},
): Promise<QaAnswer> {
  return answerQuestion(targetId, question, {
    buildReviewDatasetContext,
    callModel: options.callModel ?? createOpenAiQaModel(),
  });
}
