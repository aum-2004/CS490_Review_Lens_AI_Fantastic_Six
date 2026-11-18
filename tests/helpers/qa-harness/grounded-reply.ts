import { MAX_QUOTE_CHARACTERS } from "@/services/qa/qa-response";

import { parseEvidenceRows } from "./assertions";
import type { QaModelRequest, QaOutcome } from "./contract";

/**
 * S2-011 grounded-claims reply builders.
 *
 * The model reply is `{"outcome", "claims", "note"}`: every finding from the reviews is a claim
 * whose evidence quotes a contiguous span of the cited review, and `note` carries only text that
 * is not a finding (a decline, the insufficient-evidence explanation, or what a partial answer
 * does not cover). These builders produce that shape so tests do not hand-write JSON, and so
 * valid quotes are always taken from the review text instead of being typed by hand.
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
  note: string | null;
}

/** Any review-like value with an id and text: a fixture Review, an evidence row, etc. */
export interface QuotableReview {
  readonly id: string;
  readonly text: string;
}

/** Words taken by `quoteOf` by default: enough to clear the 3-word minimum, short enough to read. */
export const DEFAULT_QUOTE_WORDS = 8;

export const DEFAULT_CLAIM_STATEMENT = "Fixture claim grounded in the quoted review.";
export const DEFAULT_INSUFFICIENT_NOTE =
  "The reviews do not contain enough information to answer that.";
export const DEFAULT_DECLINE_NOTE = "I can only analyze the reviews for the active target.";

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
  answered(claims: QaReplyClaim[], note: string | null = null): QaClaimReplyPayload {
    return { outcome: "answered", claims, note };
  },
  /** Pass claims only to script a contradictory reply; it is rejected (UNEXPECTED_CITATIONS). */
  insufficientEvidence(
    note: string | null = DEFAULT_INSUFFICIENT_NOTE,
    claims: QaReplyClaim[] = [],
  ): QaClaimReplyPayload {
    return { outcome: "insufficient_evidence", claims, note };
  },
  declined(
    outcome: Exclude<QaOutcome, "answered" | "insufficient_evidence">,
    note: string | null = DEFAULT_DECLINE_NOTE,
    claims: QaReplyClaim[] = [],
  ): QaClaimReplyPayload {
    return { outcome, claims, note };
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
  note: string | null = null,
): QaClaimReplyPayload {
  if (reviewIds.length === 0) return claimReply.answered([], note);
  const texts = new Map(parseEvidenceRows(request).map((row) => [row.id, row.text]));
  const evidence = reviewIds.map((reviewId) => {
    const text = texts.get(reviewId);
    return { reviewId, quote: text === undefined ? UNKNOWN_REVIEW_QUOTE : quoteOf(text) };
  });
  return claimReply.answered([{ statement, evidence }], note);
}
