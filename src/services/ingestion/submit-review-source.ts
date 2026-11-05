import "server-only";

import { startOutscraperExtraction, type OutscraperJob } from "./outscraper-client";

export type IngestionTarget = {
  id: string;
  ownerId: string;
  platform: "google_maps";
  sourceUrl: string;
  googlePlaceId: string | null;
};

export type SubmitReviewSourceDependencies = {
  getTargetById: (ownerId: string, targetId: string) => Promise<IngestionTarget | null>;
  startExtraction?: (placeId: string) => Promise<OutscraperJob>;
};

export class SubmitReviewSourceError extends Error {
  constructor(
    public readonly code: "AUTH_REQUIRED" | "TARGET_NOT_FOUND" | "SOURCE_NOT_CONFIGURED",
    message: string,
  ) {
    super(message);
    this.name = "SubmitReviewSourceError";
  }
}

export type SubmittedReviewSource = {
  status: "accepted";
  targetId: string;
  requestId: string;
  providerStatus: string;
};

/**
 * Starts review ingestion after the caller supplies a verified user identity
 * and an ownership-filtered AnalysisTarget lookup. The caller must derive
 * `userId` from the server-side auth guard (for example, `requireApiUser()`),
 * never from request-body data.
 */
export async function submitReviewSource(
  userId: string,
  targetId: string,
  dependencies: SubmitReviewSourceDependencies,
): Promise<SubmittedReviewSource> {
  if (!userId.trim()) {
    throw new SubmitReviewSourceError("AUTH_REQUIRED", "Authentication is required.");
  }

  const target = await dependencies.getTargetById(userId, targetId);

  if (!target || target.ownerId !== userId) {
    throw new SubmitReviewSourceError(
      "TARGET_NOT_FOUND",
      "The requested analysis target is unavailable.",
    );
  }

  if (target.platform !== "google_maps" || !target.googlePlaceId?.trim()) {
    throw new SubmitReviewSourceError(
      "SOURCE_NOT_CONFIGURED",
      "This analysis target is missing supported review source information.",
    );
  }

  const startExtraction = dependencies.startExtraction ?? startOutscraperExtraction;
  const job = await startExtraction(target.googlePlaceId);

  return {
    status: "accepted",
    targetId: target.id,
    requestId: job.id,
    providerStatus: job.status,
  };
}
