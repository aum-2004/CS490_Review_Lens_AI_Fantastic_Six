import { normalizeBatch, normalizeReview } from "@/services/reviews/normalize";

const valid = {
  text: "  Great service!  ",
  rating: 5,
  sourceReviewId: "r-1",
  reviewerName: "Sam",
  reviewDate: "2026-10-01T12:00:00Z",
  reviewUrl: "https://example.com/review/1",
  metadata: { helpfulVotes: 3 },
};

describe("normalizeReview", () => {
  it("normalizes a valid review and preserves metadata", () => {
    const result = normalizeReview(valid);
    expect(result).toEqual({
      ok: true,
      review: {
        text: "Great service!",
        rating: 5,
        sourceReviewId: "r-1",
        reviewerName: "Sam",
        reviewDate: new Date("2026-10-01T12:00:00Z"),
        reviewUrl: "https://example.com/review/1",
        sourceMetadata: { helpfulVotes: 3 },
      },
    });
  });

  it.each([undefined, null, "", "   ", 42])("rejects missing or unusable text: %p", (text) => {
    expect(normalizeReview({ ...valid, text }, 7)).toEqual({
      ok: false,
      reason: "MISSING_TEXT",
      index: 7,
    });
  });

  it.each([undefined, null, ""])("rejects missing rating: %p", (rating) => {
    expect(normalizeReview({ ...valid, rating })).toMatchObject({
      ok: false,
      reason: "MISSING_RATING",
    });
  });

  it.each([0, 6, -1, "abc", NaN, Infinity, true, {}])("rejects invalid rating: %p", (rating) => {
    expect(normalizeReview({ ...valid, rating })).toMatchObject({
      ok: false,
      reason: "INVALID_RATING",
    });
  });

  it("accepts a numeric-string rating", () => {
    expect(normalizeReview({ ...valid, rating: "4" })).toMatchObject({
      ok: true,
      review: { rating: 4 },
    });
  });

  it("keeps a review with only text and rating", () => {
    const result = normalizeReview({ text: "Fine", rating: 3 });
    expect(result).toEqual({
      ok: true,
      review: {
        text: "Fine",
        rating: 3,
        sourceReviewId: undefined,
        reviewerName: undefined,
        reviewDate: undefined,
        reviewUrl: undefined,
        sourceMetadata: undefined,
      },
    });
  });

  it("drops malformed optional fields without rejecting the review", () => {
    const result = normalizeReview({
      ...valid,
      reviewDate: "not-a-date",
      reviewUrl: "javascript:alert(1)",
      metadata: "oops",
    });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.review.reviewDate).toBeUndefined();
      expect(result.review.reviewUrl).toBeUndefined();
      expect(result.review.sourceMetadata).toBeUndefined();
    }
  });

  it.each([null, undefined, "string", 5])("rejects a non-object record: %p", (raw) => {
    expect(normalizeReview(raw)).toMatchObject({ ok: false });
  });
});

describe("normalizeBatch", () => {
  it("keeps valid records and reports rejected ones with their index", () => {
    const result = normalizeBatch([valid, { text: "", rating: 4 }, { text: "ok", rating: 9 }]);
    expect(result.reviews).toHaveLength(1);
    expect(result.rejected).toEqual([
      { index: 1, reason: "MISSING_TEXT" },
      { index: 2, reason: "INVALID_RATING" },
    ]);
  });

  it("returns nothing for an empty batch (no fabricated records)", () => {
    expect(normalizeBatch([])).toEqual({ reviews: [], rejected: [] });
  });
});
