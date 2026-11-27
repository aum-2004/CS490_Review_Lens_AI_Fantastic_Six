interface ReviewFilterable {
  rating: number;
  reviewDate: string | null;
}

export interface ReviewFilters {
  minRating: number | null;
  maxRating: number | null;
  startDate: string;
  endDate: string;
}

export const RATING_FILTER_ERROR =
  "Ratings must be numbers from 1 through 5, and the minimum cannot exceed the maximum.";
export const DATE_FILTER_ERROR =
  "Dates must use valid calendar dates, and the start date cannot be after the end date.";

export const EMPTY_REVIEW_FILTERS: ReviewFilters = {
  minRating: null,
  maxRating: null,
  startDate: "",
  endDate: "",
};

/** Applies every active criterion to the already-authorized target dataset without mutation. */
export function filterReviews<T extends ReviewFilterable>(
  reviews: readonly T[],
  filters: ReviewFilters,
): T[] {
  return reviews.filter((review) => {
    if (filters.minRating !== null && review.rating < filters.minRating) return false;
    if (filters.maxRating !== null && review.rating > filters.maxRating) return false;
    if (filters.startDate || filters.endDate) {
      if (!review.reviewDate) return false;
      const sourceDate = review.reviewDate.slice(0, 10);
      if (filters.startDate && sourceDate < filters.startDate) return false;
      if (filters.endDate && sourceDate > filters.endDate) return false;
    }
    return true;
  });
}

export function hasActiveReviewFilters(filters: ReviewFilters): boolean {
  return (
    filters.minRating !== null ||
    filters.maxRating !== null ||
    filters.startDate !== "" ||
    filters.endDate !== ""
  );
}

/** Validates draft values before they become the applied filter state. */
export function validateReviewFilters(filters: ReviewFilters): string | null {
  const ratingsAreValid = [filters.minRating, filters.maxRating].every(
    (rating) => rating === null || (Number.isFinite(rating) && rating >= 1 && rating <= 5),
  );
  if (
    !ratingsAreValid ||
    (filters.minRating !== null &&
      filters.maxRating !== null &&
      filters.minRating > filters.maxRating)
  ) {
    return RATING_FILTER_ERROR;
  }

  const datesAreValid = [filters.startDate, filters.endDate].every(
    (date) => date === "" || isValidDateInput(date),
  );
  if (
    !datesAreValid ||
    (filters.startDate !== "" && filters.endDate !== "" && filters.startDate > filters.endDate)
  ) {
    return DATE_FILTER_ERROR;
  }

  return null;
}

function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
