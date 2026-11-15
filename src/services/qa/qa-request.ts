import "server-only";

import {
  buildQaModelRequest,
  type PromptReview,
  type PromptTarget,
  type QaModelRequest,
} from "@/services/qa/system-prompt";

/**
 * The part of the S2-010 review context this module reads. S2-010's `ReviewDatasetContext`
 * (`buildReviewDatasetContext`, PR #78) satisfies it structurally, so S2-013 does not import the
 * unmerged module. Its extra fields (`target.sourceUrl`, `evidenceJson`, ...) are ignored.
 */
export interface QaReviewContext {
  readonly target: Readonly<PromptTarget>;
  readonly reviews: readonly Readonly<PromptReview>[];
}

/**
 * Service-boundary limits, checked in `runGroundedQaRequest` before the injected model caller runs.
 * They apply to every caller (route, harness, scripts), not only the public route, and do not
 * depend on the provider. Provider token counting stays in the OpenAI adapter
 * (`openai-qa-client.ts` / `token-budget.ts`).
 */
/** Matches the S2-009 route's question limit (2,000 characters after trimming). */
export const QA_MAX_QUESTION_CHARACTERS = 2_000;
/** Largest UTF-8 size of the serialized model request (`JSON.stringify(request)`): 128 KiB. */
export const QA_MAX_REQUEST_BYTES = 131_072;

export type QaInputValidationErrorCode =
  "QA_QUESTION_INVALID_TYPE" | "QA_QUESTION_TOO_LONG" | "QA_REQUEST_TOO_LARGE";

const INPUT_MESSAGES: Record<QaInputValidationErrorCode, string> = {
  QA_QUESTION_INVALID_TYPE: "Enter a question about the reviews.",
  QA_QUESTION_TOO_LONG: `Questions can be up to ${QA_MAX_QUESTION_CHARACTERS.toLocaleString("en-US")} characters.`,
  QA_REQUEST_TOO_LARGE:
    "This question is too long to analyze with these reviews. Try a shorter question.",
};

/**
 * Input rejected at the shared service boundary, before any model call. The code is stable, so
 * routes and the S2-003 harness can match on it. The message is user-safe; `detail` is for server
 * logs and holds only sizes and types, never question or review text.
 */
export class QaInputValidationError extends Error {
  constructor(
    readonly code: QaInputValidationErrorCode,
    readonly detail: string,
  ) {
    super(INPUT_MESSAGES[code]);
    this.name = "QaInputValidationError";
  }
}

/** Throws QaInputValidationError unless `question` is a string within the length limit. */
export function assertValidQuestion(question: unknown): asserts question is string {
  if (typeof question !== "string") {
    throw new QaInputValidationError(
      "QA_QUESTION_INVALID_TYPE",
      `Question must be a string; received ${question === null ? "null" : typeof question}.`,
    );
  }
  const length = question.trim().length;
  if (length > QA_MAX_QUESTION_CHARACTERS) {
    throw new QaInputValidationError(
      "QA_QUESTION_TOO_LONG",
      `Question is ${length} characters after trimming; the limit is ${QA_MAX_QUESTION_CHARACTERS}.`,
    );
  }
}

/** Throws QaInputValidationError if the serialized request exceeds QA_MAX_REQUEST_BYTES. */
export function assertRequestWithinSizeLimit(request: QaModelRequest): void {
  const bytes = Buffer.byteLength(JSON.stringify(request), "utf8");
  if (bytes > QA_MAX_REQUEST_BYTES) {
    throw new QaInputValidationError(
      "QA_REQUEST_TOO_LARGE",
      `Serialized model request is ${bytes} bytes; the limit is ${QA_MAX_REQUEST_BYTES}.`,
    );
  }
}

/** Builds the authorized context for a target, or throws. In production: S2-010's builder. */
export type QaReviewContextBuilder = (targetId: unknown) => Promise<QaReviewContext>;

/** The single model boundary. S2-011 supplies the provider call; S2-003 supplies a mock. */
export type QaModelInvoker<T> = (request: QaModelRequest) => Promise<T>;

export interface GroundedQaDependencies<T> {
  buildReviewDatasetContext: QaReviewContextBuilder;
  invokeModel: QaModelInvoker<T>;
}

/**
 * Adapter from the S2-010 context to the S2-013 prompt input. The types already match; this
 * explicit projection guarantees only the listed fields reach the prompt builder, which encodes
 * its own dataset (S2-010's `evidenceJson` is never sent).
 */
export function toPromptContext(context: QaReviewContext): {
  target: PromptTarget;
  reviews: PromptReview[];
} {
  return {
    target: {
      id: context.target.id,
      name: context.target.name,
      platform: context.target.platform,
    },
    reviews: context.reviews.map((review) => ({
      id: review.id,
      analysisTargetId: review.analysisTargetId,
      rating: review.rating,
      text: review.text,
      reviewDate: review.reviewDate,
    })),
  };
}

/**
 * The shared service boundary. Order:
 *   1. validate the question (type, length): QaInputValidationError, before any data is loaded;
 *   2. build the authorized review context (S2-010): ReviewContextError / TargetNotFoundError;
 *   3. build the model request (S2-013): QaPromptError;
 *   4. check the serialized request size: QaInputValidationError;
 *   5. call the model.
 * If any step throws, the error propagates and `invokeModel` is never called. `question` is
 * `unknown` because callers may pass unvalidated input; it is checked at runtime.
 */
export async function runGroundedQaRequest<T>(
  targetId: unknown,
  question: unknown,
  { buildReviewDatasetContext, invokeModel }: GroundedQaDependencies<T>,
): Promise<T> {
  assertValidQuestion(question);
  const context = await buildReviewDatasetContext(targetId);
  const request = buildQaModelRequest({ ...toPromptContext(context), question });
  assertRequestWithinSizeLimit(request);
  return invokeModel(request);
}
