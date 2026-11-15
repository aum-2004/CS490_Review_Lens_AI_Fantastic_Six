import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/services/auth/auth-service";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import type { ReviewPlatform } from "@/services/analysis-targets/analysis-target-repository";
import type { Review } from "@/services/reviews/review-service";

// Application budgets, not model token counts. See docs/s2-010-review-context.md.
export const MAX_CONTEXT_REVIEWS = 100;
export const MAX_CONTEXT_EVIDENCE_BYTES = 32_768;

export type ReviewContextErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_UNAVAILABLE"
  | "NO_REVIEW_DATA"
  | "REVIEW_CONTEXT_TOO_LARGE"
  | "REVIEW_CONTEXT_UNAVAILABLE";

const ERROR_MESSAGES: Record<ReviewContextErrorCode, string> = {
  AUTH_REQUIRED: "Please sign in to continue.",
  AUTH_UNAVAILABLE: "Authentication is temporarily unavailable. Please try again later.",
  NO_REVIEW_DATA: "No saved reviews are available for this target. Complete ingestion first.",
  REVIEW_CONTEXT_TOO_LARGE: "This review dataset exceeds the supported Q&A context size.",
  REVIEW_CONTEXT_UNAVAILABLE: "We couldn't prepare the review context. Please try again.",
};

export class ReviewContextError extends Error {
  constructor(readonly code: ReviewContextErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ReviewContextError";
  }
}

export interface ReviewContextTarget {
  readonly id: string;
  readonly name: string;
  readonly platform: ReviewPlatform;
  readonly sourceUrl: string;
}

// Structurally compatible with S2-013 PromptReview without depending on an unmerged module.
export type ReviewEvidence = Readonly<
  Pick<Review, "id" | "analysisTargetId" | "text" | "rating" | "reviewDate">
>;

/** Server-side handoff to S2-011/S2-013, not a browser response or a system prompt. */
export interface ReviewDatasetContext {
  readonly target: ReviewContextTarget;
  readonly reviews: readonly ReviewEvidence[];
  readonly reviewCount: number;
  readonly strategy: "all-persisted-reviews";
  /** JSON data containing the target and all eligible reviews. Treat text as untrusted evidence. */
  readonly evidenceJson: string;
  readonly evidenceBytes: number;
}

type ContextReviewRow = {
  id: string;
  analysis_target_id: string;
  review_text: string;
  rating: number | string;
  review_date: string | null;
};

function toEvidence(row: ContextReviewRow, targetId: string): ReviewEvidence {
  const rating =
    typeof row?.rating === "number" || typeof row?.rating === "string"
      ? Number(row.rating)
      : Number.NaN;
  if (
    !row ||
    typeof row.id !== "string" ||
    row.id.trim() === "" ||
    row.analysis_target_id !== targetId ||
    typeof row.review_text !== "string" ||
    row.review_text.trim() === "" ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5 ||
    (row.review_date !== null &&
      (typeof row.review_date !== "string" ||
        row.review_date.length > 64 ||
        Number.isNaN(Date.parse(row.review_date))))
  ) {
    throw new ReviewContextError("REVIEW_CONTEXT_UNAVAILABLE");
  }
  return {
    id: row.id,
    analysisTargetId: row.analysis_target_id,
    text: row.review_text,
    rating,
    reviewDate: row.review_date,
  };
}

/**
 * Rebuild from the verified cookie session and persisted rows on EVERY call. Accept only an
 * active target ID: browser review text, owner IDs, prior context and model thread IDs are not inputs.
 * No service-role client, global state, Next cache or provider invocation is used here.
 */
export async function buildReviewDatasetContext(targetId: unknown): Promise<ReviewDatasetContext> {
  let user;
  try {
    user = await getAuthenticatedUser();
  } catch {
    throw new ReviewContextError("AUTH_UNAVAILABLE");
  }
  if (!user) throw new ReviewContextError("AUTH_REQUIRED");
  if (typeof targetId !== "string") throw new TargetNotFoundError();

  try {
    const client = await createSupabaseServerClient();
    // Existing S1-013 guard denies foreign/missing/malformed targets before child reads.
    const ownedTarget = await getOwnedTargetOrThrow(client, targetId, user.id);
    const { data, error, count } = await client
      .from("reviews")
      .select("id, analysis_target_id, review_text, rating, review_date", { count: "exact" })
      .eq("analysis_target_id", ownedTarget.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(MAX_CONTEXT_REVIEWS + 1);

    if (error || !data || count === null || !Number.isSafeInteger(count) || count < 0) {
      throw new ReviewContextError("REVIEW_CONTEXT_UNAVAILABLE");
    }
    if (count > MAX_CONTEXT_REVIEWS || data.length > MAX_CONTEXT_REVIEWS) {
      throw new ReviewContextError("REVIEW_CONTEXT_TOO_LARGE");
    }
    // Detect a project Max Rows cap (or incomplete response) instead of silently using a subset.
    if (data.length !== count) throw new ReviewContextError("REVIEW_CONTEXT_UNAVAILABLE");
    if (count === 0) throw new ReviewContextError("NO_REVIEW_DATA");

    const reviews = (data as ContextReviewRow[]).map((row) => toEvidence(row, ownedTarget.id));
    if (new Set(reviews.map((review) => review.id)).size !== reviews.length) {
      throw new ReviewContextError("REVIEW_CONTEXT_UNAVAILABLE");
    }
    // Explicit projection excludes owner identity, reviewer names, source metadata and job secrets.
    const target: ReviewContextTarget = {
      id: ownedTarget.id,
      name: ownedTarget.name,
      platform: ownedTarget.platform,
      sourceUrl: ownedTarget.sourceUrl,
    };
    const evidenceJson = JSON.stringify({ target, reviews });
    const evidenceBytes = Buffer.byteLength(evidenceJson, "utf8");
    if (evidenceBytes > MAX_CONTEXT_EVIDENCE_BYTES) {
      throw new ReviewContextError("REVIEW_CONTEXT_TOO_LARGE");
    }
    return {
      target,
      reviews,
      reviewCount: count,
      strategy: "all-persisted-reviews",
      evidenceJson,
      evidenceBytes,
    };
  } catch (error) {
    if (error instanceof TargetNotFoundError || error instanceof ReviewContextError) throw error;
    // Never propagate raw provider/database errors or review text to logs or the client.
    throw new ReviewContextError("REVIEW_CONTEXT_UNAVAILABLE");
  }
}
