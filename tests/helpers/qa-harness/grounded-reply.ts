import { MAX_QUOTE_CHARACTERS } from "@/services/qa/qa-response";

import { parseEvidenceRows } from "./assertions";
import type { QaCoverage, QaModelRequest, QaOutcome } from "./contract";

/**
 * S2-011 grounded-claims reply builders.
 *
 * The model reply is `{"outcome", "claims", "coverage"}`: every finding from the reviews is a
 * claim whose evidence quotes a contiguous span of the cited review, and `coverage` is a closed
 * enum (complete | partial | none). The model writes no other text: the server writes the decline,
 * insufficient-evidence, and partial-coverage wording (prompt s2-013.v7). These builders produce
 * that shape so tests do not hand-write JSON, and so valid quotes are always taken from the review
 * text instead of being typed by hand.
 */

export interface QaReplyEvidence {
  reviewId: string;
  quote: string;
}

export interface QaReplyClaim {
  statement: string;
  evidence: QaReplyEvidence[];
}

/** The JSON object the S2-013 prompt asks the model to return. */
export interface QaClaimReplyPayload {
  outcome: QaOutcome;
  claims: QaReplyClaim[];
  coverage: QaCoverage;
}

/** Any review-like value with an id and text: a fixture Review, an evidence row, etc. */
export interface QuotableReview {
  readonly id: string;
  readonly text: string;
}

/** Words taken by `quoteOf` by default: enough to clear the 3-word minimum, short enough to read. */
export const DEFAULT_QUOTE_WORDS = 8;

export const DEFAULT_CLAIM_STATEMENT = "Fixture claim grounded in the quoted review.";

/** Placeholder quote for review IDs that are not in the request (invented-citation cases). */
export const UNKNOWN_REVIEW_QUOTE = "quote for a review that was not supplied";

/**
 * A contiguous span of `text`: its first `maxWords` whitespace-separated words, joined by single
 * spaces (the validator collapses whitespace, so this still matches). The whole text when shorter.
 */
export function quoteOf(text: string, maxWords = DEFAULT_QUOTE_WORDS): string {
  // Capped at the validator's quote limit; a cut prefix is still one contiguous span.
  return text.trim().split(/\s+/).slice(0, maxWords).join(" ").slice(0, MAX_QUOTE_CHARACTERS);
}

/**
 * Contiguous spans that together quote all of `text`, each at most MAX_QUOTE_CHARACTERS and (unless
 * it is the whole text) at least three words. A short tail is folded into a final span that
 * overlaps the previous one, so it still clears the minimum. Used by adversarial echo fakes.
 */
export function quoteChunksOf(text: string): string[] {
  const words = text.trim().split(/\s+/);
  const chunks: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    if (current.length > 0 && [...current, word].join(" ").length > MAX_QUOTE_CHARACTERS) {
      chunks.push(current);
      current = [];
    }
    current.push(word);
  }
  chunks.push(current);
  const last = chunks[chunks.length - 1];
  if (chunks.length > 1 && last.length < 3) {
    chunks[chunks.length - 1] = words.slice(-3);
  }
  return chunks.map((chunk) => chunk.join(" "));
}

/** Evidence citing `review`, quoting `quote` (default: the opening span of its text). */
export function evidenceFrom(
  review: QuotableReview,
  quote = quoteOf(review.text),
): QaReplyEvidence {
  return { reviewId: review.id, quote };
}

/** One claim supported by each review in `reviews`, each quoted with its opening span. */
export function claimFrom(statement: string, ...reviews: QuotableReview[]): QaReplyClaim {
  return { statement, evidence: reviews.map((review) => evidenceFrom(review)) };
}

export const claimReply = {
  answered(
    claims: QaReplyClaim[],
    coverage: Exclude<QaCoverage, "none"> = "complete",
  ): QaClaimReplyPayload {
    return { outcome: "answered", claims, coverage };
  },
  /** Pass claims only to script a contradictory reply; it is rejected (UNEXPECTED_CITATIONS). */
  insufficientEvidence(claims: QaReplyClaim[] = []): QaClaimReplyPayload {
    return { outcome: "insufficient_evidence", claims, coverage: "none" };
  },
  declined(
    outcome: Exclude<QaOutcome, "answered" | "insufficient_evidence">,
    claims: QaReplyClaim[] = [],
  ): QaClaimReplyPayload {
    return { outcome, claims, coverage: "none" };
  },
  /** The model's reply text for a payload. */
  text(payload: QaClaimReplyPayload): string {
    return JSON.stringify(payload);
  },
};

/**
 * For fakes that only see the model request: an `answered` payload with one claim citing every
 * listed review, each quoted from that review's text in the request's REVIEW DATASET. An ID that
 * is not in the dataset gets `UNKNOWN_REVIEW_QUOTE`, so invented-citation cases still reach the
 * validator's review-ID check. An empty list yields no claims: an uncited answer.
 */
export function answeredFromRequest(
  request: QaModelRequest,
  reviewIds: readonly string[],
  statement = DEFAULT_CLAIM_STATEMENT,
  coverage: Exclude<QaCoverage, "none"> = "complete",
): QaClaimReplyPayload {
  if (reviewIds.length === 0) return claimReply.answered([], coverage);
  const texts = new Map(parseEvidenceRows(request).map((row) => [row.id, row.text]));
  const evidence = reviewIds.map((reviewId) => {
    const text = texts.get(reviewId);
    return { reviewId, quote: text === undefined ? UNKNOWN_REVIEW_QUOTE : quoteOf(text) };
  });
  return claimReply.answered([{ statement, evidence }], coverage);
}
