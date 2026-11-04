import type { NormalizedReview, Review } from "@/types/review";
import { InvalidReviewError, TargetNotFoundError } from "./errors";

/** Data-access port. The Supabase implementation must use the user-scoped client (RLS on). */
export interface ReviewStore {
  getTargetOwnerId(targetId: string): Promise<string | null>;
  insertReviews(targetId: string, reviews: NormalizedReview[]): Promise<Review[]>;
  listReviews(targetId: string): Promise<Review[]>;
}

async function assertOwnsTarget(store: ReviewStore, userId: string, targetId: string) {
  const ownerId = await store.getTargetOwnerId(targetId);

  if (ownerId === null || ownerId !== userId) {
    throw new TargetNotFoundError();
  }
}

function assertValid(review: NormalizedReview) {
  if (typeof review.reviewText !== "string" || review.reviewText.trim() === "") {
    throw new InvalidReviewError("Review text is required.");
  }

  if (typeof review.rating !== "number" || !Number.isFinite(review.rating)) {
    throw new InvalidReviewError("Review rating must be a number.");
  }
}

/**
 * userId MUST come from the verified session (S1-011), never from the request body (S1-BR-010).
 * Persists nothing if any review is invalid, so a bad batch is never partially saved.
 */
export async function saveReviews(
  store: ReviewStore,
  userId: string,
  targetId: string,
  reviews: NormalizedReview[],
): Promise<Review[]> {
  await assertOwnsTarget(store, userId, targetId);
  reviews.forEach(assertValid);

  if (reviews.length === 0) {
    return [];
  }

  return store.insertReviews(targetId, reviews);
}

export async function getReviewsForTarget(
  store: ReviewStore,
  userId: string,
  targetId: string,
): Promise<Review[]> {
  await assertOwnsTarget(store, userId, targetId);

  return store.listReviews(targetId);
}
