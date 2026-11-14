import type { NextRequest } from "next/server";
import { requireApiUser } from "@/services/auth/access-control";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { answerQuestion } from "@/services/qa/answer-question";
import { buildReviewDatasetContext, ReviewContextError } from "@/services/qa/review-context";
import { createOpenAiQaModel, QaModelError } from "@/services/qa/openai-qa-client";
import { QaPromptError } from "@/services/qa/system-prompt";
import { QaBudgetError } from "@/services/qa/token-budget";
import { QaResponseError } from "@/services/qa/qa-response";
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
    const result = await answerQuestion(targetId, parsed.data.question, {
      buildReviewDatasetContext,
      callModel: createOpenAiQaModel(),
    });
    return successResponse(200, {
      targetId: result.targetId,
      outcome: result.outcome.startsWith("declined_") ? "out_of_scope" : result.outcome,
      answer: result.answer,
    });
  } catch (error) {
    logFailure("ask-question", error);
    if (error instanceof TargetNotFoundError) return targetNotFoundResponse();
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
