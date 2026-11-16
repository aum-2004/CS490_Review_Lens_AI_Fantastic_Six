import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLatestAttempt,
  type IngestionAttemptRow,
} from "@/services/ingestion/ingestion-attempt-repository";
import type { IngestionState } from "@/services/ingestion/ingestion-state";

import { TargetNotFoundError } from "./errors";
import type { ReviewStore } from "./review-service";

export interface ReviewSummary {
  targetId: string;
  reviewCount: number;
  averageRating: number | null;
  ingestionStatus: IngestionState | null;
  skippedCount: number | null;
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
 * Returns exact persisted review metrics for an authenticated user's owned target.
 * The store's aggregate executes in PostgreSQL and returns only count and average; review text,
 * reviewer names, metadata, and other full Review fields never enter application memory.
 */
export async function getReviewSummary(
  store: ReviewStore,
  client: SupabaseClient,
  userId: string,
  targetId: string,
): Promise<ReviewSummary> {
  if (!(await store.isTargetOwnedBy(targetId, userId))) {
    throw new TargetNotFoundError();
  }

  const aggregate = await store.aggregateReviews(targetId);
  const attempt = await getLatestAttempt(client, userId, targetId);

  return {
    targetId,
    ...aggregate,
    ...summarizeIngestion(attempt),
  };
}
