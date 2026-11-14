// DEMO ONLY (S2-001): deliberately untested. Do not merge.
export function describeRating(rating: number): string {
  if (rating >= 4) return "positive";
  if (rating === 3) return "mixed";
  return "negative";
}
