import { createHash } from "node:crypto";

import { toStorableText } from "./storable-text";
import type { NormalizedReview } from "./types";

/**
 * S3-011 duplicate strategy (S3-BR-017, S3-BR-018) and S3-010 reconciliation. Pure: no I/O, clock,
 * locale, or randomness. Full rules: docs/s3-011-duplicate-reviews.md.
 *
 * Every stored Review keeps its nullable source review id AND a content fingerprint. Within one
 * AnalysisTarget an incoming review is matched (matchStoredReview):
 *   1. by source id;
 *   2. an id not stored yet adopts the oldest id-less row with the same fingerprint;
 *   3. a review without an id matches by fingerprint, preferring an id-less row.
 * Distinct non-null source ids are always distinct reviews.
 *
 * PostgreSQL implements the same rules in public.merge_target_reviews and computes the stored
 * fingerprint as a generated column (migration 20261126120000_prevent_duplicate_reviews.sql).
 * Shared golden vectors in tests/fixtures/review-identity-vectors.json keep the two fingerprint
 * implementations identical. Change neither in place: a new rule needs a new prefix and a
 * migration that recomputes stored fingerprints.
 */
export type ReviewIdentityInput = Pick<
  NormalizedReview,
  "text" | "rating" | "sourceReviewId" | "reviewerName" | "reviewDate"
>;

export const FINGERPRINT_PREFIX = "fp2:";
const FINGERPRINT_VERSION = "v2";
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
 * Source ids are opaque and case-sensitive, so they are only trimmed. A blank id counts as no id.
 * PostgreSQL stores ids in this normalized form (public.review_source_id and a CHECK constraint).
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

/**
 * The exact string whose SHA-256 is the fingerprint.
 * - author-time tier (reviewer name AND review time present): only those two stable attributes,
 *   so an edit to the text or rating does not create a new identity;
 * - content tier (either is missing): reviewer name, time, rating, and text, because without both
 *   stable attributes the content is the only thing that tells reviews apart.
 */
export function reviewFingerprintSource(review: ReviewIdentityInput): string {
  const author = normalizeIdentityText(review.reviewerName);
  const time = canonicalDate(review.reviewDate);
  if (author !== undefined && time !== undefined) {
    return [FINGERPRINT_VERSION, "author-time", encodeField(author), encodeField(time)].join("|");
  }
  return [
    FINGERPRINT_VERSION,
    "content",
    encodeField(author),
    encodeField(time),
    encodeField(canonicalRating(review.rating)),
    encodeField(normalizeIdentityText(review.text)),
  ].join("|");
}

/** Deterministic content fingerprint, stored for every review (reviews.review_fingerprint). */
export function reviewFingerprint(review: ReviewIdentityInput): string {
  const digest = createHash("sha256").update(reviewFingerprintSource(review), "utf8").digest("hex");
  return `${FINGERPRINT_PREFIX}${digest}`;
}

/** What the matcher needs to know about a review already stored for the same target. */
export interface StoredReviewIdentity {
  id: string;
  /** Normalized, as stored. */
  sourceReviewId: string | null;
  fingerprint: string;
  /** Any totally ordered value; ties break on id. Oldest first wins every choice. */
  createdAt: string | number;
}

export type MatchDecision =
  | { action: "insert" }
  | { action: "update"; rowId: string; matchedBy: "source_id" | "fingerprint" }
  | { action: "adopt"; rowId: string };

const oldestFirst = (a: StoredReviewIdentity, b: StoredReviewIdentity) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;

/**
 * Decides how one incoming review reconciles with the stored reviews of ONE target. Mirrors
 * public.merge_target_reviews; the database enforces the result with partial unique indexes.
 */
export function matchStoredReview(
  stored: readonly StoredReviewIdentity[],
  incoming: ReviewIdentityInput,
): MatchDecision {
  const sourceId = normalizeSourceReviewId(incoming.sourceReviewId);
  const fingerprint = reviewFingerprint(incoming);
  const rows = [...stored].sort(oldestFirst);

  if (sourceId !== undefined) {
    const sameId = rows.find((row) => row.sourceReviewId === sourceId);
    if (sameId) return { action: "update", rowId: sameId.id, matchedBy: "source_id" };
    // The id appeared: claim the oldest id-less copy instead of inserting a second record.
    // A row with a DIFFERENT id is a different review and is never adopted.
    const idless = rows.find(
      (row) => row.sourceReviewId === null && row.fingerprint === fingerprint,
    );
    if (idless) return { action: "adopt", rowId: idless.id };
    return { action: "insert" };
  }

  // The id is missing (or disappeared): match by fingerprint, preferring an id-less row.
  const match =
    rows.find((row) => row.sourceReviewId === null && row.fingerprint === fingerprint) ??
    rows.find((row) => row.fingerprint === fingerprint);
  return match
    ? { action: "update", rowId: match.id, matchedBy: "fingerprint" }
    : { action: "insert" };
}

/**
 * S3-010 refresh rule for a matched review. Text and rating (always present) take the incoming
 * value. Optional fields take the incoming value only when it is present: a missing value never
 * erases stored data. A stored source id is never cleared; an id-less row gains the incoming id.
 */
export function mergeReviewFields(stored: NormalizedReview, incoming: NormalizedReview) {
  return {
    text: incoming.text,
    rating: incoming.rating,
    sourceReviewId:
      normalizeSourceReviewId(stored.sourceReviewId) ??
      normalizeSourceReviewId(incoming.sourceReviewId),
    reviewerName: incoming.reviewerName ?? stored.reviewerName,
    reviewDate: incoming.reviewDate ?? stored.reviewDate,
    reviewUrl: incoming.reviewUrl ?? stored.reviewUrl,
    sourceMetadata: incoming.sourceMetadata ?? stored.sourceMetadata,
  } satisfies NormalizedReview;
}

/**
 * Applies the same matching and merge rules within one batch (one target), so the database
 * receives each source review once. Output keeps the position of each review's first occurrence;
 * field values merge in batch order, so the last occurrence wins for every field it provides.
 */
export function collapseReviews<T extends NormalizedReview>(
  reviews: readonly T[],
): { reviews: NormalizedReview[]; duplicateCount: number } {
  const merged: NormalizedReview[] = [];
  const identities: StoredReviewIdentity[] = [];
  const identityOf = (review: NormalizedReview, index: number): StoredReviewIdentity => ({
    id: String(index).padStart(6, "0"),
    sourceReviewId: normalizeSourceReviewId(review.sourceReviewId) ?? null,
    fingerprint: reviewFingerprint(review),
    createdAt: index,
  });

  for (const review of reviews) {
    const decision = matchStoredReview(identities, review);
    if (decision.action === "insert") {
      merged.push({ ...review });
      identities.push(identityOf(review, merged.length - 1));
      continue;
    }
    const index = Number(decision.rowId);
    merged[index] = mergeReviewFields(merged[index], review);
    identities[index] = identityOf(merged[index], index);
  }
  return { reviews: merged, duplicateCount: reviews.length - merged.length };
}
