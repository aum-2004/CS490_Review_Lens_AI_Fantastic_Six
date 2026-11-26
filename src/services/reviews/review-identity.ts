import { createHash } from "node:crypto";

import { toStorableText } from "./storable-text";
import type { NormalizedReview } from "./types";

/**
 * S3-011 duplicate strategy (S3-BR-017, S3-BR-018). Pure: no I/O, clock, locale, or randomness.
 *
 * Every Review has one identity key, unique per AnalysisTarget (never across targets or users):
 * - `sid:<id>` when the source supplied a non-blank review id (Outscraper `review_id`);
 * - otherwise `fp1:<sha256 hex>` of a normalized fingerprint of reviewer name, review time,
 *   rating, and review text.
 * The prefixes keep the two identity types from colliding.
 *
 * PostgreSQL computes the same key in `public.review_identity_key` (migration
 * 20261126120000_prevent_duplicate_reviews.sql) as a stored generated column with a unique index,
 * and that database key is authoritative. This twin lets the application collapse duplicates
 * within one batch before it writes anything. Shared golden vectors in
 * tests/fixtures/review-identity-vectors.json keep the two implementations identical.
 * Change neither implementation in place: a new rule needs a new prefix (for example `fp2:`)
 * and a migration that recomputes stored keys.
 */
export type ReviewIdentityInput = Pick<
  NormalizedReview,
  "text" | "rating" | "sourceReviewId" | "reviewerName" | "reviewDate"
>;

export const SOURCE_ID_KEY_PREFIX = "sid:";
export const FINGERPRINT_KEY_PREFIX = "fp1:";
const FINGERPRINT_VERSION = "v1";
const ABSENT_FIELD = "~";

// Listed explicitly instead of `\s` so PostgreSQL uses exactly the same set. This is the
// ECMAScript `\s` set (Unicode White_Space plus BOM), which PostgreSQL's locale-dependent `\s`
// does not guarantee.
const WHITESPACE =
  "[\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]";
const WHITESPACE_RUN = new RegExp(`${WHITESPACE}+`, "gu");
const EDGE_WHITESPACE = new RegExp(`^${WHITESPACE}+|${WHITESPACE}+$`, "gu");

/**
 * Fingerprint normalization for free text (review text and reviewer name), applied in order:
 * storable-text cleanup (as persisted), Unicode NFC, collapse each whitespace run to one space,
 * trim, then ASCII-only case folding. Full Unicode case folding is deliberately not used because
 * PostgreSQL `lower()` depends on the database collation. Empty results count as absent.
 */
export function normalizeIdentityText(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = toStorableText(value)
    .normalize("NFC")
    .replace(WHITESPACE_RUN, " ")
    .replace(/^ | $/g, "")
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  return normalized === "" ? undefined : normalized;
}

/**
 * Source ids are opaque and case-sensitive, so they are only trimmed. A blank id counts as no
 * id, and the review falls back to the fingerprint.
 */
export function normalizeSourceReviewId(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = toStorableText(value).replace(EDGE_WHITESPACE, "");
  return trimmed === "" ? undefined : trimmed;
}

/** Shortest round-trip decimal, which matches PostgreSQL `trim_scale(numeric)::text` for 1..5. */
function canonicalRating(rating: number): string {
  return String(rating);
}

/** UTC epoch milliseconds, the precision a JavaScript Date carries. */
function canonicalDate(date: Date | null | undefined): string | undefined {
  if (!(date instanceof Date)) return undefined;
  const time = date.getTime();
  return Number.isNaN(time) ? undefined : String(time);
}

/** Length-prefixed (in code points), so no field value can imitate a delimiter. */
function encodeField(value: string | undefined): string {
  return value === undefined ? ABSENT_FIELD : `${Array.from(value).length}:${value}`;
}

/** The exact string whose SHA-256 is the fingerprint. Exported for tests and documentation. */
export function reviewFingerprintSource(review: ReviewIdentityInput): string {
  return [
    FINGERPRINT_VERSION,
    encodeField(normalizeIdentityText(review.reviewerName)),
    encodeField(canonicalDate(review.reviewDate)),
    encodeField(canonicalRating(review.rating)),
    encodeField(normalizeIdentityText(review.text)),
  ].join("|");
}

/** Deterministic identity key of one review within its AnalysisTarget. */
export function reviewIdentityKey(review: ReviewIdentityInput): string {
  const sourceId = normalizeSourceReviewId(review.sourceReviewId);
  if (sourceId !== undefined) return `${SOURCE_ID_KEY_PREFIX}${sourceId}`;
  const digest = createHash("sha256").update(reviewFingerprintSource(review), "utf8").digest("hex");
  return `${FINGERPRINT_KEY_PREFIX}${digest}`;
}

/**
 * Keeps the first occurrence of each identity key, in input order. The caller must pass reviews
 * of a single AnalysisTarget: the database scopes uniqueness by target.
 */
export function dedupeReviews<T extends ReviewIdentityInput>(
  reviews: readonly T[],
): { reviews: T[]; duplicateCount: number } {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const review of reviews) {
    const key = reviewIdentityKey(review);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(review);
  }
  return { reviews: unique, duplicateCount: reviews.length - unique.length };
}
