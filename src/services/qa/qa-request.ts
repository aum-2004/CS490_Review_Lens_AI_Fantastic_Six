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
 * Builds the authorized review context for `targetId` (S2-010), then the model request (S2-013),
 * and only then calls the model. If either builder throws (S2-010's ReviewContextError or
 * TargetNotFoundError, or QaPromptError), the error propagates and `invokeModel` is never called.
 */
export async function runGroundedQaRequest<T>(
  targetId: unknown,
  question: string,
  { buildReviewDatasetContext, invokeModel }: GroundedQaDependencies<T>,
): Promise<T> {
  const context = await buildReviewDatasetContext(targetId);
  const request = buildQaModelRequest({ ...toPromptContext(context), question });
  return invokeModel(request);
}
