import { InvalidReviewError, TargetNotFoundError } from "./errors";
import { toStorableText } from "./storable-text";
import { MAX_RATING, MIN_RATING, type NormalizedReview } from "./types";

/** A persisted Review. Ownership is inherited through its AnalysisTarget (S1-BR-022). */
export interface Review {
  id: string;
  analysisTargetId: string;
  text: string;
  rating: number;
  sourceReviewId: string | null;
  reviewerName: string | null;
  /** ISO 8601 timestamp. */
  reviewDate: string | null;
  reviewUrl: string | null;
  sourceMetadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Data-access port. The Supabase implementation must use the user-scoped client (RLS on). */
export interface ReviewStore {
  /** True only if the target exists and belongs to `userId`. */
  isTargetOwnedBy(targetId: string, userId: string): Promise<boolean>;
  insertReviews(targetId: string, reviews: NormalizedReview[]): Promise<Review[]>;
  aggregateReviews(targetId: string): Promise<ReviewAggregate>;
  listReviews(targetId: string): Promise<Review[]>;
}

/** Exact metrics returned by the database aggregate; no review content is loaded. */
export interface ReviewAggregate {
  reviewCount: number;
  averageRating: number | null;
}

/** Larger metadata is dropped (the review is kept), so one record cannot bloat the table. */
export const MAX_METADATA_BYTES = 16_384;
const MAX_METADATA_DEPTH = 10;

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Returns a JSON-safe copy of `value`, or undefined if it cannot be stored. Postgres rejects
 * \u0000 and lone UTF-16 surrogates in jsonb, so keys and strings are cleaned with
 * `toStorableText`. Values JSON cannot represent (functions, bigint, NaN, class instances,
 * cycles past the depth limit) are dropped.
 */
function toJsonValue(value: unknown, depth: number): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return toStorableText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value !== "object" || depth >= MAX_METADATA_DEPTH) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, depth + 1) ?? null);
  }
  if (!isPlainObject(value)) return undefined;

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const clean = toJsonValue(item, depth + 1);
    if (clean !== undefined) result[toStorableText(key)] = clean;
  }
  return result;
}

/** PostgreSQL jsonb expands exponent-form numbers, so its stored text can dwarf JSON.stringify. */
function containsExponentNumber(value: unknown): boolean {
  if (typeof value === "number") {
    return JSON.stringify(value)?.toLowerCase().includes("e") ?? false;
  }
  if (Array.isArray(value)) return value.some(containsExponentNumber);
  if (value === null || typeof value !== "object") return false;
  return Object.values(value).some(containsExponentNumber);
}

/** S1-021 hands metadata sanitization to persistence. Unstorable metadata is dropped. */
export function sanitizeMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }

  const clean = toJsonValue(metadata, 0) as Record<string, unknown> | undefined;
  if (clean === undefined || containsExponentNumber(clean)) return undefined;

  const bytes = new TextEncoder().encode(JSON.stringify(clean)).length;
  return bytes <= MAX_METADATA_BYTES ? clean : undefined;
}

async function assertOwnsTarget(store: ReviewStore, userId: string, targetId: string) {
  if (!(await store.isTargetOwnedBy(targetId, userId))) {
    throw new TargetNotFoundError();
  }
}

function assertValid(review: NormalizedReview, index: number) {
  if (typeof review.text !== "string" || review.text.trim() === "") {
    throw new InvalidReviewError(`Review ${index}: text is required.`);
  }

  if (
    typeof review.rating !== "number" ||
    !Number.isFinite(review.rating) ||
    review.rating < MIN_RATING ||
    review.rating > MAX_RATING
  ) {
    throw new InvalidReviewError(
      `Review ${index}: rating must be between ${MIN_RATING} and ${MAX_RATING}.`,
    );
  }

  if (
    review.reviewDate !== undefined &&
    (!(review.reviewDate instanceof Date) || Number.isNaN(review.reviewDate.getTime()))
  ) {
    throw new InvalidReviewError(`Review ${index}: reviewDate must be a valid Date.`);
  }
}

/**
 * Persists S1-021 normalized reviews under a target the user owns.
 *
 * userId MUST come from the verified session (S1-011), never from the request body (S1-BR-010).
 * Persists nothing if any review is invalid, so a bad batch is never partially saved.
 * Duplicate sourceReviewIds are stored as-is in Sprint 1 (no re-ingestion or dedupe).
 */
export async function saveReviews(
  store: ReviewStore,
  userId: string,
  targetId: string,
  reviews: NormalizedReview[],
): Promise<Review[]> {
  await assertOwnsTarget(store, userId, targetId);
  reviews.forEach(assertValid);

  if (reviews.length === 0) {
    return [];
  }

  return store.insertReviews(
    targetId,
    reviews.map((review) => ({
      ...review,
      sourceMetadata: sanitizeMetadata(review.sourceMetadata),
    })),
  );
}

/** Returns every Review of a target the user owns. */
export async function getReviewsForTarget(
  store: ReviewStore,
  userId: string,
  targetId: string,
): Promise<Review[]> {
  await assertOwnsTarget(store, userId, targetId);

  return store.listReviews(targetId);
}
