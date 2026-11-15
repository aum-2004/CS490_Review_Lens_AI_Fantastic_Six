import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnalysisTargetById } from "@/services/analysis-targets/analysis-target-repository";

import { ReviewPersistenceError } from "./errors";
import type { Review, ReviewAggregate, ReviewStore } from "./review-service";
import type { NormalizedReview } from "./types";

interface ReviewRow {
  id: string;
  analysis_target_id: string;
  review_text: string;
  rating: number | string;
  source_review_id: string | null;
  reviewer_name: string | null;
  review_date: string | null;
  review_url: string | null;
  source_metadata: Record<string, unknown> | null;
  created_at: string;
}

const TABLE = "reviews";
const INSERT_RPC = "insert_reviews";
const SUMMARY_RPC = "get_review_summary";

/**
 * Rows requested per page when reading reviews. Supabase's Data API returns at most the
 * project's "Max rows" (1,000 by default) per request, so one unpaginated query would silently
 * truncate large targets. Paging stops only on an empty page, so a server limit lower than this
 * value still returns every review.
 */
export const REVIEW_PAGE_SIZE = 1000;
// One string literal so supabase-js can parse the selected columns into a row type.
const COLUMNS =
  "id, analysis_target_id, review_text, rating, source_review_id, reviewer_name, review_date, review_url, source_metadata, created_at";

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    analysisTargetId: row.analysis_target_id,
    text: row.review_text,
    rating: Number(row.rating),
    sourceReviewId: row.source_review_id,
    reviewerName: row.reviewer_name,
    reviewDate: row.review_date,
    reviewUrl: row.review_url,
    sourceMetadata: row.source_metadata,
    createdAt: row.created_at,
  };
}

function toInsertRow(review: NormalizedReview) {
  return {
    review_text: review.text,
    rating: review.rating,
    source_review_id: review.sourceReviewId ?? null,
    reviewer_name: review.reviewerName ?? null,
    review_date: review.reviewDate?.toISOString() ?? null,
    review_url: review.reviewUrl ?? null,
    source_metadata: review.sourceMetadata ?? null,
  };
}

/** Pass the user-scoped server client (cookie session). Never the service-role client. */
export function createSupabaseReviewStore(client: SupabaseClient): ReviewStore {
  return {
    async isTargetOwnedBy(targetId, userId) {
      // S1-014 returns null for missing, foreign, and non-UUID ids alike.
      return (await getAnalysisTargetById(client, userId, targetId)) !== null;
    },

    async insertReviews(targetId, reviews) {
      // The user-scoped RPC derives ownership from auth.uid(), validates the complete batch, and
      // inserts atomically. Authenticated clients have no direct INSERT privilege on reviews.
      const { data, error } = await client.rpc(INSERT_RPC, {
        p_target_id: targetId,
        p_rows: reviews.map(toInsertRow),
      });

      if (error || !data) {
        throw new ReviewPersistenceError("save", { cause: error });
      }

      return (data as ReviewRow[]).map(toReview);
    },

    async aggregateReviews(targetId): Promise<ReviewAggregate> {
      // The invoker-security RPC performs the ownership check and computes count/average in
      // PostgreSQL. It deliberately selects no review text, identity, metadata, or other columns.
      const { data, error } = await client.rpc(SUMMARY_RPC, { p_target_id: targetId });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row || typeof row !== "object") {
        throw new ReviewPersistenceError("summary", { cause: error });
      }

      const result = row as {
        review_count?: number | string;
        average_rating?: number | string | null;
      };
      const reviewCount = Number(result.review_count);
      const averageRating =
        result.average_rating === null || result.average_rating === undefined
          ? null
          : Number(result.average_rating);
      if (!Number.isSafeInteger(reviewCount) || reviewCount < 0) {
        throw new ReviewPersistenceError("summary");
      }
      if (averageRating !== null && !Number.isFinite(averageRating)) {
        throw new ReviewPersistenceError("summary");
      }

      return { reviewCount, averageRating };
    },

    async listReviews(targetId) {
      // S1-022 requires every review of the target. Each page keeps the target filter and the
      // stable (created_at, id) order. Any failed page fails the whole read: a partial result
      // is never returned as if it were complete.
      const rows: ReviewRow[] = [];

      while (true) {
        const from = rows.length;
        const { data, error } = await client
          .from(TABLE)
          .select(COLUMNS)
          .eq("analysis_target_id", targetId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + REVIEW_PAGE_SIZE - 1);

        if (error || !data) {
          throw new ReviewPersistenceError("load", { cause: error });
        }
        if (data.length === 0) {
          return rows.map(toReview);
        }

        rows.push(...(data as ReviewRow[]));
      }
    },
  };
}
