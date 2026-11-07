import "server-only";

import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";

import { startOutscraperExtraction, type OutscraperJob } from "./outscraper-client";

export class IngestionSourceNotConfiguredError extends Error {
  readonly code = "SOURCE_NOT_CONFIGURED";

  constructor() {
    super("This analysis target is missing supported review source information.");
    this.name = "IngestionSourceNotConfiguredError";
  }
}

export interface StartedIngestion {
  status: "accepted";
  targetId: string;
  requestId: string;
  providerStatus: string;
}

/**
 * S1-013 minimal ingestion start. `target` MUST come from `getOwnedTargetOrThrow`, so ownership
 * is proven before this runs (S1-BR-018). S1-019 owns the full submission flow and can replace
 * this while keeping the same guard.
 *
 * Starts the provider job only; it does not fetch, normalize, or persist reviews.
 */
export async function startTargetIngestion(
  target: AnalysisTarget,
  startExtraction: (placeId: string) => Promise<OutscraperJob> = startOutscraperExtraction,
): Promise<StartedIngestion> {
  if (target.platform !== "google_maps" || !target.googlePlaceId?.trim()) {
    throw new IngestionSourceNotConfiguredError();
  }

  const job = await startExtraction(target.googlePlaceId);
  return {
    status: "accepted",
    targetId: target.id,
    requestId: job.id,
    providerStatus: job.status,
  };
}
