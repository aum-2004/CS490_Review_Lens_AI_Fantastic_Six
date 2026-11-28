import {
  filterReviews,
  EMPTY_REVIEW_FILTERS,
  validateReviewFilters,
} from "@/lib/reviews/filter-reviews";
import type { Review } from "@/services/reviews/review-service";

function review(
  id: string,
  rating: number,
  reviewDate: string | null,
  target = "target-a",
): Review {
  return {
    id,
    analysisTargetId: target,
    text: id,
    rating,
    sourceReviewId: null,
    reviewerName: null,
    reviewDate,
    reviewUrl: null,
    sourceMetadata: null,
    createdAt: "2026-11-01T00:00:00.000Z",
  };
}

const reviews = [
  review("one", 1, "2026-01-01T23:59:00.000Z"),
  review("two", 2, "2026-01-02T00:00:00.000Z"),
  review("four", 4, "2026-01-03T12:00:00.000Z"),
  review("five", 5, "2026-01-04T00:00:00.000Z"),
  review("undated", 4, null),
  review("other-target", 4, "2026-01-02T00:00:00.000Z", "target-b"),
];

describe("filterReviews", () => {
  test("filters inclusively by minimum and maximum rating independently and together", () => {
    expect(
      filterReviews(reviews, { ...EMPTY_REVIEW_FILTERS, minRating: 4 }).map(({ id }) => id),
    ).toEqual(["four", "five", "undated", "other-target"]);
    expect(
      filterReviews(reviews, { ...EMPTY_REVIEW_FILTERS, maxRating: 2 }).map(({ id }) => id),
    ).toEqual(["one", "two"]);
    expect(
      filterReviews(reviews, { ...EMPTY_REVIEW_FILTERS, minRating: 2, maxRating: 4 }).map(
        ({ id }) => id,
      ),
    ).toEqual(["two", "four", "undated", "other-target"]);
  });

  test("uses inclusive date bounds and excludes missing source dates when a date filter is active", () => {
    expect(
      filterReviews(reviews, {
        ...EMPTY_REVIEW_FILTERS,
        startDate: "2026-01-02",
        endDate: "2026-01-03",
      }).map(({ id }) => id),
    ).toEqual(["two", "four", "other-target"]);
  });

  test("combines rating and date constraints with AND semantics without mutating the dataset", () => {
    const original = [...reviews];
    expect(
      filterReviews(reviews, {
        minRating: 2,
        maxRating: 4,
        startDate: "2026-01-02",
        endDate: "2026-01-03",
      }).map(({ id }) => id),
    ).toEqual(["two", "four", "other-target"]);
    expect(reviews).toEqual(original);
  });

  test("returns an empty result when no review matches", () => {
    expect(
      filterReviews(reviews, { ...EMPTY_REVIEW_FILTERS, minRating: 5, endDate: "2025-12-31" }),
    ).toEqual([]);
  });
});

describe("validateReviewFilters", () => {
  test.each([
    { minRating: 0, maxRating: null },
    { minRating: null, maxRating: 6 },
    { minRating: 4, maxRating: 2 },
    { minRating: Number.NaN, maxRating: null },
  ])("rejects invalid rating bounds: %j", (ratings) => {
    expect(validateReviewFilters({ ...EMPTY_REVIEW_FILTERS, ...ratings })).toMatch(/Ratings/);
  });

  test.each([
    { startDate: "2026-02-30", endDate: "" },
    { startDate: "2026-01-03", endDate: "2026-01-02" },
    { startDate: "not-a-date", endDate: "" },
  ])("rejects invalid date bounds: %j", (dates) => {
    expect(validateReviewFilters({ ...EMPTY_REVIEW_FILTERS, ...dates })).toMatch(/Dates/);
  });

  test("accepts empty, single-bound, and equal inclusive bounds", () => {
    expect(validateReviewFilters(EMPTY_REVIEW_FILTERS)).toBeNull();
    expect(validateReviewFilters({ ...EMPTY_REVIEW_FILTERS, minRating: 1 })).toBeNull();
    expect(
      validateReviewFilters({
        ...EMPTY_REVIEW_FILTERS,
        minRating: 5,
        maxRating: 5,
        startDate: "2026-01-01",
        endDate: "2026-01-01",
      }),
    ).toBeNull();
  });
});
