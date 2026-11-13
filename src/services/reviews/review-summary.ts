import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLatestAttempt,
  type IngestionAttemptRow,
} from "@/services/ingestion/ingestion-attempt-repository";
import type { IngestionState } from "@/services/ingestion/ingestion-state";

import { getReviewsForTarget, type Review, type ReviewStore } from "./review-service";

export interface ReviewSummary {
  targetId: string;
  reviewCount: number;
  averageRating: number | null;
  ingestionStatus: IngestionState | null;
  skippedCount: number | null;
}

function summarizeRatings(
  targetId: string,
  reviews: Review[],
): Pick<ReviewSummary, "targetId" | "reviewCount" | "averageRating"> {
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount === 0
      ? null
      : reviews.reduce((total, review) => total + review.rating, 0) / reviewCount;

  return { targetId, reviewCount, averageRating };
}

function summarizeIngestion(
  attempt: IngestionAttemptRow | null,
): Pick<ReviewSummary, "ingestionStatus" | "skippedCount"> {
  return {
    ingestionStatus: attempt?.status ?? null,
    skippedCount: attempt?.skipped_count ?? null,
  };
}

/**
 * Returns persisted review metrics for an authenticated user's owned target.
 * `getReviewsForTarget` performs the parent ownership check before reading child reviews, while
 * `getLatestAttempt` reads the same owner-bound ingestion record used by the ingestion UI.
 */
export async function getReviewSummary(
  store: ReviewStore,
  client: SupabaseClient,
  userId: string,
  targetId: string,
): Promise<ReviewSummary> {
  const reviews = await getReviewsForTarget(store, userId, targetId);
  const attempt = await getLatestAttempt(client, userId, targetId);

  return {
    ...summarizeRatings(targetId, reviews),
    ...summarizeIngestion(attempt),
  };
}
