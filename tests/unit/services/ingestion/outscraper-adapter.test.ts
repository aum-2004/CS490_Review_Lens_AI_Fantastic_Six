import { mapOutscraperReview, mapOutscraperReviews } from "@/services/ingestion/outscraper-adapter";

describe("Outscraper review adapter", () => {
  it("maps a review into Deep's RawReview format", () => {
    const raw = {
      review_text: "Great coffee and service!",
      review_rating: 5,
      review_id: "test-review-001",
      author_title: "Test Reviewer",
      review_timestamp: 1793481600,
      review_link: "https://example.com/review/001",
      place_id: "test-place-id",
      google_id: "test-google-id",
    };

    const result = mapOutscraperReview(raw);

    expect(result).toMatchObject({
      text: "Great coffee and service!",
      rating: 5,
      sourceReviewId: "test-review-001",
      reviewerName: "Test Reviewer",
      reviewUrl: "https://example.com/review/001",
      metadata: {
        platform: "google_maps",
        provider: "outscraper",
        placeId: "test-place-id",
        googleId: "test-google-id",
      },
    });

    expect(result.reviewDate).toBe(new Date(1793481600 * 1000).toISOString());
  });

  it("does not fabricate missing review text or rating", () => {
    const result = mapOutscraperReview({
      review_id: "test-review-002",
    });

    expect(result.text).toBeUndefined();
    expect(result.rating).toBeUndefined();
  });

  it("handles missing optional fields", () => {
    const result = mapOutscraperReview({
      review_text: "Good coffee",
      review_rating: 4,
    });

    expect(result.text).toBe("Good coffee");
    expect(result.rating).toBe(4);
    expect(result.reviewDate).toBeUndefined();
    expect(result.reviewUrl).toBeUndefined();
  });

  it("handles malformed individual records", () => {
    const result = mapOutscraperReviews([
      null,
      "invalid",
      { review_text: "Good", review_rating: 5 },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0].text).toBeUndefined();
    expect(result[1].rating).toBeUndefined();
    expect(result[2].text).toBe("Good");
  });
});
