import "server-only";

import { getOutscraperResult, OutscraperError } from "./outscraper-client";
import { mapOutscraperReviews } from "./outscraper-adapter";
/**
 * S1-020: Retrieve Outscraper results and convert
 * them into the field structure used by S1-021.
 *
 * Does not persist reviews or modify AnalysisTargets.
 */
export async function getExtractedReviews(
  requestId: string,
  expectedPlaceId: string,
  fetcher?: typeof fetch,
) {
  const result = await getOutscraperResult(requestId, expectedPlaceId, fetcher);

  if (result.status === "pending") {
    return {
      status: "pending" as const,
    };
  }

  const reviews = mapOutscraperReviews(
    result.reviews.map((review) => ({
      ...review,
      place_id: result.placeId,
    })),
  );

  const usableReviews = reviews.filter((review) => {
    const hasText = typeof review.text === "string" && review.text.trim().length > 0;

    const rating =
      typeof review.rating === "string" && review.rating.trim() !== ""
        ? Number(review.rating)
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
    reviews,
  };
}
