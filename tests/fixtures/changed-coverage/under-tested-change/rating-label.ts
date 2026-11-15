// S2-001 failure-path fixture: a deliberately under-tested change.
//
// The gate tests copy this file into a throwaway git repository as a new
// `src/lib/rating-label.ts` and pair it with coverage-final.json, in which only
// the "positive" path ran. The gate must reject that change. This file is never
// part of the application and lives under tests/fixtures on purpose.

export function ratingLabel(rating: number): string {
  if (rating >= 4) {
    return "positive";
  }
  if (rating === 3) {
    return "mixed";
  }
  if (rating >= 1) {
    return "negative";
  }
  throw new RangeError(`Unsupported rating: ${rating}`);
}
