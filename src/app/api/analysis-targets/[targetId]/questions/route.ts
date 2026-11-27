import type { NextRequest } from "next/server";
import { requireApiUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { answerQuestion } from "@/services/qa/answer-question";
import { buildReviewDatasetContext, ReviewContextError } from "@/services/qa/review-context";
import {
  createOpenAiQaModel,
  QaModelError,
  readOpenAiQaConfig,
} from "@/services/qa/openai-qa-client";
import { reserveQuestionQuota, QuestionQuotaError } from "@/services/qa/question-quota";
import { QaPromptError } from "@/services/qa/system-prompt";
import { QaBudgetError } from "@/services/qa/token-budget";
import { QaResponseError } from "@/services/qa/qa-response";
import { QaInputValidationError } from "@/services/qa/qa-request";
import { responseCitations } from "@/lib/qa/citations";
import {
  listQaHistory,
  QaHistoryError,
  recordQaExchange,
  type QaHistoryOutcome,
} from "@/services/qa/qa-history";
import {
  reviewQuestionSchema,
  QUESTION_REQUIRED_MESSAGE,
  QUESTION_LENGTH_MESSAGE,
} from "@/lib/validation/review-question";
import { readJsonBodyWithLimit } from "../reviews/review-input";
import { errorResponse, logFailure, successResponse, targetNotFoundResponse } from "../responses";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/questions">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { targetId } = await ctx.params;
  try {
    // Deny foreign/missing targets before reading input. The real builder independently
    // rechecks cookie identity and ownership before retrieving fresh persisted evidence.
    const client = await createSupabaseServerClient();
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);
    // Requiring JSON also prevents cross-origin browser forms from triggering paid calls.
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") {
      return errorResponse(415, "INVALID_CONTENT_TYPE", "Send the question as JSON.");
    }
    const body = await readJsonBodyWithLimit(request, 16_384);
    const parsed = body.ok ? reviewQuestionSchema.safeParse(body.body) : null;
    if (!parsed?.success) {
      return errorResponse(
        400,
        "INVALID_QUESTION",
        "Enter a question about this target's reviews, using at most 2,000 characters.",
        parsed && !parsed.success
          ? {
              question: parsed.error.issues.some(
                (issue) => issue.path[0] === "question" && issue.code === "too_big",
              )
                ? QUESTION_LENGTH_MESSAGE
                : QUESTION_REQUIRED_MESSAGE,
            }
          : undefined,
      );
    }
    const callModel = createOpenAiQaModel();
    const result = await answerQuestion(targetId, parsed.data.question, {
      buildReviewDatasetContext,
      callModel: async (modelRequest) => {
        // Context/prompt must succeed first. Disabled/misconfigured Q&A consumes no slot.
        readOpenAiQaConfig();
        await reserveQuestionQuota(client);
        // Neither the token-count request nor generation can run without a durable slot.
        return callModel(modelRequest);
      },
    });
    const outcome: QaHistoryOutcome = result.outcome.startsWith("declined_")
      ? "out_of_scope"
      : (result.outcome as QaHistoryOutcome);
    // Already validated against the active target's evidence by parseQaModelReply.
    const citedReviewIds = responseCitations(result.outcome, result.citedReviewIds);
    return successResponse(200, {
      targetId: result.targetId,
      outcome,
      answer: result.answer,
      citedReviewIds,
      history: await saveToHistory(client, {
        targetId: result.targetId,
        question: parsed.data.question,
        outcome,
        answer: result.answer,
        citedReviewIds,
        promptVersion: result.promptVersion,
      }),
    });
  } catch (error) {
    logFailure("ask-question", error);
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof QaInputValidationError) {
      if (error.code === "QA_REQUEST_TOO_LARGE")
        return errorResponse(413, error.code, error.message);
      return errorResponse(400, "INVALID_QUESTION", error.message, {
        question:
          error.code === "QA_QUESTION_TOO_LONG"
            ? QUESTION_LENGTH_MESSAGE
            : QUESTION_REQUIRED_MESSAGE,
      });
    }
    if (error instanceof QuestionQuotaError) {
      const response = errorResponse(
        error.code === "QA_DAILY_LIMIT" ? 429 : 503,
        error.code,
        error.message,
      );
      if (error.code === "QA_DAILY_LIMIT") response.headers.set("Retry-After", "86400");
      return response;
    }
    if (error instanceof ReviewContextError) {
      const status =
        error.code === "AUTH_REQUIRED"
          ? 401
          : error.code === "NO_REVIEW_DATA"
            ? 409
            : error.code === "REVIEW_CONTEXT_TOO_LARGE"
              ? 413
              : 503;
      return errorResponse(status, error.code, error.message);
    }
    if (error instanceof QaPromptError)
      return errorResponse(
        error.code === "REQUEST_TOO_LARGE" ? 413 : 400,
        error.code,
        error.message,
      );
    if (error instanceof QaModelError) return errorResponse(503, error.code, error.message);
    if (error instanceof QaBudgetError || error instanceof QaResponseError)
      return errorResponse(503, error.code, error.message);
    return errorResponse(
      500,
      "QA_FAILED",
      "We couldn't answer your question. Please try again later.",
    );
  }
}

/**
 * S3-006: stores the exchange the user just saw. The answer has already used a paid quota slot, so
 * a history failure never hides it: the response says it was not saved instead.
 */
async function saveToHistory(
  client: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  exchange: Parameters<typeof recordQaExchange>[1],
) {
  try {
    const saved = await recordQaExchange(client, exchange);
    return { saved: true as const, id: saved.id, createdAt: saved.createdAt };
  } catch (error) {
    logFailure("save-question-history", error);
    return {
      saved: false as const,
      reason: error instanceof QaHistoryError ? error.code : "QA_HISTORY_UNAVAILABLE",
    };
  }
}

/** S3-006: the analysis's persisted Q&A history, oldest first (restored by S3-007). */
export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/analysis-targets/[targetId]/questions">,
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const { targetId } = await ctx.params;
  try {
    const client = await createSupabaseServerClient();
    await getOwnedTargetOrThrow(client, targetId, auth.user.id);
    const exchanges = await listQaHistory(client, targetId);
    return successResponse(200, { targetId, exchanges });
  } catch (error) {
    logFailure("list-question-history", error);
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
    if (error instanceof QaHistoryError) return errorResponse(503, error.code, error.message);
    return errorResponse(
      500,
      "QA_HISTORY_FAILED",
      "We couldn't load the Q&A history. Please try again later.",
    );
  }
}
