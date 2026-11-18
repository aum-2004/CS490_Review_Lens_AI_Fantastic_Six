/**
 * S1-020: Map Outscraper review data into the
 * RawReview format used by S1-021.
 */

type OutscraperRecord = Record<string, unknown>;

function formatReviewDate(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Outscraper Unix timestamps are in seconds.
    const date = new Date(value * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  return undefined;
}

export function mapOutscraperReview(record: OutscraperRecord) {
  return {
    text: record.review_text,
    rating: record.review_rating,
    sourceReviewId: record.review_id,
    reviewerName: record.author_title,
    reviewDate: formatReviewDate(record.review_timestamp),
    reviewUrl: record.review_link,
    metadata: {
      platform: "google_maps",
      provider: "outscraper",
      placeId: record.place_id,
      googleId: record.google_id,
    },
  };
}

export function mapOutscraperReviews(records: unknown[]) {
  return records.map((record) => {
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      return mapOutscraperReview({});
    }

    return mapOutscraperReview(record as OutscraperRecord);
  });
}
