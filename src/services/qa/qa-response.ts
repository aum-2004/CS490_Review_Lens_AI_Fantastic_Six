import "server-only";

import { z } from "zod";

import {
  QA_OUTCOMES,
  type PromptReview,
  type QaModelRequest,
  type QaOutcome,
} from "@/services/qa/system-prompt";

/**
 * S2-011 / S2-012: validates the model's reply before anything reaches the user.
 *
 * The prompt (S2-013) asks for `{"outcome", "claims", "note"}`:
 *   - `claims` holds every finding from the reviews. Each claim cites one or more reviews, and each
 *     citation carries a quote that must be one contiguous span of THAT review's text.
 *   - `note` holds only text that is not a finding: a decline, the insufficient-evidence
 *     explanation, or what a partial answer does not cover. It is free text and is NOT verified.
 *
 * A valid review ID is not proof that a claim is grounded, so each quote is checked against the
 * cited review's persisted text. The reply is rejected (fail closed) rather than repaired: dropping
 * one bad claim would silently change the meaning of the rest.
 */

/** Longest answer shown to the user. Well above what QA_RESERVED_OUTPUT_TOKENS can produce. */
export const MAX_ANSWER_CHARACTERS = 8_000;
export const MAX_CLAIMS = 20;
export const MAX_CLAIM_STATEMENT_CHARACTERS = 1_000;
export const MAX_EVIDENCE_PER_CLAIM = 10;
export const MAX_QUOTE_CHARACTERS = 500;
/** A shorter quote (such as "the") would match almost any review and prove nothing. */
export const MIN_QUOTE_WORDS = 3;
/** Fixed server text that frames `note` on a partial answer, so it never reads as a finding. */
export const NOT_COVERED_PREFIX = "Not covered by these reviews:";

/**
 * JSON schema sent to the provider as structured output. Mirrors `modelReplySchema`. Strict-mode
 * compatible: every object lists all of its properties as required and sets
 * `additionalProperties: false`; the optional `note` is expressed as nullable. Length and count
 * limits are enforced by `modelReplySchema`, not by the provider.
 */
export const QA_REPLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: [...QA_OUTCOMES] },
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                reviewId: { type: "string" },
                quote: { type: "string" },
              },
              required: ["reviewId", "quote"],
              additionalProperties: false,
            },
          },
        },
        required: ["statement", "evidence"],
        additionalProperties: false,
      },
    },
    note: { type: ["string", "null"] },
  },
  required: ["outcome", "claims", "note"],
  additionalProperties: false,
} as const;

const evidenceSchema = z
  .object({ reviewId: z.string(), quote: z.string().max(MAX_QUOTE_CHARACTERS) })
  .strict();

const claimSchema = z
  .object({
    statement: z.string().trim().min(1).max(MAX_CLAIM_STATEMENT_CHARACTERS),
    evidence: z.array(evidenceSchema).max(MAX_EVIDENCE_PER_CLAIM),
  })
  .strict();

const modelReplySchema = z
  .object({
    outcome: z.enum(QA_OUTCOMES),
    claims: z.array(claimSchema).max(MAX_CLAIMS),
    note: z.string().trim().max(MAX_ANSWER_CHARACTERS).nullable(),
  })
  .strict();

/** A validated reply, safe to show to the user. */
export interface QaAnswer {
  outcome: QaOutcome;
  /**
   * Text shown to the user. For `answered`, composed by the server from the verified claims (each
   * followed by its cited review IDs), then the framed note if any. Otherwise, the model's note.
   */
  answer: string;
  /** Review IDs that support the answer; always a subset of the request's `reviewIds`. */
  citedReviewIds: string[];
  promptVersion: string;
  targetId: string;
}

export type QaResponseErrorCode =
  "INVALID_MODEL_RESPONSE" | "UNGROUNDED_ANSWER" | "UNEXPECTED_CITATIONS" | "UNSUPPORTED_CLAIM";

const RESPONSE_ERROR_MESSAGE = "We couldn't produce a reliable answer. Please try again.";

/** The reply cannot be shown. The message never includes model output or review text. */
export class QaResponseError extends Error {
  constructor(readonly code: QaResponseErrorCode) {
    super(RESPONSE_ERROR_MESSAGE);
    this.name = "QaResponseError";
  }
}

/** The evidence a reply is checked against: the reviews whose text was sent to the model. */
export type QaEvidenceReview = Pick<PromptReview, "id" | "text">;

const SINGLE_QUOTES = /[‘’‚‛′`´]/g;
const DOUBLE_QUOTES = /[“”„‟″«»]/g;
const DASHES = /[‐-―−﹘﹣]/g;

/**
 * Normalization applied identically to quotes and review text: Unicode NFKC (this also turns "…"
 * into "..."), curly quotes and dash variants to their ASCII forms, a per-character case fold
 * (upper then lower, so "ß" matches "SS" and no context rule such as Greek final sigma depends on
 * where a quote starts or ends), and whitespace runs collapsed to one space. Nothing else is
 * removed, so the quote must still be one contiguous span of the review: fragments joined with
 * an ellipsis do not match unless the review itself contains that exact ellipsis.
 */
export function normalizeEvidenceText(text: string): string {
  const unified = text
    .normalize("NFKC")
    .replace(SINGLE_QUOTES, "'")
    .replace(DOUBLE_QUOTES, '"')
    .replace(DASHES, "-");
  return Array.from(unified, (character) => character.toUpperCase().toLowerCase())
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when `quote` is a contiguous span of `reviewText` that is long enough to mean something. */
export function quoteSupportedByReview(quote: string, reviewText: string): boolean {
  const normalizedQuote = normalizeEvidenceText(quote);
  const normalizedReview = normalizeEvidenceText(reviewText);
  if (normalizedQuote === "") return false;
  const wholeReview = normalizedQuote === normalizedReview;
  if (!wholeReview && normalizedQuote.split(" ").length < MIN_QUOTE_WORDS) return false;
  return normalizedReview.includes(normalizedQuote);
}

export function parseQaModelReply(
  replyText: string,
  request: QaModelRequest,
  reviews: readonly QaEvidenceReview[],
): QaAnswer {
  let json: unknown;
  try {
    json = JSON.parse(replyText);
  } catch {
    throw new QaResponseError("INVALID_MODEL_RESPONSE");
  }

  const parsed = modelReplySchema.safeParse(json);
  if (!parsed.success) throw new QaResponseError("INVALID_MODEL_RESPONSE");
  const { outcome, claims } = parsed.data;
  const note = parsed.data.note === "" ? null : parsed.data.note;

  // Only reviews that were both in the request and supplied as evidence can be cited. An ID
  // outside that set means the model invented or mixed in evidence (for any outcome).
  const requested = new Set(request.reviewIds);
  const textById = new Map(
    reviews.filter((review) => requested.has(review.id)).map((review) => [review.id, review.text]),
  );
  const evidence = claims.flatMap((claim) => claim.evidence);
  if (evidence.some((item) => !textById.has(item.reviewId))) {
    throw new QaResponseError("UNGROUNDED_ANSWER");
  }

  if (outcome !== "answered") {
    // Declines and insufficient_evidence are not answers from the reviews, so claims make the
    // reply contradictory. Reject it rather than silently dropping them (prompt: empty list).
    if (claims.length > 0) throw new QaResponseError("UNEXPECTED_CITATIONS");
    // The note is the only text the user sees for these outcomes.
    if (note === null) throw new QaResponseError("INVALID_MODEL_RESPONSE");
    return {
      outcome,
      answer: note,
      citedReviewIds: [],
      promptVersion: request.promptVersion,
      targetId: request.targetId,
    };
  }

  // S2-011: an answer must contain at least one finding from the reviews.
  if (claims.length === 0) throw new QaResponseError("UNGROUNDED_ANSWER");
  for (const claim of claims) {
    if (claim.evidence.length === 0) throw new QaResponseError("UNSUPPORTED_CLAIM");
    for (const item of claim.evidence) {
      // KNOWN LIMITATION: this proves the quote is really in the cited review, not that it
      // entails the statement. A parking claim that quotes a real food sentence passes.
      if (!quoteSupportedByReview(item.quote, textById.get(item.reviewId)!)) {
        throw new QaResponseError("UNSUPPORTED_CLAIM");
      }
    }
  }

  const cited: string[] = [];
  const lines = claims.map((claim) => {
    const ids = [...new Set(claim.evidence.map((item) => item.reviewId))];
    for (const id of ids) if (!cited.includes(id)) cited.push(id);
    return `${claim.statement} [${ids.join(", ")}]`;
  });
  const answer =
    note === null ? lines.join("\n") : `${lines.join("\n")}\n\n${NOT_COVERED_PREFIX} ${note}`;
  if (answer.length > MAX_ANSWER_CHARACTERS) throw new QaResponseError("INVALID_MODEL_RESPONSE");

  return {
    outcome,
    answer,
    citedReviewIds: cited,
    promptVersion: request.promptVersion,
    targetId: request.targetId,
  };
}
