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

  it("removes NUL characters from text but keeps the review", () => {
    const result = normalizeReview({ ...valid, text: "Great\u0000 food" });
    expect(result).toMatchObject({ ok: true, review: { text: "Great food" } });
  });

  it("rejects text that is only NUL characters", () => {
    expect(normalizeReview({ ...valid, text: "\u0000\u0000 \u0000" })).toMatchObject({
      ok: false,
      reason: "MISSING_TEXT",
    });
  });

  it("removes NUL characters from other string fields", () => {
    const result = normalizeReview({
      ...valid,
      reviewerName: "Sa\u0000m",
      sourceReviewId: "\u0000",
    });
    expect(result).toMatchObject({ ok: true, review: { reviewerName: "Sam" } });
    if (result.ok) expect(result.review.sourceReviewId).toBeUndefined();
  });

  it.each([undefined, null, ""])("rejects missing rating: %p", (rating) => {
    expect(normalizeReview({ ...valid, rating })).toMatchObject({
      ok: false,
      reason: "MISSING_RATING",
    });
  });

  it.each([0, 6, -1, "abc", "0x5", "5e0", "0b101", NaN, Infinity, true, {}])(
    "rejects invalid rating: %p",
    (rating) => {
      expect(normalizeReview({ ...valid, rating })).toMatchObject({
        ok: false,
        reason: "INVALID_RATING",
      });
    },
  );

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

  it("does not share the metadata object with the input", () => {
    const metadata = { helpfulVotes: 3 };
    const result = normalizeReview({ ...valid, metadata });
    metadata.helpfulVotes = 99;
    expect(result).toMatchObject({ ok: true, review: { sourceMetadata: { helpfulVotes: 3 } } });
  });

  it("drops future review dates but keeps the review", () => {
    const result = normalizeReview({ ...valid, reviewDate: "2099-01-01" });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.review.reviewDate).toBeUndefined();
  });

  it.each([
    "5",
    "Review 5",
    "March 2",
    1700000000,
    "2026-10-01T12:00:00",
    "2026-02-30",
    "2026-13-01",
    {},
    new Date("invalid"),
  ])("drops non-ISO or invalid dates but keeps the review: %p", (reviewDate) => {
    const result = normalizeReview({ ...valid, reviewDate });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.review.reviewDate).toBeUndefined();
  });

  it.each([
    ["2026-10-01", "2026-10-01T00:00:00.000Z"],
    ["2026-10-01T12:00:00.123Z", "2026-10-01T12:00:00.123Z"],
    ["2026-10-01T12:00:00+05:30", "2026-10-01T06:30:00.000Z"],
  ])("accepts ISO 8601 date %p", (reviewDate, expected) => {
    const result = normalizeReview({ ...valid, reviewDate });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.review.reviewDate?.toISOString()).toBe(expected);
  });

  it("accepts a valid Date object", () => {
    const reviewDate = new Date("2026-10-01T12:00:00Z");
    const result = normalizeReview({ ...valid, reviewDate });
    expect(result).toMatchObject({ ok: true, review: { reviewDate } });
  });

  it("drops URLs with embedded credentials", () => {
    const result = normalizeReview({ ...valid, reviewUrl: "https://user:pass@example.com/r/1" });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.review.reviewUrl).toBeUndefined();
  });

  it("returns the normalized URL href", () => {
    const result = normalizeReview({ ...valid, reviewUrl: "https://example.com" });
    expect(result).toMatchObject({ ok: true, review: { reviewUrl: "https://example.com/" } });
  });

  it("converts numeric source review ids to strings", () => {
    expect(normalizeReview({ ...valid, sourceReviewId: 12345 })).toMatchObject({
      ok: true,
      review: { sourceReviewId: "12345" },
    });
  });

  it.each([NaN, Infinity, {}, true])("drops an unusable source review id: %p", (sourceReviewId) => {
    const result = normalizeReview({ ...valid, sourceReviewId });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.review.sourceReviewId).toBeUndefined();
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
