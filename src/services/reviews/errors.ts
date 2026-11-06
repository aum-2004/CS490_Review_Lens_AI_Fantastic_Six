/**
 * Thrown when the target does not exist OR belongs to another user.
 * The two cases are deliberately indistinguishable (maps to HTTP 404) so
 * responses never reveal another user's private resource.
 */
export class TargetNotFoundError extends Error {
  readonly code = "TARGET_NOT_FOUND";

  constructor() {
    super("Analysis target not found.");
    this.name = "TargetNotFoundError";
  }
}

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
