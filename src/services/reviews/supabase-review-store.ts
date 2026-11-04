import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedReview, Review } from "@/types/review";
import type { ReviewStore } from "./review-service";

interface ReviewRow {
  id: string;
  analysis_target_id: string;
  review_text: string;
  rating: number;
  source_review_id: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_url: string | null;
  created_at: string;
}

function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    analysisTargetId: row.analysis_target_id,
    reviewText: row.review_text,
    rating: Number(row.rating),
    sourceReviewId: row.source_review_id,
    reviewerName: row.reviewer_name,
    reviewedAt: row.reviewed_at,
    reviewUrl: row.review_url,
    createdAt: row.created_at,
  };
}

/** Pass the user-scoped server client (cookie session). Never the service-role client. */
export function createSupabaseReviewStore(client: SupabaseClient): ReviewStore {
  return {
    async getTargetOwnerId(targetId) {
      const { data, error } = await client
        .from("analysis_targets")
        .select("owner_id")
        .eq("id", targetId)
        .maybeSingle();

      if (error) {
        throw new Error("Failed to load analysis target.");
      }

      return data?.owner_id ?? null;
    },

    async insertReviews(targetId, reviews: NormalizedReview[]) {
      const { data, error } = await client
        .from("reviews")
        .insert(
          reviews.map((review) => ({
            analysis_target_id: targetId,
            review_text: review.reviewText,
            rating: review.rating,
            source_review_id: review.sourceReviewId ?? null,
            reviewer_name: review.reviewerName ?? null,
            reviewed_at: review.reviewedAt ?? null,
            review_url: review.reviewUrl ?? null,
          })),
        )
        .select();

      if (error) {
        throw new Error("Failed to save reviews.");
      }

      return (data as ReviewRow[]).map(toReview);
    },

    async listReviews(targetId) {
      const { data, error } = await client
        .from("reviews")
        .select()
        .eq("analysis_target_id", targetId)
        .order("created_at", { ascending: true });

      if (error) {
        throw new Error("Failed to load reviews.");
      }

      return (data as ReviewRow[]).map(toReview);
    },
  };
}
