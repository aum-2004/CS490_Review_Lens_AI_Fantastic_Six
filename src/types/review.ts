/** Canonical Review produced by normalization (S1-021). Text and rating are required (S1-BR-020). */
export interface NormalizedReview {
  reviewText: string;
  rating: number;
  sourceReviewId?: string | null;
  reviewerName?: string | null;
  reviewedAt?: string | null;
  reviewUrl?: string | null;
}

/** A persisted Review. Ownership is inherited through its AnalysisTarget. */
export interface Review extends NormalizedReview {
  id: string;
  analysisTargetId: string;
  createdAt: string;
}
