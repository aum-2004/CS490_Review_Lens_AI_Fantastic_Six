import "server-only";

import {
  getOutscraperResult,
  OutscraperError,
  type OutscraperExpectedIdentity,
  type VerifiedBusinessIdentity,
} from "./outscraper-client";
import { mapOutscraperReviews } from "./outscraper-adapter";

export type VerifiedExtractedReviews =
  | { status: "pending" }
  | {
      status: "completed";
      identity: VerifiedBusinessIdentity;
      businessName: string;
      placeId: string;
      reviews: ReturnType<typeof mapOutscraperReviews>;
      skippedCount?: number;
    };

/**
 * S1-020: Retrieve Outscraper results and convert
 * them into the field structure used by S1-021.
 *
 * Does not persist reviews or modify AnalysisTargets. S1-022/S1-023 may consume only the
 * completed result returned here; raw provider payloads and adapter output are not verified
 * persistence inputs. A pending result has no reviews, and missing, ambiguous, or mismatched
 * provider identity throws before any review mapping is accepted.
 */
export async function getExtractedReviews(
  requestId: string,
  expectedIdentity: string | OutscraperExpectedIdentity,
  fetcher?: typeof fetch,
): Promise<VerifiedExtractedReviews> {
  const result = await getOutscraperResult(requestId, expectedIdentity, fetcher);

  if (result.status === "pending") {
    return {
      status: "pending" as const,
    };
  }

  const mappedReviews = mapOutscraperReviews(
    result.reviews.map((review) => {
      if (review.place_id !== undefined && review.place_id !== result.placeId) {
        throw new OutscraperError(
          "BUSINESS_MISMATCH",
          "The provider returned a review for a different business.",
        );
      }

      return {
        ...review,
        place_id: review.place_id ?? result.placeId,
      };
    }),
  );

  const usableReviews = mappedReviews.filter((review) => {
    const hasText = typeof review.text === "string" && review.text.trim().length > 0;

    const rating =
      typeof review.rating === "string" &&
      /^(?:[1-5](?:\.\d+)?|0?\.\d+)$/.test(review.rating.trim())
        ? Number.parseFloat(review.rating.trim())
        : review.rating;

    const hasValidRating =
      typeof rating === "number" && Number.isFinite(rating) && rating >= 1 && rating <= 5;

    return hasText && hasValidRating;
  });

  if (usableReviews.length === 0) {
    throw new OutscraperError(
      "INSUFFICIENT_REVIEWS",
      "No usable written reviews with ratings were found for this business.",
    );
  }

  return {
    status: "completed" as const,
    businessName: result.businessName,
    placeId: result.placeId,
    identity: result.identity,
    reviews: usableReviews,
    skippedCount: mappedReviews.length - usableReviews.length,
  };
}
