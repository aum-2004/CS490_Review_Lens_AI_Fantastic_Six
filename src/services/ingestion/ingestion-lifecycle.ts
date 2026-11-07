import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisTarget } from "@/services/analysis-targets/analysis-target-repository";
import {
  getOwnedTargetOrThrow,
  TargetNotFoundError,
} from "@/services/analysis-targets/target-ownership";
import { normalizeBatch } from "@/services/reviews/normalize";
import { sanitizeMetadata } from "@/services/reviews/review-service";
import {
  createIngestionAttemptWriter,
  getBoundAttempt,
  getLatestAttempt,
  summarizeAttempt,
} from "./ingestion-attempt-repository";
import { getExtractedReviews, type VerifiedExtractedReviews } from "./outscraper-service";
import { OutscraperError, startOutscraperExtraction } from "./outscraper-client";
import { submitReviewSource, type SubmittedReviewSource } from "./submit-review-source";
import { validateAnalysisTargetInput } from "@/lib/validation/analysis-target";

export interface IngestionDependencies {
  writer: ReturnType<typeof createIngestionAttemptWriter>;
  start?: (target: AnalysisTarget, recoveryUrl: string) => Promise<SubmittedReviewSource>;
  extract?: typeof getExtractedReviews;
  storageApproved: boolean;
  recoveryUrl: (attemptId: string) => string;
  retryDelay?: (milliseconds: number) => Promise<void>;
}
export class IngestionGateError extends Error {
  constructor(
    readonly code: "INGESTION_DISABLED" | "STORAGE_NOT_APPROVED" | "SOURCE_NOT_CONFIGURED",
  ) {
    super(code);
    this.name = "IngestionGateError";
  }
}
/** A result lookup failure does not prove that the already accepted job failed. */
export class IngestionRefreshError extends Error {
  constructor(readonly code: string) {
    super("The ingestion result is temporarily unavailable.");
  }
}
export class IngestionBindingPendingError extends Error {
  readonly code = "JOB_BINDING_PENDING";
  constructor() {
    super("Review collection may have started. Check its status before trying again.");
  }
}
function failureCode(error: unknown): string {
  if (error instanceof OutscraperError) {
    if (["PROVIDER_TIMEOUT", "PROVIDER_QUOTA", "PROVIDER_UNAVAILABLE"].includes(error.code))
      return error.code;
    if (["NO_REVIEWS", "INSUFFICIENT_REVIEWS"].includes(error.code)) return "NO_REVIEWS";
    if (
      ["PROVIDER_AUTH", "PROVIDER_BILLING", "MISSING_API_KEY", "INVALID_RESPONSE"].includes(
        error.code,
      )
    )
      return "RESULT_LOOKUP_UNAVAILABLE";
    if (error.code === "PROVIDER_REJECTED") return "PROVIDER_REJECTED";
    if (["BUSINESS_MISMATCH", "IDENTITY_MISSING", "IDENTITY_AMBIGUOUS"].includes(error.code))
      return "SOURCE_IDENTITY_UNVERIFIED";
  }
  return "INGESTION_FAILED";
}
function log(operation: string, category: string) {
  console.info("Ingestion lifecycle", { operation, category });
}

/** Client job IDs, source and owner inputs are never read; identity is server verified. */
export async function beginIngestion(
  client: SupabaseClient,
  ownerId: string,
  targetId: string,
  deps: IngestionDependencies,
) {
  const target = await getOwnedTargetOrThrow(client, targetId, ownerId);
  if (target.ownerId !== ownerId) throw new TargetNotFoundError();
  if (!deps.storageApproved) throw new IngestionGateError("STORAGE_NOT_APPROVED");
  const source = validateAnalysisTargetInput({ name: target.name, sourceUrl: target.sourceUrl });
  if (
    !source.success ||
    target.platform !== "google_maps" ||
    (target.googlePlaceId !== null && !/^ChIJ[A-Za-z0-9_-]+$/.test(target.googlePlaceId.trim()))
  ) {
    throw new IngestionGateError("SOURCE_NOT_CONFIGURED");
  }
  const reserved = await deps.writer.reserve(target.id, ownerId);
  if (!reserved.created) return summarizeAttempt(reserved.attempt);
  log("start", "PROCESSING");
  let started;
  try {
    const snapshot: AnalysisTarget = {
      ...target,
      sourceUrl: reserved.attempt.source_url,
      googlePlaceId: reserved.attempt.expected_place_id,
    };
    const recoveryUrl = deps.recoveryUrl(reserved.attempt.id);
    started = deps.start
      ? await deps.start(snapshot, recoveryUrl)
      : await submitReviewSource(ownerId, snapshot.id, {
          getTargetById: async () => snapshot,
          startExtraction: (query) => startOutscraperExtraction(query, undefined, recoveryUrl),
        });
  } catch (error) {
    const code =
      error instanceof OutscraperError &&
      (error.submissionRejected ||
        [
          "PROVIDER_QUOTA",
          "PROVIDER_AUTH",
          "PROVIDER_BILLING",
          "MISSING_API_KEY",
          "INVALID_PLACE_ID",
          "INVALID_SOURCE_URL",
        ].includes(error.code))
        ? error.code === "PROVIDER_QUOTA"
          ? "PROVIDER_QUOTA"
          : ["PROVIDER_AUTH", "PROVIDER_BILLING", "MISSING_API_KEY"].includes(error.code)
            ? "PROVIDER_CONFIGURATION_UNAVAILABLE"
            : "PROVIDER_REJECTED"
        : "SUBMISSION_UNCERTAIN";
    const failed = await deps.writer.finish(reserved.attempt.id, ownerId, [], 0, null, code);
    log("start-failed", code);
    return summarizeAttempt(failed);
  }
  // Retry ONLY the idempotent database binding, never the paid provider request. The signed
  // per-attempt callback registered before submission can recover a lost response/binding.
  const delay =
    deps.retryDelay ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let retry = 0; retry < 3; retry++) {
    try {
      const bound = await deps.writer.bind(reserved.attempt.id, ownerId, started.requestId);
      log("accepted", "JOB_BOUND");
      return summarizeAttempt(bound);
    } catch {
      if (retry < 2) await delay(100 * (retry + 1));
    }
  }
  log("binding-pending", "JOB_BINDING_PENDING");
  throw new IngestionBindingPendingError();
}

/** POST-only reconciliation. Remote jobs keep running when a page leaves. */
export async function reconcileIngestion(
  client: SupabaseClient,
  ownerId: string,
  targetId: string,
  deps: IngestionDependencies,
) {
  await getOwnedTargetOrThrow(client, targetId, ownerId);
  const latest = await getLatestAttempt(client, ownerId, targetId);
  if (!latest || latest.status !== "processing") return summarizeAttempt(latest);
  if (!latest.provider_request_id) {
    if (Date.now() - Date.parse(latest.started_at) > 60_000) {
      return summarizeAttempt(await deps.writer.expireUnbound(latest.id, ownerId));
    }
    return summarizeAttempt(latest);
  }
  const bound = await getBoundAttempt(client, ownerId, targetId, latest.provider_request_id);
  const current = await deps.writer.expireBound(bound.id, ownerId);
  if (current.status !== "processing") return summarizeAttempt(current);
  if (!deps.storageApproved) throw new IngestionRefreshError("STORAGE_NOT_APPROVED");
  let extracted: VerifiedExtractedReviews;
  try {
    extracted = await (deps.extract ?? getExtractedReviews)(bound.provider_request_id!, {
      sourceUrl: bound.source_url,
      googlePlaceId: bound.expected_place_id,
    });
  } catch (error) {
    const terminal =
      error instanceof OutscraperError &&
      [
        "PROVIDER_FAILED",
        "BUSINESS_MISMATCH",
        "IDENTITY_MISSING",
        "IDENTITY_AMBIGUOUS",
        "NO_REVIEWS",
        "INSUFFICIENT_REVIEWS",
      ].includes(error.code);
    const category = failureCode(error);
    const code =
      !terminal && category === "INGESTION_FAILED" ? "RESULT_LOOKUP_UNAVAILABLE" : category;
    log("result-lookup", code);
    if (!terminal) {
      throw new IngestionRefreshError(code);
    }
    return summarizeAttempt(await deps.writer.finish(bound.id, ownerId, [], 0, null, code));
  }
  if (extracted.status === "pending") return summarizeAttempt(bound);
  // A result must match an expected Place ID when one existed at submission. For URL jobs,
  // retain provider-resolved identity as provenance, never as independent source-URL proof.
  if (
    extracted.identity.placeId !== extracted.placeId ||
    (bound.query_kind === "place_id" &&
      (!bound.expected_place_id || extracted.placeId !== bound.expected_place_id))
  ) {
    return summarizeAttempt(
      await deps.writer.finish(
        bound.id,
        ownerId,
        [],
        0,
        extracted.identity,
        "SOURCE_IDENTITY_UNVERIFIED",
      ),
    );
  }
  const normalized = normalizeBatch(extracted.reviews);
  const skippedCount = (extracted.skippedCount ?? 0) + normalized.rejected.length;
  if (normalized.reviews.length === 0) {
    return summarizeAttempt(
      await deps.writer.finish(
        bound.id,
        ownerId,
        [],
        skippedCount,
        extracted.identity,
        "NO_REVIEWS",
      ),
    );
  }
  const rows = normalized.reviews.map((review) => ({
    text: review.text,
    rating: review.rating,
    source_review_id: review.sourceReviewId ?? null,
    reviewer_name: review.reviewerName ?? null,
    review_date: review.reviewDate?.toISOString() ?? null,
    review_url: review.reviewUrl ?? null,
    source_metadata: sanitizeMetadata(review.sourceMetadata) ?? null,
  }));
  // Atomic review insert + result state; duplicate polling cannot save a completed attempt twice.
  const completed = await deps.writer.finish(
    bound.id,
    ownerId,
    rows,
    skippedCount,
    extracted.identity,
    null,
  );
  log("completed", completed.status.toUpperCase());
  return summarizeAttempt(completed);
}
