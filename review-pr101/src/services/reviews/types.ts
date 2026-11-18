export const MIN_RATING = 1;
export const MAX_RATING = 5;

/** Candidate fields produced by a source adapter (S1-020). Values are untrusted. */
export type RawReview = {
  text?: unknown;
  rating?: unknown;
  sourceReviewId?: unknown;
  reviewerName?: unknown;
  reviewDate?: unknown;
  reviewUrl?: unknown;
  metadata?: unknown;
};

/** Canonical Review handed to persistence (S1-022). */
export type NormalizedReview = {
  text: string;
  rating: number;
  sourceReviewId?: string;
  reviewerName?: string;
  reviewDate?: Date;
  reviewUrl?: string;
  sourceMetadata?: Record<string, unknown>;
};

export type RejectionReason = "MISSING_TEXT" | "MISSING_RATING" | "INVALID_RATING";

export type NormalizeResult =
  { ok: true; review: NormalizedReview } | { ok: false; reason: RejectionReason; index: number };

export type BatchResult = {
  reviews: NormalizedReview[];
  rejected: { index: number; reason: RejectionReason }[];
};
