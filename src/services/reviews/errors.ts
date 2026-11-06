// S1-013 moved the shared denial next to the ownership guard; re-exported so imports keep working.
export { TargetNotFoundError } from "@/services/analysis-targets/target-ownership";

/** Thrown when a review in the batch is not a valid S1-021 NormalizedReview. */
export class InvalidReviewError extends Error {
  readonly code = "INVALID_REVIEW";

  constructor(message: string) {
    super(message);
    this.name = "InvalidReviewError";
  }
}

export class ReviewPersistenceError extends Error {
  readonly code = "REVIEW_PERSISTENCE_FAILED";

  constructor(operation: "save" | "load", options?: { cause?: unknown }) {
    // The message is safe to show; database details stay on `cause` for server-side logging.
    super(`Could not ${operation} the reviews.`, options);
    this.name = "ReviewPersistenceError";
  }
}
