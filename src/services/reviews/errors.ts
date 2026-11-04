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

export class InvalidReviewError extends Error {
  readonly code = "INVALID_REVIEW";

  constructor(message: string) {
    super(message);
    this.name = "InvalidReviewError";
  }
}
