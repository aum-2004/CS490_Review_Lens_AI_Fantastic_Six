import "server-only";

import { validateAnalysisTargetInput } from "@/lib/validation/analysis-target";
import {
  startOutscraperExtraction,
  type OutscraperJob,
  type OutscraperQuery,
} from "./outscraper-client";

export type IngestionTarget = {
  id: string;
  ownerId: string;
  platform: "google_maps";
  sourceUrl: string;
  googlePlaceId: string | null;
};

export type SubmitReviewSourceDependencies = {
  getTargetById: (ownerId: string, targetId: string) => Promise<IngestionTarget | null>;
  startExtraction?: (query: OutscraperQuery) => Promise<OutscraperJob>;
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
 * Starts review ingestion after an ownership-filtered AnalysisTarget lookup.
 * The user ID must come from the server-side auth guard, never request input.
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

  const sourceValidation = validateAnalysisTargetInput({
    name: "review source",
    sourceUrl: target?.sourceUrl,
  });

  if (!sourceValidation.success || target.platform !== "google_maps") {
    throw new SubmitReviewSourceError(
      "SOURCE_NOT_CONFIGURED",
      "This analysis target is missing supported review source information.",
    );
  }

  const startExtraction = dependencies.startExtraction ?? startOutscraperExtraction;
  const query: OutscraperQuery = target.googlePlaceId?.trim()
    ? { kind: "place_id", value: target.googlePlaceId.trim() }
    : { kind: "source_url", value: sourceValidation.data.sourceUrl };
  const job = await startExtraction(query);

  return {
    status: "accepted",
    targetId: target.id,
    requestId: job.id,
    providerStatus: job.status,
  };
}
